# Device libraries

A device library is **one JSON file** that adds a category of blocks for one
device: the blocks themselves, the Python each one generates, and the
MicroPython driver to copy onto the robot.

Nothing in the file is executed. It is data all the way down — strings,
numbers, lists — so a library can be emailed, dropped in a folder or fetched
from a URL without running anyone's code.

Ten libraries ship here: `pcf8575.json`, `neopixel.json`,
`ssd1315-oled.json`, `mecanum.json`, `remote-control.json`, `tcs34725.json`,
`lcd1602.json`, `lcd2004.json`, `triggers.json` and `ble-remote.json`.
See [Remote control setup](../docs/remote-control.md) and [mecanum setup](../docs/mecanum.md)
for the four-motor wheel layout and calibration. They are reference implementations; copy one and edit
it. The OLED one is the largest and was written to this document rather than
converted from existing code, so it is the best one to read.

## Adding a library in the IDE

Click **Library** in the toolbar. You can:

- **Add** one listed in `index.json` (the libraries that ship with the IDE)
- **Add from a file** — a `.json` someone sent you
- **Fetch** a URL — a raw file on a code host, or a school server

What you add is remembered in the browser, so it is still there tomorrow. Open
a saved project that uses blocks from a library you do not have, and the IDE
puts that library back for you if it is in the catalogue.

A library can only be removed once none of its blocks are left in your program.

## The catalogue: `index.json`

```json
{
  "catalogueVersion": 1,
  "libraries": [
    {
      "id": "pcf8575",
      "file": "pcf8575.json",
      "name": { "en": "PCF8575 I/O expander", "nl": "PCF8575 I/O-uitbreiding" },
      "description": { "en": "Sixteen extra pins over the Qwiic connector." },
      "version": "1.0.0",
      "colour": "#7E9BD8",
      "provides": ["xrp_pcf_setup", "xrp_pcf_led"]
    }
  ]
}
```

`provides` lists the block types the library defines. It is what lets the IDE
work out which library a saved project is missing, so keep it in step with the
manifest.

## The manifest

Every translatable field takes either a plain string or an object keyed by
language: `"name": "NeoPixel"` and `"name": { "en": "NeoPixel", "nl":
"NeoPixel-strip" }` are both fine. Missing languages fall back to English.

```json
{
  "manifestVersion": 1,
  "id": "pcf8575",
  "name": { "en": "PCF8575 I/O expander" },
  "description": { "en": "Sixteen extra pins over the Qwiic connector." },
  "version": "1.0.0",
  "author": "Your name",
  "licence": "MIT",
  "homepage": "",

  "category": { ... },
  "driver":   { ... },
  "instance": { ... },
  "lists":    { ... },
  "blocks":   [ ... ],
  "toolbox":  [ ... ]
}
```

`id` is lowercase letters, digits, hyphen or underscore. It has to be unique
across the libraries someone has added.

### `category`

How the device appears in the block palette.

```json
"category": {
  "key": "Expander",
  "label": { "en": "PCF8575" },
  "colour": "#7E9BD8",
  "colourDark": "#3D71DF",
  "iconSvg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"…\"/></svg>"
}
```

| Field        | Meaning |
|--------------|---------|
| `key`        | Stable name used by lesson files to show or hide this category. Defaults to `id`. |
| `label`      | What the learner sees. Defaults to `name`. |
| `colour`     | Six-digit hex. Used for the blocks and the category dot in light mode. |
| `colourDark` | Optional. The dark-mode colour. Leave it out and the IDE deepens `colour` until white text on it passes WCAG AA (4.5:1). |
| `iconSvg`    | Optional. An inline SVG, drawn as a white silhouette, so one file really is the whole library. |
| `icon`       | Optional. A path or data URI instead of `iconSvg`. A path only works if the file is there, so `iconSvg` travels better. |

### `driver`

The MicroPython file to copy onto the robot. It is uploaded the first time a
program actually mentions `marker`, and then stays in the robot's flash.

```json
"driver": {
  "filename": "PCF8575.py",
  "marker": "PCF8575",
  "source": "class PCF8575:\n    ...\n"
}
```

`marker` defaults to the filename without `.py`. Leave `driver` out entirely if
the device needs nothing beyond what MicroPython and XRPLib already provide.

### `instance`

Most devices are one object that every block talks to. Describe it once here
and the blocks stay short.

```json
"instance": {
  "name": "expander",
  "import": "from PCF8575 import PCF8575, INPUT, OUTPUT",
  "create": "PCF8575()",
  "createConfigured": "PCF8575(address={ADDR})"
}
```

Any block of the library creates the object lazily with `create`, so a program
still works if the learner forgets the setup block. A block marked
`"configuresInstance": true` builds it with `createConfigured` instead, filling
in that block's own arguments — that is what a "set up …" block is for.

Leave `instance` out for a device whose blocks are self-contained.

### `lists`

Shared dropdown lists, so a sixteen-pin list is written once and referenced as
`"$pins"`.

```json
"lists": {
  "pins": [
    { "label": "0 (P00)", "value": "0" },
    { "label": "1 (P01)", "value": "1" }
  ]
}
```

### `blocks`

```json
{
  "type": "xrp_pcf_led",
  "text": { "en": "PCF8575 LED on pin %1 %2" },
  "tooltip": { "en": "Switch an LED wired to this PCF8575 pin on or off." },
  "args": [
    { "type": "dropdown", "name": "PIN", "options": "$pins" },
    { "type": "dropdown", "name": "STATE", "options": [
      { "label": { "en": "on" }, "value": "ON", "code": "True" },
      { "label": { "en": "off" }, "value": "OFF", "code": "False" }
    ]}
  ],
  "inline": true,
  "shape": "statement",
  "code": "expander.led({PIN}, {STATE})\n"
}
```

| Field                | Meaning |
|----------------------|---------|
| `type`               | Unique block identifier. Prefix it with your device so it cannot clash: `xrp_pcf_led`, not `led`. |
| `text`               | The label. `%1`, `%2` … are the arguments, in order. `%%` is a literal percent sign. |
| `tooltip`            | Shown on hover. Worth writing: it is where a learner finds the units and the range. |
| `args`               | See below. Omit for a block with no arguments. |
| `inline`             | `true` puts the arguments on one line. |
| `shape`              | `"statement"` (default) or `"value"` for a block that reports something. |
| `returns`            | For `"value"`: `"Number"`, `"Boolean"`, `"String"`, `"Colour"` or your own type name. |
| `order`              | For `"value"`: the Blockly order, usually `"FUNCTION_CALL"`, `"ATOMIC"` or `"MEMBER"`. |
| `code`               | The Python. `{NAME}` is replaced by that argument. `{{` and `}}` give literal braces. |
| `configuresInstance` | `true` on the "set up …" block. |

#### Argument types

**Fields** sit inside the block:

| `type`         | What it is |
|----------------|------------|
| `dropdown`     | A list to pick from. `options` is an inline array or `"$listName"`. |
| `number_field` | A number typed into the block. `default`, `min`, `max`, `precision`. |
| `text_field`   | Text typed into the block. `default`. |
| `checkbox`     | A tick box. |
| `angle`        | An angle dial. |
| `colour_field` | A colour swatch. |

**Sockets** take another block plugged in:

| `type`    | What it accepts |
|-----------|-----------------|
| `number`  | Anything reporting a number |
| `text`    | Anything reporting text |
| `boolean` | Anything reporting true/false |
| `value`   | Anything; set `check` to restrict it, e.g. `"check": "Colour"` |

A socket takes `"default"`: the Python used when the learner leaves it empty.
For `xrp_np_fill` that is `"colour('off')"`.

Each dropdown option is `{ "label": …, "value": …, "code": … }`. `value` is
what gets saved in the project file, so **never change a value once people have
saved work with it**. `code` is what goes into the Python and defaults to
`value` — that is how `"ON"` becomes `True` without breaking saved projects.
The short form `["Label", "VALUE"]` also works where the two are the same.

### `toolbox`

The order the blocks appear in the palette, and the values that come
pre-plugged into their sockets.

```json
"toolbox": [
  { "block": "xrp_np_setup", "shadows": { "COUNT": 10 } },
  { "gap": 16 },
  { "block": "xrp_np_fill", "shadows": {
      "COLOUR": { "type": "xrp_np_colour", "fields": { "NAME": "blue" } }
  }}
]
```

A shadow is a number, a string, or `{ "type": …, "fields": … }` for a block.
Leave `toolbox` out and every block is listed in the order it is defined.

## Writing your own

1. Copy `neopixel.json` and change `id`, `name`, `category` and the block types.
2. Write the MicroPython driver first and test it on the robot by hand. Paste
   it into `driver.source` once it works — with `\n` for the line breaks, as
   JSON requires.
3. Start with two or three blocks. Add the rest once those generate the Python
   you expect; the Python panel at the bottom of the IDE shows it live.
4. Share the file, or add it to `index.json` to ship it with the IDE.

A manifest that does not validate is rejected whole, with a list of what is
wrong, rather than half-loading and breaking the palette.

## Pictures and the designer

`tools/oled-designer.html` is a mouse-driven sketch pad the size of the OLED.
Draw, press **Copy for XRP Blocks**, and paste the result into a `show picture`
block. Open it by double-clicking the file, or at `/tools/oled-designer.html`
when the local server is running.

The string it produces is one line of plain text:

    XRPI1:<width>:<height>:<base64>

The decoded bytes start with a mode byte — `0` means the screen bytes follow as
they are, `1` means they are `(count, value)` pairs — and the pixels themselves
are in the display's own MONO_VLSB layout, so they go straight out to the panel.
A mostly blank sketch shrinks to a few dozen characters; a noisy one falls back
to raw rather than growing. Because it is text, it travels in a Blockly text
block, an email or a lesson file with nothing to encode or decode by hand.

The encoder in the page and the decoder in `lib/SSD1315.py` are two separate
implementations of the same format, which is a place where a silent drift would
be painful. They are checked against each other: the page draws a set of test
pictures, and the driver's decoder has to return the same pixels for every one.

Any display library can reuse this. Copy the `_decode_picture` helper out of
`lib/SSD1315.py`, and point your own `show picture` block at it.

## Libraries from other block editors

Libraries written for other block editors (mBlock, MakeCode and the like) are
**not** in this format and cannot be dropped in as they are. Those projects use
their own extension formats, and some of them are JavaScript rather than data.
Converting one means mapping its blocks onto this manifest by hand, or writing
a converter for that one format. Worth doing for a format with many open-source
extensions; not something this IDE does for you today.

## Limits of the format

Deliberately, a manifest cannot run JavaScript. So it cannot do:

- dropdowns whose contents change based on another field
- blocks that grow and shrink (Blockly mutators)
- validation logic beyond what the field types give you

A device that genuinely needs one of those still needs a hand-written block
file. Everything the PCF8575 and NeoPixel categories did is expressible here,
which was the bar the format had to clear.

## OLED scrolling text

OLED library 2.1.0 adds **OLED scroll [message] on line [1] speed [30] pixels/sec**.
Place it inside a forever loop with a short wait (0.02 seconds). Long messages
scroll and repeat; short messages stay still. It does not block other loop work.
In manual updating mode, also use OLED update. Each line has separate state.

## OLED icon menu (2.2.0)

Use **show OLED icon [name] size [24 px] at x [0] y [0]** for the 14 bundled
icons from images/icons. Each SVG has been converted to monochrome pixels at
16, 24 and 32 pixels square. No file browsing or encoded text is needed. The
OLED is 128x64; use 16/24-pixel icons beside text and 32-pixel icons for emphasis.
The icon replaces its square area. Clear first when switching to a smaller icon.

The designer at tools/oled-designer.html contains a preview gallery; clicking
an icon loads it for editing. For custom drawings, copy the designer output into
**show custom picture data**. This input takes XRPI1 picture data, not an SVG
filename. Built-in icon payloads are embedded in the library so saved projects
work without access to the original SVG files.

## Character LCDs: 16x2 (1.1.0) and 20x4 (1.0.0)

`lcd1602.json` drives the common 16x2 character LCD with a PCF8574 I2C
backpack (for example the blue "BDD 16X2 I2C LCD"). Blocks: set up (automatic
finds 0x27 or 0x3F), clear, print, show on line 1 or 2, show a named reading,
write at a column, scroll long text, a bar across a line, backlight, text on
or off, cursor style, and "LCD is connected".

Before wiring it up:

- **Power it from 5 V.** Most of these modules are 5 V parts; on the 3.3 V
  Qwiic supply the backlight comes on but the text is faint or missing. Join
  the 5 V supply's GND to the XRP's GND.
- **The I2C lines.** The backpack usually pulls SDA and SCL up to its own
  supply. Check the RP2350 datasheet on 5 V tolerance, or use an I2C level
  shifter.
- **Contrast.** Backlight on but no text, or a row of solid blocks: turn the
  blue trimmer on the backpack.
- **Bus speed.** The driver opens the bus at 100 kHz (the PCF8574's rated
  speed). An OLED on the same bus redraws more slowly after that.

Automatic addressing deliberately skips 0x20-0x26 so it never grabs a PCF8575
expander; pick the address from the list if your backpack's solder pads have
been changed. `tools/test_lcd1602.py` checks the driver against a simulated
panel; it does not replace a test on the real module.

`lcd2004.json` is the same set of blocks for the 20x4 panel (for example the
"BMT 20X4 I2C SERIAL LCD"): lines 1 to 4, columns 1 to 20, a 20-cell bar. Its
blocks say "20x4 LCD" and use their own object (`lcd4`), so both libraries can
be added at once. Both share one driver file, `lib/LCD1602.py`, which holds
the `LCD1602` and `LCD2004` classes; the IDE copies it to the robot once.
If you edit the driver, run `tools/embed_drivers.py` so both manifests get
the new copy. On a 20x4 panel the controller continues line 1 into line 3
and line 2 into line 4; the driver clips each write at the end of its own
line, so that never shows.

## Triggers: lights and servos in the background (1.0.0)

`triggers.json` adds rules such as **while braking show red solid on the brake
light** that keep working while the program drives. A virtual timer checks
about 20 times a second: movement comes from the two drive wheels' encoders,
plus pins, line sensors, battery, time and values the program posts. Actions
are lights (onboard RGB, board LED, LEDs on pins, a strip of up to 30 pixels)
and servos, plus an opt-in emergency stop that brakes every motor until it is
cleared. It never drives the wheels. See [Triggers](../docs/triggers.md).
The Stop button stops the engine (see `js/serial/base-transport.js`).
`tools/test_triggers.py` checks the driver against stand-in hardware.

## Phone control over Bluetooth (1.0.0)

`ble-remote.json` lets an Android phone drive the robot over Bluetooth with a
joystick, a D-pad and six buttons. It reuses the robot's own Bluetooth serial
link (the one an IDE uses) instead of taking over the radio, so the phone and
a Bluetooth IDE cannot be connected at once. The phone page is
`phone/index.html` and must be opened from an https:// address in Chrome.
See [Phone control over Bluetooth](../docs/ble-remote.md).
`tools/test_ble_remote.py` checks the driver; `tools/test_phone_page.py` runs
the real page against the real driver in headless Chromium.
