"""SSD1315 - 128x64 monochrome OLED driver for MicroPython on the XRP.

For the DisplayModule DM-OLED096-636 and the many 0.96" I2C OLED boards that
use the same controller. The SSD1315 takes the same commands as the older and
far more common SSD1306, so this driver works with both.

Controller: Solomon Systech SSD1315, 128 x 64 passive-matrix OLED.

WIRING
------
The display is an I2C device, so it goes on a Qwiic connector: four wires,
3.3 V, GND, SDA, SCL. Qwiic 0 is normally free; Qwiic 1 shares the bus the
IMU sits on. This driver tries both.

If your module came without a breakout board, check its own datasheet for the
supply voltage before wiring it to 3.3 V. The bare panel runs at 2.8 V; the
usual breakout boards include a regulator and accept 3.3 V.

ADDRESSES
---------
The datasheet gives the slave address as 0x78 or 0x7A, which is the 8-bit
form including the read/write bit. MicroPython uses 7-bit addresses, so those
are 0x3C and 0x3D here. The choice is made by the SA0 pin, usually a solder
link on the back of the module. Almost every board ships as 0x3C.

MISSING DISPLAY
---------------
If nothing answers, this driver says so on the console and then quietly does
nothing, rather than stopping the program. A robot should keep driving when
its screen falls off. `is_connected()` tells a program which it is.

WHAT IT DRAWS WITH
------------------
MicroPython's own `framebuf` module, which carries an 8 x 8 font. That gives
16 characters across and 8 lines down, and it is why the text blocks count
lines 1 to 8.

PICTURES
--------
draw_picture() takes a string made by tools/oled-designer.html, which is a
mouse-driven sketch pad the size of the screen. The format is described at
_decode_picture() below: it is plain text, so it travels in a Blockly text
block, in an email, or in a lesson file.
"""

try:
    import framebuf
except ImportError:
    raise ImportError(
        "This MicroPython build has no framebuf module, which the OLED "
        "driver needs. Update the firmware on the XRP."
    )

import math
import time
from machine import I2C, Pin

# (bus id, named sda, named scl, fallback sda gpio, fallback scl gpio)
# Qwiic 1 shares the bus the IMU uses; Qwiic 0 is normally free.
_BUS_CANDIDATES = (
    (1, "I2C_SDA_1", "I2C_SCL_1", 38, 39),
    (0, "I2C_SDA_0", "I2C_SCL_0", 4, 5),
)

# Commands used here. Names follow the SSD1315 datasheet.
_SET_CONTRAST = 0x81
_SET_ENTIRE_ON = 0xA4
_SET_NORM_INV = 0xA6
_SET_DISP = 0xAE
_SET_MEM_ADDR = 0x20
_SET_COL_ADDR = 0x21
_SET_PAGE_ADDR = 0x22
_SET_DISP_START_LINE = 0x40
_SET_SEG_REMAP = 0xA0
_SET_MUX_RATIO = 0xA8
_SET_COM_OUT_DIR = 0xC0
_SET_DISP_OFFSET = 0xD3
_SET_COM_PIN_CFG = 0xDA
_SET_DISP_CLK_DIV = 0xD5
_SET_PRECHARGE = 0xD9
_SET_VCOM_DESEL = 0xDB
_SET_CHARGE_PUMP = 0x8D
_NOP = 0xE3

_CONTROL_CMD = 0x00
_CONTROL_DATA = 0x40


def _open_bus(bus_id, sda_name, scl_name, sda_gpio, scl_gpio, freq):
    """Open an I2C bus by board pin name, falling back to raw GPIO numbers."""
    try:
        return I2C(bus_id, sda=Pin(sda_name), scl=Pin(scl_name), freq=freq)
    except Exception:
        return I2C(bus_id, sda=Pin(sda_gpio), scl=Pin(scl_gpio), freq=freq)


def scan(freq=400000):
    """Return a list of (bus_id, address) for every OLED found."""
    found = []
    for spec in _BUS_CANDIDATES:
        try:
            bus = _open_bus(spec[0], spec[1], spec[2], spec[3], spec[4], freq)
            for addr in bus.scan():
                if addr in (0x3C, 0x3D):
                    found.append((spec[0], addr))
        except Exception:
            pass
    return found


_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


def _b64_decode(text):
    """Decode base64 without binascii, so the driver has no dependency on it."""
    out = bytearray()
    accumulator = 0
    bits = 0
    for char in text:
        if char == "=":
            break
        index = _B64.find(char)
        if index < 0:
            continue                     # whitespace and line breaks are ignored
        accumulator = (accumulator << 6) | index
        bits += 6
        if bits >= 8:
            bits -= 8
            out.append((accumulator >> bits) & 0xFF)
    return out


def _rle_decode(data):
    """Undo the (count, value) pairs the designer writes for blank areas."""
    out = bytearray()
    for i in range(0, len(data) - 1, 2):
        out.extend(bytes([data[i + 1]]) * data[i])
    return out


def _decode_picture(text):
    """Turn a designer string into (width, height, pixels).

    The format is one line of plain text:

        XRPI1:<width>:<height>:<base64>

    The decoded bytes start with a mode byte: 0 means the screen bytes follow
    as they are, 1 means they are (count, value) pairs. The pixels themselves
    are MONO_VLSB, the same layout the SSD1315 wants, so they go straight out.
    """
    text = str(text).strip()
    if not text.startswith("XRPI1:"):
        raise ValueError(
            "That is not a picture from the OLED designer. Draw one in "
            "tools/oled-designer.html and use its Copy button."
        )

    parts = text.split(":")
    if len(parts) < 4:
        raise ValueError("The picture text is incomplete.")

    width = int(parts[1])
    height = int(parts[2])
    if width <= 0 or height <= 0 or height % 8:
        raise ValueError("A picture must be at least 1 wide and a multiple of 8 high.")

    raw = _b64_decode(parts[3])
    if not raw:
        raise ValueError("The picture text has no picture in it.")

    pixels = raw[1:] if raw[0] == 0 else _rle_decode(raw[1:])
    needed = width * (height // 8)
    if len(pixels) < needed:
        raise ValueError(
            "The picture is %d bytes short of the %dx%d it claims to be."
            % (needed - len(pixels), width, height)
        )
    return width, height, bytearray(pixels[:needed])


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


class SSD1315:
    """A 128 x 64 SSD1315 or SSD1306 OLED on the XRP's Qwiic bus."""

    def __init__(self, address=0x3C, width=128, height=64,
                 i2c=None, freq=400000, auto_show=True):
        if address not in (0x3C, 0x3D):
            raise ValueError("OLED address must be 0x3C or 0x3D")

        self.address = address
        self.width = int(width)
        self.height = int(height)
        self.pages = self.height // 8
        self.rows = self.pages              # one text row per 8-pixel page
        self.columns = self.width // 8      # 8 x 8 font
        self.auto_show = bool(auto_show)

        self._cmd = bytearray(2)
        self._cmd[0] = _CONTROL_CMD
        self._line = 0
        self._scrolling = {}
        self._glyphs = {}        # scaled-up characters, rendered once each
        self._picture = None     # (text, width, height, FrameBuffer) most recently drawn

        # One leading control byte, then the pixels, so the whole screen goes
        # out in a single I2C write.
        self._buffer = bytearray(1 + self.pages * self.width)
        self._buffer[0] = _CONTROL_DATA
        self.frame = framebuf.FrameBuffer(
            memoryview(self._buffer)[1:], self.width, self.height, framebuf.MONO_VLSB
        )

        self.i2c = i2c if i2c is not None else self._find_bus(address, freq)
        self.present = self.i2c is not None

        if self.present:
            try:
                self._init_display()
            except Exception as err:
                self.present = False
                print("OLED at 0x%02X stopped answering: %s" % (address, err))
        else:
            print(
                "No OLED answering at 0x%02X. Check the Qwiic cable and the "
                "address link on the back of the module. The program will "
                "carry on without the screen." % address
            )

    # -- setup ------------------------------------------------------------

    @staticmethod
    def _find_bus(address, freq):
        for spec in _BUS_CANDIDATES:
            try:
                bus = _open_bus(spec[0], spec[1], spec[2], spec[3], spec[4], freq)
                if address in bus.scan():
                    return bus
            except Exception:
                pass
        return None

    def _write_cmd(self, command):
        self._cmd[1] = command & 0xFF
        self.i2c.writeto(self.address, self._cmd)

    def _init_display(self):
        for command in (
            _SET_DISP,                      # display off while we set up
            _SET_MEM_ADDR, 0x00,            # horizontal addressing
            _SET_DISP_START_LINE,           # start at line 0
            _SET_SEG_REMAP | 0x01,          # column 127 is segment 0
            _SET_MUX_RATIO, self.height - 1,
            _SET_COM_OUT_DIR | 0x08,        # scan from COM[N-1] to COM0
            _SET_DISP_OFFSET, 0x00,
            _SET_COM_PIN_CFG, 0x12 if self.height > 32 else 0x02,
            _SET_DISP_CLK_DIV, 0x80,
            _SET_PRECHARGE, 0xF1,
            _SET_VCOM_DESEL, 0x30,
            _SET_CONTRAST, 0x7F,
            _SET_ENTIRE_ON,                 # follow the RAM, not all-on
            _SET_NORM_INV,                  # not inverted
            _SET_CHARGE_PUMP, 0x14,         # internal charge pump, 7.5 V
            _SET_DISP | 0x01,               # display on
        ):
            self._write_cmd(command)
        self.clear()

    # -- sending pixels ---------------------------------------------------

    def show(self):
        """Send the picture we have built to the screen."""
        if not self.present:
            return
        try:
            self._write_cmd(_SET_COL_ADDR)
            self._write_cmd(0)
            self._write_cmd(self.width - 1)
            self._write_cmd(_SET_PAGE_ADDR)
            self._write_cmd(0)
            self._write_cmd(self.pages - 1)
            self.i2c.writeto(self.address, self._buffer)
        except Exception as err:
            self.present = False
            print("Lost the OLED at 0x%02X: %s" % (self.address, err))

    def set_auto_show(self, on=True):
        """Whether every change appears at once, or waits for show()."""
        self.auto_show = bool(on)
        if self.auto_show:
            self.show()

    def _auto(self):
        if self.auto_show:
            self.show()

    # -- text -------------------------------------------------------------

    def clear(self):
        """Wipe the screen and start printing from the top again."""
        self.frame.fill(0)
        self._line = 0
        self._scrolling.clear()
        self._auto()

    def _row_y(self, line):
        """Line 1 is the top row. Out-of-range lines are pulled back in."""
        line = int(line)
        if line < 1:
            line = 1
        if line > self.rows:
            line = self.rows
        return (line - 1) * 8

    def write_line(self, message, line):
        """Put text on one of the 8 text rows, replacing what was there."""
        y = self._row_y(line)
        self._scrolling.pop(y, None)
        self.frame.fill_rect(0, y, self.width, 8, 0)
        self.frame.text(str(message), 0, y, 1)
        self._auto()

    def scroll_text(self, message, line=1, speed=30):
        """Call repeatedly. Scroll long text left, pausing at each end.

        Speed is pixels per second (1..120). No sleeps: other robot work can
        continue. Short text stays still. Honour the normal auto-show setting.
        """
        if not self.present:
            return
        text = _format(message).replace('\n', ' ').replace('\r', ' ')
        speed = float(speed)
        if not math.isfinite(speed):
            raise ValueError('Scroll speed must be finite')
        speed = max(1, min(120, speed))
        y = self._row_y(line)
        now = time.ticks_ms()
        state = self._scrolling.get(y)
        if state is None or state['text'] != text or state['speed'] != speed:
            state = {'text': text, 'speed': speed, 'offset': 0, 'last': now, 'wait': 700}
            self._scrolling[y] = state
        else:
            end = max(0, len(text) * 8 - self.width)
            if end == 0:
                return
            elapsed = time.ticks_diff(now, state['last'])
            interval = max(1, int(1000 / speed))
            if elapsed < state['wait']:
                return
            if state['offset'] >= end:
                state['offset'] = 0
                state['wait'] = 700
            else:
                # Bound catch-up so a slow loop does not jump over the text.
                state['offset'] = min(end, state['offset'] + max(1, min(4, elapsed // interval)))
                state['wait'] = 700 if state['offset'] == end else interval
            state['last'] = now
        self.frame.fill_rect(0, y, self.width, 8, 0)
        # Render only visible characters, avoiding a large off-screen draw.
        start = state['offset'] // 8
        self.frame.text(text[start:start + self.columns + 1], -(state['offset'] % 8), y, 1)
        self._auto()

    def write_value(self, label, value, line):
        """Put "label: value" on one row. The everyday sensor-reading block."""
        self.write_line("%s: %s" % (label, _format(value)), line)

    def write_at(self, message, x, y):
        """Put text anywhere, by pixel. Nothing already on screen is cleared."""
        self.frame.text(str(message), int(x), int(y), 1)
        self._auto()

    def println(self, message):
        """Print a line like a console: fills down, then scrolls."""
        if self._line >= self.rows:
            self.frame.scroll(0, -8)
            y = (self.rows - 1) * 8
            self.frame.fill_rect(0, y, self.width, 8, 0)
        else:
            y = self._line * 8
            self._line += 1
        self.frame.text(str(message), 0, y, 1)
        self._auto()

    # -- drawing ----------------------------------------------------------

    def set_pixel(self, x, y, on=True):
        """Light or clear one pixel. x is 0 to 127, y is 0 to 63."""
        self.frame.pixel(int(x), int(y), 1 if on else 0)
        self._auto()

    def line(self, x1, y1, x2, y2, on=True):
        """A straight line between two points."""
        self.frame.line(int(x1), int(y1), int(x2), int(y2), 1 if on else 0)
        self._auto()

    def rect(self, x, y, width, height, filled=False, on=True):
        """A rectangle, outline or solid."""
        x, y = int(x), int(y)
        width, height = int(width), int(height)
        colour = 1 if on else 0
        if filled:
            self.frame.fill_rect(x, y, width, height, colour)
        else:
            self.frame.rect(x, y, width, height, colour)
        self._auto()

    def circle(self, x, y, radius, filled=False, on=True):
        """A circle, outline or solid.

        Drawn here with the midpoint algorithm rather than framebuf.ellipse,
        so the library does not depend on how new the firmware's framebuf is.
        """
        cx, cy, r = int(x), int(y), int(radius)
        colour = 1 if on else 0
        if r < 0:
            return

        px, py = r, 0
        error = 1 - r
        while px >= py:
            if filled:
                self.frame.hline(cx - px, cy + py, 2 * px + 1, colour)
                self.frame.hline(cx - px, cy - py, 2 * px + 1, colour)
                self.frame.hline(cx - py, cy + px, 2 * py + 1, colour)
                self.frame.hline(cx - py, cy - px, 2 * py + 1, colour)
            else:
                for ox, oy in ((px, py), (py, px), (-px, py), (-py, px),
                               (-px, -py), (-py, -px), (px, -py), (py, -px)):
                    self.frame.pixel(cx + ox, cy + oy, colour)
            py += 1
            if error < 0:
                error += 2 * py + 1
            else:
                px -= 1
                error += 2 * (py - px) + 1
        self._auto()

    def bar(self, value, minimum=0, maximum=100, line=8, on=True):
        """A horizontal bar across one text row, for a sensor reading."""
        y = self._row_y(line)
        try:
            span = float(maximum) - float(minimum)
            fraction = 0.0 if span == 0 else (float(value) - float(minimum)) / span
        except (TypeError, ValueError):
            fraction = 0.0
        if fraction < 0:
            fraction = 0.0
        if fraction > 1:
            fraction = 1.0

        colour = 1 if on else 0
        self.frame.fill_rect(0, y, self.width, 8, 0)
        self.frame.rect(0, y, self.width, 8, colour)
        filled = int((self.width - 4) * fraction)
        if filled > 0:
            self.frame.fill_rect(2, y + 2, filled, 4, colour)
        self._auto()

    def _fill_triangle(self, points, colour):
        """Solid triangle, used for the arrow head."""
        (x1, y1), (x2, y2), (x3, y3) = points
        left = max(0, min(x1, x2, x3))
        right = min(self.width - 1, max(x1, x2, x3))
        top = max(0, min(y1, y2, y3))
        bottom = min(self.height - 1, max(y1, y2, y3))

        def side(ax, ay, bx, by, px, py):
            return (bx - ax) * (py - ay) - (by - ay) * (px - ax)

        for py in range(top, bottom + 1):
            for px in range(left, right + 1):
                a = side(x1, y1, x2, y2, px, py)
                b = side(x2, y2, x3, y3, px, py)
                c = side(x3, y3, x1, y1, px, py)
                if (a >= 0 and b >= 0 and c >= 0) or (a <= 0 and b <= 0 and c <= 0):
                    self.frame.pixel(px, py, colour)

    def arrow(self, angle, x=None, y=None, size=None, on=True):
        """An arrow pointing at a compass angle.

        0 degrees is up, 90 is right, 180 is down, 270 is left, which is what
        the gyro heading block reports. Plug that block straight in and the
        arrow swings like a compass needle as the robot turns.
        """
        try:
            angle = float(angle)
        except (TypeError, ValueError):
            angle = 0.0

        cx = self.width // 2 if x is None else int(x)
        cy = self.height // 2 if y is None else int(y)
        length = (min(self.width, self.height) // 2 - 2) if size is None else int(size)
        if length < 3:
            length = 3

        radians = math.radians(angle)
        dx = math.sin(radians)
        dy = -math.cos(radians)          # screen y grows downwards

        tip_x = int(round(cx + dx * length))
        tip_y = int(round(cy + dy * length))
        tail_x = int(round(cx - dx * length * 0.75))
        tail_y = int(round(cy - dy * length * 0.75))

        colour = 1 if on else 0
        self.frame.line(tail_x, tail_y, tip_x, tip_y, colour)

        # The head: a solid triangle sitting on the shaft, behind the tip.
        head = length * 0.45
        spread = length * 0.22
        base_x = cx + dx * (length - head)
        base_y = cy + dy * (length - head)
        self._fill_triangle((
            (tip_x, tip_y),
            (int(round(base_x - dy * spread)), int(round(base_y + dx * spread))),
            (int(round(base_x + dy * spread)), int(round(base_y - dx * spread))),
        ), colour)
        self._auto()

    def _glyph(self, char):
        """The 8x8 font's picture of one character, as rows of 0 and 1."""
        if char in self._glyphs:
            return self._glyphs[char]
        buffer = bytearray(8)
        cell = framebuf.FrameBuffer(buffer, 8, 8, framebuf.MONO_VLSB)
        cell.text(char, 0, 0, 1)
        rows = [[cell.pixel(px, py) for px in range(8)] for py in range(8)]
        if len(self._glyphs) < 64:
            self._glyphs[char] = rows
        return rows

    def big(self, message, scale=3, x=None, y=None, on=True):
        """Text drawn several times its normal size.

        The 8 x 8 font blown up, so "^" or ">" becomes a chunky arrow and a
        countdown digit can be read from across the room.
        """
        message = str(message)
        scale = int(scale)
        if scale < 1:
            scale = 1

        block_width = 8 * scale
        total = block_width * len(message)
        start_x = (self.width - total) // 2 if x is None else int(x)
        start_y = (self.height - block_width) // 2 if y is None else int(y)

        colour = 1 if on else 0
        for index, char in enumerate(message):
            rows = self._glyph(char)
            origin_x = start_x + index * block_width
            for row, pixels in enumerate(rows):
                for column, lit in enumerate(pixels):
                    if lit:
                        self.frame.fill_rect(
                            origin_x + column * scale,
                            start_y + row * scale,
                            scale, scale, colour,
                        )
        self._auto()

    def draw_picture(self, text, x=0, y=0):
        """Draw a picture made in tools/oled-designer.html.

        The decoded picture is kept, so redrawing the same one inside a loop
        costs nothing after the first time.
        """
        text = str(text)
        if self._picture is None or self._picture[0] != text:
            width, height, pixels = _decode_picture(text)
            source = framebuf.FrameBuffer(pixels, width, height, framebuf.MONO_VLSB)
            self._picture = (text, width, height, source)
        self.frame.blit(self._picture[3], int(x), int(y))
        self._auto()

    # -- display control --------------------------------------------------

    def set_brightness(self, percent):
        """Contrast, 0 to 100 percent. The panel is readable well below 50."""
        if not self.present:
            return
        try:
            percent = float(percent)
        except (TypeError, ValueError):
            percent = 50.0
        if percent < 0:
            percent = 0.0
        if percent > 100:
            percent = 100.0
        self._write_cmd(_SET_CONTRAST)
        self._write_cmd(int(percent * 255 / 100))

    def invert(self, on=True):
        """Swap lit and unlit pixels. Nothing in the picture changes."""
        if not self.present:
            return
        self._write_cmd(_SET_NORM_INV | (1 if on else 0))

    def power(self, on=True):
        """Switch the panel off to save current. The picture is kept."""
        if not self.present:
            return
        self._write_cmd(_SET_DISP | (1 if on else 0))

    # -- questions a program can ask --------------------------------------

    def is_connected(self):
        """True if the display answers right now."""
        if self.i2c is None:
            return False
        try:
            self._write_cmd(_NOP)
            self.present = True
        except Exception:
            self.present = False
        return self.present
