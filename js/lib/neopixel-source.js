/**
 * Generated from lib/NeoPixelStrip.py - keep the two in step.
 */

export const NEOPIXEL_SOURCE = `"""NeoPixelStrip - WS2812 / NeoPixel strip helper for MicroPython on the XRP.

Built on MicroPython's own \`neopixel\` module, which on the RP2 port drives the
strip with exact hardware timing. This wrapper adds the things a classroom
needs: brightness scaling, named colours, a rainbow, and a shift.

WIRING
------
Data  -> a real GPIO on the XRP. The signal wire of a servo header is the
         easiest physical connector (Servo 1 = GPIO 6, Servo 2 = GPIO 9,
         Servo 3 = GPIO 7, Servo 4 = GPIO 8), or use a spare pin, GPIO 12
         to GPIO 19.
Power -> for more than two or three pixels, give the strip its own supply
         and tie the grounds together. Ten pixels at full white draw about
         600 mA, which is far more than the board should provide.
Level -> a WS2812 running on 5 V wants a data HIGH of about 3.5 V and the
         XRP gives 3.3 V. It often works, but it is marginal. Powering the
         strip from about 3.7 to 4.2 V, or adding a level shifter, is the
         reliable fix.

A PCF8575 pin CANNOT drive a strip: WS2812 bits are 1.25 us long and an
I2C write takes tens of microseconds.

PIXEL NUMBERING
---------------
Pixels are numbered from 0, like the Python list they really are. The first
pixel on the strip is 0.

BRIGHTNESS
----------
set_brightness() takes a percentage, 0 to 100. It scales what is sent to the
strip; the colours you set are remembered at full value, so turning the
brightness back up restores them exactly.
"""

from machine import Pin

try:
    import neopixel
except ImportError:
    raise ImportError(
        "This MicroPython build has no 'neopixel' module. "
        "Update the firmware on the XRP."
    )

# Named colours at full value. Brightness scaling happens at write time.
COLOURS = {
    "off": (0, 0, 0),
    "black": (0, 0, 0),
    "red": (255, 0, 0),
    "orange": (255, 80, 0),
    "yellow": (255, 200, 0),
    "green": (0, 255, 0),
    "cyan": (0, 255, 255),
    "blue": (0, 0, 255),
    "purple": (128, 0, 255),
    "magenta": (255, 0, 255),
    "pink": (255, 80, 120),
    "white": (255, 255, 255),
}


def colour(name):
    """Look up a named colour, returning an (r, g, b) tuple."""
    try:
        return COLOURS[str(name).lower()]
    except KeyError:
        raise ValueError("Unknown colour: %s" % name)


def wheel(position):
    """Map 0-255 onto a colour wheel, returning an (r, g, b) tuple."""
    position = int(position) % 256
    if position < 85:
        return (255 - position * 3, position * 3, 0)
    if position < 170:
        position -= 85
        return (0, 255 - position * 3, position * 3)
    position -= 170
    return (position * 3, 0, 255 - position * 3)


class NeoPixelStrip:
    """A strip of WS2812 pixels on one GPIO pin."""

    def __init__(self, pin=6, count=10, brightness=30, auto_show=True):
        pin = int(pin)
        count = int(count)
        if count < 1 or count > 300:
            raise ValueError("Pixel count must be 1 to 300")
        self.pin = pin
        self.count = count
        self.auto_show = bool(auto_show)
        self._brightness = 0.0
        self._pixels = [(0, 0, 0)] * count      # colours as the user set them
        self._np = neopixel.NeoPixel(Pin(pin, Pin.OUT), count)
        self.set_brightness(brightness)          # this also blanks the strip

    # -- internals --------------------------------------------------------

    def _check(self, index):
        index = int(index)
        if index < 0 or index >= self.count:
            raise ValueError(
                "Pixel must be 0 to %d on this strip" % (self.count - 1)
            )
        return index

    @staticmethod
    def _as_rgb(value):
        """Accept (r, g, b), a colour name, or a 24-bit number."""
        if isinstance(value, str):
            return colour(value)
        if isinstance(value, int):
            return ((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF)
        r, g, b = value
        return (_clamp(r), _clamp(g), _clamp(b))

    def _push(self):
        """Copy the buffer to the strip, scaled by the brightness."""
        scale = self._brightness
        for i in range(self.count):
            r, g, b = self._pixels[i]
            self._np[i] = (int(r * scale), int(g * scale), int(b * scale))
        self._np.write()

    def _maybe_show(self):
        if self.auto_show:
            self._push()

    # -- settings ---------------------------------------------------------

    def set_brightness(self, percent):
        """Set the brightness as a percentage, 0 to 100."""
        percent = float(percent)
        if percent < 0:
            percent = 0.0
        elif percent > 100:
            percent = 100.0
        self._brightness = percent / 100.0
        self._push()   # brightness always takes effect at once

    def get_brightness(self):
        return int(round(self._brightness * 100))

    def set_auto_show(self, on):
        """True updates the strip on every change; False waits for show()."""
        self.auto_show = bool(on)
        if self.auto_show:
            self._push()

    # -- setting colours --------------------------------------------------

    def set_pixel(self, index, value):
        """Set one pixel. Accepts (r, g, b), a colour name or a 24-bit int."""
        self._pixels[self._check(index)] = self._as_rgb(value)
        self._maybe_show()

    def set_rgb(self, index, r, g, b):
        """Set one pixel from three separate 0-255 values."""
        self._pixels[self._check(index)] = (_clamp(r), _clamp(g), _clamp(b))
        self._maybe_show()

    def get_pixel(self, index):
        """The colour a pixel was set to, ignoring brightness."""
        return self._pixels[self._check(index)]

    def fill(self, value):
        """Set every pixel to the same colour."""
        self._pixels = [self._as_rgb(value)] * self.count
        self._maybe_show()

    def clear(self):
        """Switch every pixel off."""
        self._pixels = [(0, 0, 0)] * self.count
        self._push()   # off always takes effect at once

    def show(self):
        """Send the buffer to the strip."""
        self._push()

    # -- patterns ---------------------------------------------------------

    def shift(self, step=1):
        """Rotate the pattern along the strip. Positive moves towards the end."""
        step = int(step) % self.count
        if step:
            self._pixels = self._pixels[-step:] + self._pixels[:-step]
        self._maybe_show()

    def rainbow(self, offset=0):
        """Spread one full colour wheel across the whole strip."""
        offset = int(offset)
        span = 256 // self.count if self.count < 256 else 1
        self._pixels = [
            wheel(offset + i * span) for i in range(self.count)
        ]
        self._maybe_show()


def _clamp(value):
    value = int(value)
    if value < 0:
        return 0
    if value > 255:
        return 255
    return value
`;
