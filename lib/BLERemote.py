"""Phone control over Bluetooth, using the XRP's own Bluetooth REPL link.

The XRP firmware already offers a Bluetooth serial link (Nordic UART Service,
advertised as "XRP-xxxxx"): it is how an IDE connects over Bluetooth. This
driver does not take over the radio. It makes sure that link is running, then
reads short text lines the phone page writes into it, which arrive on
sys.stdin while a program runs.

Messages are one line each and start with '#', so if a line ever reaches the
REPL (no program running) Python treats it as a comment and nothing happens.

  phone -> robot   #xrp h                   hello (asks for the page setup)
                   #xrp s <mask> <x> <y>    buttons 1-6 as bits, joystick
                                            -100..100, sent on change and
                                            every 0.25 s as a heartbeat
                   #xrp o 1 | #xrp o 0      robot messages wanted / not
  robot -> phone   #xrp ok                  "a program is listening" (0.5 s)
                   #xrp cfg <title>|<l1>|...|<l6>
                   #xrp m <text>            message for the phone's text line
                   #xrp v <name>|<value>    a named reading (only when wanted)
                   #xrp p <text>            a line for the message log (ditto)

Replies go to the phone as Bluetooth notifications on the same link, not
through print(): the REPL sends print() output as indications, which Chrome
on Android drops (found on hardware with 1.0.0).

The phone only sends states after it has heard "#xrp ok", and the robot only
sends "#xrp ok" while it is reading, so nothing piles up in the Bluetooth
buffer when no program is listening.

Cooperative, like the Wi-Fi remote: every read services the link. Use
update() in loops that read nothing. Inputs expire one second after the last
message; stopping motors on disconnect is the user program's job.

The phone and an IDE cannot both be connected over Bluetooth at the same time.
"""
import sys
import time

try:
    import select
except ImportError:  # older ports
    import uselect as select

VERSION = '1.1.0'
_TIMEOUT_MS = 1000
_ACK_MS = 500
_MAX_LINE = 96
_MAX_CHARS_PER_UPDATE = 512
_MAX_VALUES = 8
_LOG_KEEP = 8
_FEED_MS = 200        # changed readings go out at most 5 times a second
_FEED_ALL_MS = 2000   # and every reading is repeated every 2 s

_active_phone = None


def _clean(text, limit):
    text = str(text)
    out = ''
    for ch in text:
        if ch in '|\r\n' or ord(ch) < 32:
            ch = ' '
        out += ch
    return out[:limit]


class BLERemote:
    def __init__(self):
        self.title = 'XRP phone control'
        self.labels = ['Up', 'Left', 'Right', 'Down', 'A', 'B']
        self.buttons = [False] * 6
        self.edges = [False] * 6
        self.x = 0
        self.y = 0
        self.last_seen = None
        self.last_ack = None
        self.started = False
        self.link = 'none'
        self._line = ''
        self._poller = None
        self._message = None
        self._uart = None
        self.feed_on = False      # the phone has asked for robot messages
        self._values = []         # [name, text] pairs, in first-shown order
        self._dirty = set()
        self._last_feed = None
        self._last_feed_all = None
        self._log = []            # (number, text), the last _LOG_KEEP lines
        self._log_n = 0
        self._log_sent = 0
        self._warned = False

    # ---- setup ---------------------------------------------------------

    def set_title(self, text):
        self.title = _clean(text, 40) or 'XRP phone control'
        self._send_config()

    def label(self, button, text):
        self.labels[self._index(button)] = _clean(text, 16)
        self._send_config()

    def start(self):
        """Make sure the Bluetooth link is up and start listening."""
        global _active_phone
        if _active_phone is not None and _active_phone is not self:
            _active_phone.release()
        _active_phone = self
        print('Phone control (Bluetooth) driver ' + VERSION)
        self.link = self._ensure_bluetooth()
        self._uart = self._find_uart()
        self._poller = select.poll()
        self._poller.register(sys.stdin, select.POLLIN)
        self.started = True
        if self.link == 'none':
            print('Phone control: Bluetooth link not available. Connect the robot '
                  'once to the official XRPCode IDE so it installs /lib/ble, then try again.')
        else:
            print('Phone control: open the phone page and connect to this robot (' +
                  self._name() + ').')

    @staticmethod
    def _name():
        try:
            from machine import unique_id
            x = ''.join(['{:02x}'.format(b) for b in unique_id()])
            return 'XRP-' + x[11:]
        except Exception:
            return 'XRP-...'

    @staticmethod
    def _ensure_bluetooth():
        # Same test the official XRPCode main.py uses: slot 0 holds the
        # Bluetooth REPL stream when it is running.
        try:
            import os
            current = os.dupterm(None, 0)
            if current is not None:
                os.dupterm(current, 0)
                return 'running'
            import ble.blerepl  # noqa: F401  starts the Bluetooth REPL
            return 'started'
        except ImportError:
            return 'none'
        except Exception as exc:
            print('Phone control: could not start Bluetooth:', exc)
            return 'none'

    @staticmethod
    def _find_uart():
        # The BLEUART object the Bluetooth REPL made (ble/blerepl.py, 'uart').
        try:
            import ble.blerepl as repl
            uart = repl.uart
            uart._ble, uart._tx_handle, uart._connections  # noqa: B018
            return uart
        except Exception:
            return None

    @staticmethod
    def _index(button):
        index = int(button) - 1
        if index < 0 or index >= 6:
            raise ValueError('Button must be 1 to 6')
        return index

    # ---- link servicing ------------------------------------------------

    def update(self):
        """Read waiting phone messages. Returns quickly when there are none."""
        if not self.started:
            self.start()
        count = 0
        while count < _MAX_CHARS_PER_UPDATE and self._poller.poll(0):
            ch = sys.stdin.read(1)
            if not ch:
                break
            count += 1
            if ch == '\n' or ch == '\r':
                if self._line:
                    self._handle(self._line)
                self._line = ''
            elif len(self._line) < _MAX_LINE:
                self._line += ch
            else:
                self._line = ''   # overlong junk: drop it
        self._expire()
        if self.last_seen is not None:
            now = time.ticks_ms()
            if self.last_ack is None or time.ticks_diff(now, self.last_ack) >= _ACK_MS:
                self.last_ack = now
                self._write('#xrp ok')
                if self._message is not None:
                    self._write('#xrp m ' + self._message)
            if self.feed_on:
                self._feed(now)

    def _handle(self, line):
        parts = line.strip().split()
        if len(parts) < 2 or parts[0] != '#xrp':
            return
        kind = parts[1]
        if kind == 'h':
            self._seen()
            self._send_config(force=True)
            self.last_ack = None
        elif kind == 'o' and len(parts) == 3:
            self._seen()
            want = parts[2] == '1'
            if want and not self.feed_on:
                # Fresh opt-in: send every reading and the recent log.
                self._dirty = set(range(len(self._values)))
                self._last_feed = None
                self._log_sent = max(self._log_sent, self._log_n - _LOG_KEEP)
            self.feed_on = want
        elif kind == 's' and len(parts) == 5:
            try:
                mask, x, y = int(parts[2]), int(parts[3]), int(parts[4])
            except ValueError:
                return
            if not 0 <= mask < 64:
                return
            self._seen()
            for i in range(6):
                down = bool(mask & (1 << i))
                if down and not self.buttons[i]:
                    self.edges[i] = True
                self.buttons[i] = down
            self.x = max(-100, min(100, x))
            self.y = max(-100, min(100, y))

    def _seen(self):
        first = self.last_seen is None
        self.last_seen = time.ticks_ms()
        if first:
            self.last_ack = None

    def _expire(self):
        if self.last_seen is not None and \
                time.ticks_diff(time.ticks_ms(), self.last_seen) > _TIMEOUT_MS:
            self.release()
            self.last_seen = None
            self.feed_on = False

    def _write(self, text):
        # Replies go straight to the phone as Bluetooth notifications, in
        # 20-byte pieces (the smallest packet every phone accepts). print()
        # would send them through the REPL link as "indications", which
        # Chrome on Android does not pass on (found on hardware, 1.0.0).
        uart = self._uart
        if uart is None:
            print(text)
            return
        data = (text + '\r\n').encode()
        for conn in tuple(uart._connections):
            for i in range(0, len(data), 20):
                try:
                    uart._ble.gatts_notify(conn, uart._tx_handle, data[i:i + 20])
                except OSError:
                    pass   # link busy or gone: the next reply is 0.5 s away

    def _send_config(self, force=False):
        if force or self.last_seen is not None:
            self._write('#xrp cfg ' + '|'.join([self.title] + self.labels))

    # ---- blocks --------------------------------------------------------

    def connected(self):
        self.update()
        return self.last_seen is not None

    def pressed(self, button):
        self.update()
        return self.buttons[self._index(button)]

    def clicked(self, button):
        self.update()
        index = self._index(button)
        result = self.edges[index]
        self.edges[index] = False
        return result

    def joystick(self, axis):
        self.update()
        return self.y if axis == 'y' else self.x

    def show(self, text):
        """Show a short text line on the phone page."""
        self._message = _clean(text, 60)
        if self.last_seen is not None:
            self._write('#xrp m ' + self._message)

    @staticmethod
    def _format(value):
        if isinstance(value, bool):
            return 'true' if value else 'false'
        if isinstance(value, float):
            text = '{:.2f}'.format(value)
            if '.' in text:
                text = text.rstrip('0').rstrip('.')
            return '0' if text == '-0' else text
        return str(value)

    def value(self, name, value):
        """Show a named reading on the phone, e.g. Distance = 12.5."""
        name = _clean(name, 16) or '?'
        text = _clean(self._format(value), 24)
        for i, pair in enumerate(self._values):
            if pair[0] == name:
                if pair[1] != text:
                    pair[1] = text
                    self._dirty.add(i)
                break
        else:
            if len(self._values) >= _MAX_VALUES:
                if not self._warned:
                    self._warned = True
                    print('Phone control: only %d readings can be shown; "%s" left out.'
                          % (_MAX_VALUES, name))
                return
            self._values.append([name, text])
            self._dirty.add(len(self._values) - 1)
        self.update()

    def log(self, text):
        """Add a line to the phone's message log."""
        self._log_n += 1
        self._log.append((self._log_n, _clean(text, 60)))
        if len(self._log) > _LOG_KEEP:
            self._log.pop(0)
        self.update()

    def _feed(self, now):
        if self._last_feed_all is None or \
                time.ticks_diff(now, self._last_feed_all) >= _FEED_ALL_MS:
            self._last_feed_all = now
            self._dirty = set(range(len(self._values)))
        if self._dirty and (self._last_feed is None or
                            time.ticks_diff(now, self._last_feed) >= _FEED_MS):
            self._last_feed = now
            for i in sorted(self._dirty):
                name, text = self._values[i]
                self._write('#xrp v ' + name + '|' + text)
            self._dirty = set()
        sent = 0
        for n, text in self._log:
            if n > self._log_sent and sent < 3:
                self._write('#xrp p ' + text)
                self._log_sent = n
                sent += 1

    def release(self):
        self.buttons = [False] * 6
        self.edges = [False] * 6
        self.x = 0
        self.y = 0
