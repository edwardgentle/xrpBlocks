"""TCS34725 - RGB colour and clear-light sensor driver for MicroPython on the XRP.

Datasheet: ams TCS3472 (covers TCS34721/23/25/27); the register map, gain and
integration-time tables and the McCamy colour-temperature formula below are
ported from Adafruit's Adafruit_TCS34725 Arduino/CircuitPython driver
(https://github.com/adafruit/Adafruit_TCS34725, BSD licence), checked against
its source on 21 September 2026. `nearest_colour()` at the bottom is this
driver's own addition, not part of Adafruit's library.

WIRING
------
Qwiic / I2C only: VDD, GND, SCL, SDA. The bare TCS3472 chip also has an INT
pin (interrupt, open-drain active low); this driver does not use it. The chip
itself has no onboard LED - a breakout board with a white illumination LED
wires that LED to its own pin or straight to VDD, not through this driver.

ADDRESS
-------
0x29 for TCS34725/TCS34727 (this part). TCS34721/TCS34723 answer at 0x39
instead and are not what this driver expects.

READINGS TAKE TIME
-------------------
Each reading waits out the sensor's integration time (about 24 ms at the
default setting) so the value is fresh. red(), green(), blue(), clear_raw(),
lux() and colour_temperature() each take their own reading, so reading
several of them back to back for "the same" colour means several short waits
and slightly different moments in time. For matched R, G and B from one
instant, call raw() once and read the tuple.
"""

from machine import I2C, Pin
from time import sleep_ms

# -- registers (Adafruit_TCS34725.h) --------------------------------------

_COMMAND_BIT = 0x80

_ENABLE = 0x00
_ENABLE_AIEN = 0x10
_ENABLE_WEN = 0x08
_ENABLE_AEN = 0x02
_ENABLE_PON = 0x01
_ATIME = 0x01
_CONTROL = 0x0F
_ID = 0x12
_STATUS = 0x13
_CDATAL = 0x14
_RDATAL = 0x16
_GDATAL = 0x18
_BDATAL = 0x1A

# -- gain (TCS34725_CONTROL) -----------------------------------------------

GAIN_1X = 0x00
GAIN_4X = 0x01
GAIN_16X = 0x02
GAIN_60X = 0x03

# -- integration time (TCS34725_ATIME); a practical subset of the datasheet
#    table. Shorter times saturate less in bright light; longer times give
#    a steadier reading in dim light. --------------------------------------

IT_2_4MS = 0xFF   # 1 cycle,   max count 1024
IT_24MS = 0xF6    # 10 cycles, max count 10240
IT_50MS = 0xEB    # 21 cycles, max count 21504
IT_101MS = 0xD6   # 42 cycles, max count 43008
IT_154MS = 0xC0   # 64 cycles, max count 65535 (last time before analog sat.)
IT_240MS = 0x9C   # 100 cycles
IT_614MS = 0x00   # 256 cycles, the longest, steadiest reading

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
    """Return a list of (bus_id, address) for every TCS34725-family chip found."""
    found = []
    for spec in _BUS_CANDIDATES:
        try:
            bus = _open_bus(spec[0], spec[1], spec[2], spec[3], spec[4], freq)
            for addr in bus.scan():
                if addr in (0x29, 0x39):
                    found.append((spec[0], addr))
        except Exception:
            pass
    return found


class TCS34725:
    """A single TCS34725 (or TCS34727) colour sensor."""

    def __init__(self, address=0x29, i2c=None, freq=400000,
                 integration_time=IT_101MS, gain=GAIN_4X):
        self.address = address
        self.i2c = i2c if i2c is not None else self._find_bus(address, freq)

        chip_id = self._read8(_ID)
        if chip_id not in (0x44, 0x4D, 0x10):
            raise OSError(
                "Device at 0x%02X does not answer as a TCS34725/27 (got ID "
                "0x%02X). Check the Qwiic cable and the address." %
                (address, chip_id)
            )

        self._integration_time = integration_time
        self._gain = gain
        self.set_integration_time(integration_time)
        self.set_gain(gain)
        self.enable()

    # -- setup --------------------------------------------------------------

    @staticmethod
    def _find_bus(address, freq):
        for spec in _BUS_CANDIDATES:
            try:
                bus = _open_bus(spec[0], spec[1], spec[2], spec[3], spec[4], freq)
                if address in bus.scan():
                    return bus
            except Exception:
                pass
        raise OSError(
            "No TCS34725 answering at 0x%02X. Check the Qwiic cable and "
            "the power." % address
        )

    def _write8(self, reg, value):
        self.i2c.writeto_mem(self.address, _COMMAND_BIT | reg, bytes([value & 0xFF]))

    def _read8(self, reg):
        return self.i2c.readfrom_mem(self.address, _COMMAND_BIT | reg, 1)[0]

    def _read16(self, reg):
        data = self.i2c.readfrom_mem(self.address, _COMMAND_BIT | reg, 2)
        return data[0] | (data[1] << 8)   # low byte first, per the datasheet

    def _integration_delay_ms(self):
        # Adafruit's own margin: (256 - ATIME) * 12/5, +1 for truncation.
        return (256 - self._integration_time) * 12 // 5 + 1

    def enable(self):
        """Power the sensor up and start the ADC. Called automatically by setup."""
        self._write8(_ENABLE, _ENABLE_PON)
        sleep_ms(3)
        self._write8(_ENABLE, _ENABLE_PON | _ENABLE_AEN)
        sleep_ms(self._integration_delay_ms())

    def disable(self):
        """Power the sensor down to save current. set up / read again to wake it."""
        reg = self._read8(_ENABLE)
        self._write8(_ENABLE, reg & ~(_ENABLE_PON | _ENABLE_AEN))

    def set_integration_time(self, it):
        """Change how long the sensor collects light for, an IT_* constant."""
        self._write8(_ATIME, it)
        self._integration_time = it

    def set_gain(self, gain):
        """Change the sensor's sensitivity, a GAIN_* constant."""
        self._write8(_CONTROL, gain)
        self._gain = gain

    # -- readings -------------------------------------------------------------

    def raw(self):
        """One reading as (red, green, blue, clear), each a raw 0-65535 count."""
        c = self._read16(_CDATAL)
        r = self._read16(_RDATAL)
        g = self._read16(_GDATAL)
        b = self._read16(_BDATAL)
        sleep_ms(self._integration_delay_ms())
        return r, g, b, c

    def rgb(self):
        """One reading as (red, green, blue), each normalised to 0-255."""
        r, g, b, c = self.raw()
        if c == 0:
            return 0, 0, 0
        return (
            min(255, round(r / c * 255)),
            min(255, round(g / c * 255)),
            min(255, round(b / c * 255)),
        )

    def red(self):
        """Red, normalised to 0-255. Takes its own reading."""
        return self.rgb()[0]

    def green(self):
        """Green, normalised to 0-255. Takes its own reading."""
        return self.rgb()[1]

    def blue(self):
        """Blue, normalised to 0-255. Takes its own reading."""
        return self.rgb()[2]

    def clear_raw(self):
        """The clear (overall light level) channel, raw 0-65535. Takes its own reading."""
        return self.raw()[3]

    def lux(self):
        """A rough brightness estimate from R/G/B (Adafruit's calculateLux)."""
        r, g, b, c = self.raw()
        illuminance = (-0.32466 * r) + (1.57837 * g) + (-0.73191 * b)
        return round(illuminance)

    def colour_temperature(self):
        """A rough colour temperature in kelvin (McCamy's formula), or 0 if too dark."""
        r, g, b, c = self.raw()
        if r == 0 and g == 0 and b == 0:
            return 0
        x = (-0.14282 * r) + (1.54924 * g) + (-0.95641 * b)
        y = (-0.32466 * r) + (1.57837 * g) + (-0.73191 * b)
        z = (-0.68202 * r) + (0.77073 * g) + (0.56332 * b)
        total = x + y + z
        if total == 0:
            return 0
        xc = x / total
        yc = y / total
        denom = 0.1858 - yc
        if denom == 0:
            return 0
        n = (xc - 0.3320) / denom
        cct = (449.0 * n ** 3) + (3525.0 * n ** 2) + (6823.3 * n) + 5520.33
        return round(cct)

    # -- this driver's own addition, not from Adafruit -----------------------

    _NAMED_COLOURS = (
        ("black", (0, 0, 0)),
        ("white", (255, 255, 255)),
        ("red", (255, 0, 0)),
        ("green", (0, 255, 0)),
        ("blue", (0, 0, 255)),
        ("yellow", (255, 255, 0)),
        ("cyan", (0, 255, 255)),
        ("magenta", (255, 0, 255)),
    )

    def nearest_colour(self):
        """The closest of a small named-colour palette to the current reading.

        A simple nearest-neighbour match in RGB space against black, white,
        red, green, blue, yellow, cyan and magenta - a teaching aid, not a
        calibrated colour name library. Lighting and the sample's distance
        from the sensor both change the result; re-check against a known
        sample before trusting it for a marking rubric.
        """
        r, g, b = self.rgb()
        best_name = "black"
        best_dist = None
        for name, (cr, cg, cb) in self._NAMED_COLOURS:
            dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
            if best_dist is None or dist < best_dist:
                best_dist = dist
                best_name = name
        return best_name
