"""LCD1602 - character LCDs with a PCF8574 I2C backpack, for MicroPython on the XRP.

Two classes, one protocol:
    LCD1602  16 characters x 2 lines, e.g. Communica "BDD 16X2 I2C LCD BLUE"
    LCD2004  20 characters x 4 lines, e.g. Communica "BMT 20X4 I2C SERIAL LCD"
Both panels use an HD44780-compatible controller; the backpack is a PCF8574
(or PCF8574A) I/O expander that drives it in 4-bit mode. The file keeps its
original name so programs written for the 16x2 library keep working.

LINE ADDRESSES
--------------
The controller's memory is laid out for two long lines, so on a 20x4 panel
line 3 continues line 1 and line 4 continues line 2 (start addresses 0x00,
0x40, 0x14, 0x54). This driver clips every write at the end of its line, so
text never spills from line 1 into line 3.

BACKPACK PIN MAP
----------------
The usual backpack wiring, also used by Dave Hylands' python_lcd driver
(github.com/dhylands/python_lcd, MIT):
    P0 = RS, P1 = RW, P2 = E, P3 = backlight, P4..P7 = D4..D7
A backpack wired differently will show nothing or rubbish. This driver was
written from the HD44780 4-bit protocol, not copied from python_lcd.

POWER - READ BEFORE WIRING
--------------------------
Most of these modules are 5 V parts. At 3.3 V (the Qwiic supply) the
backlight comes on but the characters are very faint or missing. Power VCC
from a 5 V source, with its GND joined to the XRP's GND.

The backpack usually has pull-up resistors on SDA and SCL to its own VCC, so
at 5 V the I2C lines are pulled to 5 V. Check the RP2350 datasheet for GPIO
5 V tolerance before relying on that, or put an I2C level shifter in between.

ADDRESS
-------
PCF8574T backpacks are usually 0x27; PCF8574AT backpacks are usually 0x3F.
The A0-A2 solder pads on the back change it (0x20-0x27 or 0x38-0x3F).
Left on automatic, this driver looks for 0x27 and then 0x3F only, so it will
never mistake a PCF8575 expander (0x20 by default) for the display.

BUS SPEED
---------
The PCF8574 datasheet rates it for 100 kHz, so this driver opens the bus at
100 kHz. On a shared Qwiic bus the most recently opened device sets the speed
for everyone, so an OLED on the same bus will redraw more slowly after the
LCD is set up.

CONTRAST
--------
If the backlight is on but you see nothing, or a row of solid blocks, turn
the blue trimmer on the backpack slowly until the characters appear.

CHARACTERS
----------
The panel has its own built-in character set (ROM A00 on most modules):
ordinary letters, digits and punctuation work, "°" is translated to the
panel's degree sign, and anything the panel cannot show becomes "?".
Two quirks of that ROM: a backslash shows as a yen sign, and "~" shows as a
right arrow.

MISSING DISPLAY
---------------
If nothing answers, this driver says so on the console and then quietly does
nothing, rather than stopping the program. `is_connected()` tells a program
which it is.
"""

import time
from machine import I2C, Pin

# (bus id, named sda, named scl, fallback sda gpio, fallback scl gpio)
# Qwiic 1 shares the bus the IMU uses; Qwiic 0 is normally free.
_BUS_CANDIDATES = (
    (1, "I2C_SDA_1", "I2C_SCL_1", 38, 39),
    (0, "I2C_SDA_0", "I2C_SCL_0", 4, 5),
)

_AUTO_ADDRESSES = (0x27, 0x3F)

# Backpack bits
_RS = 0x01
_EN = 0x04
_BACKLIGHT = 0x08

# HD44780 commands
_CLEAR = 0x01
_ENTRY_MODE = 0x04 | 0x02          # increment, no display shift
_DISPLAY_CTRL = 0x08
_DISPLAY_ON = 0x04
_CURSOR_ON = 0x02
_BLINK_ON = 0x01
_FUNCTION_SET = 0x20 | 0x08        # 4-bit, 2 lines, 5x8 dots
_SET_DDRAM = 0x80

_ROW_OFFSETS = (0x00, 0x40, 0x14, 0x54)   # 16x2 uses the first two

_DEGREE = 0xDF
_FULL_BLOCK = 0xFF


def _open_bus(bus_id, sda_name, scl_name, sda_gpio, scl_gpio, freq):
    """Open an I2C bus by board pin name, falling back to raw GPIO numbers."""
    try:
        return I2C(bus_id, sda=Pin(sda_name), scl=Pin(scl_name), freq=freq)
    except Exception:
        return I2C(bus_id, sda=Pin(sda_gpio), scl=Pin(scl_gpio), freq=freq)


def scan(freq=100000):
    """Return a list of (bus_id, address) for every PCF8574/PCF8574A address answering."""
    found = []
    for spec in _BUS_CANDIDATES:
        try:
            bus = _open_bus(spec[0], spec[1], spec[2], spec[3], spec[4], freq)
            for addr in bus.scan():
                if 0x20 <= addr <= 0x27 or 0x38 <= addr <= 0x3F:
                    found.append((spec[0], addr))
        except Exception:
            pass
    return found


def _format(value):
    """Print a number the way a learner expects: 3 not 3.0, 1.25 not 1.2500001."""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        if value != value:               # NaN
            return "?"
        rounded = round(value, 2)
        if rounded == int(rounded):
            return str(int(rounded))
        return str(rounded)
    return str(value)


def _encode(text):
    """Turn text into the panel's own character codes."""
    out = bytearray()
    for ch in str(text):
        if ch == "°":
            out.append(_DEGREE)
        else:
            code = ord(ch)
            out.append(code if 32 <= code <= 127 else 63)   # 63 is "?"
    return out


class LCD1602:
    """An HD44780 character LCD behind a PCF8574 I2C backpack (16x2 by default)."""

    def __init__(self, address=None, columns=16, rows=2,
                 i2c=None, freq=100000):
        self.columns = int(columns)
        self.rows = int(rows)
        if not 1 <= self.rows <= len(_ROW_OFFSETS):
            raise ValueError("an HD44780 LCD has 1 to 4 lines")
        self._backlight = _BACKLIGHT
        self._display_ctrl = _DISPLAY_CTRL | _DISPLAY_ON
        self._shadow = [bytearray(b" " * self.columns) for _ in range(self.rows)]
        self._print_row = 0
        self._scrolling = {}
        self._warned = False

        if i2c is not None:
            self.i2c = i2c
            self.address = address if address is not None else _AUTO_ADDRESSES[0]
        else:
            self.i2c, self.address = self._find_bus(address, freq)
        self.present = self.i2c is not None

        if self.present:
            try:
                self._init_display()
            except Exception as err:
                self.present = False
                print("LCD at 0x%02X stopped answering: %s" % (self.address, err))
        else:
            wanted = ("0x%02X" % address) if address is not None else "0x27 or 0x3F"
            print(
                "No LCD answering at %s. Check the wiring, that the LCD has "
                "5 V power, and the address. The program will carry on "
                "without the screen." % wanted
            )

    # -- setup ------------------------------------------------------------

    @staticmethod
    def _find_bus(address, freq):
        wanted = (address,) if address is not None else _AUTO_ADDRESSES
        for spec in _BUS_CANDIDATES:
            try:
                bus = _open_bus(spec[0], spec[1], spec[2], spec[3], spec[4], freq)
                present = bus.scan()
                for addr in wanted:
                    if addr in present:
                        return bus, addr
            except Exception:
                pass
        return None, (address if address is not None else _AUTO_ADDRESSES[0])

    def _nibble_bytes(self, nibble, rs, buf):
        """Three backpack writes: data settles, E rises, E falls (latches)."""
        b = ((nibble & 0x0F) << 4) | self._backlight | (_RS if rs else 0)
        buf.append(b)
        buf.append(b | _EN)
        buf.append(b)

    def _send(self, values, rs):
        """Send whole bytes (commands or characters) in one I2C write."""
        buf = bytearray()
        for v in values:
            self._nibble_bytes(v >> 4, rs, buf)
            self._nibble_bytes(v, rs, buf)
        self.i2c.writeto(self.address, buf)

    def _command(self, cmd):
        self._send((cmd,), False)
        if cmd == _CLEAR:
            time.sleep_ms(2)            # clear needs 1.52 ms

    def _init_display(self):
        time.sleep_ms(50)               # the panel needs >40 ms after power-up
        self.i2c.writeto(self.address, bytes([self._backlight]))
        # Datasheet "initialising by instruction" for 4-bit mode.
        for wait in (5, 1, 1):
            buf = bytearray()
            self._nibble_bytes(0x03, False, buf)
            self.i2c.writeto(self.address, buf)
            time.sleep_ms(wait)
        buf = bytearray()
        self._nibble_bytes(0x02, False, buf)   # now in 4-bit mode
        self.i2c.writeto(self.address, buf)
        time.sleep_ms(1)
        self._command(_FUNCTION_SET)
        self._command(_DISPLAY_CTRL)            # display off while we set up
        self._command(_CLEAR)
        self._command(_ENTRY_MODE)
        self._command(self._display_ctrl)

    def _safe(self, action):
        """Run a bus action; if the LCD has gone, say so once and carry on."""
        if not self.present:
            return
        try:
            action()
        except Exception as err:
            self.present = False
            if not self._warned:
                self._warned = True
                print("Lost the LCD at 0x%02X: %s" % (self.address, err))

    # -- text -------------------------------------------------------------

    def _row(self, line):
        """Line 1 is the top row. Out-of-range lines are pulled back in."""
        line = int(line)
        if line < 1:
            line = 1
        if line > self.rows:
            line = self.rows
        return line - 1

    def _col(self, column):
        column = int(column)
        if column < 1:
            column = 1
        if column > self.columns:
            column = self.columns
        return column - 1

    def _put(self, row, col, data):
        """Write bytes at (row, col), clipped to the line, and keep the shadow copy."""
        data = data[:self.columns - col]
        if not data:
            return
        self._shadow[row][col:col + len(data)] = data

        def action():
            self._command(_SET_DDRAM | (_ROW_OFFSETS[row] + col))
            self._send(data, True)
        self._safe(action)

    def _put_line(self, row, data):
        padded = bytearray(data[:self.columns])
        while len(padded) < self.columns:
            padded.append(32)
        self._put(row, 0, padded)

    def clear(self):
        """Wipe the screen and start printing from the top again."""
        for row in self._shadow:
            row[:] = b" " * self.columns
        self._print_row = 0
        self._scrolling.clear()
        self._safe(lambda: self._command(_CLEAR))

    def write_line(self, message, line):
        """Put text on one line, replacing what was there. Extra characters are cut off."""
        row = self._row(line)
        self._scrolling.pop(row, None)
        self._put_line(row, _encode(message))

    def write_value(self, label, value, line):
        """Put "label: value" on one line. The everyday sensor-reading block."""
        self.write_line("%s: %s" % (label, _format(value)), line)

    def write_at(self, message, column, line):
        """Put text starting at a column (1 = left edge) on a line. The rest of the line is kept."""
        row = self._row(line)
        self._scrolling.pop(row, None)
        self._put(row, self._col(column), _encode(message))

    def println(self, message):
        """Print like a console: fill the lines top to bottom, then everything moves up."""
        data = _encode(message)
        if self._print_row < self.rows:
            row = self._print_row
            self._print_row += 1
        else:
            for r in range(self.rows - 1):
                self._scrolling.pop(r, None)
                self._put_line(r, bytearray(self._shadow[r + 1]))
            row = self.rows - 1
        self._scrolling.pop(row, None)
        self._put_line(row, data)

    def scroll_text(self, message, line=1, speed=3):
        """Call repeatedly. Scroll long text left, pausing at each end.

        Speed is characters per second (1..10). No sleeps, so other robot
        work carries on. Short text stays still. Only sends to the panel when
        the picture actually moves.
        """
        row = self._row(line)
        data = _encode(message)
        try:
            speed = float(speed)
        except Exception:
            speed = 3.0
        if speed < 1:
            speed = 1.0
        if speed > 10:
            speed = 10.0
        now = time.ticks_ms()

        state = self._scrolling.get(row)
        if state is None or state["data"] != data:
            state = {"data": data, "offset": 0, "last": now, "pause": 1000, "drawn": -1}
            self._scrolling[row] = state

        longest = len(data) - self.columns
        if longest > 0:
            elapsed = time.ticks_diff(now, state["last"])
            if state["pause"] > 0:
                if elapsed >= state["pause"]:
                    state["pause"] = 0
                    state["last"] = now
                    if state["offset"] >= longest:
                        state["offset"] = 0
                        state["pause"] = 1000
            else:
                step_ms = int(1000 / speed)
                steps = elapsed // step_ms
                if steps > 0:
                    state["offset"] = min(longest, state["offset"] + steps)
                    state["last"] = time.ticks_add(state["last"], steps * step_ms)
                    if state["offset"] >= longest:
                        state["pause"] = 1000
                        state["last"] = now
        else:
            state["offset"] = 0

        if state["drawn"] != state["offset"]:
            state["drawn"] = state["offset"]
            start = state["offset"]
            self._put_line(row, data[start:start + self.columns])

    def bar(self, value, minimum=0, maximum=100, line=2):
        """Fill a line with solid blocks in proportion to value, like a progress bar."""
        try:
            value = float(value)
            minimum = float(minimum)
            maximum = float(maximum)
        except Exception:
            return
        if maximum == minimum:
            fraction = 0.0
        else:
            fraction = (value - minimum) / (maximum - minimum)
        if fraction < 0:
            fraction = 0.0
        if fraction > 1:
            fraction = 1.0
        cells = int(round(fraction * self.columns))
        row = self._row(line)
        self._scrolling.pop(row, None)
        self._put_line(row, bytearray([_FULL_BLOCK] * cells))

    # -- the panel itself -------------------------------------------------

    def backlight(self, on=True):
        """Switch the backlight on or off. The text stays on the panel."""
        self._backlight = _BACKLIGHT if on else 0
        self._safe(lambda: self.i2c.writeto(self.address, bytes([self._backlight])))

    def power(self, on=True):
        """Blank the characters (on=False) or show them again. The text is kept."""
        if on:
            self._display_ctrl |= _DISPLAY_ON
        else:
            self._display_ctrl &= ~_DISPLAY_ON
        self._safe(lambda: self._command(self._display_ctrl))

    def cursor(self, mode="off"):
        """Cursor style: "off", "line" (underline) or "blink" (flashing block)."""
        self._display_ctrl &= ~(_CURSOR_ON | _BLINK_ON)
        if mode == "line":
            self._display_ctrl |= _CURSOR_ON
        elif mode == "blink":
            self._display_ctrl |= _BLINK_ON
        self._safe(lambda: self._command(self._display_ctrl))

    # -- questions a program can ask --------------------------------------

    def is_connected(self):
        """True if the backpack answers right now."""
        if self.i2c is None:
            return False
        try:
            self.i2c.writeto(self.address, bytes([self._backlight]))
            if not self.present:
                self.present = True
                self._warned = False
                self._init_display()
                self._redraw()
        except Exception:
            self.present = False
        return self.present

    def _redraw(self):
        for r in range(self.rows):
            self._put(r, 0, bytearray(self._shadow[r]))


class LCD2004(LCD1602):
    """A 20x4 HD44780 character LCD behind a PCF8574 I2C backpack."""

    def __init__(self, address=None, i2c=None, freq=100000):
        super().__init__(address=address, columns=20, rows=4, i2c=i2c, freq=freq)
