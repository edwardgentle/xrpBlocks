#!/usr/bin/env python3
"""Simulated tests for lib/LCD1602.py (LCD1602 16x2 and LCD2004 20x4) - no robot needed.

A stand-in `machine` module provides an I2C bus with a fake PCF8574 backpack
wired to a fake HD44780. The fake decodes the backpack bytes exactly as the
real panel would (4-bit mode, latching on the falling edge of E), so these
tests check what would appear on the screen, not just which calls were made.

    python tools/test_lcd1602.py

This does not replace a test on the real module: timing, contrast, the 5 V
supply and the backpack's actual pin map can only be checked on hardware.
"""

import sys
import time
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class FakeLCD:
    """HD44780 behind a PCF8574 (P0=RS, P1=RW, P2=E, P3=BL, P4-7=D4-7)."""

    def __init__(self):
        self.ddram = bytearray(b" " * 0x68)
        self.addr = 0
        self.four_bit = False
        self.half = None
        self.prev = 0
        self.backlight = False
        self.display_on = False
        self.cursor = False
        self.blink = False
        self.function = None
        self.init_nibbles = []

    def feed(self, byte):
        self.backlight = bool(byte & 0x08)
        e_fell = (self.prev & 0x04) and not (byte & 0x04)
        if e_fell:
            self._latch(byte >> 4, bool(byte & 0x01))
        self.prev = byte

    def _latch(self, nibble, rs):
        if not self.four_bit:
            # 8-bit mode: only the top nibble is wired, each latch is one instruction
            self.init_nibbles.append(nibble)
            if nibble == 0x2:
                self.four_bit = True
            return
        if self.half is None:
            self.half = nibble
            return
        value = (self.half << 4) | nibble
        self.half = None
        if rs:
            self.ddram[self.addr] = value
            self.addr = (self.addr + 1) % len(self.ddram)
        else:
            self._command(value)

    def _command(self, c):
        if c & 0x80:
            self.addr = c & 0x7F
        elif c & 0x20:
            self.function = c
        elif c & 0x08:
            self.display_on = bool(c & 0x04)
            self.cursor = bool(c & 0x02)
            self.blink = bool(c & 0x01)
        elif c == 0x01:
            self.ddram[:] = b" " * len(self.ddram)
            self.addr = 0

    def line(self, n, width=16):
        start = (0x00, 0x40, 0x14, 0x54)[n - 1]
        return bytes(self.ddram[start:start + width])


class FakeI2C:
    lcd = None
    address = 0x27
    unplugged = False

    def __init__(self, bus_id, sda=None, scl=None, freq=None):
        self.bus_id = bus_id

    def scan(self):
        if self.unplugged or self.bus_id != 0:
            return []
        return [self.address]

    def writeto(self, addr, data):
        if self.unplugged or addr != self.address or self.bus_id != 0:
            raise OSError(19)
        for b in data:
            FakeI2C.lcd.feed(b)


class FakePin:
    def __init__(self, name):
        if isinstance(name, str):
            raise ValueError("no named pins in this firmware")   # exercise the fallback


machine = types.ModuleType("machine")
machine.I2C = FakeI2C
machine.Pin = FakePin
sys.modules["machine"] = machine

_clock = [0]
time.sleep_ms = lambda ms: None
time.ticks_ms = lambda: _clock[0]
time.ticks_diff = lambda a, b: a - b
time.ticks_add = lambda a, b: a + b

sys.path.insert(0, str(ROOT / "lib"))
import LCD1602 as mod  # noqa: E402

failures = []


def check(name, got, want):
    if got != want:
        failures.append("%s: got %r, want %r" % (name, got, want))
    else:
        print("ok  ", name)


def fresh(address=0x27, wanted=None):
    FakeI2C.lcd = FakeLCD()
    FakeI2C.address = address
    FakeI2C.unplugged = False
    return mod.LCD1602(address=wanted)


def pad(s):
    return s.encode().ljust(16)


# 1. init sequence and auto address
lcd = fresh()
check("init: three 0x3 then 0x2", FakeI2C.lcd.init_nibbles, [3, 3, 3, 2])
check("init: function set 4-bit 2-line", FakeI2C.lcd.function, 0x28)
check("init: display on, no cursor", (FakeI2C.lcd.display_on, FakeI2C.lcd.cursor, FakeI2C.lcd.blink), (True, False, False))
check("init: backlight on", FakeI2C.lcd.backlight, True)
check("auto finds 0x27", lcd.address, 0x27)
lcd = fresh(address=0x3F)
check("auto finds 0x3F", (lcd.present, lcd.address), (True, 0x3F))
lcd = fresh(address=0x20)
check("auto ignores 0x20 (PCF8575 range)", lcd.present, False)
lcd = fresh(address=0x20, wanted=0x20)
check("explicit 0x20 works", lcd.present, True)

# 2. text
lcd = fresh()
lcd.write_line("Hello XRP!", 1)
check("write_line 1", FakeI2C.lcd.line(1), pad("Hello XRP!"))
lcd.write_line("This is far too long to fit", 2)
check("write_line clips", FakeI2C.lcd.line(2), b"This is far too ")
lcd.write_line("short", 2)
check("write_line replaces", FakeI2C.lcd.line(2), pad("short"))
lcd.write_value("temp", 23.456, 1)
check("write_value rounds", FakeI2C.lcd.line(1), pad("temp: 23.46"))
lcd.write_value("dist", 24.0, 2)
check("write_value drops .0", FakeI2C.lcd.line(2), pad("dist: 24"))
lcd.write_line("25°C", 1)
check("degree sign", FakeI2C.lcd.line(1)[:4], b"25\xdfC")
lcd.write_line("café", 1)
check("unknown char becomes ?", FakeI2C.lcd.line(1)[:4], b"caf?")
lcd.write_line("ABCDEFGHIJKLMNOP", 1)
lcd.write_at("xy", 3, 1)
check("write_at keeps rest", FakeI2C.lcd.line(1), b"ABxyEFGHIJKLMNOP")
lcd.write_at("END", 15, 1)
check("write_at clips at col 16", FakeI2C.lcd.line(1), b"ABxyEFGHIJKLMNEN")
lcd.write_line(7, 9)
check("line out of range clamps to 2", FakeI2C.lcd.line(2), pad("7"))

# 3. println
lcd = fresh()
lcd.println("one")
lcd.println("two")
check("println fills", (FakeI2C.lcd.line(1), FakeI2C.lcd.line(2)), (pad("one"), pad("two")))
lcd.println("three")
check("println scrolls", (FakeI2C.lcd.line(1), FakeI2C.lcd.line(2)), (pad("two"), pad("three")))
lcd.clear()
lcd.println("again")
check("clear resets println", (FakeI2C.lcd.line(1), FakeI2C.lcd.line(2)), (pad("again"), pad("")))

# 4. bar
lcd = fresh()
lcd.bar(50, 0, 100, 2)
check("bar half", FakeI2C.lcd.line(2), b"\xff" * 8 + b" " * 8)
lcd.bar(150, 0, 100, 2)
check("bar clamps high", FakeI2C.lcd.line(2), b"\xff" * 16)
lcd.bar(-5, 0, 100, 2)
check("bar clamps low", FakeI2C.lcd.line(2), b" " * 16)
lcd.bar(5, 5, 5, 2)
check("bar min==max", FakeI2C.lcd.line(2), b" " * 16)

# 5. scroll (3 chars/sec -> 333 ms per step, 1 s pauses)
lcd = fresh()
msg = "0123456789ABCDEFGHIJ"   # 20 chars, 4 steps to the end
_clock[0] = 0
lcd.scroll_text(msg, 1, 3)
check("scroll start", FakeI2C.lcd.line(1), b"0123456789ABCDEF")
_clock[0] = 900
lcd.scroll_text(msg, 1, 3)
check("scroll pauses at start", FakeI2C.lcd.line(1), b"0123456789ABCDEF")
_clock[0] = 1000
lcd.scroll_text(msg, 1, 3)
_clock[0] = 1340
lcd.scroll_text(msg, 1, 3)
check("scroll one step", FakeI2C.lcd.line(1), b"123456789ABCDEFG")
_clock[0] = 5000
lcd.scroll_text(msg, 1, 3)
check("scroll stops at end", FakeI2C.lcd.line(1), b"456789ABCDEFGHIJ")
_clock[0] = 6100
lcd.scroll_text(msg, 1, 3)
check("scroll restarts", FakeI2C.lcd.line(1), b"0123456789ABCDEF")
lcd.scroll_text("short", 2, 3)
check("short text stays", FakeI2C.lcd.line(2), pad("short"))
lcd.write_line("fixed", 1)
check("write_line stops scroll", FakeI2C.lcd.line(1), pad("fixed"))

# 6. panel controls
lcd = fresh()
lcd.backlight(False)
check("backlight off", FakeI2C.lcd.backlight, False)
lcd.write_line("dark", 1)
check("text keeps backlight off", FakeI2C.lcd.backlight, False)
lcd.backlight(True)
lcd.cursor("blink")
check("cursor blink", (FakeI2C.lcd.cursor, FakeI2C.lcd.blink), (False, True))
lcd.cursor("line")
check("cursor line", (FakeI2C.lcd.cursor, FakeI2C.lcd.blink), (True, False))
lcd.power(False)
check("power off keeps cursor", (FakeI2C.lcd.display_on, FakeI2C.lcd.cursor), (False, True))
lcd.power(True)
check("power on", FakeI2C.lcd.display_on, True)

# 7. missing and unplugged display
FakeI2C.unplugged = True
FakeI2C.lcd = FakeLCD()
lcd = mod.LCD1602()
lcd.write_line("nobody", 1)
lcd.println("home")
check("missing: no crash, not present", (lcd.present, lcd.is_connected()), (False, False))
lcd = fresh()
lcd.write_line("before", 1)
FakeI2C.unplugged = True
lcd.write_line("during", 2)
check("unplugged: not present", lcd.is_connected(), False)
FakeI2C.unplugged = False
FakeI2C.lcd = FakeLCD()     # a fresh panel, as after a real power cycle
check("replugged: connected", lcd.is_connected(), True)
check("replugged: text redrawn", (FakeI2C.lcd.line(1), FakeI2C.lcd.line(2)), (pad("before"), pad("during")))

# 8. 20x4 panel (LCD2004)
FakeI2C.lcd = FakeLCD()
FakeI2C.address = 0x27
FakeI2C.unplugged = False
lcd4 = mod.LCD2004()
check("2004: size", (lcd4.columns, lcd4.rows, lcd4.present), (20, 4, True))
for n in range(1, 5):
    lcd4.write_line("line %d" % n, n)
check("2004: four lines at the right addresses",
      [FakeI2C.lcd.line(n, 20) for n in range(1, 5)],
      [("line %d" % n).encode().ljust(20) for n in range(1, 5)])
lcd4.write_line("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 1)
check("2004: line 1 clips at 20", FakeI2C.lcd.line(1, 20), b"ABCDEFGHIJKLMNOPQRST")
check("2004: line 1 does not spill into line 3", FakeI2C.lcd.line(3, 20), b"line 3".ljust(20))
lcd4.write_at("END", 19, 4)
check("2004: write_at clips at col 20", FakeI2C.lcd.line(4, 20), b"line 4".ljust(18) + b"EN")
lcd4.bar(50, 0, 100, 3)
check("2004: bar uses 20 cells", FakeI2C.lcd.line(3, 20), b"\xff" * 10 + b" " * 10)
lcd4.write_line("five", 9)
check("2004: line out of range clamps to 4", FakeI2C.lcd.line(4, 20), b"five".ljust(20))
lcd4.clear()
for word in ("a", "b", "c", "d", "e"):
    lcd4.println(word)
check("2004: println fills four then scrolls",
      [FakeI2C.lcd.line(n, 20) for n in range(1, 5)],
      [w.encode().ljust(20) for w in ("b", "c", "d", "e")])
_clock[0] = 0
lcd4.scroll_text("0123456789ABCDEFGHIJKL", 2, 3)    # 22 chars, 2 steps
check("2004: scroll start", FakeI2C.lcd.line(2, 20), b"0123456789ABCDEFGHIJ")
_clock[0] = 1000
lcd4.scroll_text("0123456789ABCDEFGHIJKL", 2, 3)
_clock[0] = 5000
lcd4.scroll_text("0123456789ABCDEFGHIJKL", 2, 3)
check("2004: scroll reaches end", FakeI2C.lcd.line(2, 20), b"23456789ABCDEFGHIJKL")
try:
    mod.LCD1602(columns=16, rows=5)
    check("rejects 5 rows", "no error", "ValueError")
except ValueError:
    check("rejects 5 rows", "ValueError", "ValueError")

print()
if failures:
    for f in failures:
        print("FAIL", f)
    sys.exit(1)
print("all LCD1602 / LCD2004 checks passed")
