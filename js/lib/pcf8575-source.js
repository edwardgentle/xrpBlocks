/**
 * Generated from lib/PCF8575.py - keep the two in step.
 */

export const PCF8575_SOURCE = `"""PCF8575 - 16-bit I2C I/O expander driver for MicroPython on the XRP.

Datasheet: NXP PCF8575, "Remote 16-bit I/O expander for I2C-bus".

HOW THE CHIP WORKS (this matters for wiring)
--------------------------------------------
The PCF8575 has quasi-bidirectional pins: there is no direction register.
A pin is an "input" simply by being left HIGH, which the chip does with a
weak current source (-30 to -300 uA). A pin driven LOW sinks a proper
10 to 25 mA.

So:

  LED    -> wire it ACTIVE LOW. LED anode to VDD through a resistor,
            cathode to the expander pin. The pin sinks the current.
            Driving the pin LOW lights the LED.

  Button -> wire the switch between the expander pin and GND.
            The chip's weak pull-up holds the pin HIGH when released,
            and the switch pulls it LOW when pressed. No resistor needed.

That is why led() and button() below default to active_low=True.

PIN NUMBERING
-------------
Pins are numbered 0 to 15:
    0 to 7   = P00 to P07  (first data byte)
    8 to 15  = P10 to P17  (second data byte)

ADDRESSES
---------
0x20 to 0x27, set by the A2 A1 A0 pins. With A2/A1/A0 tied low the
address is 0x20, which is the default here.
"""

from machine import I2C, Pin

OUTPUT = 0
INPUT = 1

# (bus id, named sda, named scl, fallback sda gpio, fallback scl gpio)
# Qwiic 1 shares the bus the IMU uses; Qwiic 0 is normally free.
_BUS_CANDIDATES = (
    (1, "I2C_SDA_1", "I2C_SCL_1", 38, 39),
    (0, "I2C_SDA_0", "I2C_SCL_0", 4, 5),
)


def _open_bus(bus_id, sda_name, scl_name, sda_gpio, scl_gpio, freq):
    """Open an I2C bus by board pin name, falling back to raw GPIO numbers."""
    try:
        return I2C(bus_id, sda=Pin(sda_name), scl=Pin(scl_name), freq=freq)
    except Exception:
        return I2C(bus_id, sda=Pin(sda_gpio), scl=Pin(scl_gpio), freq=freq)


def scan(freq=400000):
    """Return a list of (bus_id, address) for every PCF8575 found."""
    found = []
    for spec in _BUS_CANDIDATES:
        try:
            bus = _open_bus(spec[0], spec[1], spec[2], spec[3], spec[4], freq)
            for addr in bus.scan():
                if 0x20 <= addr <= 0x27:
                    found.append((spec[0], addr))
        except Exception:
            pass
    return found


class PCF8575:
    """A single PCF8575 expander."""

    def __init__(self, address=0x20, i2c=None, freq=400000):
        if not 0x20 <= address <= 0x27:
            raise ValueError("PCF8575 address must be 0x20 to 0x27")
        self.address = address
        self.i2c = i2c if i2c is not None else self._find_bus(address, freq)

        # Power-on reset leaves every pin HIGH, so start from that.
        self._state = 0xFFFF     # what we want the outputs to be
        self._inputs = 0x0000    # pins reserved as inputs, always held HIGH
        self._buf = bytearray(2)
        self._write()

    # -- setup ------------------------------------------------------------

    @staticmethod
    def _find_bus(address, freq):
        errors = []
        for spec in _BUS_CANDIDATES:
            try:
                bus = _open_bus(spec[0], spec[1], spec[2], spec[3], spec[4], freq)
                if address in bus.scan():
                    return bus
            except Exception as err:
                errors.append(err)
        raise OSError(
            "No PCF8575 answering at 0x%02X. Check the Qwiic cable, the "
            "power and the A0/A1/A2 address pins." % address
        )

    @staticmethod
    def _check(pin):
        pin = int(pin)
        if not 0 <= pin <= 15:
            raise ValueError("Expander pin must be 0 to 15")
        return pin

    # -- whole port -------------------------------------------------------

    def _write(self):
        # Pins reserved as inputs must always be written HIGH, otherwise the
        # chip holds them LOW and they can never read a button.
        value = (self._state | self._inputs) & 0xFFFF
        self._buf[0] = value & 0xFF          # P07..P00
        self._buf[1] = (value >> 8) & 0xFF   # P17..P10
        self.i2c.writeto(self.address, self._buf)

    def write_port(self, value):
        """Set all 16 pins at once from a 16-bit value."""
        self._state = int(value) & 0xFFFF
        self._write()

    def read_port(self):
        """Read all 16 pins as a 16-bit value."""
        data = self.i2c.readfrom(self.address, 2)
        return data[0] | (data[1] << 8)

    # -- individual pins --------------------------------------------------

    def pin_mode(self, pin, mode):
        """Reserve a pin as INPUT (held HIGH) or release it for OUTPUT."""
        mask = 1 << self._check(pin)
        if mode == INPUT:
            self._inputs |= mask
        else:
            self._inputs &= (~mask) & 0xFFFF
        self._write()

    def set_pin(self, pin, value):
        """Drive one pin HIGH (True) or LOW (False)."""
        mask = 1 << self._check(pin)
        self._inputs &= (~mask) & 0xFFFF   # driving it makes it an output
        if value:
            self._state |= mask
        else:
            self._state &= (~mask) & 0xFFFF
        self._write()

    def get_pin(self, pin):
        """Read one pin, returning 1 or 0."""
        return (self.read_port() >> self._check(pin)) & 1

    def toggle_pin(self, pin):
        """Flip one pin and return its new level."""
        mask = 1 << self._check(pin)
        self.set_pin(pin, not (self._state & mask))
        return 1 if self._state & mask else 0

    # -- friendly helpers -------------------------------------------------

    def led(self, pin, on, active_low=True):
        """Switch an LED on or off.

        active_low=True matches the recommended wiring: LED from VDD through
        a resistor into the pin, so the pin sinks the current.
        """
        on = bool(on)
        self.set_pin(pin, (not on) if active_low else on)

    def button(self, pin, active_low=True):
        """True while the button on this pin is pressed.

        active_low=True matches a switch wired from the pin to GND.
        """
        mask = 1 << self._check(pin)
        if not (self._inputs & mask):
            self.pin_mode(pin, INPUT)
        level = self.get_pin(pin)
        return level == 0 if active_low else level == 1

    def all_off(self, active_low=True):
        """Switch every LED off without disturbing pins reserved as inputs."""
        self._state = 0xFFFF if active_low else 0x0000
        self._write()
`;
