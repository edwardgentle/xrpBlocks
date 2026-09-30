# Historical replication snapshot: changes 1–28

[Documentation](docs/README.md) · [Development guide](docs/development.md) · [Change history](docs/CHANGELOG.md)

This is the source snapshot recorded on 20 September 2026 against upstream commit `cd39757` of [Stichting STEAMup/XRPBlocks](https://github.com/Stichting-STEAMup/XRPBlocks). It covers changes 1–28 only.

**Historical reference:** the embedded code and test claims below describe that snapshot. They do not reproduce or verify the current application. Use the repository source and [development guide](docs/development.md) for maintenance, and [Testing status](docs/testing-status.md) for later evidence. The original snapshot is retained below for traceability.

## 1. What changed, and why


| # | Change | Problem it solves | Type |
|---|--------|-------------------|------|
| 1 | Local web server with no-cache headers | Opening `index.html` from disk breaks the app; browser caching then breaks the toolbox | Deployment fix |
| 2 | `repeat forever` block | The Loops category had no infinite-loop block | Feature |
| 3 | Shadow value on `set variable to` | Blockly builds that block with an empty socket, which reads as broken | Usability fix |
| 4 | MicroPython compatibility patch | Any program using `change variable by` dies with `ImportError` before running | Bug fix, critical |
| 5 | PCF8575 I/O expander driver and blocks | No way to drive extra LEDs, buttons, relays or buzzers from Qwiic | Feature |
| 6 | NeoPixel strip driver and blocks | No way to control an addressable LED strip | Feature |
| 7 | Confirmation dialog before Deploy | Deploy silently overwrote `main.py` on the robot | Safety |
| 8 | Servo category rebuilt | Only two of four servos; unclamped angles; wrong documented range | Feature and safety |
| 9 | Motors category rebuilt | Untranslated labels; unclamped effort; tooltips missing units | Feature and safety |
| 10 | Gyro reset and heading blocks | Yaw accumulates from power-up and no block could zero it | Bug fix |
| 11 | Dropdowns replacing repeated blocks | Eight near-identical blocks where three would do | Usability |
| 12 | Toolbox tolerates unloaded blocks | One stale cached file broke every category, not just its own | Robustness |
| 13 | Dark mode | White labels on pale blocks; the yellow Board blocks measure 1.41:1 against white, far below the 4.5:1 WCAG AA asks | Accessibility |
| 14 | Device library system | Adding a device meant editing five source files, so only the IDE's author could do it | Architecture |
| 15 | OLED screen library | No way to show a reading on the robot itself; the console needs a tethered laptop | Feature |
| 16 | OLED drawing, compass arrow and sketch designer | Text only, and no way to make a picture without writing byte arrays by hand | Feature |
| 17 | Functions were never generated | Every program using the Functions category called a function that was never defined | Bug fix, critical |
| 18 | Block audit | A blink block that had never worked; a servo not in degrees; three effort conventions; unclamped drive effort; tooltips with no units | Bug fix and usability |
| 19 | Onboard RGB colour and brightness | See current addendum | Update |
| 20 | Delete unused blocks | See current addendum | Update |
| 21 | Panel pinning and unused-variable cleanup | See current addendum | Update |
| 22 | Remembered connections and non-interrupting Connect | See current addendum | Update |
| 23 | Mecanum wheels library | See current addendum | Update |
| 24 | General Remote control library | See current addendum | Update |
| 25 | Grid and game D-pad layouts | See current addendum | Update |
| 26 | Hotspot and network-join fixes | See current addendum | Update |
| 27 | Acknowledged USB uploads and cached-module refresh | See current addendum | Update |
| 28 | OLED scrolling text | See current addendum | Update |

Changes 14 to 16 are the structural ones. The IDE no longer contains any
built-in knowledge of a specific add-on device.

### 1.1 The defects, in detail

**Change 1. `file://` breaks the app, and caching breaks it again.** `index.html`
loads the vendored Blockly files as plain scripts but its own code as an ES
module:

```html
<script src="js/vendor/blockly/blockly_compressed.js"></script>   <!-- loads -->
<script type="module" src="js/app.js"></script>                   <!-- BLOCKED -->
```

Chrome and Edge block module scripts from a `file://` origin under CORS (origin
`null`). The canvas draws, but the code that wires up Connect XRP never runs, so
the page looks correct and does nothing. Web Serial also needs a secure context.
Serving over `http://localhost` solves both.

That exposes a second problem, which cost hours during development. Chrome
caches ES modules aggressively. After editing a block file you can end up
running a **new `toolbox.js` against an old block file**. The toolbox then asks
for a block the browser has never heard of and Blockly raises
`Invalid block definition for type: ...`, which breaks that category's flyout
**and every category opened afterwards**. `serve.py` sends `no-store` on
everything so that cannot happen, and change 12 makes the failure graceful even
if it somehow does.

Note for labs: a secure context means `localhost` or HTTPS. Serving from one
school machine to the rest over plain `http://192.168.x.x` loads the page but
the robot will never connect. Each machine needs its own copy and its own local
server.

**Change 3. Blockly's own inconsistency.** In the Variables flyout, Blockly
creates `math_change` with a shadow number plugged in, but creates
`variables_set` with an **empty** socket. Beginners read the empty socket as a
broken block and conclude there is no way to assign a value.

**Change 4. The critical one.** Blockly's Python generator targets CPython. The
`change variable by` block emits:

```python
from numbers import Number          # MicroPython has no such module
Blue = (Blue if isinstance(Blue, Number) else 0) + 1
```

MicroPython has no `numbers` module, so the robot raises
`ImportError: no module named 'numbers'` on the second line and the entire
program stops before executing anything. The observed symptom was an LED program
that did nothing at all, while an identical program using random values worked.
Three further standard blocks emit the same import: `is prime`, and the
`average` and `median` options of the list-maths block. Worth reporting upstream.

**Change 10. Why a gyro program appears frozen.** Found on real hardware. In
XRPLib's `imu.py`:

- `get_yaw()` merely returns `self.running_yaw`; it reads nothing itself.
- `running_yaw` is accumulated by a background `Timer` callback,
  `_update_imu_readings()`, started when the IMU object is created.
- `calibrate()` recomputes the gyro offsets and restarts that timer, but **never
  zeroes `running_yaw`**.

So yaw has been accumulating, with uncalibrated offsets, since the board powered
up. A program that maps yaw onto a servo finds the angle already far out of
range and the servo parked against its end stop. There was no block to zero it,
which is why change 10 adds one.


**Change 17: function definitions were never generated.** The most serious of
the lot, and present from the beginning. `_generateCode()` builds the program by
walking outwards from the `xrp_start` block, which is deliberate: loose blocks
left on the canvas are then ignored rather than silently joining the program.
But a function definition is a loose stack by nature, so the walk never reached
it. The call was emitted and the definition was not:

```python
for count in range(2):
    UP()          # there is no def UP() anywhere in the program
```

On the robot that is `NameError: name 'UP' isn't defined` at the first call.
Every program using the Functions category was affected, for any device. It
presented as "the program runs and nothing happens", because the traceback goes
to the Console tab. Fixed by generating every `procedures_defnoreturn` and
`procedures_defreturn` on the canvas before the start stack is walked; their
output lands in `definitions_`, which `finish()` emits above everything that
calls them. **Worth reporting upstream** with change 4.

**Change 18: `board.led_blink()` takes one argument, not two.** The block said
"blink LED N times with D delay" and generated `board.led_blink(3, 0.5)`.
XRPLib's `led_blink(frequency=0)` takes a frequency in Hz and starts a
background timer, so two arguments raise `TypeError` and the program stops on
that line. This block had never worked. It now generates a count-and-delay loop.

**Change 18: the servo was never in degrees.** `Servo.set_angle(d)` converts
straight to a pulse width, `d * 10 + 500` microseconds, so XRPLib's documented
0 to 200 is the full 500 to 2500 microsecond travel and 100 is the centre. It
was never an angle. The blocks now take 0 to 180 degrees and one helper converts
with `degrees * 10 / 9`, clamped five degrees from each end so the servo is not
driven into its own stop.

**Change 18: three effort conventions in one session.** "drive straight with 50%
effort", "set drive effort 0.5", and a Motors category offering both a 0 to 1
block and a percent block. Effort is percent everywhere visible now, and
`drivetrain.set_effort` and `drivetrain.arcade` are clamped, which neither they
nor XRPLib did before.

### 1.2 Hardware facts the drivers depend on

**PCF8575** (NXP datasheet, "Remote 16-bit I/O expander for I2C-bus"):

- Address `0100 A2 A1 A0`, so 0x20 to 0x27.
- Two data bytes per transfer: first is Port 0 (P07 to P00), second is Port 1
  (P17 to P10).
- Quasi-bidirectional pins, no direction register. "All ports programmed as
  input should be set to logic 1."
- A pin sinks 10 to 25 mA when LOW, but sources only 30 to 300 uA when HIGH.
- Power-on reset sets all I/Os to logic 1.

Therefore everything is wired **active low**: an LED from VDD through a resistor
into the pin, a button from the pin to GND using the chip's own weak pull-up.

**XRP Controller pinout** (SparkFun hardware overview):

| Function | Pins |
|----------|------|
| Qwiic 0 | GPIO 4 (SDA), GPIO 5 (SCL), I2C0 |
| Qwiic 1 | GPIO 38 (SDA), GPIO 39 (SCL), I2C1 |
| Servo 1 to 4 | GPIO 6, 9, 7, 8 |
| Free I/O | GPIO 12 to 19 |
| User button / onboard RGB LED | GPIO 36 / GPIO 37 |

XRPLib's IMU uses `I2C(id=1, scl=Pin("I2C_SCL_1"), sda=Pin("I2C_SDA_1"), freq=400000)`,
so Qwiic 1 shares the IMU's bus and Qwiic 0 is normally free.

**XRPLib ranges that are not range-checked.** Confirmed by reading the source:

- `Servo.set_angle(degrees)` takes **0 to 200**, which spans the full 500 to
  2500 microsecond pulse, so **100 is the centre, not 90**. No clamping: a value
  outside the range is converted straight to a pulse width and can strain the
  servo.
- `EncodedMotor.set_effort(effort)` takes **-1 to 1**. No clamping either.
- `EncodedMotor.set_speed(rpm)` is in **rpm**; `set_speed(None)` or `0` turns
  speed control off rather than braking.
- `Board.set_rgb_led()` does no range checking; values above 255 raise
  `ValueError` in the NeoPixel layer.

Every block that feeds these goes through a small clamping helper.

**Why a NeoPixel cannot run off the PCF8575.** WS2812 pixels take a single-wire
stream at 800 kHz, each bit 1.25 us long. A PCF8575 pin only changes when an I2C
transaction pushes it, on a bus running at 400 kHz at best, so each change costs
tens of microseconds: about two orders of magnitude too slow. The pin also
cannot source current, only sink it. The data line must go to a real GPIO.

---


**SSD1315 OLED (changes 15 and 16).** DisplayModule DM-OLED096-636, 0.96 inch,
128 by 64, monochrome. Facts taken from the SSD1315 datasheet rather than
assumed from the far more common SSD1306, whose command set it shares:

- Slave address 0x78 or 0x7A in the datasheet's 8-bit form, which is 0x3C or
  0x3D as MicroPython wants it. SA0, usually a solder link on the back of the
  module, chooses between them. Almost every board ships as 0x3C.
- Charge pump: command `0x8D` with `0x14` enables the internal pump at 7.5 V.
  `0x94` and `0x95` give 8.5 V and 9.0 V.
- Pixels are MONO_VLSB, one byte per eight vertical pixels, which is the layout
  `framebuf` produces, so the frame buffer goes straight out over I2C with a
  single `0x40` control byte in front of it.
- The panel itself is listed at 2.8 V. The usual breakout boards regulate 3.3 V
  down; a bare module should be checked against its own datasheet before going
  on Qwiic.
- Text is eight lines of sixteen characters because `framebuf` carries an 8 by 8
  font. That is where the "line 1 to 8" dropdown comes from.

**XRPLib facts confirmed from source during the change 18 audit**, not from the
documentation: `set_effort` on both `EncodedMotor` and `DifferentialDrive` does
no range checking; `Servo.set_angle` does no range checking; `set_speed` is
centimetres per second on the drivetrain and revolutions per minute on a single
motor; `Reflectance.get_left/right` return 0 for white to 1 for black;
`arcade(straight, turn)` computes `left = straight - turn` and
`right = straight + turn`.

## 2. Method


```bash
git clone https://github.com/Stichting-STEAMup/XRPBlocks.git
cd XRPBlocks
```

1. **Part A**: create or overwrite the files listed, exactly as given.
2. **Part B**: run `tools/embed_drivers.py`, which fills each device manifest's
   `driver.source` from the matching file in `lib/`.
3. **Part C**: verify.

Every changed file is supplied whole rather than as a patch. The previous
revision patched `index.html` and `css/index.css` because they were then mostly
upstream; both have since been modified substantially enough that a whole file
is safer, and a whole file cannot drift.

The working installation lives at
`C:\Users\Gentle\Desktop\XRP\XRPBlocks-main\XRPBlocks-main` on Windows.

---

## 3. Part A: the files

### 3.1 Running it locally (change 1)

`serve.py` is the important half: it forbids caching, which is what stops a stale
block file breaking the toolbox.

**`serve.py`**

```python
#!/usr/bin/env python3
"""Local web server for XRPBlocks.

Serves this folder on http://localhost so that ES modules and Web Serial work,
and tells the browser never to cache anything.

That last part matters. Chrome caches JavaScript modules aggressively, so after
an edit you can end up running a new toolbox.js against an old blocks file. The
toolbox then asks for a block the browser has never heard of and Blockly raises
"Invalid block definition for type: ...", which breaks that category's flyout
and every category opened after it. No-store headers make that impossible.

Usage:  python serve.py [port]
"""

import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

DEFAULT_PORT = 8765


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Static file handler that forbids caching."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # One tidy line per request, without the date noise.
        sys.stdout.write("  %s\n" % (fmt % args))
        sys.stdout.flush()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)

    if not os.path.exists("index.html"):
        print("ERROR: index.html was not found in this folder:")
        print("   " + root)
        return 1

    try:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    except ValueError:
        print("Port must be a number.")
        return 1

    address = "http://localhost:%d/" % port

    try:
        httpd = Server(("127.0.0.1", port), NoCacheHandler)
    except OSError as err:
        if getattr(err, "errno", None) in (48, 98, 10048):
            print("ERROR: port %d is already in use." % port)
            print("Close the other server, or run:  python serve.py %d" % (port + 1))
        else:
            print("ERROR: could not start the server: %s" % err)
        return 1

    print("Serving folder:")
    print("   " + root)
    print()
    print("   Address: " + address)
    print()
    print("Nothing is cached, so a normal refresh always loads your latest edit.")
    print("Leave this window OPEN while you work. Close it to stop the server.")
    print()

    threading.Timer(1.5, lambda: webbrowser.open(address)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Save the launcher with **CRLF line endings**; it is a Windows batch file.

**`start-xrpblocks.bat`**

```bat
@echo off
rem ---------------------------------------------------------------
rem  XRPBlocks launcher
rem  Serves THIS folder over http://localhost so that Web Serial
rem  works. Opening index.html directly from disk does NOT work,
rem  because the browser blocks the module script js/app.js.
rem  Keep this file in the same folder as index.html.
rem
rem  If the port is already in use, change PORT below to another
rem  number, for example 8766, and run this file again.
rem ---------------------------------------------------------------

setlocal
cd /d "%~dp0"
set PORT=8765

if not exist "index.html" (
  echo ERROR: index.html was not found in this folder:
  echo   %~dp0
  echo Put start-xrpblocks.bat in the same folder as index.html.
  echo.
  pause
  exit /b 1
)

netstat -ano | findstr /r /c:"127.0.0.1:%PORT% .*LISTENING" >nul 2>nul
if %errorlevel%==0 (
  echo ERROR: Port %PORT% is already in use by another program.
  echo Close that program, or edit this file and change PORT.
  echo.
  pause
  exit /b 1
)

echo Serving folder:
echo   %~dp0
echo.
echo   Address: http://localhost:%PORT%/
echo.
echo Your browser should open by itself. If it opens in something
echo other than Chrome or Edge, copy the address above into Chrome
echo or Edge instead, because only those support Web Serial.
echo.
echo Nothing is cached, so a normal refresh loads your latest edit.
echo.
echo Leave this black window OPEN while you work.
echo Close it when you are finished to stop the server.
echo.

rem serve.py opens the browser itself. This is only for the npx fallback.
if not exist "%~dp0serve.py" (
  start "" /min cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:%PORT%/"
)

rem serve.py adds no-cache headers, which stops the browser mixing an old
rem cached block file with a new toolbox. Fall back to the built-in server
rem only if serve.py is missing.
where py >nul 2>nul
if %errorlevel%==0 (
  if exist "%~dp0serve.py" (
    py -3 "%~dp0serve.py" %PORT%
  ) else (
    py -3 -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0"
  )
  goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
  if exist "%~dp0serve.py" (
    python "%~dp0serve.py" %PORT%
  ) else (
    python -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0"
  )
  goto :done
)

where npx >nul 2>nul
if %errorlevel%==0 (
  npx --yes serve -l %PORT% "%~dp0"
  goto :done
)

echo.
echo Neither Python nor Node.js was found on this computer.
echo.
echo Install Python from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH" during installation,
echo then run this file again.
echo.
pause
exit /b 1

:done
echo.
echo Server stopped.
pause
```

### 3.2 New block modules

`loops.js` adds `repeat forever`. The block deliberately has **no
`nextStatement`**, so nothing can follow it, which makes "this never ends"
visible in its shape.

**`js/blockly/blocks/loops.js`**

```js
/**
 * XRP Blocks — Loop block definitions
 * Adds a beginner-friendly "repeat forever" block (Scratch style).
 */

export function registerLoopBlocks() {
  // --- Repeat Forever ---
  Blockly.Blocks['xrp_forever'] = {
    init() {
      this.jsonInit({
        type: 'xrp_forever',
        message0: '%{BKY_XRP_FOREVER}',
        message1: '%1',
        args1: [
          { type: 'input_statement', name: 'DO' },
        ],
        previousStatement: null,
        // No nextStatement: nothing can follow a forever loop, which makes
        // the "this never ends" idea visible in the shape of the block.
        style: 'loop_blocks',
        tooltip: '%{BKY_XRP_FOREVER_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
```

**`js/blockly/generators/loops.js`**

```js
/**
 * XRP Blocks — Python generators for Loop blocks
 */

export function registerLoopGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;

  python.forBlock['xrp_forever'] = function (block, generator) {
    let branch = generator.statementToCode(block, 'DO');
    if (typeof generator.addLoopTrap === 'function') {
      branch = generator.addLoopTrap(branch, block);
    }
    if (!branch.trim()) {
      branch = generator.INDENT + 'pass\n';
    }
    if (!branch.endsWith('\n')) {
      branch += '\n';
    }
    return 'while True:\n' + branch;
  };
}
```

**`js/blockly/generators/micropython-compat.js`**

```js
/**
 * XRP Blocks — MicroPython compatibility fixes
 *
 * Blockly's Python generator targets CPython. A few standard blocks emit
 * `from numbers import Number`, and MicroPython has no `numbers` module, so
 * the very first line of the program raises ImportError and NOTHING runs.
 * The most common offender is the "change <var> by <n>" block.
 *
 * Two fixes:
 *   1. Regenerate "change <var> by <n>" as plain `x = x + n`.
 *   2. Anything else that still asks for `numbers` gets a one-line shim.
 *      `isinstance()` accepts a tuple, so `Number = (int, float)` behaves
 *      correctly for the generated checks.
 */

export function registerMicroPythonCompat(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  python.forBlock['math_change'] = function (block, generator) {
    const delta = generator.valueToCode(block, 'DELTA', Order.ADDITIVE) || '0';
    const varName = generator.getVariableName(block.getFieldValue('VAR'));
    return `${varName} = ${varName} + ${delta}\n`;
  };
}

/**
 * Replace CPython-only imports in generated code with MicroPython-safe
 * equivalents. Safe to call on every generation pass.
 *
 * @param {string} code - Generated Python code
 * @returns {string}
 */
export function patchMicroPythonImports(code) {
  if (!code) return code;
  return code.replace(
    /^from numbers import Number$/gm,
    'Number = (int, float)  # MicroPython has no "numbers" module'
  );
}
```

`isinstance()` accepts a tuple, so `Number = (int, float)` behaves correctly for
every check the three remaining offenders generate.

### 3.3 PCF8575 driver (change 5)


The blocks for this device no longer live in the IDE's source. They are in
`devices/pcf8575.json`, in section 3.8. What remains here is the MicroPython
driver, which is the readable copy and the one to edit; `tools/embed_drivers.py`
copies it into the manifest.

The wiring rules in the docstring are the important part. The chip has no
direction register, so a pin is an input purely by being left high, which is why
LEDs must be wired active low.

**`lib/PCF8575.py`**

```python
"""PCF8575 - 16-bit I2C I/O expander driver for MicroPython on the XRP.

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
```

**`images/icons/expander.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" xmlns:c2pa="http://c2pa.org/manifest"><metadata><c2pa:manifest>AAAWgmp1bWIAAAAeanVtZGMycGEAEQAQgAAAqgA4m3EDYzJwYQAAABZcanVtYgAAAEdqdW1kYzJtYQARABCAAACqADibcQN1cm46YzJwYTo4Y2U0NjA5ZC02OGY4LTQzNWItOTI1Ny1kYjY3OWFhMGQ4NWQAAAADl2p1bWIAAAApanVtZGMyYXMAEQAQgAAAqgA4m3EDYzJwYS5hc3NlcnRpb25zAAAAALxqdW1iAAAARGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaW5ncmVkaWVudC52MwAAAAAYYzJzaDhoWdmyOwDbhzh84CxqyT4AAABwY2JvcqNpZGM6Zm9ybWF0bWltYWdlL3N2Zyt4bWxqaW5zdGFuY2VJRHgseG1wOmlpZDo1ZDQ0YmZiOS0yNjdlLTQyMDktOWZkMi1lNmNmYjEyYmQ3MjNscmVsYXRpb25zaGlwaHBhcmVudE9mAAAB4mp1bWIAAABBanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5hY3Rpb25zLnYyAAAAABhjMnNom6aPXDOrIa6o034uD5CEuQAAAZljYm9yomdhY3Rpb25zgqJmYWN0aW9ua2MycGEub3BlbmVkanBhcmFtZXRlcnOha2luZ3JlZGllbnRzgaJjdXJseC1zZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmluZ3JlZGllbnQudjNkaGFzaFgg4Npz9hY9kF0zxiXZ3fH9EqYOm+NwgQDNZjpLZ3AlayakZmFjdGlvbngdY29tLmFudGhyb3BpYy5jbGF1ZGUucHJvdmlkZWRqcGFyYW1ldGVyc6F4H2NvbS5hbnRocm9waWMub3JpZ2luLWNvbmZpZGVuY2VndW5rbm93bmtkZXNjcmlwdGlvbnhmQ2xhdWRlIHByb3ZpZGVkIHRoaXMgZmlsZSBhdCB0aGUgcmVxdWVzdCBvZiBhIHVzZXIgYW5kIG1heSBoYXZlIGNyZWF0ZWQgb3IgbW9kaWZpZWQgdGhlIGZpbGUgY29udGVudHMubXNvZnR3YXJlQWdlbnShZG5hbWVmQ2xhdWRlcmFsbEFjdGlvbnNJbmNsdWRlZPUAAADIanVtYgAAAEBqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmhhc2guZGF0YQAAAAAYYzJzaA686vqMNxnzWSBpi8lHsKgAAACAY2JvcqVjYWxnZnNoYTI1NmNwYWRNAAAAAAAAAAAAAAAAAGRoYXNoWCAa+zxEuRPNryhcHzUXuai9ew+cRl5kWsZXdwDsP+Si22RuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBh7Zmxlbmd0aBkeBAAAAj5qdW1iAAAAJ2p1bWRjMmNsABEAEIAAAKoAOJtxA2MycGEuY2xhaW0udjIAAAACD2Nib3KlY2FsZ2ZzaGEyNTZpc2lnbmF0dXJleE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOjhjZTQ2MDlkLTY4ZjgtNDM1Yi05MjU3LWRiNjc5YWEwZDg1ZC9jMnBhLnNpZ25hdHVyZWppbnN0YW5jZUlEeCx4bXA6aWlkOjE4ZTU3ZTNlLTcyM2QtNDIzZS05NTc3LTJlYzRlMGI0NzY1YnJjcmVhdGVkX2Fzc2VydGlvbnODomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCDg2nP2Fj2QXTPGJdnd8f0Spg6b43CBAM1mOktncCVrJqJjdXJseCpzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmFjdGlvbnMudjJkaGFzaFggLPcKupZXEkIWH+uLizb/bQBkcr971Ds9fn/mN3kTleKiY3VybHgpc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFkaGFzaFggGRJWOiSAdO1Ix196iVqW7DzGZqKWPOXgMb7/fgUDQvF0Y2xhaW1fZ2VuZXJhdG9yX2luZm+jZG5hbWVvQW50aHJvcGljIEZpbGVzZ3ZlcnNpb25lMS4wLjBrc3BlY1ZlcnNpb25lMi40LjAAABA4anVtYgAAAChqdW1kYzJjcwARABCAAACqADibcQNjMnBhLnNpZ25hdHVyZQAAABAIY2JvctKEWQISogEmGCFZAgowggIGMIIBjaADAgECAhRA5aAK7sI50L64g/oGQgU9Z1UTADAKBggqhkjOPQQDAzBJMRcwFQYDVQQKEw5BbnRocm9waWMsIFBCQzEuMCwGA1UEAxMlQW50aHJvcGljIENvbnRlbnQgQ3JlZGVudGlhbHMgUm9vdCBDQTAeFw0yNjA4MDcxODQzNTZaFw0yODA4MDYxOTQzNTZaMEQxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMSkwJwYDVQQDEyBBbnRocm9waWMgQ2xhdWRlIENvbnRlbnQgU2lnbmluZzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJh6CmvLUBgFFNU0vUKlOVtE6djd17L5SuwX0LemFisBM3dkd/3cyjxFA3Qo5S46fX0/ihY0VZ7mfb9KF703t5OjWDBWMA4GA1UdDwEB/wQEAwIHgDAVBgNVHSUEDjAMBgorBgEEAYPoXgIBMAwGA1UdEwEB/wQCMAAwHwYDVR0jBBgwFoAUzlHiBIFOZFsj+OPEz5o+nMHXXMIwCgYIKoZIzj0EAwMDZwAwZAIwMXMdFJ4BetLLVY7ORuE9noqbbAZOZn/aArXyTwFAZfKrPzxF2vPoJNf1+UCdg1XGAjBwX1zd9WGqYkqmL5SFqw1QySjr1zJfpJM9+1rdDwSPLMOPOjKuiXjoU/pUUeG9RwmhY3BhZFkNngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPZYQCe2e5rhwXT7IGVdo59wF9hLdl6OzRsiVR7HHEpuRK9kiLN51Z9UBWBvdmC77vuPqU+5eRg/7d55DKxMwUu63qY=</c2pa:manifest></metadata><path d="M8 2h1.6v2H8zm3.2 0h1.6v2h-1.6zm3.2 0H16v2h-1.6zM8 20h1.6v2H8zm3.2 0h1.6v2h-1.6zm3.2 0H16v2h-1.6zM2 8h2v1.6H2zm0 3.2h2v1.6H2zm0 3.2h2V16H2zm18-6.4h2v1.6h-2zm0 3.2h2v1.6h-2zm0 3.2h2V16h-2zM5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1.6 1.6v10.8h10.8V6.6z"/></svg>
```

The icon file is now only used by the dead CSS rule `.cat-icon-expander`; the
manifest carries its own icon inline. It is listed for completeness.

### 3.4 NeoPixel driver (change 6)


As above: the blocks are in `devices/neopixel.json`, and this is the driver.

**`lib/NeoPixelStrip.py`**

```python
"""NeoPixelStrip - WS2812 / NeoPixel strip helper for MicroPython on the XRP.

Built on MicroPython's own `neopixel` module, which on the RP2 port drives the
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
```

**`images/icons/neopixel.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" xmlns:c2pa="http://c2pa.org/manifest"><metadata><c2pa:manifest>AAAWgmp1bWIAAAAeanVtZGMycGEAEQAQgAAAqgA4m3EDYzJwYQAAABZcanVtYgAAAEdqdW1kYzJtYQARABCAAACqADibcQN1cm46YzJwYTphNzI0ZmQ3ZC1jOGRjLTQyY2YtYjYzYi03MDdkNjhlMWJjZTUAAAADl2p1bWIAAAApanVtZGMyYXMAEQAQgAAAqgA4m3EDYzJwYS5hc3NlcnRpb25zAAAAALxqdW1iAAAARGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaW5ncmVkaWVudC52MwAAAAAYYzJzaALVAlDX8wvCKQTi+cvNm4UAAABwY2JvcqNpZGM6Zm9ybWF0bWltYWdlL3N2Zyt4bWxqaW5zdGFuY2VJRHgseG1wOmlpZDo1YWZkNGNiZS0xODBmLTQ0NTQtYWE1Yy1mNzI2MzZlYTFjNDBscmVsYXRpb25zaGlwaHBhcmVudE9mAAAB4mp1bWIAAABBanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5hY3Rpb25zLnYyAAAAABhjMnNotKv6bv+W3b6kHQYjxTK8AAAAAZljYm9yomdhY3Rpb25zgqJmYWN0aW9ua2MycGEub3BlbmVkanBhcmFtZXRlcnOha2luZ3JlZGllbnRzgaJjdXJseC1zZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmluZ3JlZGllbnQudjNkaGFzaFgg6oogZPi3JiQsfuZYpX1BKq6Vx8swxnT4bTWYVJUrFfGkZmFjdGlvbngdY29tLmFudGhyb3BpYy5jbGF1ZGUucHJvdmlkZWRqcGFyYW1ldGVyc6F4H2NvbS5hbnRocm9waWMub3JpZ2luLWNvbmZpZGVuY2VndW5rbm93bmtkZXNjcmlwdGlvbnhmQ2xhdWRlIHByb3ZpZGVkIHRoaXMgZmlsZSBhdCB0aGUgcmVxdWVzdCBvZiBhIHVzZXIgYW5kIG1heSBoYXZlIGNyZWF0ZWQgb3IgbW9kaWZpZWQgdGhlIGZpbGUgY29udGVudHMubXNvZnR3YXJlQWdlbnShZG5hbWVmQ2xhdWRlcmFsbEFjdGlvbnNJbmNsdWRlZPUAAADIanVtYgAAAEBqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmhhc2guZGF0YQAAAAAYYzJzaBBw+qZC75UdbK+/4exHmrYAAACAY2JvcqVjYWxnZnNoYTI1NmNwYWRNAAAAAAAAAAAAAAAAAGRoYXNoWCBAqSXx6xeqn2W4eipWxeyxgisTtr1QbT157zJY/rDYJ2RuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBh7Zmxlbmd0aBkeBAAAAj5qdW1iAAAAJ2p1bWRjMmNsABEAEIAAAKoAOJtxA2MycGEuY2xhaW0udjIAAAACD2Nib3KlY2FsZ2ZzaGEyNTZpc2lnbmF0dXJleE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOmE3MjRmZDdkLWM4ZGMtNDJjZi1iNjNiLTcwN2Q2OGUxYmNlNS9jMnBhLnNpZ25hdHVyZWppbnN0YW5jZUlEeCx4bXA6aWlkOmIxY2RjNWMxLWNhNjMtNDI1ZC1iZDYxLWYzMjg5NDZhZmI1OHJjcmVhdGVkX2Fzc2VydGlvbnODomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCDqiiBk+LcmJCx+5lilfUEqrpXHyzDGdPhtNZhUlSsV8aJjdXJseCpzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmFjdGlvbnMudjJkaGFzaFggogsdgI9iNfnOmDtH3qmYtFMOrXvkizTh3eXQ4SoWRmmiY3VybHgpc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFkaGFzaFggiGkMkOcKaZatVY4tMOpAab6u4aysTRM39fxbD4c/RfJ0Y2xhaW1fZ2VuZXJhdG9yX2luZm+jZG5hbWVvQW50aHJvcGljIEZpbGVzZ3ZlcnNpb25lMS4wLjBrc3BlY1ZlcnNpb25lMi40LjAAABA4anVtYgAAAChqdW1kYzJjcwARABCAAACqADibcQNjMnBhLnNpZ25hdHVyZQAAABAIY2JvctKEWQISogEmGCFZAgowggIGMIIBjaADAgECAhRA5aAK7sI50L64g/oGQgU9Z1UTADAKBggqhkjOPQQDAzBJMRcwFQYDVQQKEw5BbnRocm9waWMsIFBCQzEuMCwGA1UEAxMlQW50aHJvcGljIENvbnRlbnQgQ3JlZGVudGlhbHMgUm9vdCBDQTAeFw0yNjA4MDcxODQzNTZaFw0yODA4MDYxOTQzNTZaMEQxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMSkwJwYDVQQDEyBBbnRocm9waWMgQ2xhdWRlIENvbnRlbnQgU2lnbmluZzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJh6CmvLUBgFFNU0vUKlOVtE6djd17L5SuwX0LemFisBM3dkd/3cyjxFA3Qo5S46fX0/ihY0VZ7mfb9KF703t5OjWDBWMA4GA1UdDwEB/wQEAwIHgDAVBgNVHSUEDjAMBgorBgEEAYPoXgIBMAwGA1UdEwEB/wQCMAAwHwYDVR0jBBgwFoAUzlHiBIFOZFsj+OPEz5o+nMHXXMIwCgYIKoZIzj0EAwMDZwAwZAIwMXMdFJ4BetLLVY7ORuE9noqbbAZOZn/aArXyTwFAZfKrPzxF2vPoJNf1+UCdg1XGAjBwX1zd9WGqYkqmL5SFqw1QySjr1zJfpJM9+1rdDwSPLMOPOjKuiXjoU/pUUeG9RwmhY3BhZFkNngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPZYQLVwmrL+139h+3ofPIm3gVjyKenE7ToWaaXArkkBtwKCtcc0+7usazH9zml9RRX3wI2hYWbXzp8iGMMz8rScIFU=</c2pa:manifest></metadata><path d="M2 9.5h20a1.5 1.5 0 0 1 1.5 1.5v2A1.5 1.5 0 0 1 22 14.5H2A1.5 1.5 0 0 1 .5 13v-2A1.5 1.5 0 0 1 2 9.5zm2.6 1.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm3.7 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm3.7 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm3.7 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm3.7 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM11 3h2v4.5h-2zm0 13.5h2V21h-2z"/></svg>
```

### 3.5 Deploy confirmation (change 7)

XRPBlocks already had a Deploy button that saves the program to the robot as
`main.py`. That name is required, not a convention: MicroPython runs `boot.py`
then `main.py` from the filesystem root at startup, so a file saved under any
other name never auto-starts. Deploy overwrote it without asking, hence the
dialog. Cancel is focused on open and there is deliberately no Enter shortcut,
so a stray keypress cannot overwrite a learner's robot.

**`js/ui/confirm-modal.js`**

```js
/**
 * XRP Blocks — Confirmation Modal
 *
 * A yes/no dialog in the same style as the connection picker, used before
 * anything that overwrites work on the robot.
 *
 * Usage:
 *   import { ConfirmModal } from './ui/confirm-modal.js';
 *   const ok = await ConfirmModal.ask({
 *     title: 'Save to the robot?',
 *     body: 'This replaces main.py on the XRP.',
 *     confirmLabel: 'Save to XRP',
 *     cancelLabel: 'Cancel',
 *   });
 */

export class ConfirmModal {
  /**
   * Show the dialog and resolve true only if the user confirms. Dismissing it
   * with the close button, the Escape key or a click on the backdrop all
   * resolve false, so a cancel is always the safe default.
   *
   * @param {{title?: string, body?: string, detail?: string,
   *          confirmLabel?: string, cancelLabel?: string}} options
   * @returns {Promise<boolean>}
   */
  static ask({ title, body, detail, confirmLabel, cancelLabel } = {}) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const bodyEl = document.getElementById('confirm-modal-body');
      const detailEl = document.getElementById('confirm-modal-detail');
      const okBtn = document.getElementById('confirm-modal-ok');
      const cancelBtn = document.getElementById('confirm-modal-cancel');
      const closeBtn = document.getElementById('confirm-modal-close');

      if (!modal || !okBtn || !cancelBtn) {
        // Markup missing: fall back to the browser's own dialog rather than
        // silently going ahead with a destructive action.
        resolve(window.confirm(`${title || ''}\n\n${body || ''}`.trim()));
        return;
      }

      if (title) titleEl.textContent = title;
      if (body) bodyEl.textContent = body;
      if (detailEl) {
        detailEl.textContent = detail || '';
        detailEl.hidden = !detail;
      }
      if (confirmLabel) okBtn.textContent = confirmLabel;
      if (cancelLabel) cancelBtn.textContent = cancelLabel;

      modal.classList.add('visible');
      document.body.classList.add('modal-open');

      const close = (result) => {
        modal.classList.remove('visible');
        document.body.classList.remove('modal-open');
        cleanup();
        resolve(result);
      };

      const onOk = () => close(true);
      const onCancel = () => close(false);
      const onOverlay = (e) => { if (e.target === modal) close(false); };
      // Escape cancels. There is deliberately no Enter shortcut: the focused
      // button is Cancel, and a stray keypress must not overwrite the robot.
      const onKey = (e) => { if (e.key === 'Escape') close(false); };

      const cleanup = () => {
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn?.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onOverlay);
        document.removeEventListener('keydown', onKey);
      };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn?.addEventListener('click', onCancel);
      modal.addEventListener('click', onOverlay);
      document.addEventListener('keydown', onKey);

      // Focus Cancel, so a stray Space or Enter does not overwrite the robot.
      cancelBtn.focus();
    });
  }
}
```

### 3.6 The block families (changes 8 to 11, and 18)


These are the core categories. Change 18 rewrote three of the generators and
left the block definitions alone, because the labels and sockets did not need to
move; only the Python behind them did.

- **Servo**: the generator converts 0 to 180 degrees into XRPLib's pulse units
  with `degrees * 10 / 9`, clamped by `SAFE_LOW` and `SAFE_HIGH`, which are
  written into the generated helper so a class can widen them by hand.
- **Drivetrain**: effort is percent, converted and clamped by one `xrp_effort`
  helper, with `lowest=0` for the maximum effort of a measured drive where a
  negative value makes no sense.
- **Board**: `led_blink` generates a count-and-delay loop instead of calling
  XRPLib's one-argument `board.led_blink()`.

**`js/blockly/blocks/servo.js`**

```js
/**
 * XRP Blocks — Servo block definitions
 * Maps to XRPLib Servo API
 *
 * XRPLib's angle range is 0 to 200, which spans the full 500 to 2500 us pulse
 * of a standard hobby servo. That makes 100 the true centre, not 90.
 *
 * Servos 3 and 4 exist on the XRP Controller but not on the XRP Beta.
 */

export function registerServoBlocks() {
  const SERVO_OPTIONS = [
    ['%{BKY_XRP_SERVO_1}', '1'],
    ['%{BKY_XRP_SERVO_2}', '2'],
    ['%{BKY_XRP_SERVO_3}', '3'],
    ['%{BKY_XRP_SERVO_4}', '4'],
  ];

  // --- Set Servo Angle ---
  Blockly.Blocks['xrp_servo_set_angle'] = {
    init() {
      this.jsonInit({
        type: 'xrp_servo_set_angle',
        message0: '%{BKY_XRP_SERVO_SET_ANGLE}',
        args0: [
          { type: 'field_dropdown', name: 'SERVO', options: SERVO_OPTIONS },
          { type: 'input_value', name: 'ANGLE', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'servo_blocks',
        tooltip: '%{BKY_XRP_SERVO_SET_ANGLE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Centre Servo ---
  Blockly.Blocks['xrp_servo_centre'] = {
    init() {
      this.jsonInit({
        type: 'xrp_servo_centre',
        message0: '%{BKY_XRP_SERVO_CENTRE}',
        args0: [
          { type: 'field_dropdown', name: 'SERVO', options: SERVO_OPTIONS },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'servo_blocks',
        tooltip: '%{BKY_XRP_SERVO_CENTRE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Sweep Servo ---
  Blockly.Blocks['xrp_servo_sweep'] = {
    init() {
      this.jsonInit({
        type: 'xrp_servo_sweep',
        message0: '%{BKY_XRP_SERVO_SWEEP}',
        args0: [
          { type: 'field_dropdown', name: 'SERVO', options: SERVO_OPTIONS },
        ],
        message1: '%{BKY_XRP_SERVO_SWEEP_RANGE}',
        args1: [
          { type: 'input_value', name: 'FROM', check: 'Number' },
          { type: 'input_value', name: 'TO', check: 'Number' },
        ],
        message2: '%{BKY_XRP_SERVO_SWEEP_TIME}',
        args2: [
          { type: 'input_value', name: 'SECONDS', check: 'Number' },
        ],
        // Four arguments on one row makes a block wider than the flyout, so
        // this one stacks its inputs instead of running them inline.
        inputsInline: false,
        previousStatement: null,
        nextStatement: null,
        style: 'servo_blocks',
        tooltip: '%{BKY_XRP_SERVO_SWEEP_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Continuous rotation speed ---
  Blockly.Blocks['xrp_servo_speed'] = {
    init() {
      this.jsonInit({
        type: 'xrp_servo_speed',
        message0: '%{BKY_XRP_SERVO_SPEED}',
        args0: [
          { type: 'field_dropdown', name: 'SERVO', options: SERVO_OPTIONS },
          { type: 'input_value', name: 'SPEED', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'servo_blocks',
        tooltip: '%{BKY_XRP_SERVO_SPEED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Free Servo ---
  Blockly.Blocks['xrp_servo_free'] = {
    init() {
      this.jsonInit({
        type: 'xrp_servo_free',
        message0: '%{BKY_XRP_SERVO_FREE}',
        args0: [
          { type: 'field_dropdown', name: 'SERVO', options: SERVO_OPTIONS },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'servo_blocks',
        tooltip: '%{BKY_XRP_SERVO_FREE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
```

**`js/blockly/generators/servo.js`**

```js
/**
 * XRP Blocks — Python generators for Servo blocks
 *
 * THE BLOCKS ARE IN DEGREES, 0 TO 180. XRPLIB IS NOT.
 * ---------------------------------------------------
 * XRPLib's `set_angle(d)` is not really degrees at all: it converts straight to
 * a pulse width with `d * 10 + 500` microseconds, so its 0 to 200 covers the
 * full 500 to 2500 us travel of a hobby servo and 100 is the centre. Students
 * reach for a protractor, not a pulse width, so every block here takes plain
 * degrees and one helper does the conversion:
 *
 *     0 degrees   ->  500 us   (XRPLib   0)
 *     90 degrees  -> 1500 us   (XRPLib 100, the centre)
 *     180 degrees -> 2500 us   (XRPLib 200)
 *
 * XRPLib does no range checking, so a value outside that span drives the servo
 * past its stop. The helper clamps, and holds back a few degrees at each end so
 * a servo cannot be pushed into its own mechanical stop, where it buzzes, draws
 * current and gets hot. SAFE_LOW and SAFE_HIGH sit at the top of the generated
 * helper so a class with an unusual servo can widen or narrow them by hand.
 */

/** Degrees the blocks accept. */
const DEGREES_MIN = 0;
const DEGREES_MAX = 180;

/** Held back from each end so the servo never reaches its mechanical stop. */
const SAFE_LOW = 5;
const SAFE_HIGH = 175;

/** Degrees to XRPLib units: 180 degrees of travel over 200 units. */
const UNITS_PER_DEGREE = 10 / 9;

export function registerServoGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  const SERVO_MAP = {
    '1': 'servo_one',
    '2': 'servo_two',
    '3': 'servo_three',
    '4': 'servo_four',
  };

  function getServoVar(block) {
    return SERVO_MAP[block.getFieldValue('SERVO')] || 'servo_one';
  }

  /** The degrees-to-XRPLib helper, emitted once however many blocks use it. */
  function provideSetAngle(generator) {
    return generator.provideFunction_('xrp_servo_degrees', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(servo, degrees):',
      '  # The blocks are in degrees, 0 to 180. XRPLib\'s set_angle wants 0 to',
      '  # 200, which is really the pulse width: 0 = 500us, 200 = 2500us.',
      '  # A few degrees are held back at each end so the servo is never',
      '  # driven into its own stop. Widen these two if your servo can take it.',
      `  SAFE_LOW = ${SAFE_LOW}`,
      `  SAFE_HIGH = ${SAFE_HIGH}`,
      '  if degrees < SAFE_LOW:',
      '    degrees = SAFE_LOW',
      '  elif degrees > SAFE_HIGH:',
      '    degrees = SAFE_HIGH',
      '  servo.set_angle(degrees * 10 / 9)',
    ]);
  }

  python.forBlock['xrp_servo_set_angle'] = function (block, generator) {
    const setAngle = provideSetAngle(generator);
    const angle = generator.valueToCode(block, 'ANGLE', Order.NONE) || '90';
    return `${setAngle}(${getServoVar(block)}, ${angle})\n`;
  };

  python.forBlock['xrp_servo_centre'] = function (block, generator) {
    const setAngle = provideSetAngle(generator);
    // 90 degrees is the middle of 0 to 180, and lands on XRPLib's 100.
    return `${setAngle}(${getServoVar(block)}, 90)\n`;
  };

  python.forBlock['xrp_servo_speed'] = function (block, generator) {
    const setAngle = provideSetAngle(generator);
    const speed = generator.valueToCode(block, 'SPEED', Order.MULTIPLICATIVE) || '0';
    // A continuous rotation servo sits still at the centre pulse and runs
    // faster the further the pulse moves from it, so -100..100 percent maps
    // onto 0..180 degrees around the 90 degree centre.
    return `${setAngle}(${getServoVar(block)}, 90 + (${speed}) * 0.9)\n`;
  };

  python.forBlock['xrp_servo_sweep'] = function (block, generator) {
    const setAngle = provideSetAngle(generator);
    generator.definitions_['import_time'] = 'import time';
    const sweep = generator.provideFunction_('xrp_servo_sweep', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(servo, start, end, seconds):',
      '  # 50 steps a second is smooth to the eye and matches the servo\'s own',
      '  # 50 Hz update rate, so asking for more would not move it any sooner.',
      '  steps = int(seconds * 50)',
      '  if steps < 1:',
      '    steps = 1',
      '  for i in range(steps + 1):',
      '    ' + setAngle + '(servo, start + (end - start) * i / steps)',
      '    time.sleep(seconds / steps)',
    ]);
    const from = generator.valueToCode(block, 'FROM', Order.NONE) || String(DEGREES_MIN);
    const to = generator.valueToCode(block, 'TO', Order.NONE) || String(DEGREES_MAX);
    const seconds = generator.valueToCode(block, 'SECONDS', Order.NONE) || '1';
    return `${sweep}(${getServoVar(block)}, ${from}, ${to}, ${seconds})\n`;
  };

  python.forBlock['xrp_servo_free'] = function (block) {
    return `${getServoVar(block)}.free()\n`;
  };
}

export const SERVO_LIMITS = { DEGREES_MIN, DEGREES_MAX, SAFE_LOW, SAFE_HIGH, UNITS_PER_DEGREE };
```

**`js/blockly/blocks/motors.js`**

```js
/**
 * XRP Blocks — Motor block definitions
 * Maps to XRPLib EncodedMotor API
 */

export function registerMotorBlocks() {
  const MOTOR_OPTIONS = [
    ['%{BKY_XRP_LEFT}', 'LEFT'],
    ['%{BKY_XRP_RIGHT}', 'RIGHT'],
    ['%{BKY_XRP_MOTOR_3}', 'MOTOR3'],
    ['%{BKY_XRP_MOTOR_4}', 'MOTOR4'],
  ];

  // --- Set Motor Effort ---
  Blockly.Blocks['xrp_motor_set_effort'] = {
    init() {
      this.jsonInit({
        type: 'xrp_motor_set_effort',
        message0: '%{BKY_XRP_MOTOR_SET_EFFORT}',
        args0: [
          { type: 'field_dropdown', name: 'MOTOR', options: MOTOR_OPTIONS },
          { type: 'input_value', name: 'EFFORT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'motor_blocks',
        tooltip: '%{BKY_XRP_MOTOR_SET_EFFORT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Set Motor Speed ---
  Blockly.Blocks['xrp_motor_set_speed'] = {
    init() {
      this.jsonInit({
        type: 'xrp_motor_set_speed',
        message0: '%{BKY_XRP_MOTOR_SET_SPEED}',
        args0: [
          { type: 'field_dropdown', name: 'MOTOR', options: MOTOR_OPTIONS },
          { type: 'input_value', name: 'SPEED', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'motor_blocks',
        tooltip: '%{BKY_XRP_MOTOR_SET_SPEED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Set Motor Effort as a percentage ---
  Blockly.Blocks['xrp_motor_set_effort_percent'] = {
    init() {
      this.jsonInit({
        type: 'xrp_motor_set_effort_percent',
        message0: '%{BKY_XRP_MOTOR_SET_EFFORT_PERCENT}',
        args0: [
          { type: 'field_dropdown', name: 'MOTOR', options: MOTOR_OPTIONS },
          { type: 'input_value', name: 'PERCENT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'motor_blocks',
        tooltip: '%{BKY_XRP_MOTOR_SET_EFFORT_PERCENT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Turn speed control off ---
  Blockly.Blocks['xrp_motor_speed_off'] = {
    init() {
      this.jsonInit({
        type: 'xrp_motor_speed_off',
        message0: '%{BKY_XRP_MOTOR_SPEED_OFF}',
        args0: [
          { type: 'field_dropdown', name: 'MOTOR', options: MOTOR_OPTIONS },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'motor_blocks',
        tooltip: '%{BKY_XRP_MOTOR_SPEED_OFF_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Get Motor Position ---
  Blockly.Blocks['xrp_motor_get_position'] = {
    init() {
      this.jsonInit({
        type: 'xrp_motor_get_position',
        message0: '%{BKY_XRP_MOTOR_GET_POSITION}',
        args0: [
          { type: 'field_dropdown', name: 'MOTOR', options: MOTOR_OPTIONS },
        ],
        output: 'Number',
        style: 'motor_blocks',
        tooltip: '%{BKY_XRP_MOTOR_GET_POSITION_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Get Motor Speed ---
  Blockly.Blocks['xrp_motor_get_speed'] = {
    init() {
      this.jsonInit({
        type: 'xrp_motor_get_speed',
        message0: '%{BKY_XRP_MOTOR_GET_SPEED}',
        args0: [
          { type: 'field_dropdown', name: 'MOTOR', options: MOTOR_OPTIONS },
        ],
        output: 'Number',
        style: 'motor_blocks',
        tooltip: '%{BKY_XRP_MOTOR_GET_SPEED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Get Motor Position in encoder counts ---
  Blockly.Blocks['xrp_motor_get_counts'] = {
    init() {
      this.jsonInit({
        type: 'xrp_motor_get_counts',
        message0: '%{BKY_XRP_MOTOR_GET_COUNTS}',
        args0: [
          { type: 'field_dropdown', name: 'MOTOR', options: MOTOR_OPTIONS },
        ],
        output: 'Number',
        style: 'motor_blocks',
        tooltip: '%{BKY_XRP_MOTOR_GET_COUNTS_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Reset Motor Encoder ---
  Blockly.Blocks['xrp_motor_reset_encoder'] = {
    init() {
      this.jsonInit({
        type: 'xrp_motor_reset_encoder',
        message0: '%{BKY_XRP_MOTOR_RESET_ENCODER}',
        args0: [
          { type: 'field_dropdown', name: 'MOTOR', options: MOTOR_OPTIONS },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'motor_blocks',
        tooltip: '%{BKY_XRP_MOTOR_RESET_ENCODER_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Brake Motor ---
  Blockly.Blocks['xrp_motor_brake'] = {
    init() {
      this.jsonInit({
        type: 'xrp_motor_brake',
        message0: '%{BKY_XRP_MOTOR_BRAKE}',
        args0: [
          { type: 'field_dropdown', name: 'MOTOR', options: MOTOR_OPTIONS },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'motor_blocks',
        tooltip: '%{BKY_XRP_MOTOR_BRAKE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Coast Motor ---
  Blockly.Blocks['xrp_motor_coast'] = {
    init() {
      this.jsonInit({
        type: 'xrp_motor_coast',
        message0: '%{BKY_XRP_MOTOR_COAST}',
        args0: [
          { type: 'field_dropdown', name: 'MOTOR', options: MOTOR_OPTIONS },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'motor_blocks',
        tooltip: '%{BKY_XRP_MOTOR_COAST_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
```

**`js/blockly/generators/motors.js`**

```js
/**
 * XRP Blocks — Python generators for Motor blocks
 *
 * XRPLib's set_effort() does NOT clamp its argument: anything outside -1 to 1
 * is passed straight through to the motor driver. Effort blocks therefore go
 * through a small clamping helper. Speed is in rpm, and set_speed(0) hands
 * control back to effort rather than braking.
 */

export function registerMotorGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  // Map dropdown values to Python variable names
  const MOTOR_MAP = {
    LEFT: 'left_motor',
    RIGHT: 'right_motor',
    MOTOR3: 'motor_three',
    MOTOR4: 'motor_four',
  };

  function getMotorVar(block) {
    const motor = block.getFieldValue('MOTOR');
    return MOTOR_MAP[motor] || 'left_motor';
  }

  // Shared helper: keep effort inside the -1 to 1 the motor driver expects.
  function provideSetEffort(generator) {
    return generator.provideFunction_('xrp_motor_effort', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(motor, effort):',
      '  # XRPLib does not check the range. -1 is full reverse, 1 is full',
      '  # forward, 0 is stop.',
      '  if effort < -1:',
      '    effort = -1',
      '  elif effort > 1:',
      '    effort = 1',
      '  motor.set_effort(effort)',
    ]);
  }

  python.forBlock['xrp_motor_set_effort'] = function (block, generator) {
    const setEffort = provideSetEffort(generator);
    const effort = generator.valueToCode(block, 'EFFORT', Order.NONE) || '0';
    return `${setEffort}(${getMotorVar(block)}, ${effort})\n`;
  };

  python.forBlock['xrp_motor_set_effort_percent'] = function (block, generator) {
    const setEffort = provideSetEffort(generator);
    const percent = generator.valueToCode(block, 'PERCENT', Order.NONE) || '0';
    return `${setEffort}(${getMotorVar(block)}, (${percent}) / 100)\n`;
  };

  python.forBlock['xrp_motor_speed_off'] = function (block) {
    return `${getMotorVar(block)}.set_speed(None)\n`;
  };

  python.forBlock['xrp_motor_get_counts'] = function (block) {
    return [`${getMotorVar(block)}.get_position_counts()`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_motor_set_speed'] = function (block, generator) {
    const motor = getMotorVar(block);
    const speed = generator.valueToCode(block, 'SPEED', Order.NONE) || '0';
    return `${motor}.set_speed(${speed})\n`;
  };

  python.forBlock['xrp_motor_get_position'] = function (block) {
    const motor = getMotorVar(block);
    return [`${motor}.get_position()`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_motor_get_speed'] = function (block) {
    const motor = getMotorVar(block);
    return [`${motor}.get_speed()`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_motor_reset_encoder'] = function (block) {
    const motor = getMotorVar(block);
    return `${motor}.reset_encoder_position()\n`;
  };

  python.forBlock['xrp_motor_brake'] = function (block) {
    const motor = getMotorVar(block);
    return `${motor}.brake()\n`;
  };

  python.forBlock['xrp_motor_coast'] = function (block) {
    const motor = getMotorVar(block);
    return `${motor}.coast()\n`;
  };
}
```

**`js/blockly/blocks/sensors.js`**

```js
/**
 * XRP Blocks — Sensor block definitions
 * Maps to XRPLib DistanceSensor, Reflectance, IMU, Board APIs
 */

export function registerSensorBlocks() {

  // --- Distance Sensor ---
  Blockly.Blocks['xrp_distance_sensor'] = {
    init() {
      this.jsonInit({
        type: 'xrp_distance_sensor',
        message0: '%{BKY_XRP_DISTANCE_SENSOR}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_DISTANCE_SENSOR_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Line Follower Left ---
  Blockly.Blocks['xrp_line_get_left'] = {
    init() {
      this.jsonInit({
        type: 'xrp_line_get_left',
        message0: '%{BKY_XRP_LINE_GET_LEFT}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_LINE_GET_LEFT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Line Follower Right ---
  Blockly.Blocks['xrp_line_get_right'] = {
    init() {
      this.jsonInit({
        type: 'xrp_line_get_right',
        message0: '%{BKY_XRP_LINE_GET_RIGHT}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_LINE_GET_RIGHT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- IMU Heading / Yaw ---
  Blockly.Blocks['xrp_imu_get_yaw'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_get_yaw',
        message0: '%{BKY_XRP_IMU_GET_YAW}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_GET_YAW_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- IMU Pitch ---
  Blockly.Blocks['xrp_imu_get_pitch'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_get_pitch',
        message0: '%{BKY_XRP_IMU_GET_PITCH}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_GET_PITCH_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- IMU Roll ---
  Blockly.Blocks['xrp_imu_get_roll'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_get_roll',
        message0: '%{BKY_XRP_IMU_GET_ROLL}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_GET_ROLL_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Line sensor reflectance, either side ---
  Blockly.Blocks['xrp_line_reflectance'] = {
    init() {
      this.jsonInit({
        type: 'xrp_line_reflectance',
        message0: '%{BKY_XRP_LINE_REFLECTANCE}',
        args0: [
          {
            type: 'field_dropdown',
            name: 'SIDE',
            options: [
              ['%{BKY_XRP_SIDE_LEFT}', 'left'],
              ['%{BKY_XRP_SIDE_RIGHT}', 'right'],
            ],
          },
        ],
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_LINE_REFLECTANCE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Gyro angle, any of the four readings ---
  Blockly.Blocks['xrp_imu_angle'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_angle',
        message0: '%{BKY_XRP_IMU_ANGLE}',
        args0: [
          {
            type: 'field_dropdown',
            name: 'READING',
            options: [
              ['%{BKY_XRP_IMU_READ_YAW}', 'get_yaw'],
              ['%{BKY_XRP_IMU_READ_HEADING}', 'get_heading'],
              ['%{BKY_XRP_IMU_READ_PITCH}', 'get_pitch'],
              ['%{BKY_XRP_IMU_READ_ROLL}', 'get_roll'],
            ],
          },
        ],
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_ANGLE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Reset one of the three angles ---
  Blockly.Blocks['xrp_imu_reset_yaw'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_reset_yaw',
        message0: '%{BKY_XRP_IMU_RESET_YAW}',
        args0: [
          {
            type: 'field_dropdown',
            name: 'AXIS',
            options: [
              ['%{BKY_XRP_IMU_AXIS_YAW}', 'yaw'],
              ['%{BKY_XRP_IMU_AXIS_PITCH}', 'pitch'],
              ['%{BKY_XRP_IMU_AXIS_ROLL}', 'roll'],
            ],
          },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_RESET_YAW_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Heading, bounded 0 to 360 ---
  Blockly.Blocks['xrp_imu_get_heading'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_get_heading',
        message0: '%{BKY_XRP_IMU_GET_HEADING}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_GET_HEADING_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- IMU Calibrate ---
  Blockly.Blocks['xrp_imu_calibrate'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_calibrate',
        message0: '%{BKY_XRP_IMU_CALIBRATE}',
        previousStatement: null,
        nextStatement: null,
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_CALIBRATE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Button Pressed ---
  Blockly.Blocks['xrp_button_is_pressed'] = {
    init() {
      this.jsonInit({
        type: 'xrp_button_is_pressed',
        message0: '%{BKY_XRP_BUTTON_IS_PRESSED}',
        output: 'Boolean',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_BUTTON_IS_PRESSED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Wait For Button ---
  Blockly.Blocks['xrp_wait_for_button'] = {
    init() {
      this.jsonInit({
        type: 'xrp_wait_for_button',
        message0: '%{BKY_XRP_WAIT_FOR_BUTTON}',
        previousStatement: null,
        nextStatement: null,
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_WAIT_FOR_BUTTON_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
```

**`js/blockly/generators/sensors.js`**

```js
/**
 * XRP Blocks — Python generators for Sensor blocks
 */

export function registerSensorGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  python.forBlock['xrp_distance_sensor'] = function () {
    return ['rangefinder.distance()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_line_get_left'] = function () {
    return ['reflectance.get_left()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_line_get_right'] = function () {
    return ['reflectance.get_right()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_imu_get_yaw'] = function () {
    return ['imu.get_yaw()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_imu_get_pitch'] = function () {
    return ['imu.get_pitch()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_imu_get_roll'] = function () {
    return ['imu.get_roll()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_line_reflectance'] = function (block) {
    const side = block.getFieldValue('SIDE') || 'left';
    return [`reflectance.get_${side}()`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_imu_angle'] = function (block) {
    const reading = block.getFieldValue('READING') || 'get_yaw';
    return [`imu.${reading}()`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_imu_reset_yaw'] = function (block) {
    // The block keeps its original type name so saved workspaces still load;
    // the dropdown chooses which of the three angles is zeroed.
    const axis = block.getFieldValue('AXIS') || 'yaw';
    return `imu.reset_${axis}()\n`;
  };

  python.forBlock['xrp_imu_get_heading'] = function () {
    return ['imu.get_heading()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_imu_calibrate'] = function () {
    return 'imu.calibrate()\n';
  };

  python.forBlock['xrp_button_is_pressed'] = function () {
    return ['board.is_button_pressed()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_wait_for_button'] = function () {
    return 'board.wait_for_button()\n';
  };
}
```

**`js/blockly/blocks/drivetrain.js`**

```js
/**
 * XRP Blocks — Drivetrain block definitions
 * Maps to XRPLib DifferentialDrive API
 */

export function registerDrivetrainBlocks() {

  // --- Drive Straight ---
  Blockly.Blocks['xrp_drive_straight'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_straight',
        message0: '%{BKY_XRP_DRIVE_STRAIGHT}',
        args0: [
          {
            type: 'input_value',
            name: 'DISTANCE',
            check: 'Number',
          },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_STRAIGHT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Drive Straight (with effort) ---
  Blockly.Blocks['xrp_drive_straight_effort'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_straight_effort',
        message0: '%{BKY_XRP_DRIVE_STRAIGHT_EFFORT}',
        args0: [
          { type: 'input_value', name: 'DISTANCE', check: 'Number' },
          { type: 'input_value', name: 'EFFORT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_STRAIGHT_EFFORT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Turn ---
  Blockly.Blocks['xrp_drive_turn'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_turn',
        message0: '%{BKY_XRP_DRIVE_TURN}',
        args0: [
          { type: 'input_value', name: 'ANGLE', check: 'Number' },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_TURN_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Turn (with effort) ---
  Blockly.Blocks['xrp_drive_turn_effort'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_turn_effort',
        message0: '%{BKY_XRP_DRIVE_TURN_EFFORT}',
        args0: [
          { type: 'input_value', name: 'ANGLE', check: 'Number' },
          { type: 'input_value', name: 'EFFORT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_TURN_EFFORT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Stop ---
  Blockly.Blocks['xrp_drive_stop'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_stop',
        message0: '%{BKY_XRP_DRIVE_STOP}',
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_STOP_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Set Drive Effort ---
  Blockly.Blocks['xrp_drive_set_effort'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_set_effort',
        message0: '%{BKY_XRP_DRIVE_SET_EFFORT}',
        args0: [
          { type: 'input_value', name: 'LEFT', check: 'Number' },
          { type: 'input_value', name: 'RIGHT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_SET_EFFORT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Set Drive Speed ---
  Blockly.Blocks['xrp_drive_set_speed'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_set_speed',
        message0: '%{BKY_XRP_DRIVE_SET_SPEED}',
        args0: [
          { type: 'input_value', name: 'LEFT', check: 'Number' },
          { type: 'input_value', name: 'RIGHT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_SET_SPEED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Arcade Drive ---
  Blockly.Blocks['xrp_drive_arcade'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_arcade',
        message0: '%{BKY_XRP_DRIVE_ARCADE}',
        args0: [
          { type: 'input_value', name: 'SPEED', check: 'Number' },
          { type: 'input_value', name: 'TURN', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_ARCADE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Get Left Encoder ---
  Blockly.Blocks['xrp_drive_get_left_encoder'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_get_left_encoder',
        message0: '%{BKY_XRP_DRIVE_LEFT_ENCODER}',
        output: 'Number',
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_LEFT_ENCODER_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Get Right Encoder ---
  Blockly.Blocks['xrp_drive_get_right_encoder'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_get_right_encoder',
        message0: '%{BKY_XRP_DRIVE_RIGHT_ENCODER}',
        output: 'Number',
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_RIGHT_ENCODER_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Reset Encoders ---
  Blockly.Blocks['xrp_drive_encoder'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_encoder',
        message0: '%{BKY_XRP_DRIVE_ENCODER}',
        args0: [
          {
            type: 'field_dropdown',
            name: 'SIDE',
            options: [
              ['%{BKY_XRP_SIDE_LEFT}', 'left'],
              ['%{BKY_XRP_SIDE_RIGHT}', 'right'],
            ],
          },
        ],
        output: 'Number',
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_ENCODER_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  Blockly.Blocks['xrp_drive_reset_encoders'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_reset_encoders',
        message0: '%{BKY_XRP_DRIVE_RESET_ENCODERS}',
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_RESET_ENCODERS_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
```

**`js/blockly/generators/drivetrain.js`**

```js
/**
 * XRP Blocks — Python generators for Drivetrain blocks
 *
 * EFFORT IS IN PERCENT EVERYWHERE
 * -------------------------------
 * XRPLib takes effort as a fraction from -1 to 1, and does no range checking:
 * anything larger goes straight to the motor driver. The blocks used to be
 * inconsistent about this — "drive straight with 50% effort" alongside "set
 * drive effort 0.5" — so a student met two conventions in one category. Every
 * effort block now says percent, and one helper converts and clamps.
 *
 * Units, from the XRPLib API:
 *   straight(distance_cm), turn(degrees), set_speed(cm/s),
 *   get_left_encoder_position() -> cm
 */

export function registerDrivetrainGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  /**
   * Percent to XRPLib's -1..1, clamped. `lowest` is 0 for the blocks where a
   * negative effort makes no sense, such as the max_effort of a measured drive.
   */
  function provideEffort(generator) {
    return generator.provideFunction_('xrp_effort', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(percent, lowest=-1):',
      '  # The blocks are in percent. XRPLib wants -1 to 1 and does not check',
      '  # the range, so without this a slip of the keyboard would go straight',
      '  # to the motor driver.',
      '  effort = percent / 100',
      '  if effort < lowest:',
      '    effort = lowest',
      '  elif effort > 1:',
      '    effort = 1',
      '  return effort',
    ]);
  }

  python.forBlock['xrp_drive_straight'] = function (block, generator) {
    const distance = generator.valueToCode(block, 'DISTANCE', Order.NONE) || '0';
    return `drivetrain.straight(${distance})\n`;
  };

  python.forBlock['xrp_drive_straight_effort'] = function (block, generator) {
    const effortOf = provideEffort(generator);
    const distance = generator.valueToCode(block, 'DISTANCE', Order.NONE) || '0';
    const effort = generator.valueToCode(block, 'EFFORT', Order.NONE) || '50';
    return `drivetrain.straight(${distance}, max_effort=${effortOf}(${effort}, 0))\n`;
  };

  python.forBlock['xrp_drive_turn'] = function (block, generator) {
    const angle = generator.valueToCode(block, 'ANGLE', Order.NONE) || '0';
    return `drivetrain.turn(${angle})\n`;
  };

  python.forBlock['xrp_drive_turn_effort'] = function (block, generator) {
    const effortOf = provideEffort(generator);
    const angle = generator.valueToCode(block, 'ANGLE', Order.NONE) || '0';
    const effort = generator.valueToCode(block, 'EFFORT', Order.NONE) || '50';
    return `drivetrain.turn(${angle}, max_effort=${effortOf}(${effort}, 0))\n`;
  };

  python.forBlock['xrp_drive_stop'] = function () {
    return 'drivetrain.stop()\n';
  };

  python.forBlock['xrp_drive_set_effort'] = function (block, generator) {
    const effortOf = provideEffort(generator);
    const left = generator.valueToCode(block, 'LEFT', Order.NONE) || '0';
    const right = generator.valueToCode(block, 'RIGHT', Order.NONE) || '0';
    return `drivetrain.set_effort(${effortOf}(${left}), ${effortOf}(${right}))\n`;
  };

  python.forBlock['xrp_drive_set_speed'] = function (block, generator) {
    // Speed is centimetres per second here, not rpm as it is on a single motor.
    const left = generator.valueToCode(block, 'LEFT', Order.NONE) || '0';
    const right = generator.valueToCode(block, 'RIGHT', Order.NONE) || '0';
    return `drivetrain.set_speed(${left}, ${right})\n`;
  };

  python.forBlock['xrp_drive_arcade'] = function (block, generator) {
    const effortOf = provideEffort(generator);
    const speed = generator.valueToCode(block, 'SPEED', Order.NONE) || '0';
    const turn = generator.valueToCode(block, 'TURN', Order.NONE) || '0';
    return `drivetrain.arcade(${effortOf}(${speed}), ${effortOf}(${turn}))\n`;
  };

  python.forBlock['xrp_drive_get_left_encoder'] = function () {
    return ['drivetrain.get_left_encoder_position()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_drive_get_right_encoder'] = function () {
    return ['drivetrain.get_right_encoder_position()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_drive_encoder'] = function (block) {
    const side = block.getFieldValue('SIDE') || 'left';
    return [`drivetrain.get_${side}_encoder_position()`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_drive_reset_encoders'] = function () {
    return 'drivetrain.reset_encoder_position()\n';
  };
}
```

**`js/blockly/blocks/board.js`**

```js
/**
 * XRP Blocks — Board block definitions
 * Maps to XRPLib Board API + general utilities
 */

export function registerBoardBlocks() {
  // --- Start (Hat Block) ---
  Blockly.Blocks['xrp_start'] = {
    init() {
      this.jsonInit({
        type: 'xrp_start',
        message0: '%{BKY_XRP_START}',
        nextStatement: null,
        style: 'events_blocks',
        tooltip: '%{BKY_XRP_START_TOOLTIP}',
        helpUrl: '',
      });
      this.setDeletable(false);
    },
  };

  // --- LED On ---
  Blockly.Blocks['xrp_led_on'] = {
    init() {
      this.jsonInit({
        type: 'xrp_led_on',
        message0: '%{BKY_XRP_LED_ON}',
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_LED_ON_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- LED Off ---
  Blockly.Blocks['xrp_led_off'] = {
    init() {
      this.jsonInit({
        type: 'xrp_led_off',
        message0: '%{BKY_XRP_LED_OFF}',
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_LED_OFF_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- LED Blink ---
  Blockly.Blocks['xrp_led_blink'] = {
    init() {
      this.jsonInit({
        type: 'xrp_led_blink',
        message0: '%{BKY_XRP_LED_BLINK}',
        args0: [
          { type: 'input_value', name: 'COUNT', check: 'Number' },
          { type: 'input_value', name: 'DELAY', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_LED_BLINK_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- RGB LED ---
  Blockly.Blocks['xrp_rgb_led'] = {
    init() {
      this.jsonInit({
        type: 'xrp_rgb_led',
        message0: '%{BKY_XRP_RGB_LED}',
        args0: [
          { type: 'input_value', name: 'RED', check: 'Number' },
          { type: 'input_value', name: 'GREEN', check: 'Number' },
          { type: 'input_value', name: 'BLUE', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_RGB_LED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // Simple onboard colour control; independent of add-on device libraries.
  Blockly.Blocks['xrp_rgb_colour'] = {
    init() {
      const colours = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue',
        'purple', 'magenta', 'pink', 'white', 'off'];
      this.jsonInit({
        message0: '%{BKY_XRP_RGB_COLOUR}',
        args0: [
          { type: 'field_dropdown', name: 'COLOUR', options: colours.map(name =>
            [Blockly.Msg['XRP_COLOUR_' + name.toUpperCase()] || name, name]) },
          { type: 'input_value', name: 'BRIGHTNESS', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_RGB_COLOUR_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Wait / Sleep ---
  Blockly.Blocks['xrp_wait_seconds'] = {
    init() {
      this.jsonInit({
        type: 'xrp_wait_seconds',
        message0: '%{BKY_XRP_WAIT_SECONDS}',
        args0: [
          { type: 'input_value', name: 'SECONDS', check: 'Number' },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_WAIT_SECONDS_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Print ---
  Blockly.Blocks['xrp_print'] = {
    init() {
      this.jsonInit({
        type: 'xrp_print',
        message0: '%{BKY_XRP_PRINT}',
        args0: [
          { type: 'input_value', name: 'TEXT' },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_PRINT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
```

**`js/blockly/generators/board.js`**

```js
/**
 * XRP Blocks — Python generators for Board blocks
 */

export function registerBoardGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  python.forBlock['xrp_start'] = function () {
    // Must return a truthy string so Blockly traverses to the next connected block
    return '\n';
  };

  python.forBlock['xrp_led_on'] = function () {
    return 'board.led_on()\n';
  };

  python.forBlock['xrp_led_off'] = function () {
    return 'board.led_off()\n';
  };

  python.forBlock['xrp_led_blink'] = function (block, generator) {
    generator.definitions_['import_time'] = 'import time';
    // XRPLib's own board.led_blink() takes ONE argument, a frequency in Hz,
    // and starts a background timer. This block promises "blink N times,
    // waiting D seconds", so calling led_blink(N, D) raised a TypeError and
    // the program stopped. Blink it here instead and return when it is done.
    const blink = generator.provideFunction_('xrp_led_blink', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(times, delay):',
      '  for _ in range(int(times)):',
      '    board.led_on()',
      '    time.sleep(delay)',
      '    board.led_off()',
      '    time.sleep(delay)',
    ]);
    const count = generator.valueToCode(block, 'COUNT', Order.NONE) || '3';
    const delay = generator.valueToCode(block, 'DELAY', Order.NONE) || '0.5';
    return `${blink}(${count}, ${delay})\n`;
  };

  python.forBlock['xrp_rgb_led'] = function (block, generator) {
    const red = generator.valueToCode(block, 'RED', Order.NONE) || '0';
    const green = generator.valueToCode(block, 'GREEN', Order.NONE) || '0';
    const blue = generator.valueToCode(block, 'BLUE', Order.NONE) || '0';
    return `board.set_rgb_led(${red}, ${green}, ${blue})\n`;
  };

  python.forBlock['xrp_rgb_colour'] = function (block, generator) {
    // Match the NeoPixel library's named colours without requiring its driver.
    const colours = {
      red: [255, 0, 0], orange: [255, 80, 0], yellow: [255, 200, 0],
      green: [0, 255, 0], cyan: [0, 255, 255], blue: [0, 0, 255],
      purple: [128, 0, 255], magenta: [255, 0, 255], pink: [255, 80, 120],
      white: [255, 255, 255], off: [0, 0, 0],
    };
    const rgb = colours[block.getFieldValue('COLOUR')] || colours.off;
    const brightness = generator.valueToCode(block, 'BRIGHTNESS', Order.NONE) || '30';
    const setColour = generator.provideFunction_('xrp_rgb_colour', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(red, green, blue, brightness):',
      '  scale = max(0, min(100, brightness)) / 100',
      '  board.set_rgb_led(int(red * scale), int(green * scale), int(blue * scale))',
    ]);
    return `${setColour}(${rgb.join(', ')}, ${brightness})\n`;
  };

  python.forBlock['xrp_wait_seconds'] = function (block, generator) {
    const seconds = generator.valueToCode(block, 'SECONDS', Order.NONE) || '1';
    generator.definitions_['import_time'] = 'import time';
    return `time.sleep(${seconds})\n`;
  };

  python.forBlock['xrp_print'] = function (block, generator) {
    const text = generator.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return `print(${text})\n`;
  };
}
```

### 3.7 Application shell


`app.js` holds the change 17 fix: `_generateFunctionDefinitions()` runs before
the start stack is walked. It also loads the device libraries before the
workspace is injected, because the toolbox names their blocks.

`toolbox.js` no longer contains the PCF8575 or NeoPixel categories. It takes the
library categories as an argument, and each remaining category is ordered from
what a beginner needs down to the advanced, with separators between the groups.

`theme.js` gained the dark palette and a `mergeExtra` that folds in the styles a
device library contributes, with existing names winning so a library cannot
repaint a built-in category.

**`js/app.js`**

```js
/**
 * XRP Blocks — Main Application
 * Orchestrates Blockly workspace, WebSerial, and UI components.
 */

import { createXRPTheme } from './blockly/theme.js';
import { getToolboxDefinition, getFilteredToolbox } from './blockly/toolbox.js';
import { registerDrivetrainBlocks } from './blockly/blocks/drivetrain.js';
import { registerMotorBlocks } from './blockly/blocks/motors.js';
import { registerServoBlocks } from './blockly/blocks/servo.js';
import { registerSensorBlocks } from './blockly/blocks/sensors.js';
import { registerBoardBlocks } from './blockly/blocks/board.js';
import { registerLoopBlocks } from './blockly/blocks/loops.js';
import { registerDrivetrainGenerators } from './blockly/generators/drivetrain.js';
import { registerMotorGenerators } from './blockly/generators/motors.js';
import { registerServoGenerators } from './blockly/generators/servo.js';
import { registerSensorGenerators } from './blockly/generators/sensors.js';
import { registerBoardGenerators } from './blockly/generators/board.js';
import { registerLoopGenerators } from './blockly/generators/loops.js';
import { registerMicroPythonCompat, patchMicroPythonImports } from './blockly/generators/micropython-compat.js';
import { registerCustomCategory } from './blockly/custom-category.js';
import { registerUnusedBlocksMenu } from './blockly/unused-blocks.js';
import { LibraryManager } from './devices/library-manager.js';
import { XRPSerial } from './serial/webserial.js';
import { XRPBluetooth } from './serial/webbluetooth.js';
import { getLastConnection, rememberConnection } from './serial/last-connection.js';
import { Toolbar } from './ui/toolbar.js';
import { PythonPanel } from './ui/python-panel.js';
import { ConsolePanel } from './ui/console-panel.js';
import { XRP_TRANSLATIONS } from './ui/translations.js';
import { LessonManager } from './ui/lesson-manager.js';
import { LessonPickerModal } from './ui/lesson-picker-modal.js';
import { ConnectionModal } from './ui/connection-modal.js';
import { ConfirmModal } from './ui/confirm-modal.js';
import { UnsupportedModal } from './ui/unsupported-modal.js';
import { LibraryModal } from './ui/library-modal.js';

class XRPBlocksApp {
  constructor() {
    this.workspace = null;
    this.serial = null;          // Assigned after user picks USB or BT
    this.connectionMode = null;  // 'usb' | 'bluetooth'
    this.pythonPanel = null;
    this.consolePanel = null;
    this.toolbar = null;
    this.lessonManager = null;
    this._pythonGenerator = null;
    this.lang = 'en';
    this.libraries = null;       // set up in loadLibraries(), before init()
  }

  // ── Device Libraries ──

  /**
   * Bring back the device libraries (devices/*.json) the user had last time,
   * and add any a saved project needs. This must finish before init(), because
   * the workspace is injected with a toolbox that names their blocks.
   */
  async loadLibraries() {
    this.libraries = new LibraryManager({
      lang: this.lang,
      onWarn: (message) => console.warn('[XRP Blocks]', message),
    });

    try {
      await this.libraries.loadCatalogue();
      await this.libraries.restore();
      await this._addLibrariesForSavedProject();
    } catch (err) {
      console.error('[XRP Blocks] Device libraries could not be loaded:', err);
    }
  }

  /**
   * A project saved before a library was removed — or opened on a different
   * computer — names blocks that nothing defines yet. Rather than dropping
   * those blocks silently, put the library that provides them back.
   *
   * @param {Object} [state] - a workspace state; the auto-saved one by default
   * @returns {Promise<string[]>} ids of the libraries that were added
   */
  async _addLibrariesForSavedProject(state = null) {
    let text;
    if (state) {
      text = JSON.stringify(state);
    } else {
      try {
        text = localStorage.getItem('xrp_blocks_workspace') || '';
      } catch (err) {
        return [];
      }
    }
    if (!text) return [];

    const types = new Set();
    for (const match of text.matchAll(/"type"\s*:\s*"([A-Za-z_][A-Za-z0-9_]*)"/g)) {
      types.add(match[1]);
    }

    const wanted = new Set();
    for (const type of types) {
      if (Blockly.Blocks[type]) continue;
      const entry = this.libraries.catalogueEntryProviding(type);
      if (entry && !this.libraries.has(entry.id)) wanted.add(entry.id);
    }

    const added = [];
    for (const id of wanted) {
      try {
        await this.libraries.addFromCatalogue(id);
        added.push(id);
      } catch (err) {
        console.warn(`[XRP Blocks] Could not add the "${id}" library this project needs:`, err);
      }
    }
    return added;
  }

  /**
   * Rebuild everything a library touches: the palette, the toolbox and the
   * generated code. Called after a library is added or removed.
   */
  _refreshLibraries() {
    if (!this.workspace) return;
    this.libraries.registerBlocks();
    if (this._pythonGenerator) {
      const pythonModule = window.python || window.blocklyPython;
      if (pythonModule) this.libraries.registerGenerators(pythonModule);
    }
    this.workspace.setTheme(
      createXRPTheme(this._themeMode(), this.libraries.themeStyles(this._themeMode()))
    );
    this._applyFilteredToolbox(this._toolboxFilter || null);
    this._generateCode();
  }

  /**
   * Initialize the entire application
   */
  init() {
    // Register custom category renderer
    registerCustomCategory();

    // Register all custom blocks
    this._registerBlocks();

    // Create and inject Blockly workspace
    this._initWorkspace();

    // Set up Python generator
    this._initGenerator();

    // Initialize UI components
    this._initUI();

    // Set up WebSerial callbacks (called after transport is chosen)
    // this._initSerial() is now called lazily in _handleConnect()

    // Set up workspace change listener for live code gen
    this._initLiveCodeGen();

    // Handle window resize
    this._initResize();

    // Load saved workspace from localStorage
    this._loadWorkspace();
    this._removeUnusedVariables();

    // Initial code generation
    this._generateCode();

    console.log('🤖 XRP Blocks IDE initialized');
  }

  // ── Language Support ──

  async loadLanguage() {
    // Detect default browser language (Dutch or English)
    let defaultLang = 'en';
    const browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (browserLang.startsWith('nl')) {
      defaultLang = 'nl';
    }

    this.lang = localStorage.getItem('xrp_blocks_language') || defaultLang;

    // Set the HTML lang attribute dynamically
    document.documentElement.setAttribute('lang', this.lang);

    try {
      await this._loadScript(`js/vendor/blockly/msg/${this.lang}.js`);
    } catch (err) {
      console.warn(`Failed to load language script for ${this.lang}, falling back to English.`, err);
      this.lang = 'en';
      await this._loadScript('js/vendor/blockly/msg/en.js');
      document.documentElement.setAttribute('lang', 'en');
    }
    const trans = XRP_TRANSLATIONS[this.lang] || XRP_TRANSLATIONS['en'];
    for (const key in trans) {
      Blockly.Msg[key] = trans[key];
    }
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  _applyLanguageToDOM() {
    const i18nElements = document.querySelectorAll('[data-i18n]');
    i18nElements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = Blockly.Msg[key];
      if (translation) {
        el.textContent = translation;
      }
    });

    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const translation = Blockly.Msg[key];
      if (translation) {
        el.setAttribute('placeholder', translation);
      }
    });

    const tooltipElements = document.querySelectorAll('[data-i18n-tooltip]');
    tooltipElements.forEach(el => {
      const key = el.getAttribute('data-i18n-tooltip');
      const translation = Blockly.Msg[key];
      if (translation) {
        el.setAttribute('data-tooltip', translation);
      }
    });
  }

  _switchLanguage(lang) {
    if (lang === this.lang) return;
    this._autoSave();
    localStorage.setItem('xrp_blocks_language', lang);
    window.location.reload();
  }

  // ── Block Registration ──

  _registerBlocks() {
    registerDrivetrainBlocks();
    registerMotorBlocks();
    registerServoBlocks();
    registerSensorBlocks();
    registerBoardBlocks();
    registerLoopBlocks();
    this.libraries.registerBlocks();
  }

  // ── Workspace ──

  _initWorkspace() {
    const mode = this._themeMode();
    const theme = createXRPTheme(mode, this.libraries.themeStyles(mode));
    const toolbox = this._pruneUnknownBlocks(
      getToolboxDefinition(this.libraries.toolboxCategories())
    );

    this.workspace = Blockly.inject('blocklyDiv', {
      toolbox,
      theme,
      renderer: 'zelos',
      grid: {
        spacing: 25,
        length: 3,
        colour: '#E2E6EF',
        snap: true,
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.9,
        maxScale: 2,
        minScale: 0.3,
        scaleSpeed: 1.1,
        pinch: true,
      },
      trashcan: true,
      move: {
        scrollbars: {
          horizontal: true,
          vertical: true,
        },
        drag: true,
        wheel: true,
      },
      sounds: true,
      media: 'js/vendor/blockly/media/',
    });

    this._customiseVariablesFlyout();
    registerUnusedBlocksMenu(this.workspace);
  }

  /**
   * Blockly throws, and leaves the flyout in a broken state, if the toolbox
   * names a block the browser has not loaded. That happens when a cached copy
   * of a block file is served next to a newer toolbox.js: one stale file then
   * breaks every category, not just its own. Drop the unknown entries and say
   * so loudly instead.
   *
   * @param {!Object} toolbox - Toolbox definition, modified in place
   * @returns {!Object} the same toolbox, with unloadable blocks removed
   */
  _pruneUnknownBlocks(toolbox) {
    const missing = [];
    const known = (type) => Boolean(type && Blockly.Blocks[type]);

    const pruneShadows = (item) => {
      if (!item || !item.inputs) return;
      for (const [name, input] of Object.entries(item.inputs)) {
        const shadowType = input?.shadow?.type;
        const blockType = input?.block?.type;
        if (shadowType && !known(shadowType)) {
          missing.push(shadowType);
          delete item.inputs[name];
        } else if (blockType && !known(blockType)) {
          missing.push(blockType);
          delete item.inputs[name];
        }
      }
    };

    const walk = (node) => {
      if (!node || !Array.isArray(node.contents)) return;
      node.contents = node.contents.filter((item) => {
        if (!item) return false;
        if (item.kind === 'block') {
          if (!known(item.type)) {
            missing.push(item.type);
            return false;
          }
          pruneShadows(item);
          return true;
        }
        walk(item);
        return true;
      });
    };

    walk(toolbox);

    if (missing.length) {
      const list = [...new Set(missing)].join(', ');
      console.warn(
        `[XRP Blocks] These blocks are not loaded, so they were hidden from the toolbox: ${list}. ` +
        'The browser is almost certainly serving a cached copy of the block files. ' +
        'Reload with Ctrl+Shift+R.'
      );
      setTimeout(() => {
        this._showToast?.(
          Blockly.Msg['MSG_STALE_CACHE'] ||
          'Some blocks are missing: the browser is using cached files. Reload with Ctrl+Shift+R.',
          'error'
        );
      }, 1200);
    }

    return toolbox;
  }

  /**
   * Blockly builds the Variables flyout with an EMPTY value socket on the
   * "set <var> to" block, while "change <var> by" ships with a shadow number.
   * For beginners the empty socket reads as a broken or missing block. Here we
   * wrap the built-in category callback and drop a shadow "0" into that socket,
   * so the block arrives ready to type into, like every other XRP block.
   */
  _customiseVariablesFlyout() {
    try {
      this.workspace.registerToolboxCategoryCallback('VARIABLE', (ws) => {
        const items = Blockly.Variables.flyoutCategory(ws, false);
        for (const item of items) {
          if (item && item.kind === 'block' && item.type === 'variables_set' && !item.inputs) {
            item.inputs = {
              VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            };
          }
        }
        return items;
      });
    } catch (err) {
      console.warn('Could not customise the Variables flyout; using the Blockly default.', err);
    }
  }

  // ── Python Generator ──

  _initGenerator() {
    const pythonModule = window.python || window.blocklyPython;
    if (!pythonModule || !pythonModule.pythonGenerator) {
      console.error('Failed to find Blockly Python generator module.');
      this._showToast('Failed to load Python generator module', 'error');
      return;
    }
    
    this._pythonGenerator = pythonModule.pythonGenerator;

    // Register XRP-specific generators
    registerDrivetrainGenerators(pythonModule);
    registerMotorGenerators(pythonModule);
    registerServoGenerators(pythonModule);
    registerSensorGenerators(pythonModule);
    registerBoardGenerators(pythonModule);
    registerLoopGenerators(pythonModule);
    this.libraries.registerGenerators(pythonModule);
    registerMicroPythonCompat(pythonModule);
  }

  _generateCode() {
    if (!this.workspace || !this._pythonGenerator) return '';

    try {
      // Find the start block
      const startBlocks = this.workspace.getBlocksByType('xrp_start', false);
      let code = '';
      
      if (startBlocks.length > 0) {
        // Generate code starting from the xrp_start block
        const startBlock = startBlocks[0];
        this._pythonGenerator.init(this.workspace);

        // A function definition is its own stack on the canvas: nothing
        // reaches it from the start block, so walking out from the start
        // block alone never generates its body. The call would then be the
        // only mention of it in the program and the robot would stop with
        // "NameError: name 'UP' isn't defined". Generate the definitions
        // first; their code lands in definitions_, which finish() puts at
        // the top of the program.
        this._generateFunctionDefinitions();

        code = this._pythonGenerator.blockToCode(startBlock);
        code = this._pythonGenerator.finish(code);
      }

      // Prepend selective imports if we generated any actual code
      if (code.trim()) {
        const cleaned = code.replace(/^\n+/, '').replace(/\n+$/, '');
        const importLine = this._buildImportLine(cleaned);
        code = importLine + '\n\n' + cleaned;
      }

      // Strip CPython-only imports that MicroPython cannot satisfy.
      code = patchMicroPythonImports(code);

      this.pythonPanel?.update(code);
      return code;
    } catch (err) {
      console.error('Code generation error:', err);
      return '';
    }
  }

  /**
   * Generate every function the user has defined on the canvas.
   *
   * Blockly's own `workspaceToCode` does this by walking all the top blocks,
   * but this IDE generates from the start block so that loose blocks are
   * ignored. Function definitions are loose by nature, so they have to be
   * picked up deliberately.
   *
   * The generators put their output into `definitions_` and return null, so
   * there is nothing to collect here; `finish()` emits them.
   */
  _generateFunctionDefinitions() {
    const DEFINITION_TYPES = ['procedures_defnoreturn', 'procedures_defreturn'];

    for (const block of this.workspace.getTopBlocks(false)) {
      if (!DEFINITION_TYPES.includes(block.type)) continue;
      try {
        this._pythonGenerator.blockToCode(block);
      } catch (err) {
        console.error(`[XRP Blocks] Could not generate the function "${block.getFieldValue('NAME')}":`, err);
      }
    }
  }

  /**
   * Scan the generated Python code and produce a selective import line that
   * only pulls in the XRPLib objects that are actually referenced. This
   * prevents background threads (e.g. in imu.py and encoded_motor.py) from
   * starting when those objects are not needed by the program.
   *
   * @param {string} code - Generated Python code (without the import line)
   * @returns {string} - e.g. "from XRPLib.defaults import board, drivetrain"
   */
  _buildImportLine(code) {
    // Ordered list of [identifier, regex] pairs.
    // The regex checks that the identifier appears as a standalone word in the code.
    const XRPLIB_OBJECTS = [
      'board',
      'drivetrain',
      'left_motor',
      'right_motor',
      'motor_three',
      'motor_four',
      'imu',
      'rangefinder',
      'reflectance',
      'servo_one',
      'servo_two',
      'servo_three',
      'servo_four',
    ];

    const needed = XRPLIB_OBJECTS.filter(name => {
      // Match the identifier as a whole word (not inside another identifier)
      return new RegExp(`\\b${name}\\b`).test(code);
    });

    if (needed.length === 0) {
      // Fallback: no recognised objects — use the safe minimal import
      return 'from XRPLib.defaults import board';
    }

    return `from XRPLib.defaults import ${needed.join(', ')}`;
  }

  // ── UI Components ──

  /**
   * Which colour scheme to use. Light is the default and is unchanged from
   * upstream; dark deepens every block colour so white labels are readable.
   * @returns {'light'|'dark'}
   */
  _themeMode() {
    try {
      return localStorage.getItem('xrp_blocks_theme') === 'dark' ? 'dark' : 'light';
    } catch (err) {
      return 'light';
    }
  }

  /**
   * Apply a colour scheme to the page and to the Blockly workspace.
   * @param {'light'|'dark'} mode
   */
  _applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    try {
      localStorage.setItem('xrp_blocks_theme', mode);
    } catch (err) {
      // Private browsing: the choice simply will not be remembered.
    }
    if (this.workspace) {
      this.workspace.setTheme(createXRPTheme(mode, this.libraries.themeStyles(mode)));
    }
  }

  _initUI() {
    // Apply translations to DOM elements
    this._applyLanguageToDOM();

    // Colour scheme: restore the saved choice and wire the toggle.
    this._applyTheme(this._themeMode());
    document.getElementById('btn-theme')?.addEventListener('click', () => {
      this._applyTheme(this._themeMode() === 'dark' ? 'light' : 'dark');
    });

    // Language dropdown selection
    const selectLang = document.getElementById('select-lang');
    if (selectLang) {
      selectLang.value = this.lang;
      selectLang.addEventListener('change', (e) => {
        this._switchLanguage(e.target.value);
      });
    }

    // Python preview panel
    const pythonEl = document.getElementById('python-code');
    this.pythonPanel = new PythonPanel(pythonEl);

    // Console panel
    const consoleEl = document.getElementById('console-output');
    this.consolePanel = new ConsolePanel(consoleEl, {
      onAutoScrollChange: (enabled) => this._updateAutoScrollButton(enabled),
    });

    // Toolbar
    this.toolbar = new Toolbar({
      onConnect: () => this._handleConnect(),
      onRun: () => this._handleRun(),
      onStop: () => this._handleStop(),
      onDeploy: () => this._handleDeploy(),
      onSave: () => this._saveWorkspace(),
      onLoad: () => this._loadFromFile(),
      onLoadLesson: () => this._openLessonPicker(),
      onOpenLibrary: () => this._openLibraryPicker(),
    });

    // Lesson manager
    this.lessonManager = new LessonManager({
      onToolboxChange: (filter) => this._applyFilteredToolbox(filter),
      onLoadTemplate: (state) => this._loadTemplateWorkspace(state),
      onResize: () => Blockly.svgResize(this.workspace),
    });

    // Bottom panel tabs
    this._initPanelTabs();

    // Copy button
    document.getElementById('btn-copy-code')?.addEventListener('click', async () => {
      const success = await this.pythonPanel.copyToClipboard();
      if (success) this._showToast(Blockly.Msg['MSG_COPIED'] || 'Code copied!');
    });

    // Console clear
    document.getElementById('btn-clear-console')?.addEventListener('click', () => {
      this.consolePanel.clear();
    });

    // Console copy
    document.getElementById('btn-copy-console')?.addEventListener('click', async () => {
      const success = await this.consolePanel.copyToClipboard();
      if (success) this._showToast(Blockly.Msg['MSG_CONSOLE_COPIED'] || 'Console copied!');
    });

    // Console auto-scroll toggle
    document.getElementById('btn-autoscroll')?.addEventListener('click', () => {
      this.consolePanel.toggleAutoScroll();
    });

    // Panel collapse toggle
    document.getElementById('btn-collapse-panel')?.addEventListener('click', () => {
      this._toggleBottomPanel();
    });
    document.getElementById('btn-collapse-panel-2')?.addEventListener('click', () => {
      this._toggleBottomPanel();
    });

    // Check transport support — disable connect button if neither is available
    const usbOk = XRPSerial.isSupported();
    const btOk  = XRPBluetooth.isSupported();
    if (!usbOk && !btOk) {
      const connectBtn = document.getElementById('btn-connect');
      if (connectBtn) connectBtn.disabled = true;
      document.getElementById('btn-connect').title =
        Blockly.Msg['MSG_NOT_SUPPORTED'] || 'WebSerial/Bluetooth not supported — use Chrome or Edge';

      // Inform the user up front that this browser can't connect to the XRP.
      UnsupportedModal.show();
    }
  }

  _initPanelTabs() {
    const tabs = document.querySelectorAll('.bottom-panel__tab');
    this._consolePinned = false;
    try {
      this._consolePinned = localStorage.getItem('xrp_blocks_console_pinned') === 'true';
    } catch { /* Auto-hide remains the default when storage is unavailable. */ }
    this._updateConsolePinButton();
    document.querySelectorAll('#btn-pin-console, #btn-pin-python').forEach(button => button.addEventListener('click', () => {
      this._consolePinned = !this._consolePinned;
      try {
        localStorage.setItem('xrp_blocks_console_pinned', String(this._consolePinned));
      } catch { /* The current session still honours the pin. */ }
      this._updateConsolePinButton();
      if (!this._consolePinned) this._setPanelState(false);
      else if (document.querySelector('.bottom-panel').classList.contains('collapsed')) {
        this._setPanelState(true, 'python');
      }
    }));

    // Unpinned output is opened explicitly through its tab. Do not dismiss it
    // while the user reads it, or open it automatically when running a program.
    if (this._consolePinned) this._setPanelState(true, 'console');
    else this._setPanelState(false);

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        const panel = document.querySelector('.bottom-panel');
        const isCollapsed = panel.classList.contains('collapsed');
        const isAlreadyActive = tab.classList.contains('active');

        if (isCollapsed) {
          // If panel is closed, clicking either tab opens it to that specific tab
          this._setPanelState(true, target);
        } else {
          // Panel is open
          if (isAlreadyActive) {
            // Clicking the active tab closes the panel (neither tab is active)
            this._setPanelState(false);
          } else {
            // Clicking a different tab switches to that tab (keeps panel open)
            this._setPanelState(true, target);
          }
        }
      });
    });
  }

  _updateConsolePinButton() {
    for (const button of document.querySelectorAll('#btn-pin-console, #btn-pin-python')) {
    const key = this._consolePinned ? 'TIP_UNPIN_CONSOLE' : 'TIP_PIN_CONSOLE';
    const label = Blockly.Msg[key] || (this._consolePinned ? 'Unpin console (auto-hide)' : 'Pin console');
    button.classList.toggle('is-active', this._consolePinned);
    button.setAttribute('aria-pressed', String(this._consolePinned));
    button.setAttribute('aria-label', label);
    button.setAttribute('data-tooltip', label);
    button.setAttribute('data-i18n-tooltip', key);
    }
  }

  /** Reflect the console auto-scroll state on its toggle button. */
  _updateAutoScrollButton(enabled) {
    const btn = document.getElementById('btn-autoscroll');
    if (!btn) return;
    btn.classList.toggle('is-active', enabled);
    btn.setAttribute('aria-pressed', String(enabled));
  }

  _toggleBottomPanel() {
    const panel = document.querySelector('.bottom-panel');
    const isCollapsed = panel.classList.contains('collapsed');
    
    if (isCollapsed) {
      // If closed, default to opening the python tab
      this._setPanelState(true, 'python');
    } else {
      // If open, close it
      this._setPanelState(false);
    }
  }

  _setPanelState(isOpen, targetTab = 'python') {
    const panel = document.querySelector('.bottom-panel');
    const tabs = document.querySelectorAll('.bottom-panel__tab');
    const views = document.querySelectorAll('.panel-view');

    if (isOpen) {
      panel.classList.remove('collapsed');

      tabs.forEach(t => {
        if (t.dataset.tab === targetTab) {
          t.classList.add('active');
        } else {
          t.classList.remove('active');
        }
      });

      views.forEach(v => {
        if (v.id === `panel-${targetTab}`) {
          v.classList.add('active');
        } else {
          v.classList.remove('active');
        }
      });

      // Update actions visibility
      const pythonActions = document.getElementById('python-actions');
      const consoleActions = document.getElementById('console-actions');
      if (pythonActions) pythonActions.style.display = targetTab === 'python' ? 'flex' : 'none';
      if (consoleActions) consoleActions.style.display = targetTab === 'console' ? 'flex' : 'none';

      // Update collapse button tooltip to indicate close behavior
      const collapseBtn1 = document.getElementById('btn-collapse-panel');
      const collapseBtn2 = document.getElementById('btn-collapse-panel-2');
      if (collapseBtn1) collapseBtn1.setAttribute('data-tooltip', 'Collapse panel');
      if (collapseBtn2) collapseBtn2.setAttribute('data-tooltip', 'Collapse panel');
    } else {
      panel.classList.add('collapsed');

      // Deactivate all tabs and views so neither is active when closed
      tabs.forEach(t => t.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));

      // Update collapse button tooltip to indicate open behavior
      const collapseBtn1 = document.getElementById('btn-collapse-panel');
      const collapseBtn2 = document.getElementById('btn-collapse-panel-2');
      if (collapseBtn1) collapseBtn1.setAttribute('data-tooltip', 'Expand panel');
      if (collapseBtn2) collapseBtn2.setAttribute('data-tooltip', 'Expand panel');
    }

    // Resize Blockly workspace after animation finishes
    setTimeout(() => {
      Blockly.svgResize(this.workspace);
    }, 320);
  }

  // ── WebSerial ──

  _initSerial() {
    this.serial.onConnect = () => {
      this.toolbar.setConnected(true, this.connectionMode || 'usb');
      this.consolePanel.appendSystem(Blockly.Msg['MSG_CONNECTED'] || '✓ Connected to XRP');
    };

    this.serial.onDisconnect = () => {
      this.toolbar.setConnected(false);
      this.toolbar.setRunning(false);
      this.consolePanel.appendSystem(Blockly.Msg['MSG_DISCONNECTED'] || '✗ Disconnected from XRP');
    };

    this.serial.onData = (text) => {
      this.consolePanel.appendData(text, 'received');
    };

    this.serial.onError = (err) => {
      this.consolePanel.appendError(`Error: ${err.message}`);
    };
  }

  async _handleConnect() {
    if (this._connecting) return;
    this._connecting = true;
    try {
    // If already connected, disconnect
    if (this.serial && this.serial.connected) {
      await this.serial.disconnect();
      return;
    }

    const prepare = mode => {
      this.connectionMode = mode;
      this._installedLibraries = {};
      this.serial = mode === 'bluetooth' ? new XRPBluetooth() : new XRPSerial();
      this._initSerial();
    };

    // Try a previously authorised device before asking the user to choose.
    try {
      const previous = await getLastConnection();
      if (previous) {
        prepare(previous.mode);
        await this.serial.connect(previous.device);
      }
    } catch {
      // Release partially opened transports before offering another connection.
      await this.serial?.disconnect().catch(() => {});
    }

    if (!this.serial?.connected) {
      const mode = await ConnectionModal.pick();
      if (!mode) return;
      prepare(mode);

    try {
      await this.serial.connect();
    } catch (err) {
      this._showToast(
        (Blockly.Msg['MSG_CONNECT_FAILED'] || 'Failed to connect: ') + err.message,
        'error'
      );
      return;
    }
    }

    if (this.serial.connected) {
      rememberConnection(this.connectionMode,
        this.connectionMode === 'usb' ? this.serial.port : this.serial._device);
    }

    // Connecting only attaches to serial output. Run, Stop and Deploy handle
    // interruption explicitly; preserve an auto-started web server here.
    } finally {
      this._connecting = false;
    }
  }

  async _handleRun() {
    this._removeUnusedVariables();
    const code = this._generateCode();
    if (!code.trim()) {
      this._showToast(Blockly.Msg['MSG_NO_CODE'] || 'No code to run — add some blocks first!', 'error');
      return;
    }

    // Only pinned output opens automatically; otherwise keep the user's view.
    if (this._consolePinned) this._setPanelState(true, 'console');

    this.toolbar.setRunning(true);
    try {
      await this._ensureLibraries(code);
      this.consolePanel.appendSystem(Blockly.Msg['MSG_RUNNING'] || '▶ Running program...');
      await this.serial.runProgram(code);
    } catch (err) {
      this.consolePanel.appendError(`${Blockly.Msg['MSG_RUN_FAILED'] || 'Run error: '}${err.message}`);
      this._showToast((Blockly.Msg['MSG_RUN_FAILED'] || 'Run error: ') + err.message, 'error');
      this.toolbar.setRunning(false);
      return;
    }

    // runProgram() has returned — the REPL handshake (Ctrl+C / Ctrl+A / Ctrl+B) is
    // complete and all setup prompts have passed. Only now start watching for the
    // '>>> ' prompt that signals the user's program actually finished on its own.
    this._watchForProgramEnd();
  }

  async _handleStop() {
    try {
      this._stopWatchingForProgramEnd();
      const stopped = await this.serial.stopExecution();
      if (stopped) {
        this.consolePanel.appendSystem(Blockly.Msg['MSG_STOPPED'] || '⏹ Program stopped');
      } else {
        const message = this.connectionMode === 'bluetooth'
          ? (Blockly.Msg['MSG_STOP_REBOOTING'] || '⏹ Stop signal sent — board is rebooting, reconnect once it comes back.')
          : (Blockly.Msg['MSG_STOP_FAILED'] || '⚠ Board did not confirm it stopped — try again, or press the reset button on the board.');
        this.consolePanel.appendSystem(message);
      }
      this.toolbar.setRunning(false);
    } catch (err) {
      this.consolePanel.appendError(`Stop error: ${err.message}`);
    }
  }

  /**
   * A device library's blocks generate code that imports a driver which is not
   * part of XRPLib. Copy each needed driver onto the robot's filesystem the
   * first time a program uses it. It then stays in flash, so this happens
   * once per board. A failure here is reported but never blocks the run: the
   * program itself will report the missing import clearly enough.
   *
   * The list comes from the installed manifests, so a device someone adds
   * tomorrow installs its driver the same way, with nothing to change here.
   */
  async _ensureLibraries(code) {
    if (!code) return;
    const LIBRARIES = this.libraries.drivers();
    this._installedLibraries = this._installedLibraries || {};

    for (const lib of LIBRARIES) {
      if (!code.includes(lib.marker)) continue;
      if (this._installedLibraries[lib.filename]) continue;
      try {
        this.consolePanel?.appendSystem(`⬇ Installing ${lib.filename} on the robot...`);
        await this.serial.uploadFile(lib.filename, lib.source);
        this._installedLibraries[lib.filename] = true;
      } catch (err) {
        this.consolePanel?.appendError(`Could not install ${lib.filename}: ${err.message}`);
        throw err;
      }
    }
  }

  async _handleDeploy() {
    const code = this._generateCode();
    if (!code.trim()) {
      this._showToast(Blockly.Msg['MSG_NO_CODE'] || 'No code to run — add some blocks first!', 'error');
      return;
    }

    // Saving overwrites main.py on the robot, so ask first.
    const confirmed = await ConfirmModal.ask({
      title: Blockly.Msg['UI_DEPLOY_CONFIRM_TITLE'] || 'Save this program to the robot?',
      body: Blockly.Msg['UI_DEPLOY_CONFIRM_BODY']
        || 'The program will be saved on the XRP as main.py and will run by itself every time the robot is switched on.',
      confirmLabel: Blockly.Msg['UI_DEPLOY_CONFIRM_OK'] || 'Save to XRP',
      cancelLabel: Blockly.Msg['UI_CANCEL'] || 'Cancel',
    });
    if (!confirmed) {
      this._showToast(Blockly.Msg['MSG_DEPLOY_CANCELLED'] || 'Save cancelled — nothing was changed on the robot.');
      return;
    }

    // Deployment output is recorded even when the console remains hidden.
    if (this._consolePinned) this._setPanelState(true, 'console');

    const deployBtn = document.getElementById('btn-deploy');
    if (deployBtn) {
      deployBtn.disabled = true;
      deployBtn.classList.add('deploying');
    }

    this.consolePanel.appendSystem(Blockly.Msg['MSG_DEPLOYING'] || '⬇ Saving main.py to board...');

    try {
      await this._ensureLibraries(code);
      await this.serial.uploadFile('main.py', code);
      this.consolePanel.appendSystem(Blockly.Msg['MSG_DEPLOYED'] || '✓ Deployed! Program will run automatically on power-up.');
      this._showToast(Blockly.Msg['MSG_DEPLOYED'] || '✓ Deployed to board!');

      // Deploy only saves main.py — it does not run it, so the board stays
      // idle at the REPL (and reachable over Bluetooth) right after a save.
    } catch (err) {
      this.consolePanel.appendError(`${Blockly.Msg['MSG_DEPLOY_FAILED'] || 'Deploy error: '}${err.message}`);
      this._showToast((Blockly.Msg['MSG_DEPLOY_FAILED'] || 'Deploy error: ') + err.message, 'error');
      this.toolbar.setRunning(false);
    } finally {
      if (deployBtn) {
        deployBtn.classList.remove('deploying');
        deployBtn.disabled = false;
      }
    }
  }

  /**
   * Install a one-shot listener on the serial data stream that resets the
   * running state when MicroPython prints its REPL prompt, which means the
   * program has finished executing on its own.
   */
  _watchForProgramEnd() {
    this._stopWatchingForProgramEnd(); // clear any previous watcher

    // Buffer incoming data; look for the '>>> ' REPL prompt
    this._replBuffer = '';
    this._seenExecutionStart = false;

    // Defensive fallback: enable prompt checking after 1.5 seconds regardless
    this._fallbackTimeout = setTimeout(() => {
      this._seenExecutionStart = true;
    }, 1500);

    this._replEndHandler = (text) => {
      // Check for execution start signatures to clear pre-execution prompts
      if (!this._seenExecutionStart) {
        const lower = text.toLowerCase();
        if (lower.includes('raw repl') || lower.includes('soft reboot') || lower.includes('micropython')) {
          this._seenExecutionStart = true;
          this._replBuffer = ''; // Clear any backlog containing pre-execution prompts
        }
      }

      if (this._seenExecutionStart) {
        this._replBuffer += text;
        // Keep only the last 16 chars to avoid unbounded growth
        if (this._replBuffer.length > 16) {
          this._replBuffer = this._replBuffer.slice(-16);
        }
        if (this._replBuffer.includes('>>> ')) {
          this._stopWatchingForProgramEnd();
          this.toolbar.setRunning(false);
          this.consolePanel.appendSystem(Blockly.Msg['MSG_DONE'] || '✓ Program finished');
        }
      }
    };

    // Chain on top of the existing onData handler
    const existingOnData = this.serial.onData;
    this.serial.onData = (text) => {
      if (existingOnData) existingOnData(text);
      if (this._replEndHandler) this._replEndHandler(text);
    };
  }

  _stopWatchingForProgramEnd() {
    if (this._fallbackTimeout) {
      clearTimeout(this._fallbackTimeout);
      this._fallbackTimeout = null;
    }
    if (!this._replEndHandler) return;
    // Restore the plain data handler
    this.serial.onData = (text) => {
      this.consolePanel.appendData(text, 'received');
    };
    this._replEndHandler = null;
    this._replBuffer = '';
  }

  // Remove only variables with no references anywhere, including loose blocks
  // and function parameters, so unfinished work is preserved. One undo group.
  _removeUnusedVariables() {
    const used = new Set(Blockly.Variables.allUsedVarModels(this.workspace).map(variable => variable.getId()));
    const map = this.workspace.getVariableMap();
    const unused = map.getAllVariables().filter(variable => !used.has(variable.getId()));
    if (!unused.length) return;
    const group = Blockly.Events.getGroup();
    Blockly.Events.setGroup(true);
    try {
      for (const variable of unused) map.deleteVariable(variable);
    } finally {
      Blockly.Events.setGroup(group);
    }
    this._autoSave();
  }

  // ── Live Code Generation ──

  _initLiveCodeGen() {
    this.workspace.addChangeListener((event) => {
      // Only regenerate on meaningful changes
      if (event.isUiEvent) return;
      if (event.type === Blockly.Events.FINISHED_LOADING) return;

      this._disableOrphans();
      this._generateCode();

      // Auto-save to localStorage on change (debounced)
      clearTimeout(this._saveTimeout);
      this._saveTimeout = setTimeout(() => this._autoSave(), 1000);
    });
  }

  _disableOrphans() {
    const validRoots = ['xrp_start', 'procedures_defnoreturn', 'procedures_defreturn'];
    const topBlocks = this.workspace.getTopBlocks();
    
    for (const block of topBlocks) {
      if (validRoots.includes(block.type)) {
        if (!block.isEnabled()) block.setDisabledReason(false, 'orphan');
        
        // Ensure all children are enabled
        const descendants = block.getDescendants(false);
        for (const desc of descendants) {
          if (!desc.isEnabled()) desc.setDisabledReason(false, 'orphan');
        }
      } else {
        // If it's not a valid root, disable it and all children
        const descendants = block.getDescendants(false);
        for (const desc of descendants) {
          if (desc.isEnabled()) desc.setDisabledReason(true, 'orphan');
        }
      }
    }
  }

  // ── Save / Load ──

  _autoSave() {
    try {
      const state = Blockly.serialization.workspaces.save(this.workspace);
      localStorage.setItem('xrp_blocks_workspace', JSON.stringify(state));
    } catch (err) {
      console.warn('Auto-save failed:', err);
    }
  }

  _saveWorkspace() {
    const state = Blockly.serialization.workspaces.save(this.workspace);
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xrp-blocks-project.json';
    a.click();
    URL.revokeObjectURL(url);
    this._showToast('Project saved!');
  }

  _loadWorkspace() {
    try {
      const saved = localStorage.getItem('xrp_blocks_workspace');
      if (saved) {
        const state = JSON.parse(saved);
        Blockly.serialization.workspaces.load(state, this.workspace);
      }
    } catch (err) {
      console.warn('Failed to load saved workspace:', err);
    }

    // Ensure there is at least one start block
    const topBlocks = this.workspace.getTopBlocks();
    const hasStart = topBlocks.some(b => b.type === 'xrp_start');
    if (!hasStart) {
      const startBlock = this.workspace.newBlock('xrp_start');
      startBlock.initSvg();
      startBlock.render();
      startBlock.moveBy(50, 50);
    }
  }

  _loadFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const state = JSON.parse(text);

        // The project may use blocks from a device library this browser does
        // not have yet. Put those libraries back before loading, or every one
        // of their blocks would be dropped on the floor.
        const added = await this._addLibrariesForSavedProject(state);
        if (added.length) {
          this._refreshLibraries();
          this._showToast(
            (Blockly.Msg['MSG_LIBRARY_AUTO_ADDED'] || 'Added the device libraries this project needs: %1')
              .replace('%1', added.join(', '))
          );
        }

        Blockly.serialization.workspaces.load(state, this.workspace);
        this._showToast('Project loaded!');
      } catch (err) {
        this._showToast('Failed to load file', 'error');
      }
    };
    input.click();
  }

  // ── Device Library Picker ──

  async _openLibraryPicker() {
    await LibraryModal.open({
      manager: this.libraries,
      workspace: this.workspace,
      onChange: () => this._refreshLibraries(),
      onToast: (message, type) => this._showToast(message, type || 'success'),
    });
  }

  // ── Lesson Support ──

  async _openLessonPicker() {
    const lesson = await LessonPickerModal.pick();
    if (!lesson) return;

    const ok = this.lessonManager.load(lesson);
    if (ok) {
      this._showToast(
        (Blockly.Msg['MSG_LESSON_LOADED'] || '📖 Lesson loaded: ') + (lesson.title || 'Untitled')
      );
    } else {
      this._showToast(
        Blockly.Msg['MSG_LESSON_INVALID'] || 'Invalid lesson file — must have a steps array.',
        'error'
      );
    }
  }

  /**
   * Re-inject the Blockly toolbox with a filtered or full definition.
   * @param {Object|null} toolboxFilter - Lesson toolbox filter, or null to restore full.
   */
  _applyFilteredToolbox(toolboxFilter) {
    if (!this.workspace) return;
    this._toolboxFilter = toolboxFilter || null;
    const toolbox = this._pruneUnknownBlocks(
      getFilteredToolbox(toolboxFilter, this.libraries.toolboxCategories())
    );
    this.workspace.updateToolbox(toolbox);
  }

  /**
   * Load a lesson template state into the Blockly workspace.
   * Clears the current workspace first, then loads the template.
   * Always ensures an xrp_start block is present afterwards.
   * @param {Object} state - Blockly serialization workspace state
   */
  _loadTemplateWorkspace(state) {
    if (!this.workspace) return;
    try {
      Blockly.serialization.workspaces.load(state, this.workspace);
    } catch (err) {
      console.error('[XRPBlocks] Failed to load lesson template:', err);
    }

    // Guarantee there is always a start block
    const topBlocks = this.workspace.getTopBlocks();
    const hasStart = topBlocks.some(b => b.type === 'xrp_start');
    if (!hasStart) {
      const startBlock = this.workspace.newBlock('xrp_start');
      startBlock.initSvg();
      startBlock.render();
      startBlock.moveBy(50, 50);
    }
  }

  // ── Resize ──

  _initResize() {
    const resizeObserver = new ResizeObserver(() => {
      Blockly.svgResize(this.workspace);
    });
    resizeObserver.observe(document.getElementById('blocklyDiv'));

    // Also handle panel resize drag
    this._initPanelResize();
  }

  _initPanelResize() {
    const panel = document.querySelector('.bottom-panel');
    const handle = document.querySelector('.bottom-panel__resize');
    if (!handle || !panel) return;

    let startY, startHeight;

    handle.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startHeight = panel.offsetHeight;
      panel.classList.remove('collapsed');

      const onMouseMove = (e) => {
        const delta = startY - e.clientY;
        const newHeight = Math.max(100, Math.min(window.innerHeight * 0.6, startHeight + delta));
        // Store the expanded size without overriding the collapsed CSS height.
        panel.style.setProperty('--panel-height', newHeight + 'px');
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        Blockly.svgResize(this.workspace);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // ── Toast Notifications ──

  _showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast toast--${type}`;

    // Trigger show
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2500);
  }
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', async () => {
  const app = new XRPBlocksApp();
  await app.loadLanguage();
  await app.loadLibraries();
  app.init();
});
```

**`js/blockly/toolbox.js`**

```js
/**
 * XRP Blocks — Toolbox Definition
 * Category-based toolbox with XRP-specific and standard Blockly categories.
 *
 * Each category has a stable `categoryKey` (English, no spaces) used by
 * the lesson system to filter categories regardless of UI language.
 *
 * Device libraries (devices/*.json) contribute their own categories at run
 * time. They are passed in rather than hard-coded here, so adding a device
 * never means editing this file. PCF8575 and NeoPixel used to live here and
 * are now two such libraries.
 */

/**
 * @param {Array<Object>} [libraryCategories] - categories contributed by the
 *   device libraries the user has added, in the order they were added.
 */
export function getToolboxDefinition(libraryCategories = []) {
  return {
    kind: 'categoryToolbox',
    contents: [
      // ── XRP Categories ──
      // Note: the "Events" category (xrp_start) is intentionally omitted from
      // the toolbox. The start block is a permanent, non-deletable fixture
      // that is always present on the canvas by default (see app.js), so it
      // should not be selectable/draggable from the toolbox.
      {
        kind: 'category',
        categoryKey: 'Drive',
        name: Blockly.Msg['CAT_DRIVE'] || 'Drive',
        categorystyle: 'drive_category',
        cssConfig: { icon: 'cat-icon cat-icon-drive' },
        contents: [
          // Getting the robot moving.
          {
            kind: 'block',
            type: 'xrp_drive_straight',
            inputs: {
              DISTANCE: { shadow: { type: 'math_number', fields: { NUM: 20 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_drive_turn',
            inputs: {
              ANGLE: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
            },
          },
          { kind: 'block', type: 'xrp_drive_stop' },
          { kind: 'sep', gap: '24' },
          // The same two, once a learner wants to choose the power.
          {
            kind: 'block',
            type: 'xrp_drive_straight_effort',
            inputs: {
              DISTANCE: { shadow: { type: 'math_number', fields: { NUM: 20 } } },
              EFFORT: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_drive_turn_effort',
            inputs: {
              ANGLE: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
              EFFORT: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            },
          },
          { kind: 'sep', gap: '24' },
          // Driving the wheels directly, which does not stop by itself.
          {
            kind: 'block',
            type: 'xrp_drive_set_effort',
            inputs: {
              LEFT: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
              RIGHT: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_drive_arcade',
            inputs: {
              SPEED: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
              TURN: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_drive_set_speed',
            inputs: {
              LEFT: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
              RIGHT: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
            },
          },
          { kind: 'sep', gap: '24' },
          // Measuring how far the wheels have turned.
          { kind: 'block', type: 'xrp_drive_encoder' },
          { kind: 'block', type: 'xrp_drive_reset_encoders' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Motors',
        name: Blockly.Msg['CAT_MOTORS'] || 'Motors',
        categorystyle: 'motor_category',
        cssConfig: { icon: 'cat-icon cat-icon-motors' },
        contents: [
          // One motor at a time, in percent like everything else.
          {
            kind: 'block',
            type: 'xrp_motor_set_effort_percent',
            inputs: {
              PERCENT: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            },
          },
          { kind: 'block', type: 'xrp_motor_brake' },
          { kind: 'block', type: 'xrp_motor_coast' },
          { kind: 'sep', gap: '24' },
          // Holding a steady speed, which needs the encoder.
          {
            kind: 'block',
            type: 'xrp_motor_set_speed',
            inputs: {
              SPEED: { shadow: { type: 'math_number', fields: { NUM: 60 } } },
            },
          },
          { kind: 'block', type: 'xrp_motor_speed_off' },
          { kind: 'sep', gap: '24' },
          // Reading the encoder.
          { kind: 'block', type: 'xrp_motor_get_position' },
          { kind: 'block', type: 'xrp_motor_get_counts' },
          { kind: 'block', type: 'xrp_motor_get_speed' },
          { kind: 'block', type: 'xrp_motor_reset_encoder' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Servo',
        name: Blockly.Msg['CAT_SERVO'] || 'Servo',
        categorystyle: 'servo_category',
        cssConfig: { icon: 'cat-icon cat-icon-servo' },
        contents: [
          // Degrees, 0 to 180, with 90 in the middle.
          {
            kind: 'block',
            type: 'xrp_servo_set_angle',
            inputs: {
              ANGLE: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
            },
          },
          { kind: 'block', type: 'xrp_servo_centre' },
          { kind: 'sep', gap: '24' },
          // Moving smoothly rather than jumping.
          {
            kind: 'block',
            type: 'xrp_servo_sweep',
            inputs: {
              FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              TO: { shadow: { type: 'math_number', fields: { NUM: 180 } } },
              SECONDS: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            },
          },
          { kind: 'sep', gap: '24' },
          // For a continuous rotation servo, and for letting go.
          {
            kind: 'block',
            type: 'xrp_servo_speed',
            inputs: {
              SPEED: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            },
          },
          { kind: 'block', type: 'xrp_servo_free' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Sensors',
        name: Blockly.Msg['CAT_SENSORS'] || 'Sensors',
        categorystyle: 'sensor_category',
        cssConfig: { icon: 'cat-icon cat-icon-sensors' },
        contents: [
          // What the robot can see and feel.
          { kind: 'block', type: 'xrp_distance_sensor' },
          { kind: 'block', type: 'xrp_line_reflectance' },
          { kind: 'sep', gap: '16' },
          { kind: 'block', type: 'xrp_button_is_pressed' },
          { kind: 'block', type: 'xrp_wait_for_button' },
          { kind: 'sep', gap: '24' },
          // The gyro, which needs zeroing before it means anything.
          { kind: 'block', type: 'xrp_imu_angle' },
          { kind: 'block', type: 'xrp_imu_reset_yaw' },
          { kind: 'block', type: 'xrp_imu_calibrate' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Board',
        name: Blockly.Msg['CAT_BOARD'] || 'Board',
        categorystyle: 'board_category',
        cssConfig: { icon: 'cat-icon cat-icon-board' },
        contents: [
          // The single green LED.
          { kind: 'block', type: 'xrp_led_on' },
          { kind: 'block', type: 'xrp_led_off' },
          {
            kind: 'block',
            type: 'xrp_led_blink',
            inputs: {
              COUNT: { shadow: { type: 'math_number', fields: { NUM: 3 } } },
              DELAY: { shadow: { type: 'math_number', fields: { NUM: 0.5 } } },
            },
          },
          { kind: 'sep', gap: '16' },
          // Used by almost every program.
          {
            kind: 'block',
            type: 'xrp_wait_seconds',
            inputs: {
              SECONDS: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_print',
            inputs: {
              TEXT: { shadow: { type: 'text', fields: { TEXT: 'Hello XRP!' } } },
            },
          },
          { kind: 'sep', gap: '24' },
          {
            kind: 'block',
            type: 'xrp_rgb_colour',
            inputs: {
              BRIGHTNESS: { shadow: { type: 'math_number', fields: { NUM: 30 } } },
            },
          },
          // Mixing your own colour on the RGB LED.
          {
            kind: 'block',
            type: 'xrp_rgb_led',
            inputs: {
              RED: { shadow: { type: 'math_number', fields: { NUM: 255 } } },
              GREEN: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              BLUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            },
          },
        ],
      },

      // ── Device library categories (devices/*.json) ──
      ...libraryCategories,

      // ── Separator ──
      { kind: 'sep' },

      // ── Standard Blockly Categories ──
      {
        kind: 'category',
        categoryKey: 'Logic',
        name: Blockly.Msg['CAT_LOGIC'] || 'Logic',
        categorystyle: 'logic_category',
        cssConfig: { icon: 'cat-icon cat-icon-logic' },
        contents: [
          { kind: 'block', type: 'controls_if' },
          {
            kind: 'block',
            type: 'controls_ifelse',
          },
          { kind: 'block', type: 'logic_compare' },
          { kind: 'block', type: 'logic_operation' },
          { kind: 'block', type: 'logic_negate' },
          { kind: 'block', type: 'logic_boolean' },
          { kind: 'block', type: 'logic_null' },
          { kind: 'block', type: 'logic_ternary' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Loops',
        name: Blockly.Msg['CAT_LOOPS'] || 'Loops',
        categorystyle: 'loop_category',
        cssConfig: { icon: 'cat-icon cat-icon-loops' },
        contents: [
          { kind: 'block', type: 'xrp_forever' },
          { kind: 'sep', gap: '16' },
          {
            kind: 'block',
            type: 'controls_repeat_ext',
            inputs: {
              TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
            },
          },
          { kind: 'block', type: 'controls_whileUntil' },
          {
            kind: 'block',
            type: 'controls_for',
            fields: { VAR: 'i' },
            inputs: {
              FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              TO: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
              BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            },
          },
          { kind: 'block', type: 'controls_forEach' },
          { kind: 'block', type: 'controls_flow_statements' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Math',
        name: Blockly.Msg['CAT_MATH'] || 'Math',
        categorystyle: 'math_category',
        cssConfig: { icon: 'cat-icon cat-icon-math' },
        contents: [
          { kind: 'block', type: 'math_number', fields: { NUM: 0 } },
          { kind: 'block', type: 'math_arithmetic' },
          { kind: 'block', type: 'math_single' },
          { kind: 'block', type: 'math_trig' },
          { kind: 'block', type: 'math_constant' },
          { kind: 'block', type: 'math_number_property' },
          { kind: 'block', type: 'math_round' },
          { kind: 'block', type: 'math_modulo' },
          { kind: 'block', type: 'math_constrain' },
          {
            kind: 'block',
            type: 'math_random_int',
            inputs: {
              FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              TO: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            },
          },
          { kind: 'block', type: 'math_random_float' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Text',
        name: Blockly.Msg['CAT_TEXT'] || 'Text',
        categorystyle: 'text_category',
        cssConfig: { icon: 'cat-icon cat-icon-text' },
        contents: [
          { kind: 'block', type: 'text' },
          { kind: 'block', type: 'text_join' },
          { kind: 'block', type: 'text_append' },
          { kind: 'block', type: 'text_length' },
          { kind: 'block', type: 'text_isEmpty' },
          { kind: 'block', type: 'text_indexOf' },
          { kind: 'block', type: 'text_charAt' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Variables',
        name: Blockly.Msg['CAT_VARIABLES'] || 'Variables',
        categorystyle: 'variable_category',
        cssConfig: { icon: 'cat-icon cat-icon-variables' },
        custom: 'VARIABLE',
      },

      {
        kind: 'category',
        categoryKey: 'Functions',
        name: Blockly.Msg['CAT_FUNCTIONS'] || 'Functions',
        categorystyle: 'procedure_category',
        cssConfig: { icon: 'cat-icon cat-icon-functions' },
        custom: 'PROCEDURE',
      },
    ],
  };
}

/**
 * Returns a filtered toolbox definition for a lesson.
 *
 * @param {Object|null} toolboxFilter - The `toolbox` field from a lesson JSON.
 *   - null / undefined / {} → return full toolbox (no filtering)
 *   - { "Drive": [], "Events": [] } → only those categories, all their blocks
 *   - { "Drive": ["xrp_drive_straight"] } → only that category with only that block
 * @returns {Object} Blockly toolbox definition
 */
export function getFilteredToolbox(toolboxFilter, libraryCategories = []) {
  const full = getToolboxDefinition(libraryCategories);

  // No filter — return the full toolbox
  if (!toolboxFilter || Object.keys(toolboxFilter).length === 0) {
    return full;
  }

  const filteredContents = [];

  for (const item of full.contents) {
    // Pass through separators between categories
    if (item.kind === 'sep' && !item.categoryKey) {
      filteredContents.push(item);
      continue;
    }

    // Skip categories not mentioned in the filter
    if (item.kind === 'category') {
      const key = item.categoryKey;
      if (!key || !(key in toolboxFilter)) continue;

      const allowedBlocks = toolboxFilter[key];

      // Empty array → include all blocks in this category as-is
      if (!allowedBlocks || allowedBlocks.length === 0) {
        filteredContents.push(item);
        continue;
      }

      // Non-empty array → filter the category's contents to matching block types
      // Keep `sep` items that appear between included blocks
      const filteredCategoryContents = [];
      let lastWasBlock = false;
      let pendingSep = null;

      for (const entry of (item.contents || [])) {
        if (entry.kind === 'sep') {
          // Hold the sep — only emit it if a block follows
          pendingSep = entry;
        } else if (entry.kind === 'block' && allowedBlocks.includes(entry.type)) {
          if (pendingSep && lastWasBlock) {
            filteredCategoryContents.push(pendingSep);
          }
          filteredCategoryContents.push(entry);
          pendingSep = null;
          lastWasBlock = true;
        }
      }

      if (filteredCategoryContents.length > 0) {
        filteredContents.push({ ...item, contents: filteredCategoryContents });
      }
    }
  }

  return { kind: 'categoryToolbox', contents: filteredContents };
}
```

**`js/blockly/theme.js`**

```js
/**
 * XRP Blocks — Custom Blockly Theme (Pastel, child-friendly)
 * Uses the Zelos renderer for Scratch 3.0 block shapes.
 */

/**
 * @param {'light'|'dark'} [mode='light'] Which palette to build.
 * @param {{blockStyles: Object, categoryStyles: Object}} [extra] Styles
 *   contributed by device libraries (devices/*.json). They are merged in last,
 *   so a library can never quietly redefine a built-in category.
 * @returns {!Blockly.Theme}
 */
export function createXRPTheme(mode = 'light', extra = null) {
  if (mode === 'dark') return createDarkTheme(extra);

  // Block style definitions — pastel colors
  const blockStyles = {
    // XRP-specific categories
    events_blocks: {
      colourPrimary: '#FFCA28',
      colourSecondary: '#FFE082',
      colourTertiary: '#FFB300',
      hat: 'cap',
    },
    drive_blocks: {
      colourPrimary: '#7CB9F0',
      colourSecondary: '#A8D4F7',
      colourTertiary: '#5A9FDE',
      hat: '',
    },
    motor_blocks: {
      colourPrimary: '#B39DDB',
      colourSecondary: '#D1C4E9',
      colourTertiary: '#9575CD',
      hat: '',
    },
    servo_blocks: {
      colourPrimary: '#FFB74D',
      colourSecondary: '#FFCC80',
      colourTertiary: '#FFA726',
      hat: '',
    },
    sensor_blocks: {
      colourPrimary: '#81C784',
      colourSecondary: '#A5D6A7',
      colourTertiary: '#66BB6A',
      hat: '',
    },
    board_blocks: {
      colourPrimary: '#FFD54F',
      colourSecondary: '#FFE082',
      colourTertiary: '#FFCA28',
      hat: '',
    },


    // Standard Blockly categories — pastel overrides
    logic_blocks: {
      colourPrimary: '#82B1FF',
      colourSecondary: '#B3D4FF',
      colourTertiary: '#5C8BCC',
      hat: '',
    },
    loop_blocks: {
      colourPrimary: '#80CBC4',
      colourSecondary: '#B2DFDB',
      colourTertiary: '#5BACA4',
      hat: '',
    },
    math_blocks: {
      colourPrimary: '#EF9A9A',
      colourSecondary: '#F5C6C6',
      colourTertiary: '#D47C7C',
      hat: '',
    },
    text_blocks: {
      colourPrimary: '#CE93D8',
      colourSecondary: '#E1BEE7',
      colourTertiary: '#AB47BC',
      hat: '',
    },
    list_blocks: {
      colourPrimary: '#90CAF9',
      colourSecondary: '#BBDEFB',
      colourTertiary: '#64B5F6',
      hat: '',
    },
    variable_blocks: {
      colourPrimary: '#FFAB91',
      colourSecondary: '#FFCCBC',
      colourTertiary: '#FF8A65',
      hat: '',
    },
    procedure_blocks: {
      colourPrimary: '#A5D6A7',
      colourSecondary: '#C8E6C9',
      colourTertiary: '#81C784',
      hat: '',
    },
    colour_blocks: {
      colourPrimary: '#F48FB1',
      colourSecondary: '#F8BBD0',
      colourTertiary: '#EC407A',
      hat: '',
    },
  };

  // Category style definitions (toolbox sidebar color indicators)
  const categoryStyles = {
    events_category: { colour: '#FFCA28' },
    drive_category: { colour: '#7CB9F0' },
    motor_category: { colour: '#B39DDB' },
    servo_category: { colour: '#FFB74D' },
    sensor_category: { colour: '#81C784' },
    board_category: { colour: '#FFD54F' },
    logic_category: { colour: '#82B1FF' },
    loop_category: { colour: '#80CBC4' },
    math_category: { colour: '#EF9A9A' },
    text_category: { colour: '#CE93D8' },
    list_category: { colour: '#90CAF9' },
    variable_category: { colour: '#FFAB91' },
    procedure_category: { colour: '#A5D6A7' },
    colour_category: { colour: '#F48FB1' },
  };

  // Component styles — workspace chrome
  const componentStyles = {
    workspaceBackgroundColour: '#F8F9FC',
    toolboxBackgroundColour: '#FFFFFF',
    toolboxForegroundColour: '#2D3142',
    flyoutBackgroundColour: '#F0F2F8',
    flyoutForegroundColour: '#2D3142',
    flyoutOpacity: 0.97,
    scrollbarColour: '#D1D5E0',
    scrollbarOpacity: 0.6,
    insertionMarkerColour: '#6C63FF',
    insertionMarkerOpacity: 0.4,
    markerColour: '#6C63FF',
    cursorColour: '#6C63FF',
    selectedGlowColour: '#6C63FF',
    selectedGlowOpacity: 0.2,
    replacementGlowColour: '#6C63FF',
    replacementGlowOpacity: 0.2,
  };

  // Font style
  const fontStyle = {
    family: "'Nunito', 'Segoe UI', system-ui, sans-serif",
    weight: '700',
    size: 12,
  };

  // Start blocks get a hat (cap) shape
  const startHat = true;

  mergeExtra(blockStyles, categoryStyles, extra);

  return Blockly.Theme.defineTheme('xrp_pastel', {
    name: 'xrp_pastel',
    blockStyles,
    categoryStyles,
    componentStyles,
    fontStyle,
    startHats: startHat,
  });
}


/**
 * Dark theme.
 *
 * The pastel light palette puts white text on very pale blocks, which is hard
 * to read: the yellow Board blocks measure 1.41:1 against white, far below the
 * 4.5:1 that WCAG AA asks for normal text. Every colour here keeps its hue but
 * is deepened and saturated until white text passes 4.5:1, so the categories
 * stay recognisable while the labels become legible.
 */
function createDarkTheme(extra = null) {
  const blockStyles = {
    events_blocks: {
      colourPrimary: '#967100',
      colourSecondary: '#C1940A',
      colourTertiary: '#6C5200',
      hat: 'cap',
    },
    drive_blocks: {
      colourPrimary: '#0076DF',
      colourSecondary: '#399CF5',
      colourTertiary: '#0055A1',
      hat: '',
    },
    motor_blocks: {
      colourPrimary: '#8A5DDA',
      colourSecondary: '#CBB9EC',
      colourTertiary: '#5C2AB7',
      hat: '',
    },
    servo_blocks: {
      colourPrimary: '#AC6600',
      colourSecondary: '#DD880C',
      colourTertiary: '#7C4A00',
      hat: '',
    },
    sensor_blocks: {
      colourPrimary: '#2A882E',
      colourSecondary: '#3FB244',
      colourTertiary: '#1E6221',
      hat: '',
    },
    board_blocks: {
      colourPrimary: '#957100',
      colourSecondary: '#BF940A',
      colourTertiary: '#6B5200',
      hat: '',
    },
    logic_blocks: {
      colourPrimary: '#166DFF',
      colourSecondary: '#7EACF8',
      colourTertiary: '#004BC7',
      hat: '',
    },
    loop_blocks: {
      colourPrimary: '#24847B',
      colourSecondary: '#37ACA1',
      colourTertiary: '#1A5F59',
      hat: '',
    },
    math_blocks: {
      colourPrimary: '#EE0505',
      colourSecondary: '#F35656',
      colourTertiary: '#AC0404',
      hat: '',
    },
    text_blocks: {
      colourPrimary: '#BC38D3',
      colourSecondary: '#D38ADF',
      colourTertiary: '#8C239D',
      hat: '',
    },
    list_blocks: {
      colourPrimary: '#0077D8',
      colourSecondary: '#309CF4',
      colourTertiary: '#00569C',
      hat: '',
    },
    variable_blocks: {
      colourPrimary: '#DF3500',
      colourSecondary: '#F56539',
      colourTertiary: '#A12600',
      hat: '',
    },
    procedure_blocks: {
      colourPrimary: '#2B882F',
      colourSecondary: '#41B245',
      colourTertiary: '#1F6222',
      hat: '',
    },
    colour_blocks: {
      colourPrimary: '#EB004F',
      colourSecondary: '#F54983',
      colourTertiary: '#AA0039',
      hat: '',
    },
  };

  const categoryStyles = {
    events_category: { colour: '#967100' },
    drive_category: { colour: '#0076DF' },
    motor_category: { colour: '#8A5DDA' },
    servo_category: { colour: '#AC6600' },
    sensor_category: { colour: '#2A882E' },
    board_category: { colour: '#957100' },
    logic_category: { colour: '#166DFF' },
    loop_category: { colour: '#24847B' },
    math_category: { colour: '#EE0505' },
    text_category: { colour: '#BC38D3' },
    list_category: { colour: '#0077D8' },
    variable_category: { colour: '#DF3500' },
    procedure_category: { colour: '#2B882F' },
    colour_category: { colour: '#EB004F' },
  };

  const componentStyles = {
    workspaceBackgroundColour: '#1E2028',
    toolboxBackgroundColour: '#242733',
    toolboxForegroundColour: '#E6E9F2',
    flyoutBackgroundColour: '#2A2E3B',
    flyoutForegroundColour: '#E6E9F2',
    flyoutOpacity: 0.98,
    scrollbarColour: '#4A5062',
    scrollbarOpacity: 0.7,
    insertionMarkerColour: '#8C86FF',
    insertionMarkerOpacity: 0.5,
    markerColour: '#8C86FF',
    cursorColour: '#8C86FF',
    selectedGlowColour: '#8C86FF',
    selectedGlowOpacity: 0.35,
    replacementGlowColour: '#8C86FF',
    replacementGlowOpacity: 0.35,
  };

  const fontStyle = {
    family: "'Nunito', 'Segoe UI', system-ui, sans-serif",
    weight: '700',
    size: 12,
  };

  mergeExtra(blockStyles, categoryStyles, extra);

  return Blockly.Theme.defineTheme('xrp_dark', {
    name: 'xrp_dark',
    blockStyles,
    categoryStyles,
    componentStyles,
    fontStyle,
    startHats: true,
  });
}


/**
 * Fold device-library styles into a palette. Existing names win, so a library
 * with a clashing style name cannot repaint a built-in category.
 *
 * @param {!Object} blockStyles - modified in place
 * @param {!Object} categoryStyles - modified in place
 * @param {?{blockStyles: Object, categoryStyles: Object}} extra
 */
function mergeExtra(blockStyles, categoryStyles, extra) {
  if (!extra) return;
  for (const [name, style] of Object.entries(extra.blockStyles || {})) {
    if (!(name in blockStyles)) blockStyles[name] = style;
  }
  for (const [name, style] of Object.entries(extra.categoryStyles || {})) {
    if (!(name in categoryStyles)) categoryStyles[name] = style;
  }
}
```

**`js/blockly/custom-category.js`**

```js
/**
 * Custom Category class to apply the category color to the background 
 * rather than just the left border.
 */
export class CustomCategory extends Blockly.ToolboxCategory {
  /**
   * @override
   */
  addColourBorder_(colour) {
    this.colour_ = colour; // Store the category color
    if (colour && this.iconDom_) {
      // Set the background color of the icon element permanently
      this.iconDom_.style.backgroundColor = colour;
    }
  }

  /**
   * @override
   */
  setSelected(isSelected) {
    super.setSelected(isSelected);
    if (this.rowDiv_) {
      if (isSelected && this.colour_) {
        this.rowDiv_.style.backgroundColor = this.colour_;
      } else {
        this.rowDiv_.style.backgroundColor = 'transparent';
      }
    }
  }
}

/**
 * Registers the custom category so Blockly uses it for all categories.
 */
export function registerCustomCategory() {
  Blockly.registry.register(
    Blockly.registry.Type.TOOLBOX_ITEM,
    Blockly.ToolboxCategory.registrationName,
    CustomCategory,
    true
  );
}
```

**`js/ui/translations.js`**

```js
/**
 * XRP Blocks — Translation Strings
 * Contains English (en) and Dutch (nl) translations.
 */

export const XRP_TRANSLATIONS = {
  en: {
    // Directions
    XRP_LEFT: 'left',
    XRP_RIGHT: 'right',

    // Categories
    CAT_EVENTS: 'Events',
    CAT_DRIVE: 'Drive',
    CAT_MOTORS: 'Motors',
    CAT_SERVO: 'Servo',
    CAT_SENSORS: 'Sensors',
    CAT_BOARD: 'Board',
    XRP_DELETE_UNUSED: 'Delete unused blocks',
    TIP_PIN_CONSOLE: 'Pin bottom panel',
    TIP_UNPIN_CONSOLE: 'Unpin and hide bottom panel',
    CAT_LOGIC: 'Logic',
    CAT_LOOPS: 'Loops',
    CAT_MATH: 'Math',
    CAT_TEXT: 'Text',
    CAT_VARIABLES: 'Variables',
    CAT_FUNCTIONS: 'Functions',

    // UI Buttons and labels
    UI_CONNECT: 'Connect XRP',
    UI_DISCONNECT: 'Disconnect',
    UI_RUN: 'Run',
    UI_STOP: 'Stop',
    UI_DEPLOY: 'Deploy',
    UI_SAVE: 'Save',
    UI_LOAD: 'Load',
    UI_DISCONNECTED: 'Disconnected',
    UI_CONNECTED: 'Connected',
    UI_CONNECTED_BT: 'Connected (BT)',
    UI_LESSON: 'Lesson',

    // Connection modal
    UI_CONNECT_CHOOSE: 'Choose connection type',
    UI_CONNECT_USB: 'USB Cable',
    UI_CONNECT_USB_DESC: 'WebSerial — Chrome / Edge',
    UI_CONNECT_BT: 'Bluetooth',
    UI_CONNECT_BT_DESC: 'Web Bluetooth — Chrome / Edge',

    // Lesson picker modal
    UI_LESSON_CHOOSE: 'Choose a lesson',
    UI_LESSON_UPLOAD: 'Upload lesson file',

    // Unsupported-browser modal
    UI_UNSUPPORTED_TITLE: 'Browser not supported',
    UI_UNSUPPORTED_BODY: "This browser can't connect to the XRP robot. Connecting needs WebSerial or Web Bluetooth, which aren't available in Safari or Firefox.",
    UI_UNSUPPORTED_HINT: 'Use Google Chrome or Microsoft Edge on a desktop computer.',
    UI_UNSUPPORTED_DISMISS: 'Got it',

    // Tooltips
    TIP_CONNECT: 'Connect to your XRP robot',
    TIP_RUN: 'Run your program on the XRP',
    TIP_STOP: 'Stop the running program',
    TIP_DEPLOY: 'Save to board — runs automatically on power-up',
    TIP_SAVE: 'Save your project',
    TIP_LOAD: 'Load a saved project',
    TIP_COPY: 'Copy Python code',
    TIP_COPY_CONSOLE: 'Copy console output',
    TIP_AUTOSCROLL: 'Auto-scroll',
    TIP_CLEAR: 'Clear console',
    TIP_COLLAPSE: 'Collapse panel',
    TIP_EXPAND: 'Expand panel',
    TIP_LESSON: 'Browse lessons',

    // Toasts and console messages
    MSG_COPIED: 'Code copied!',
    MSG_CONSOLE_COPIED: 'Console copied!',
    MSG_NO_CODE: 'No code to run — add some blocks first!',
    MSG_RUNNING: '▶ Running program...',
    MSG_CONNECTED: '✓ Connected to XRP',
    MSG_DISCONNECTED: '✗ Disconnected from XRP',
    MSG_CONNECT_FAILED: 'Failed to connect: ',
    MSG_RUN_FAILED: 'Run error: ',
    MSG_NOT_SUPPORTED: 'WebSerial not supported — use Chrome or Edge',
    MSG_BT_NOT_SUPPORTED: 'Web Bluetooth not supported — use Chrome or Edge',
    MSG_NOT_SUPPORTED_SHORT: 'Not supported',
    MSG_STOPPED: '⏹ Program stopped',
    MSG_STOP_REBOOTING: '⏹ Stop signal sent — board is rebooting, reconnect once it comes back.',
    MSG_STOP_FAILED: '⚠ Board did not confirm it stopped — try again, or press the reset button on the board.',
    MSG_REGAINING_CONTROL_BLE: '⏳ Board was busy running a program — sent a stop signal, it will reboot and disconnect. Reconnect once it comes back.',
    MSG_REGAINING_CONTROL_USB: '⚠ Board is still busy running a program and did not respond to Stop. Try again, or press the reset button on the board.',
    MSG_DEPLOYING: '⬇ Saving main.py to board...',
    MSG_DEPLOYED: '✓ Deployed! Program will run automatically on power-up.',
    MSG_DEPLOY_FAILED: 'Deploy error: ',
    MSG_LESSON_LOADED: '📖 Lesson loaded: ',
    MSG_LESSON_INVALID: 'Invalid lesson file — must have a steps array.',
    MSG_LESSON_FILE_ERROR: 'Failed to read lesson file',
    MSG_LESSONS_LOADING: 'Loading lessons…',
    MSG_LESSONS_LOAD_ERROR: 'Failed to load lessons from the server.',
    MSG_LESSONS_EMPTY: 'No lessons found on the server.',

    // Lesson panel UI
    LESSON_STEP_OF: 'Step %1 of %2',
    LESSON_BTN_PREV: 'Previous',
    LESSON_BTN_NEXT: 'Next',
    LESSON_BTN_FINISH: 'Finish',
    LESSON_ARIA_EXIT: 'Exit lesson',
    LESSON_TIP_EXIT: 'Exit lesson',

    // Lesson exit confirmation dialog
    LESSON_CONFIRM_TITLE: 'Exit lesson?',
    LESSON_CONFIRM_BODY: 'Are you sure you want to exit the lesson? Your progress will not be saved.',
    LESSON_CONFIRM_YES: 'Exit lesson',
    LESSON_CONFIRM_NO: 'Keep going',

    // Events (Start) Block
    XRP_START: 'when program starts',
    XRP_START_TOOLTIP: 'The starting point for the program.',

    // Drivetrain Blocks
    XRP_DRIVE_STRAIGHT: 'drive straight %1 cm',
    XRP_DRIVE_STRAIGHT_TOOLTIP: 'Drive the robot straight for a distance in centimetres. Positive = forward, negative = backward. The program waits until it arrives.',
    XRP_DRIVE_STRAIGHT_EFFORT: 'drive straight %1 cm at %2 % effort',
    XRP_DRIVE_STRAIGHT_EFFORT_TOOLTIP: 'The same, but you choose the power, from 0 to 100 percent. Less power is gentler and more accurate; more power is faster.',
    XRP_DRIVE_TURN: 'turn %1 degrees',
    XRP_DRIVE_TURN_TOOLTIP: 'Turn the robot on the spot, in degrees. Positive = right, negative = left. The program waits until the turn is finished.',
    XRP_DRIVE_TURN_EFFORT: 'turn %1 degrees at %2 % effort',
    XRP_DRIVE_TURN_EFFORT_TOOLTIP: 'The same, but you choose the power, from 0 to 100 percent.',
    XRP_DRIVE_STOP: 'stop driving',
    XRP_DRIVE_STOP_TOOLTIP: 'Stop the robot immediately.',
    XRP_DRIVE_SET_EFFORT: 'set drive effort left %1 %% right %2 %%',
    XRP_DRIVE_SET_EFFORT_TOOLTIP: 'Power each wheel directly, from -100 to 100 percent. The robot keeps going until you stop it, so this needs a stop block or a wait after it.',
    XRP_DRIVE_SET_SPEED: 'set drive speed left %1 right %2',
    XRP_DRIVE_SET_SPEED_TOOLTIP: 'Hold a steady speed for each wheel in centimetres per second, using the encoders. Note this is cm/s here, while a single motor is in rpm. The robot keeps going until you stop it.',
    XRP_DRIVE_ARCADE: 'arcade drive forward %1 %% turn %2 %%',
    XRP_DRIVE_ARCADE_TOOLTIP: 'Forward speed and turning at once, both from -100 to 100 percent. A positive turn runs the right wheel faster than the left. The robot keeps going until you stop it.',
    XRP_DRIVE_LEFT_ENCODER: 'left encoder position',
    XRP_DRIVE_LEFT_ENCODER_TOOLTIP: 'Get the current position of the left wheel encoder.',
    XRP_DRIVE_RIGHT_ENCODER: 'right encoder position',
    XRP_DRIVE_RIGHT_ENCODER_TOOLTIP: 'Get the current position of the right wheel encoder.',
    XRP_DRIVE_RESET_ENCODERS: 'reset drive encoders',
    XRP_DRIVE_RESET_ENCODERS_TOOLTIP: 'Reset both wheel encoder positions to zero.',

    // Motors Blocks
    XRP_MOTOR_3: 'motor 3',
    XRP_MOTOR_4: 'motor 4',
    XRP_MOTOR_SET_EFFORT: 'set motor %1 effort %2',
    XRP_MOTOR_SET_EFFORT_TOOLTIP: 'Effort from -1 to 1: -1 is full reverse, 0 is stop, 1 is full forward. Motors 3 and 4 are on the XRP Controller only.',
    XRP_MOTOR_SET_EFFORT_PERCENT: 'set motor %1 effort %2 %%',
    XRP_MOTOR_SET_EFFORT_PERCENT_TOOLTIP: 'The same thing in percent: -100 is full reverse, 0 is stop, 100 is full forward.',
    XRP_MOTOR_SET_SPEED: 'set motor %1 speed %2 rpm',
    XRP_MOTOR_SET_SPEED_TOOLTIP: 'Hold a speed in revolutions per minute, using the encoder. The robot keeps correcting until you change it.',
    XRP_MOTOR_SPEED_OFF: 'turn speed control off for motor %1',
    XRP_MOTOR_SPEED_OFF_TOOLTIP: 'Stop holding a speed and hand the motor back to the effort blocks. This stops the motor without braking.',
    XRP_MOTOR_GET_POSITION: 'motor %1 position in turns',
    XRP_MOTOR_GET_POSITION_TOOLTIP: 'How far the wheel has turned since the encoder was reset, counted in whole revolutions.',
    XRP_MOTOR_GET_COUNTS: 'motor %1 position in counts',
    XRP_MOTOR_GET_COUNTS_TOOLTIP: 'The same position as raw encoder counts, which is a much finer measurement.',
    XRP_MOTOR_GET_SPEED: 'motor %1 speed in rpm',
    XRP_MOTOR_GET_SPEED_TOOLTIP: 'How fast the motor is actually turning, in revolutions per minute.',
    XRP_MOTOR_RESET_ENCODER: 'reset motor %1 encoder',
    XRP_MOTOR_RESET_ENCODER_TOOLTIP: 'Set the position back to zero, so the next measurement starts from here.',
    XRP_MOTOR_BRAKE: 'brake motor %1',
    XRP_MOTOR_BRAKE_TOOLTIP: 'Stop the motor and hold it still against being turned.',
    XRP_MOTOR_COAST: 'coast motor %1',
    XRP_MOTOR_COAST_TOOLTIP: 'Let the motor roll to a stop on its own, freely.',

    // Servo Blocks
    XRP_SERVO_1: 'servo 1',
    XRP_SERVO_2: 'servo 2',
    XRP_SERVO_3: 'servo 3',
    XRP_SERVO_4: 'servo 4',
    XRP_SERVO_SET_ANGLE: 'set %1 angle %2 degrees',
    XRP_SERVO_SET_ANGLE_TOOLTIP: 'Move the servo to an angle from 0 to 180 degrees. 90 is the middle. The last 5 degrees at each end are held back so the servo is never pushed against its own stop. Servos 3 and 4 are on the XRP Controller only.',
    XRP_SERVO_CENTRE: 'centre %1',
    XRP_SERVO_CENTRE_TOOLTIP: 'Move the servo to its middle position, 90 degrees.',
    XRP_SERVO_SWEEP: 'sweep %1',
    XRP_SERVO_SWEEP_RANGE: 'from %1 to %2',
    XRP_SERVO_SWEEP_TIME: 'over %1 seconds',
    XRP_SERVO_SWEEP_TOOLTIP: 'Move the servo smoothly from one angle to another, in degrees from 0 to 180. The program waits until the sweep is finished.',
    XRP_SERVO_SPEED: 'set %1 continuous speed to %2 %%',
    XRP_SERVO_SPEED_TOOLTIP: 'For a continuous rotation servo only: -100 is full speed one way, 0 is stop, 100 is full speed the other way. A normal servo will just move to an angle instead.',
    XRP_SERVO_FREE: 'free servo %1',
    XRP_SERVO_FREE_TOOLTIP: 'Free the servo, so it stops holding its position and can be turned by hand.',

    // Sensors Blocks
    XRP_DISTANCE_SENSOR: 'distance sensor distance (cm)',
    XRP_DISTANCE_SENSOR_TOOLTIP: 'How far away the nearest thing in front is, in centimetres.',
    XRP_LINE_GET_LEFT: 'line sensor left reflectance',
    XRP_LINE_GET_LEFT_TOOLTIP: 'Get reflectance value of the left reflectance sensor (0 to 1).',
    XRP_LINE_GET_RIGHT: 'line sensor right reflectance',
    XRP_LINE_GET_RIGHT_TOOLTIP: 'Get reflectance value of the right reflectance sensor (0 to 1).',
    XRP_IMU_GET_YAW: 'gyro yaw (degrees)',
    XRP_IMU_GET_YAW_TOOLTIP: 'How far the robot has turned since the yaw was last reset. It keeps counting past 360, so two full turns reads 720.',
    XRP_IMU_GET_HEADING: 'gyro heading (0 to 360)',
    XRP_IMU_GET_HEADING_TOOLTIP: 'The same turn, wrapped to stay between 0 and 360, like a compass.',
    XRP_IMU_RESET_YAW: 'set gyro %1 to zero',
    XRP_IMU_ANGLE: 'gyro %1',
    XRP_IMU_ANGLE_TOOLTIP: 'Read one of the gyro angles in degrees. Yaw keeps counting past 360; heading wraps like a compass.',
    XRP_IMU_READ_YAW: 'yaw (degrees)',
    XRP_IMU_READ_HEADING: 'heading (0 to 360)',
    XRP_IMU_READ_PITCH: 'pitch (degrees)',
    XRP_IMU_READ_ROLL: 'roll (degrees)',
    XRP_SIDE_LEFT: 'left',
    XRP_SIDE_RIGHT: 'right',
    XRP_LINE_REFLECTANCE: 'line sensor %1 reflectance',
    XRP_LINE_REFLECTANCE_TOOLTIP: 'How dark the floor is under that sensor, from 0 for white to 1 for black. It is a decimal, not a percentage.',
    XRP_DRIVE_ENCODER: '%1 wheel position',
    XRP_DRIVE_ENCODER_TOOLTIP: 'How far that wheel has travelled in centimetres since the encoders were reset.',
    XRP_IMU_RESET_YAW_TOOLTIP: 'Call this straight after calibrating. The gyro starts counting the moment the robot powers up, so without it the angle is already a large number before your program begins.',
    XRP_IMU_AXIS_YAW: 'yaw',
    XRP_IMU_AXIS_PITCH: 'pitch',
    XRP_IMU_AXIS_ROLL: 'roll',
    XRP_IMU_GET_PITCH: 'gyro pitch (degrees)',
    XRP_IMU_GET_PITCH_TOOLTIP: 'Get robot pitch angle in degrees.',
    XRP_IMU_GET_ROLL: 'gyro roll (degrees)',
    XRP_IMU_GET_ROLL_TOOLTIP: 'Get robot roll angle in degrees.',
    XRP_IMU_CALIBRATE: 'gyro calibrate',
    XRP_IMU_CALIBRATE_TOOLTIP: 'Calibrate the IMU. Keep the robot completely still during calibration.',
    XRP_BUTTON_IS_PRESSED: 'button is pressed',
    XRP_BUTTON_IS_PRESSED_TOOLTIP: 'Returns true if the onboard button is currently pressed.',
    XRP_WAIT_FOR_BUTTON: 'wait for button press',
    XRP_WAIT_FOR_BUTTON_TOOLTIP: 'Wait until the onboard user button is pressed.',

    // Board Blocks
    XRP_LED_ON: 'turn LED on',
    XRP_LED_ON_TOOLTIP: 'Turn the onboard green LED on.',
    XRP_LED_OFF: 'turn LED off',
    XRP_LED_OFF_TOOLTIP: 'Turn the onboard green LED off.',
    XRP_LED_BLINK: 'blink LED %1 times with %2 s delay',
    XRP_LED_BLINK_TOOLTIP: 'Blink the green LED on the board a set number of times. The program waits while it blinks, so a long blink holds everything else up.',
    XRP_RGB_COLOUR: 'set RGB LED colour %1 brightness %2 %%',
    XRP_RGB_COLOUR_TOOLTIP: 'Choose the onboard RGB LED colour and brightness from 0 to 100%. 0% turns it off. Values outside this range are limited. Not on the XRP Beta board.',
    XRP_COLOUR_RED: 'red', XRP_COLOUR_ORANGE: 'orange', XRP_COLOUR_YELLOW: 'yellow',
    XRP_COLOUR_GREEN: 'green', XRP_COLOUR_CYAN: 'cyan', XRP_COLOUR_BLUE: 'blue',
    XRP_COLOUR_PURPLE: 'purple', XRP_COLOUR_MAGENTA: 'magenta', XRP_COLOUR_PINK: 'pink',
    XRP_COLOUR_WHITE: 'white', XRP_COLOUR_OFF: 'off',
    XRP_RGB_LED: 'set RGB LED red %1 green %2 blue %3',
    XRP_RGB_LED_TOOLTIP: 'Mix a colour on the RGB LED from red, green and blue, each 0 to 255. Not on the XRP Beta board.',
    XRP_WAIT_SECONDS: 'wait %1 seconds',
    XRP_WAIT_SECONDS_TOOLTIP: 'Pause execution for the specified time.',
    XRP_PRINT: 'print %1',
    XRP_PRINT_TOOLTIP: 'Print a message to the console.',

    MSG_STALE_CACHE: 'Some blocks are missing because the browser is using cached files. Reload with Ctrl+Shift+R.',
    TIP_THEME: 'Switch between light and dark',

    // Deploy confirmation
    UI_CANCEL: 'Cancel',
    UI_DEPLOY_CONFIRM_TITLE: 'Save this program to the robot?',
    UI_DEPLOY_CONFIRM_BODY: 'The program will be saved on the XRP as main.py and will run by itself every time the robot is switched on.',
    UI_DEPLOY_CONFIRM_WARN: 'Any program already saved on the robot will be replaced.',
    UI_DEPLOY_CONFIRM_OK: 'Save to XRP',
    MSG_DEPLOY_CANCELLED: 'Save cancelled — nothing was changed on the robot.',

    // Loop Blocks
    XRP_FOREVER: 'repeat forever',
    XRP_FOREVER_TOOLTIP: 'Repeat the blocks inside over and over, without stopping.',

    // Device libraries (devices/*.json)
    UI_LIBRARY: 'Library',
    TIP_LIBRARY: 'Add or remove device libraries',
    UI_LIBRARY_TITLE: 'Device libraries',
    UI_LIBRARY_INTRO: 'Each library adds a category of blocks for one device, and installs its driver on the robot the first time you use it.',
    UI_LIBRARY_INSTALLED: 'Added to this IDE',
    UI_LIBRARY_AVAILABLE: 'Available to add',
    UI_LIBRARY_ADD: 'Add',
    UI_LIBRARY_REMOVE: 'Remove',
    UI_LIBRARY_UPLOAD: 'Add from a file',
    UI_LIBRARY_FETCH: 'Fetch',
    UI_LIBRARY_URL_PLACEHOLDER: 'https://…/device.json',
    UI_LIBRARY_ONE_BLOCK: '1 block',
    UI_LIBRARY_N_BLOCKS: '%1 blocks',
    UI_LIBRARY_FROM_URL: 'from a URL',
    UI_LIBRARY_FROM_FILE: 'from a file',
    MSG_LIBRARY_LOADING: 'Loading device libraries…',
    MSG_LIBRARY_EMPTY: 'No device libraries found. Add one from a file or a URL below.',
    MSG_LIBRARY_ADDED: 'Added %1',
    MSG_LIBRARY_REMOVED: 'Removed %1',
    MSG_LIBRARY_IN_USE: 'Those blocks are still being used in your program. Delete them first, then remove the library.',
    MSG_LIBRARY_URL_INVALID: 'Enter a full address starting with https://',
    MSG_LIBRARY_FETCH_ERROR: 'Could not fetch that library. Check the address, and that the server allows other sites to read it.',
    MSG_LIBRARY_AUTO_ADDED: 'Added the device libraries this project needs: %1'
  },
  nl: {
    // Directions
    XRP_LEFT: 'links',
    XRP_RIGHT: 'rechts',

    // Categories
    CAT_EVENTS: 'Gebeurtenissen',
    CAT_DRIVE: 'Aandrijving',
    CAT_MOTORS: 'Motoren',
    CAT_SERVO: 'Servo',
    CAT_SENSORS: 'Sensoren',
    CAT_BOARD: 'Printplaat',
    XRP_DELETE_UNUSED: 'Ongebruikte blokken verwijderen',
    TIP_PIN_CONSOLE: 'Onderpaneel vastzetten',
    TIP_UNPIN_CONSOLE: 'Onderpaneel losmaken en verbergen',
    CAT_LOGIC: 'Logica',
    CAT_LOOPS: 'Lussen',
    CAT_MATH: 'Rekenen',
    CAT_TEXT: 'Tekst',
    CAT_VARIABLES: 'Variabelen',
    CAT_FUNCTIONS: 'Functies',

    // UI Buttons and labels
    UI_CONNECT: 'Verbind XRP',
    UI_DISCONNECT: 'Verbreek verbinding',
    UI_RUN: 'Start',
    UI_STOP: 'Stop',
    UI_DEPLOY: 'Opslaan op robot',
    UI_SAVE: 'Opslaan',
    UI_LOAD: 'Laden',
    UI_DISCONNECTED: 'Niet verbonden',
    UI_CONNECTED: 'Verbonden',
    UI_CONNECTED_BT: 'Verbonden (BT)',
    UI_LESSON: 'Les',

    // Verbindingsmodal
    UI_CONNECT_CHOOSE: 'Kies verbindingstype',
    UI_CONNECT_USB: 'USB-kabel',
    UI_CONNECT_USB_DESC: 'WebSerial — Chrome / Edge',
    UI_CONNECT_BT: 'Bluetooth',
    UI_CONNECT_BT_DESC: 'Web Bluetooth — Chrome / Edge',

    // Lesmodal
    UI_LESSON_CHOOSE: 'Kies een les',
    UI_LESSON_UPLOAD: 'Lesbestand uploaden',

    // Unsupported-browser modal
    UI_UNSUPPORTED_TITLE: 'Browser niet ondersteund',
    UI_UNSUPPORTED_BODY: 'Deze browser kan geen verbinding maken met de XRP-robot. Verbinden vereist WebSerial of Web Bluetooth, die niet beschikbaar zijn in Safari of Firefox.',
    UI_UNSUPPORTED_HINT: 'Gebruik Google Chrome of Microsoft Edge op een desktopcomputer.',
    UI_UNSUPPORTED_DISMISS: 'Begrepen',

    // Tooltips
    TIP_CONNECT: 'Verbind met de XRP robot',
    TIP_RUN: 'Voer het programma uit op de XRP',
    TIP_STOP: 'Stop het actieve programma',
    TIP_DEPLOY: 'Sla op de robot op — start automatisch bij het aanzetten',
    TIP_SAVE: 'Sla je project op',
    TIP_LOAD: 'Laad een opgeslagen project',
    TIP_COPY: 'Kopieer Python code',
    TIP_COPY_CONSOLE: 'Kopieer console-uitvoer',
    TIP_AUTOSCROLL: 'Automatisch scrollen',
    TIP_CLEAR: 'Console leegmaken',
    TIP_COLLAPSE: 'Paneel inklappen',
    TIP_EXPAND: 'Paneel uitklappen',
    TIP_LESSON: 'Blader door lessen',

    // Toasts and console messages
    MSG_COPIED: 'Code gekopieerd!',
    MSG_CONSOLE_COPIED: 'Console gekopieerd!',
    MSG_NO_CODE: 'Geen code om uit te voeren — voeg eerst blokken toe!',
    MSG_RUNNING: '▶ Programma uitvoeren...',
    MSG_CONNECTED: '✓ Verbonden met XRP',
    MSG_DISCONNECTED: '✗ Verbinding met XRP verbroken',
    MSG_CONNECT_FAILED: 'Verbinding mislukt: ',
    MSG_RUN_FAILED: 'Fout bij uitvoeren: ',
    MSG_NOT_SUPPORTED: 'WebSerial niet ondersteund — gebruik Chrome of Edge',
    MSG_BT_NOT_SUPPORTED: 'Web Bluetooth niet ondersteund — gebruik Chrome of Edge',
    MSG_NOT_SUPPORTED_SHORT: 'Niet ondersteund',
    MSG_STOPPED: '⏹ Programma gestopt',
    MSG_STOP_REBOOTING: '⏹ Stopsignaal verzonden — de robot herstart, verbind opnieuw zodra deze terug is.',
    MSG_STOP_FAILED: '⚠ De robot bevestigde niet dat hij is gestopt — probeer het opnieuw of druk op de resetknop.',
    MSG_REGAINING_CONTROL_BLE: '⏳ De robot was bezig met een programma — er is een stopsignaal verzonden, hij herstart en verbreekt de verbinding. Verbind opnieuw zodra hij terug is.',
    MSG_REGAINING_CONTROL_USB: '⚠ De robot is nog bezig met een programma en reageerde niet op Stop. Probeer het opnieuw of druk op de resetknop.',
    MSG_DEPLOYING: '⬇ main.py opslaan op de robot...',
    MSG_DEPLOYED: '✓ Opgeslagen! Programma start automatisch bij het aanzetten.',
    MSG_DEPLOY_FAILED: 'Fout bij opslaan: ',
    MSG_LESSON_LOADED: '📖 Les geladen: ',
    MSG_LESSON_INVALID: 'Ongeldig lesbestand — moet een stappen-array bevatten.',
    MSG_LESSON_FILE_ERROR: 'Kan het lesbestand niet lezen',
    MSG_LESSONS_LOADING: 'Lessen laden…',
    MSG_LESSONS_LOAD_ERROR: 'Kan lessen niet van de server laden.',
    MSG_LESSONS_EMPTY: 'Geen lessen gevonden op de server.',

    // Lesson panel UI
    LESSON_STEP_OF: 'Stap %1 van %2',
    LESSON_BTN_PREV: 'Vorige',
    LESSON_BTN_NEXT: 'Volgende',
    LESSON_BTN_FINISH: 'Afronden',
    LESSON_ARIA_EXIT: 'Les afsluiten',
    LESSON_TIP_EXIT: 'Les afsluiten',

    // Lesson exit confirmation dialog
    LESSON_CONFIRM_TITLE: 'Les afsluiten?',
    LESSON_CONFIRM_BODY: 'Weet je zeker dat je de les wilt afsluiten? Je voortgang wordt niet opgeslagen.',
    LESSON_CONFIRM_YES: 'Les afsluiten',
    LESSON_CONFIRM_NO: 'Doorgaan',

    // Events (Start) Block
    XRP_START: 'wanneer het programma start',
    XRP_START_TOOLTIP: 'Het startpunt van het programma.',

    // Drivetrain Blocks
    XRP_DRIVE_STRAIGHT: 'rij rechtdoor %1 cm',
    XRP_DRIVE_STRAIGHT_TOOLTIP: 'Laat de robot rechtdoor rijden over een afstand in centimeter. Positief = vooruit, negatief = achteruit. Het programma wacht tot hij er is.',
    XRP_DRIVE_STRAIGHT_EFFORT: 'rij rechtdoor %1 cm met %2 % vermogen',
    XRP_DRIVE_STRAIGHT_EFFORT_TOOLTIP: 'Hetzelfde, maar jij kiest het vermogen, van 0 tot 100 procent. Minder vermogen is rustiger en nauwkeuriger, meer vermogen is sneller.',
    XRP_DRIVE_TURN: 'draai %1 graden',
    XRP_DRIVE_TURN_TOOLTIP: 'Draai de robot op de plaats, in graden. Positief = rechtsom, negatief = linksom. Het programma wacht tot de draai klaar is.',
    XRP_DRIVE_TURN_EFFORT: 'draai %1 graden met %2 % vermogen',
    XRP_DRIVE_TURN_EFFORT_TOOLTIP: 'Hetzelfde, maar jij kiest het vermogen, van 0 tot 100 procent.',
    XRP_DRIVE_STOP: 'stop met rijden',
    XRP_DRIVE_STOP_TOOLTIP: 'Stop de robot direct.',
    XRP_DRIVE_SET_EFFORT: 'stel rijvermogen in links %1 %% rechts %2 %%',
    XRP_DRIVE_SET_EFFORT_TOOLTIP: 'Geef elk wiel rechtstreeks vermogen, van -100 tot 100 procent. De robot blijft rijden tot je hem stopt, dus hier hoort een stopblok of een wachtblok achter.',
    XRP_DRIVE_SET_SPEED: 'stel rijsnelheid in links %1 rechts %2',
    XRP_DRIVE_SET_SPEED_TOOLTIP: 'Houd voor elk wiel een vaste snelheid aan in centimeter per seconde, met de encoders. Let op: hier is het cm/s, bij een losse motor is het toeren per minuut. De robot blijft rijden tot je hem stopt.',
    XRP_DRIVE_ARCADE: 'arcade besturing vooruit %1 %% sturen %2 %%',
    XRP_DRIVE_ARCADE_TOOLTIP: 'Vooruit rijden en sturen tegelijk, allebei van -100 tot 100 procent. Bij een positieve stuurwaarde draait het rechterwiel sneller dan het linker. De robot blijft rijden tot je hem stopt.',
    XRP_DRIVE_LEFT_ENCODER: 'linker encoder positie',
    XRP_DRIVE_LEFT_ENCODER_TOOLTIP: 'Vraag de huidige positie van de linker wiel-encoder op.',
    XRP_DRIVE_RIGHT_ENCODER: 'rechter encoder positie',
    XRP_DRIVE_RIGHT_ENCODER_TOOLTIP: 'Vraag de huidige positie van de rechter wiel-encoder op.',
    XRP_DRIVE_RESET_ENCODERS: 'reset encoders',
    XRP_DRIVE_RESET_ENCODERS_TOOLTIP: 'Stel beide wiel-encoders in op nul.',

    // Motors Blocks
    XRP_MOTOR_3: 'motor 3',
    XRP_MOTOR_4: 'motor 4',
    XRP_MOTOR_SET_EFFORT: 'stel motor %1 vermogen in %2',
    XRP_MOTOR_SET_EFFORT_TOOLTIP: 'Vermogen van -1 tot 1: -1 is vol achteruit, 0 is stop, 1 is vol vooruit. Motor 3 en 4 zitten alleen op de XRP Controller.',
    XRP_MOTOR_SET_EFFORT_PERCENT: 'stel motor %1 vermogen in %2 %%',
    XRP_MOTOR_SET_EFFORT_PERCENT_TOOLTIP: 'Hetzelfde in procenten: -100 is vol achteruit, 0 is stop, 100 is vol vooruit.',
    XRP_MOTOR_SET_SPEED: 'stel motor %1 snelheid in %2 tpm',
    XRP_MOTOR_SET_SPEED_TOOLTIP: 'Houd een snelheid aan in toeren per minuut, met de encoder. De robot blijft bijsturen tot je het verandert.',
    XRP_MOTOR_SPEED_OFF: 'zet snelheidsregeling uit voor motor %1',
    XRP_MOTOR_SPEED_OFF_TOOLTIP: 'Stop met een snelheid aanhouden en geef de motor terug aan de vermogensblokken. De motor stopt zonder te remmen.',
    XRP_MOTOR_GET_POSITION: 'motor %1 positie in omwentelingen',
    XRP_MOTOR_GET_POSITION_TOOLTIP: 'Hoe ver het wiel gedraaid heeft sinds de encoder op nul werd gezet, in hele omwentelingen.',
    XRP_MOTOR_GET_COUNTS: 'motor %1 positie in tellen',
    XRP_MOTOR_GET_COUNTS_TOOLTIP: 'Dezelfde positie als ruwe encodertellen, een veel fijnere meting.',
    XRP_MOTOR_GET_SPEED: 'motor %1 snelheid in tpm',
    XRP_MOTOR_GET_SPEED_TOOLTIP: 'Hoe snel de motor werkelijk draait, in toeren per minuut.',
    XRP_MOTOR_RESET_ENCODER: 'reset motor %1 encoder',
    XRP_MOTOR_RESET_ENCODER_TOOLTIP: 'Zet de positie terug op nul, zodat de volgende meting hier begint.',
    XRP_MOTOR_BRAKE: 'rem motor %1',
    XRP_MOTOR_BRAKE_TOOLTIP: 'Stop de motor en houd hem tegen draaien vast.',
    XRP_MOTOR_COAST: 'uitrollen motor %1',
    XRP_MOTOR_COAST_TOOLTIP: 'Laat de motor vrij uitrollen tot stilstand.',

    // Servo Blocks
    XRP_SERVO_1: 'servo 1',
    XRP_SERVO_2: 'servo 2',
    XRP_SERVO_3: 'servo 3',
    XRP_SERVO_4: 'servo 4',
    XRP_SERVO_SET_ANGLE: 'zet %1 hoek naar %2 graden',
    XRP_SERVO_SET_ANGLE_TOOLTIP: 'Zet de servo op een hoek van 0 tot 180 graden. 90 is het midden. De laatste 5 graden aan elke kant blijven ongebruikt, zodat de servo nooit tegen zijn eigen aanslag wordt geduwd. Servo 3 en 4 zitten alleen op de XRP Controller.',
    XRP_SERVO_CENTRE: 'zet %1 in het midden',
    XRP_SERVO_CENTRE_TOOLTIP: 'Zet de servo in de middenstand, 90 graden.',
    XRP_SERVO_SWEEP: 'laat %1 bewegen',
    XRP_SERVO_SWEEP_RANGE: 'van %1 naar %2',
    XRP_SERVO_SWEEP_TIME: 'in %1 seconden',
    XRP_SERVO_SWEEP_TOOLTIP: 'Beweeg de servo vloeiend van de ene hoek naar de andere, in graden van 0 tot 180. Het programma wacht tot de beweging klaar is.',
    XRP_SERVO_SPEED: 'zet %1 doordraaisnelheid op %2 %%',
    XRP_SERVO_SPEED_TOOLTIP: 'Alleen voor een doordraaiservo: -100 is vol vooruit, 0 is stop, 100 is vol de andere kant op. Een gewone servo gaat gewoon naar een hoek.',
    XRP_SERVO_FREE: 'servo %1 vrijgeven',
    XRP_SERVO_FREE_TOOLTIP: 'Geef de servo vrij, zodat hij zijn stand niet meer vasthoudt en met de hand te draaien is.',

    // Sensors Blocks
    XRP_DISTANCE_SENSOR: 'afstandssensor afstand (cm)',
    XRP_DISTANCE_SENSOR_TOOLTIP: 'Hoe ver het dichtstbijzijnde voorwerp voor de robot is, in centimeter.',
    XRP_LINE_GET_LEFT: 'lijnsensor links reflectie',
    XRP_LINE_GET_LEFT_TOOLTIP: 'Vraag de reflectiewaarde van de linker reflectiesensor op (0 tot 1).',
    XRP_LINE_GET_RIGHT: 'lijnsensor rechts reflectie',
    XRP_LINE_GET_RIGHT_TOOLTIP: 'Vraag de reflectiewaarde van de rechter reflectiesensor op (0 tot 1).',
    XRP_IMU_GET_YAW: 'gyro yaw (graden)',
    XRP_IMU_GET_YAW_TOOLTIP: 'Hoe ver de robot gedraaid is sinds de yaw op nul werd gezet. Telt door voorbij 360, dus twee volle rondjes is 720.',
    XRP_IMU_GET_HEADING: 'gyro kompaskoers (0 tot 360)',
    XRP_IMU_GET_HEADING_TOOLTIP: 'Dezelfde draai, maar altijd tussen 0 en 360, net als een kompas.',
    XRP_IMU_RESET_YAW: 'zet gyro %1 op nul',
    XRP_IMU_ANGLE: 'gyro %1',
    XRP_IMU_ANGLE_TOOLTIP: 'Lees een van de gyro-hoeken in graden. Yaw telt door voorbij 360; kompaskoers loopt rond.',
    XRP_IMU_READ_YAW: 'yaw (graden)',
    XRP_IMU_READ_HEADING: 'kompaskoers (0 tot 360)',
    XRP_IMU_READ_PITCH: 'pitch (graden)',
    XRP_IMU_READ_ROLL: 'roll (graden)',
    XRP_SIDE_LEFT: 'links',
    XRP_SIDE_RIGHT: 'rechts',
    XRP_LINE_REFLECTANCE: 'lijnsensor %1 reflectie',
    XRP_LINE_REFLECTANCE_TOOLTIP: 'Hoe donker de vloer onder die sensor is, van 0 voor wit tot 1 voor zwart. Het is een kommagetal, geen percentage.',
    XRP_DRIVE_ENCODER: 'positie %1 wiel',
    XRP_DRIVE_ENCODER_TOOLTIP: 'Hoe ver dat wiel in centimeter heeft afgelegd sinds de encoders op nul zijn gezet.',
    XRP_IMU_RESET_YAW_TOOLTIP: 'Gebruik dit direct na het kalibreren. De gyro telt al vanaf het aanzetten, dus zonder dit blok is de hoek al een groot getal voordat je programma begint.',
    XRP_IMU_AXIS_YAW: 'yaw',
    XRP_IMU_AXIS_PITCH: 'pitch',
    XRP_IMU_AXIS_ROLL: 'roll',
    XRP_IMU_GET_PITCH: 'gyro pitch (graden)',
    XRP_IMU_GET_PITCH_TOOLTIP: 'Vraag de stampen pitch hoek van de robot op.',
    XRP_IMU_GET_ROLL: 'gyro roll (graden)',
    XRP_IMU_GET_ROLL_TOOLTIP: 'Vraag de rollen roll hoek van de robot op.',
    XRP_IMU_CALIBRATE: 'gyro kalibreren',
    XRP_IMU_CALIBRATE_TOOLTIP: 'Kalibreer de IMU. Houd de robot volledig stil tijdens het kalibreren.',
    XRP_BUTTON_IS_PRESSED: 'knop is ingedrukt',
    XRP_BUTTON_IS_PRESSED_TOOLTIP: 'Geeft waar (true) terug als de knop op de robot is ingedrukt.',
    XRP_WAIT_FOR_BUTTON: 'wacht op knopdruk',
    XRP_WAIT_FOR_BUTTON_TOOLTIP: 'Wacht totdat de knop op de robot is ingedrukt.',

    // Board Blocks
    XRP_LED_ON: 'schakel LED in',
    XRP_LED_ON_TOOLTIP: 'Zet de groene LED op de robot aan.',
    XRP_LED_OFF: 'schakel LED uit',
    XRP_LED_OFF_TOOLTIP: 'Zet de groene LED op de robot uit.',
    XRP_LED_BLINK: 'knipper LED %1 keer met %2 s pauze',
    XRP_LED_BLINK_TOOLTIP: 'Laat de groene LED op het bord een aantal keer knipperen. Het programma wacht zolang het knippert, dus lang knipperen houdt de rest op.',
    XRP_RGB_COLOUR: 'stel RGB LED kleur %1 helderheid %2 %%',
    XRP_RGB_COLOUR_TOOLTIP: 'Kies de kleur en helderheid van de RGB-LED op het bord van 0 tot 100%. 0% zet hem uit. Waarden buiten dit bereik worden begrensd. Niet op het XRP Beta-bord.',
    XRP_COLOUR_RED: 'rood', XRP_COLOUR_ORANGE: 'oranje', XRP_COLOUR_YELLOW: 'geel',
    XRP_COLOUR_GREEN: 'groen', XRP_COLOUR_CYAN: 'cyaan', XRP_COLOUR_BLUE: 'blauw',
    XRP_COLOUR_PURPLE: 'paars', XRP_COLOUR_MAGENTA: 'magenta', XRP_COLOUR_PINK: 'roze',
    XRP_COLOUR_WHITE: 'wit', XRP_COLOUR_OFF: 'uit',
    XRP_RGB_LED: 'stel RGB LED in rood %1 groen %2 blauw %3',
    XRP_RGB_LED_TOOLTIP: 'Meng een kleur op de RGB-LED uit rood, groen en blauw, elk 0 tot 255. Niet op het XRP Beta-bord.',
    XRP_WAIT_SECONDS: 'wacht %1 seconden',
    XRP_WAIT_SECONDS_TOOLTIP: 'Wacht een aantal seconden voordat het programma verdergaat.',
    XRP_PRINT: 'print %1',
    XRP_PRINT_TOOLTIP: 'Print een bericht naar de console.',

    MSG_STALE_CACHE: 'Er ontbreken blokken omdat de browser oude bestanden gebruikt. Herlaad met Ctrl+Shift+R.',
    TIP_THEME: 'Wissel tussen licht en donker',

    // Deploy confirmation
    UI_CANCEL: 'Annuleren',
    UI_DEPLOY_CONFIRM_TITLE: 'Dit programma op de robot opslaan?',
    UI_DEPLOY_CONFIRM_BODY: 'Het programma wordt op de XRP opgeslagen als main.py en start vanzelf telkens als de robot wordt aangezet.',
    UI_DEPLOY_CONFIRM_WARN: 'Een programma dat al op de robot staat, wordt vervangen.',
    UI_DEPLOY_CONFIRM_OK: 'Opslaan op XRP',
    MSG_DEPLOY_CANCELLED: 'Opslaan geannuleerd — er is niets op de robot gewijzigd.',

    // Loop Blocks
    XRP_FOREVER: 'herhaal oneindig',
    XRP_FOREVER_TOOLTIP: 'Herhaal de blokken hierbinnen steeds opnieuw, zonder te stoppen.',

    // Apparaatbibliotheken (devices/*.json)
    UI_LIBRARY: 'Bibliotheek',
    TIP_LIBRARY: 'Apparaatbibliotheken toevoegen of verwijderen',
    UI_LIBRARY_TITLE: 'Apparaatbibliotheken',
    UI_LIBRARY_INTRO: 'Elke bibliotheek voegt een categorie blokken voor een apparaat toe en zet het stuurprogramma de eerste keer op de robot.',
    UI_LIBRARY_INSTALLED: 'Toegevoegd aan deze IDE',
    UI_LIBRARY_AVAILABLE: 'Beschikbaar om toe te voegen',
    UI_LIBRARY_ADD: 'Toevoegen',
    UI_LIBRARY_REMOVE: 'Verwijderen',
    UI_LIBRARY_UPLOAD: 'Toevoegen uit een bestand',
    UI_LIBRARY_FETCH: 'Ophalen',
    UI_LIBRARY_URL_PLACEHOLDER: 'https://…/apparaat.json',
    UI_LIBRARY_ONE_BLOCK: '1 blok',
    UI_LIBRARY_N_BLOCKS: '%1 blokken',
    UI_LIBRARY_FROM_URL: 'via een URL',
    UI_LIBRARY_FROM_FILE: 'uit een bestand',
    MSG_LIBRARY_LOADING: 'Apparaatbibliotheken laden…',
    MSG_LIBRARY_EMPTY: 'Geen apparaatbibliotheken gevonden. Voeg er hieronder een toe uit een bestand of via een URL.',
    MSG_LIBRARY_ADDED: '%1 toegevoegd',
    MSG_LIBRARY_REMOVED: '%1 verwijderd',
    MSG_LIBRARY_IN_USE: 'Die blokken worden nog in je programma gebruikt. Verwijder ze eerst en daarna de bibliotheek.',
    MSG_LIBRARY_URL_INVALID: 'Voer een volledig adres in dat met https:// begint',
    MSG_LIBRARY_FETCH_ERROR: 'Die bibliotheek kon niet worden opgehaald. Controleer het adres en of de server andere sites toegang geeft.',
    MSG_LIBRARY_AUTO_ADDED: 'De apparaatbibliotheken die dit project nodig heeft zijn toegevoegd: %1'
  }
};
```

**`js/ui/toolbar.js`**

```js
/**
 * XRP Blocks — Toolbar UI Component
 */

export class Toolbar {
  constructor({ onConnect, onRun, onStop, onDeploy, onSave, onLoad, onLoadLesson, onOpenLibrary }) {
    this.onConnect = onConnect;
    this.onRun = onRun;
    this.onStop = onStop;
    this.onDeploy = onDeploy;
    this.onSave = onSave;
    this.onLoad = onLoad;
    this.onLoadLesson = onLoadLesson;
    this.onOpenLibrary = onOpenLibrary;

    this._connected = false;
    this._running = false;
    this._connectionMode = 'usb'; // 'usb' | 'bluetooth'

    this._bindElements();
    this._bindEvents();
  }

  _bindElements() {
    this.connectBtn   = document.getElementById('btn-connect');
    this.runBtn       = document.getElementById('btn-run');
    this.stopBtn      = document.getElementById('btn-stop');
    this.deployBtn    = document.getElementById('btn-deploy');
    this.saveBtn      = document.getElementById('btn-save');
    this.loadBtn      = document.getElementById('btn-load');
    this.loadLessonBtn = document.getElementById('btn-load-lesson');
    this.libraryBtn   = document.getElementById('btn-library');
    this.statusDot    = document.getElementById('connection-dot');
    this.statusText   = document.getElementById('connection-text');
  }

  _bindEvents() {
    this.connectBtn?.addEventListener('click', () => this.onConnect?.());
    this.runBtn?.addEventListener('click', () => this.onRun?.());
    this.stopBtn?.addEventListener('click', () => this.onStop?.());
    this.deployBtn?.addEventListener('click', () => this.onDeploy?.());
    this.saveBtn?.addEventListener('click', () => this.onSave?.());
    this.loadBtn?.addEventListener('click', () => this.onLoad?.());
    this.loadLessonBtn?.addEventListener('click', () => this.onLoadLesson?.());
    this.libraryBtn?.addEventListener('click', () => this.onOpenLibrary?.());
  }

  /**
   * Update the connected state.
   * @param {boolean} connected
   * @param {'usb'|'bluetooth'} [mode='usb'] - The transport mode used
   */
  setConnected(connected, mode = 'usb') {
    this._connected = connected;
    this._connectionMode = mode;

    if (connected) {
      const isBt = mode === 'bluetooth';

      // Lucide: unplug — the button now triggers a disconnect
      const disconnectIcon =
        `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <path d="m19 5 3-3"/>
           <path d="m2 22 3-3"/>
           <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/>
           <path d="M7.5 13.5 10 11"/>
           <path d="M10.5 16.5 13 14"/>
           <path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"/>
         </svg>`;

      this.connectBtn.innerHTML = `
        ${disconnectIcon}
        <span class="btn-label">${Blockly.Msg['UI_DISCONNECT'] || 'Disconnect'}</span>
      `;
      this.connectBtn.classList.add('connected');

      // Status dot: blue for BT, default accent for USB
      this.statusDot?.classList.add('connected');
      if (isBt) {
        this.statusDot?.classList.add('connected-bt');
      } else {
        this.statusDot?.classList.remove('connected-bt');
      }

      // Status text: show transport type
      const modeLabel = isBt
        ? (Blockly.Msg['UI_CONNECTED_BT'] || 'Connected (BT)')
        : (Blockly.Msg['UI_CONNECTED'] || 'Connected');
      if (this.statusText) this.statusText.textContent = modeLabel;

      this.runBtn.disabled = false;
      if (this.deployBtn) this.deployBtn.disabled = false;

    } else {
      this.connectBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22v-5" />
          <path d="M9 8V2" />
          <path d="M15 8V2" />
          <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
        </svg>
        <span class="btn-label">${Blockly.Msg['UI_CONNECT'] || 'Connect XRP'}</span>
      `;
      this.connectBtn.classList.remove('connected');
      this.statusDot?.classList.remove('connected', 'connected-bt');
      if (this.statusText) this.statusText.textContent = Blockly.Msg['UI_DISCONNECTED'] || 'Disconnected';
      this.runBtn.disabled = true;
      if (this.deployBtn) this.deployBtn.disabled = true;
    }

    this._updateRunStopVisibility();
  }

  setRunning(running) {
    this._running = running;
    this._updateRunStopVisibility();
  }

  _updateRunStopVisibility() {
    if (this._running) {
      this.runBtn.style.display = 'none';
      this.stopBtn.classList.add('visible');
    } else {
      this.runBtn.style.display = '';
      // A program may have auto-started before the IDE connected. Keep Stop
      // available without claiming that we know whether the board is running.
      this.stopBtn.classList.toggle('visible', this._connected);
    }
  }
}
```

And the two files that were patched in the previous revision and are now given
whole:

**`index.html`**

```html
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XRP Blocks</title>
  <meta name="description"
    content="A beginner-friendly block programming IDE for XRP robots. Drag and drop blocks to program your robot — no typing required!">

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml"
    href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%236C63FF'/><text x='16' y='22' text-anchor='middle' font-size='18' font-weight='bold' fill='white' font-family='sans-serif'>XB</text></svg>">

  <!-- Styles -->
  <link rel="stylesheet" href="css/index.css">

  <!-- Blockly (Local) -->
  <script src="js/vendor/blockly/blockly_compressed.js"></script>
  <script src="js/vendor/blockly/blocks_compressed.js"></script>
  <script src="js/vendor/blockly/python_compressed.js"></script>
  <!-- App (ES module) -->
  <script type="module" src="js/app.js"></script>
</head>

<body>
  <div id="app">

    <!-- ═══════════ Toolbar ═══════════ -->
    <header class="toolbar" role="banner">
      <!-- Logo -->
      <a class="toolbar__logo" href="#" aria-label="XRP Blocks Home">
        <span class="toolbar__logo-text">XRP Blocks</span>
      </a>

      <div class="toolbar__divider"></div>

      <!-- Connection status -->
      <div class="connection-status">
        <span class="connection-status__dot" id="connection-dot"></span>
        <span id="connection-text" data-i18n="UI_DISCONNECTED">Disconnected</span>
      </div>

      <!-- Connect button -->
      <button id="btn-connect" class="toolbar__btn toolbar__btn--connect" data-tooltip="Connect to your XRP robot"
        data-i18n-tooltip="TIP_CONNECT">
        <!-- Lucide: plug -->
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22v-5" />
          <path d="M9 8V2" />
          <path d="M15 8V2" />
          <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
        </svg>
        <span class="btn-label" data-i18n="UI_CONNECT">Connect XRP</span>
      </button>

      <!-- Run button -->
      <button id="btn-run" class="toolbar__btn toolbar__btn--run" disabled data-tooltip="Run your program on the XRP"
        data-i18n-tooltip="TIP_RUN">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6,3 20,12 6,21" />
        </svg>
        <span class="btn-label" data-i18n="UI_RUN">Run</span>
      </button>

      <!-- Stop button (hidden by default) -->
      <button id="btn-stop" class="toolbar__btn toolbar__btn--stop" data-tooltip="Stop the running program"
        data-i18n-tooltip="TIP_STOP">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
        <span class="btn-label" data-i18n="UI_STOP">Stop</span>
      </button>

      <!-- Deploy button -->
      <button id="btn-deploy" class="toolbar__btn toolbar__btn--deploy" disabled
        data-tooltip="Save to board — runs automatically on power-up"
        data-i18n-tooltip="TIP_DEPLOY">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span class="btn-label" data-i18n="UI_DEPLOY">Deploy</span>
      </button>

      <div class="toolbar__spacer"></div>

      <!-- Save -->
      <button id="btn-save" class="toolbar__btn toolbar__btn--secondary" data-tooltip="Save your project"
        data-i18n-tooltip="TIP_SAVE">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        <span class="btn-label" data-i18n="UI_SAVE">Save</span>
      </button>

      <!-- Load -->
      <button id="btn-load" class="toolbar__btn toolbar__btn--secondary" data-tooltip="Load a saved project"
        data-i18n-tooltip="TIP_LOAD">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span class="btn-label" data-i18n="UI_LOAD">Load</span>
      </button>

      <div class="toolbar__divider"></div>

      <!-- Load Lesson -->
      <button id="btn-load-lesson" class="toolbar__btn toolbar__btn--lesson"
        data-tooltip="Browse lessons"
        data-i18n-tooltip="TIP_LESSON">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
        <span class="btn-label" data-i18n="UI_LESSON">Lesson</span>
      </button>

      <!-- Device library -->
      <button id="btn-library" class="toolbar__btn toolbar__btn--secondary"
        data-tooltip="Add or remove device libraries"
        data-i18n-tooltip="TIP_LIBRARY">
        <!-- Lucide: cpu -->
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
          <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>
        </svg>
        <span class="btn-label" data-i18n="UI_LIBRARY">Library</span>
      </button>

      <div class="toolbar__divider"></div>

      <!-- Light / dark toggle -->
      <button id="btn-theme" class="toolbar__icon-btn" type="button"
        data-tooltip="Switch between light and dark" data-i18n-tooltip="TIP_THEME"
        aria-label="Switch between light and dark">
        <!-- Lucide: moon (shown in light mode) -->
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>
        </svg>
        <!-- Lucide: sun (shown in dark mode) -->
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>
        </svg>
      </button>

      <!-- Language selector -->
      <select id="select-lang" class="toolbar__select" aria-label="Select Language">
        <option value="en">EN</option>
        <option value="nl">NL</option>
      </select>
    </header>

    <!-- ═══════════ Main Workspace ═══════════ -->
    <main class="workspace-area">

      <!-- ── Lesson Panel ── -->
      <div id="lesson-panel" class="lesson-panel lesson-panel--hidden" aria-live="polite" aria-label="Lesson step">
        <!-- Header -->
        <div class="lesson-panel__header">
          <div class="lesson-panel__title-row">
            <svg class="lesson-panel__book-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <span class="lesson-panel__title">Lesson</span>
          </div>
          <div class="lesson-panel__header-right">
            <span class="lesson-panel__step-count">Step 1 of 1</span>
            <button id="btn-lesson-close" class="lesson-panel__close"
              aria-label="Exit lesson"
              data-tooltip="Exit lesson"
              data-i18n-tooltip="LESSON_TIP_EXIT">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="lesson-panel__progress">
          <div class="lesson-panel__progress-fill"></div>
        </div>

        <!-- Step text -->
        <div class="lesson-panel__step-text"></div>

        <!-- Navigation -->
        <div class="lesson-panel__nav">
          <button id="btn-lesson-prev" class="lesson-panel__btn lesson-panel__btn--prev" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span data-i18n="LESSON_BTN_PREV">Previous</span>
          </button>
          <button id="btn-lesson-next" class="lesson-panel__btn lesson-panel__btn--next">
            <span data-i18n="LESSON_BTN_NEXT">Next</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

      <div id="blocklyDiv"></div>
    </main>

    <!-- ═══════════ Bottom Panel ═══════════ -->
    <section class="bottom-panel collapsed" aria-label="Output panels">
      <!-- Resize handle -->
      <div class="bottom-panel__resize" role="separator" aria-orientation="horizontal"></div>

      <!-- Tabs -->
      <div class="bottom-panel__tabs">
        <button class="bottom-panel__tab" data-tab="python">
          <svg style="width:12px;height:12px;margin-right:4px;vertical-align:-1px" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          Python
        </button>
        <button class="bottom-panel__tab" data-tab="console">
          <svg style="width:12px;height:12px;margin-right:4px;vertical-align:-1px" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          Console
        </button>

        <!-- Python actions -->
        <div class="bottom-panel__actions" id="python-actions" style="display:flex">
          <button class="bottom-panel__action-btn" id="btn-pin-python" aria-pressed="false"
            aria-label="Pin bottom panel" data-tooltip="Pin bottom panel" data-i18n-tooltip="TIP_PIN_CONSOLE">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M16 3l5 5-4 1-4 4-1 4-5-5 4-1 4-4zM7 17l-4 4" />
            </svg>
          </button>
          <button class="bottom-panel__action-btn" id="btn-copy-code" data-tooltip="Copy Python code"
            data-i18n-tooltip="TIP_COPY">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button class="bottom-panel__action-btn" id="btn-collapse-panel" data-tooltip="Collapse panel"
            data-i18n-tooltip="TIP_COLLAPSE">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
          </button>
        </div>

        <!-- Console actions -->
        <div class="bottom-panel__actions" id="console-actions" style="display:none">
          <button class="bottom-panel__action-btn" id="btn-pin-console" aria-pressed="false"
            aria-label="Pin console" data-tooltip="Pin console" data-i18n-tooltip="TIP_PIN_CONSOLE">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M16 3l5 5-4 1-4 4-1 4-5-5 4-1 4-4zM7 17l-4 4" />
            </svg>
          </button>
          <button class="bottom-panel__action-btn is-active" id="btn-autoscroll" data-tooltip="Auto-scroll"
            data-i18n-tooltip="TIP_AUTOSCROLL" aria-pressed="true">
            <!-- Lucide: arrow-down-to-line -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M12 17V3" />
              <path d="m6 11 6 6 6-6" />
              <path d="M19 21H5" />
            </svg>
          </button>
          <button class="bottom-panel__action-btn" id="btn-copy-console" data-tooltip="Copy console output"
            data-i18n-tooltip="TIP_COPY_CONSOLE">
            <!-- Lucide: copy -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button class="bottom-panel__action-btn" id="btn-clear-console" data-tooltip="Clear console"
            data-i18n-tooltip="TIP_CLEAR">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <button class="bottom-panel__action-btn" id="btn-collapse-panel-2" data-tooltip="Collapse panel"
            data-i18n-tooltip="TIP_COLLAPSE">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Panel content -->
      <div class="bottom-panel__content">
        <div id="panel-python" class="panel-view">
          <pre class="python-preview" id="python-code"></pre>
        </div>
        <div id="panel-console" class="panel-view">
          <div class="console-output" id="console-output"></div>
        </div>
      </div>
    </section>

    <!-- ═══════════ Connection Picker Modal ═══════════ -->
    <div id="connection-modal" class="connection-modal" role="dialog" aria-modal="true" aria-labelledby="conn-modal-title">
      <div class="connection-modal__panel">
        <!-- Header -->
        <div class="connection-modal__header">
          <h2 class="connection-modal__title" id="conn-modal-title" data-i18n="UI_CONNECT_CHOOSE">Choose connection type</h2>
          <button id="conn-modal-close" class="connection-modal__close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Options -->
        <div class="connection-modal__options">

          <!-- USB / WebSerial -->
          <button id="conn-opt-usb" class="conn-opt conn-opt--usb" data-tooltip="Connect via USB cable">
            <div class="conn-opt__badge" id="conn-opt-usb-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span data-i18n="MSG_NOT_SUPPORTED_SHORT">Not supported</span>
            </div>
            <div class="conn-opt__icon">
              <!-- Lucide: usb -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="10" cy="7" r="1"/>
                <circle cx="4" cy="20" r="1"/>
                <path d="M4.7 19.3 19 5"/>
                <path d="m21 3-3 1 2 2Z"/>
                <path d="M9.26 7.68 5 12l2 5"/>
                <path d="m10 14 5 2 3.5-3.5"/>
                <path d="m18 12 1-1 1 1-1 1Z"/>
              </svg>
            </div>
            <span class="conn-opt__label" data-i18n="UI_CONNECT_USB">USB Cable</span>
            <span class="conn-opt__desc" data-i18n="UI_CONNECT_USB_DESC">WebSerial — Chrome / Edge</span>
          </button>

          <!-- Bluetooth -->
          <button id="conn-opt-bt" class="conn-opt conn-opt--bt" data-tooltip="Connect via Bluetooth">
            <div class="conn-opt__badge" id="conn-opt-bt-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span data-i18n="MSG_NOT_SUPPORTED_SHORT">Not supported</span>
            </div>
            <div class="conn-opt__icon conn-opt__icon--bt">
              <!-- Lucide: bluetooth -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m7 7 10 10-5 5V2l5 5L7 17"/>
              </svg>
            </div>
            <span class="conn-opt__label" data-i18n="UI_CONNECT_BT">Bluetooth</span>
            <span class="conn-opt__desc" data-i18n="UI_CONNECT_BT_DESC">Web Bluetooth — Chrome / Edge</span>
          </button>

        </div>
      </div>
    </div>

    <!-- ═══════════ Unsupported Browser Modal ═══════════ -->
    <div id="unsupported-modal" class="connection-modal" role="dialog" aria-modal="true" aria-labelledby="unsupported-modal-title">
      <div class="connection-modal__panel">
        <!-- Header -->
        <div class="connection-modal__header">
          <h2 class="connection-modal__title" id="unsupported-modal-title" data-i18n="UI_UNSUPPORTED_TITLE">Browser not supported</h2>
          <button id="unsupported-modal-close" class="connection-modal__close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="unsupported-modal__body">
          <div class="unsupported-modal__icon">
            <!-- Lucide: triangle-alert -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
              <path d="M12 9v4"/>
              <path d="M12 17h.01"/>
            </svg>
          </div>

          <p class="unsupported-modal__text" data-i18n="UI_UNSUPPORTED_BODY">
            This browser can't connect to the XRP robot. Connecting needs WebSerial or Web Bluetooth, which aren't available in Safari or Firefox.
          </p>

          <div class="unsupported-modal__hint">
            <!-- Lucide: monitor -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="14" x="2" y="3" rx="2"/>
              <line x1="8" x2="16" y1="21" y2="21"/>
              <line x1="12" x2="12" y1="17" y2="21"/>
            </svg>
            <span data-i18n="UI_UNSUPPORTED_HINT">Use Google Chrome or Microsoft Edge on a desktop computer.</span>
          </div>

          <button id="unsupported-modal-ok" class="unsupported-modal__btn" data-i18n="UI_UNSUPPORTED_DISMISS">Got it</button>
        </div>
      </div>
    </div>

    <!-- ═══════════ Confirmation Modal ═══════════ -->
    <div id="confirm-modal" class="connection-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div class="connection-modal__panel">
        <!-- Header -->
        <div class="connection-modal__header">
          <h2 class="connection-modal__title" id="confirm-modal-title" data-i18n="UI_DEPLOY_CONFIRM_TITLE">Save this program to the robot?</h2>
          <button id="confirm-modal-close" class="connection-modal__close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="unsupported-modal__body">
          <div class="unsupported-modal__icon">
            <!-- Lucide: upload -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>

          <p class="unsupported-modal__text" id="confirm-modal-body" data-i18n="UI_DEPLOY_CONFIRM_BODY">
            The program will be saved on the XRP as main.py and will run by itself every time the robot is switched on.
          </p>

          <div class="unsupported-modal__hint" id="confirm-modal-detail">
            <!-- Lucide: triangle-alert -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
              <path d="M12 9v4"/>
              <path d="M12 17h.01"/>
            </svg>
            <span data-i18n="UI_DEPLOY_CONFIRM_WARN">Any program already saved on the robot will be replaced.</span>
          </div>

          <div class="confirm-modal__actions">
            <button id="confirm-modal-cancel" class="unsupported-modal__btn unsupported-modal__btn--ghost" data-i18n="UI_CANCEL">Cancel</button>
            <button id="confirm-modal-ok" class="unsupported-modal__btn" data-i18n="UI_DEPLOY_CONFIRM_OK">Save to XRP</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ Lesson Picker Modal ═══════════ -->
    <div id="lesson-modal" class="connection-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-modal-title">
      <div class="connection-modal__panel lesson-modal__panel">
        <!-- Header -->
        <div class="connection-modal__header">
          <h2 class="connection-modal__title" id="lesson-modal-title" data-i18n="UI_LESSON_CHOOSE">Choose a lesson</h2>
          <button id="lesson-modal-close" class="connection-modal__close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Server lessons, populated by JS from lessons/index.json -->
        <div class="lesson-modal__list" id="lesson-modal-list">
          <div class="lesson-modal__status" data-i18n="MSG_LESSONS_LOADING">Loading lessons…</div>
        </div>

        <!-- Upload -->
        <div class="lesson-modal__upload-row">
          <button id="lesson-modal-upload" class="lesson-modal__upload-btn" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span data-i18n="UI_LESSON_UPLOAD">Upload lesson file</span>
          </button>
          <div id="lesson-modal-error" class="lesson-modal__error" hidden></div>
        </div>
      </div>
    </div>

    <!-- ═══════════ Device Library Modal ═══════════ -->
    <div id="library-modal" class="connection-modal" role="dialog" aria-modal="true" aria-labelledby="library-modal-title">
      <div class="connection-modal__panel lesson-modal__panel library-modal__panel">
        <!-- Header -->
        <div class="connection-modal__header">
          <h2 class="connection-modal__title" id="library-modal-title" data-i18n="UI_LIBRARY_TITLE">Device libraries</h2>
          <button id="library-modal-close" class="connection-modal__close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <p class="library-modal__intro" data-i18n="UI_LIBRARY_INTRO">
          Each library adds a category of blocks for one device, and installs its driver on the robot the first time you use it.
        </p>

        <!-- Installed and available libraries, populated by JS -->
        <div class="lesson-modal__list" id="library-modal-list">
          <div class="lesson-modal__status" data-i18n="MSG_LIBRARY_LOADING">Loading device libraries…</div>
        </div>

        <!-- Bring one in from elsewhere -->
        <div class="lesson-modal__upload-row">
          <button id="library-modal-upload" class="lesson-modal__upload-btn" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span data-i18n="UI_LIBRARY_UPLOAD">Add from a file</span>
          </button>

          <div class="library-modal__url-row">
            <input id="library-modal-url" class="library-modal__url" type="url" inputmode="url"
              placeholder="https://…/device.json" data-i18n-placeholder="UI_LIBRARY_URL_PLACEHOLDER"
              aria-label="Device library address">
            <button id="library-modal-fetch" class="library-modal__fetch" type="button" data-i18n="UI_LIBRARY_FETCH">Fetch</button>
          </div>

          <div id="library-modal-error" class="lesson-modal__error" hidden></div>
        </div>
      </div>
    </div>

    <!-- Toast notification -->
    <div id="toast" class="toast"></div>
  </div>
</body>

</html>
```

**`css/index.css`**

```css
/* --- Google Fonts --- */
@import url("https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap");

/* --- Design Tokens --- */
:root {
  /* Typography */
  --font-ui: "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", "Consolas", monospace;

  /* Core palette — warm, welcoming light theme */
  --color-bg: #f9f9f9;
  --color-bg-warm: #fefefe;
  --color-surface: #ffffff;
  --color-surface-raised: #ffffff;
  --color-surface-hover: #f0f2f8;
  --color-border: #e2e6ef;
  --color-border-light: #eef0f6;

  /* Text */
  --color-text: #383a42;
  --color-text-secondary: #5c6378;
  --color-text-muted: #9ca3b8;
  --color-text-on-accent: #ffffff;

  /* Pastel category colors */
  --color-drive: #7cb9f0;
  --color-drive-dark: #5a9fde;
  --color-motors: #b39ddb;
  --color-motors-dark: #9575cd;
  --color-servo: #ffb74d;
  --color-servo-dark: #ffa726;
  --color-sensors: #81c784;
  --color-sensors-dark: #66bb6a;
  --color-board: #ffd54f;
  --color-board-dark: #ffca28;

  --color-events: #ffca28;
  --color-events-dark: #ffb300;

  /* Standard Blockly category colors (pastel) */
  --color-logic: #82b1ff;
  --color-loops: #80cbc4;
  --color-math: #ef9a9a;
  --color-text-cat: #ce93d8;
  --color-variables: #ffab91;
  --color-functions: #a5d6a7;

  /* Accent / action colors */
  --color-primary: #d1182c;
  --color-primary-hover: #b21425;
  --color-success: #4caf50;
  --color-success-hover: #43a047;
  --color-danger: #ef5350;
  --color-danger-hover: #e53935;
  --color-warning: #ffa726;

  /* Connection status */
  --color-connected: #4caf50;
  --color-disconnected: #bdbdbd;
  --color-bt: #2196f3;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(45, 49, 66, 0.06);
  --shadow-md: 0 4px 12px rgba(45, 49, 66, 0.08);
  --shadow-lg: 0 8px 24px rgba(45, 49, 66, 0.1);
  --shadow-toolbar: 0 2px 8px rgba(45, 49, 66, 0.06);

  /* Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;

  /* Toolbar */
  --toolbar-height: 56px;

  /* Bottom panel */
  --panel-height: 220px;
  --panel-tab-height: 38px;

  /* Transitions */
  --transition-fast: 120ms ease;
  --transition-normal: 200ms ease;
  --transition-smooth: 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* --- Reset & Base --- */
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  width: 100%;
  overflow: hidden;
  font-family: var(--font-ui);
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

button {
  font-family: var(--font-ui);
  cursor: pointer;
  border: none;
  background: none;
  font-size: inherit;
  color: inherit;
}

/* --- App Layout --- */
#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

/* --- Toolbar --- */
.toolbar {
  display: flex;
  align-items: center;
  height: var(--toolbar-height);
  padding: 0 var(--space-lg);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-toolbar);
  z-index: 100;
  gap: var(--space-md);
  flex-shrink: 0;
}

.toolbar__logo {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-right: var(--space-lg);
  text-decoration: none;
  color: var(--color-text);
}

.toolbar__logo-text {
  font-weight: 800;
  font-size: 18px;
  letter-spacing: -0.3px;
}

.toolbar__divider {
  width: 1px;
  height: 28px;
  background: var(--color-border);
  margin: 0 var(--space-sm);
}

.toolbar__select {
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 13px;
  padding: 6px 12px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text);
  outline: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.toolbar__select:hover {
  border-color: var(--color-primary);
  background: var(--color-surface-hover);
}

/* Toolbar buttons */
.toolbar__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-full);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.2px;
  transition: all var(--transition-normal);
  white-space: nowrap;
  position: relative;
  overflow: hidden;
}

.toolbar__btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.toolbar__btn:active {
  transform: translateY(0);
  box-shadow: var(--shadow-sm);
}

.toolbar__btn--connect {
  background: var(--color-primary);
  color: var(--color-text-on-accent);
}

.toolbar__btn--connect:hover {
  background: var(--color-primary-hover);
}

.toolbar__btn--connect.connected {
  background: var(--color-success);
}

.toolbar__btn--connect.connected:hover {
  background: var(--color-success-hover);
}

.toolbar__btn--run {
  background: var(--color-success);
  color: var(--color-text-on-accent);
}

.toolbar__btn--run:hover {
  background: var(--color-success-hover);
}

.toolbar__btn--run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Deploy button — amber, signals a persistent "save to board" action */
.toolbar__btn--deploy {
  background: var(--color-warning);
  color: var(--color-text-on-accent);
}

.toolbar__btn--deploy:hover {
  background: #f57c00;
}

.toolbar__btn--deploy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.toolbar__btn--deploy.deploying {
  opacity: 0.75;
  cursor: wait;
  animation: deploy-pulse 1s ease-in-out infinite alternate;
}

@keyframes deploy-pulse {
  from {
    opacity: 0.6;
  }
  to {
    opacity: 1;
  }
}

.toolbar__btn--stop {
  background: var(--color-danger);
  color: var(--color-text-on-accent);
  display: none;
}

.toolbar__btn--stop:hover {
  background: var(--color-danger-hover);
}

.toolbar__btn--stop.visible {
  display: inline-flex;
}

.toolbar__btn--secondary {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.toolbar__btn--secondary:hover {
  background: var(--color-border);
}

.toolbar__btn svg,
.toolbar__btn .btn-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* Connection status indicator */
.connection-status {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.connection-status__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-disconnected);
  transition: background var(--transition-normal);
}

.connection-status__dot.connected {
  background: var(--color-connected);
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4);
  }

  50% {
    box-shadow: 0 0 0 6px rgba(76, 175, 80, 0);
  }
}

.toolbar__spacer {
  flex: 1;
}

/* --- Main Workspace Area --- */
.workspace-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

/* Blockly container */
#blocklyDiv {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
}

/* --- Blockly Overrides --- */
/* Category toolbox styling */
.blocklyToolbox {
  background: var(--color-surface) !important;
  border-right: 1px solid var(--color-border) !important;
  box-shadow: 2px 0 8px rgba(45, 49, 66, 0.05) !important;
  padding-top: var(--space-md) !important;
  padding-bottom: var(--space-md) !important;
  z-index: 10 !important;
}

.blocklyToolboxCategory {
  height: initial !important;
  padding: 4px 16px !important;
  margin: 0;
}

.blocklyToolboxCategoryLabel {
  font: 16px var(--font-ui);
}

.blocklyTreeRow {
  display: flex !important;
  align-items: center !important;
  flex-wrap: nowrap !important;
  padding: 6px 12px !important;
  margin: 6px var(--space-sm) !important;
  border-radius: 8px !important;
  /* hardcoded to avoid any variable issues */
  min-height: 40px !important;
  transition: transform var(--transition-fast) !important;
  border: 2px solid transparent !important;
  /* Prevent layout shift */
  cursor: pointer !important;
}

.blocklyTreeRow:hover {
  transform: translateX(2px) !important;
}

.blocklyTreeSelected {
  border-color: var(--color-text) !important;
  box-shadow: var(--shadow-sm) !important;
  transform: translateX(4px) !important;
}

.blocklyTreeSelected:hover {
  transform: translateX(4px) !important;
}

.blocklyTreeLabel {
  font-family: var(--font-ui) !important;
  font-size: 14px !important;
  font-weight: 800 !important;
  color: var(--color-text) !important;
  white-space: nowrap !important;
  margin-left: 6px !important;
}

.blocklyTreeIcon {
  display: none !important;
  /* Hide Blockly's default folder/arrow icons */
}

.blocklyTreeRowContentContainer {
  display: flex;
  align-items: center;
}

.cat-icon {
  position: relative !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 28px !important;
  height: 28px !important;
  border-radius: 50% !important;
  /* Perfect circle container */
  margin-right: 4px !important;
  flex-shrink: 0 !important;
}

.cat-icon::before {
  content: "";
  width: 16px;
  height: 16px;
  background-color: white !important;
  /* White icon symbol */
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

/* XRP Category Icon Masks */
.cat-icon-events::before {
  mask-image: url("../images/icons/events.svg");
  -webkit-mask-image: url("../images/icons/events.svg");
}

.cat-icon-drive::before {
  mask-image: url("../images/icons/drive.svg");
  -webkit-mask-image: url("../images/icons/drive.svg");
}

.cat-icon-motors::before {
  mask-image: url("../images/icons/motors.svg");
  -webkit-mask-image: url("../images/icons/motors.svg");
}

.cat-icon-servo::before {
  mask-image: url("../images/icons/servo.svg");
  -webkit-mask-image: url("../images/icons/servo.svg");
}

.cat-icon-sensors::before {
  mask-image: url("../images/icons/sensors.svg");
  -webkit-mask-image: url("../images/icons/sensors.svg");
}

.cat-icon-board::before {
  mask-image: url("../images/icons/board.svg");
  -webkit-mask-image: url("../images/icons/board.svg");
}

.cat-icon-expander::before {
  mask-image: url("../images/icons/expander.svg");
  -webkit-mask-image: url("../images/icons/expander.svg");
}

.cat-icon-neopixel::before {
  mask-image: url("../images/icons/neopixel.svg");
  -webkit-mask-image: url("../images/icons/neopixel.svg");
}

/* Standard Category Icon Masks */
.cat-icon-logic::before {
  mask-image: url("../images/icons/logic.svg");
  -webkit-mask-image: url("../images/icons/logic.svg");
}

.cat-icon-loops::before {
  mask-image: url("../images/icons/loops.svg");
  -webkit-mask-image: url("../images/icons/loops.svg");
}

.cat-icon-math::before {
  mask-image: url("../images/icons/math.svg");
  -webkit-mask-image: url("../images/icons/math.svg");
}

.cat-icon-text::before {
  mask-image: url("../images/icons/text.svg");
  -webkit-mask-image: url("../images/icons/text.svg");
}

.cat-icon-variables::before {
  mask-image: url("../images/icons/variables.svg");
  -webkit-mask-image: url("../images/icons/variables.svg");
}

.cat-icon-functions::before {
  mask-image: url("../images/icons/functions.svg");
  -webkit-mask-image: url("../images/icons/functions.svg");
}

.blocklyFlyoutBackground {
  fill: var(--color-surface) !important;
  fill-opacity: 0.98 !important;
  stroke: var(--color-border) !important;
  stroke-width: 1px !important;
  filter: drop-shadow(2px 0 8px rgba(45, 49, 66, 0.06));
}

.blocklyMainBackground {
  fill: var(--color-bg) !important;
}

.blocklyScrollbarHandle {
  fill: var(--color-border) !important;
  rx: 4;
  ry: 4;
}

.blocklyScrollbarBackground {
  fill: transparent !important;
}

/* Zoom controls */
.blocklyZoom > image {
  opacity: 0.5;
  transition: opacity var(--transition-fast);
}

.blocklyZoom > image:hover {
  opacity: 0.8;
}

/* Trash can */
.blocklyTrash {
  opacity: 0.4;
  transition: opacity var(--transition-fast);
}

.blocklyTrash:hover {
  opacity: 0.7;
}

/* --- Bottom Panel --- */
.bottom-panel {
  height: var(--panel-height);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: height var(--transition-smooth);
  z-index: 50;
}

.bottom-panel.collapsed {
  height: var(--panel-tab-height);
}

/* Panel resize handle */
.bottom-panel__resize {
  height: 4px;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.bottom-panel__resize::after {
  content: "";
  width: 40px;
  height: 3px;
  border-radius: var(--radius-full);
  background: var(--color-border);
  transition: background var(--transition-fast);
}

.bottom-panel__resize:hover::after {
  background: var(--color-text-muted);
}

/* Panel tabs */
.bottom-panel__tabs {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 var(--space-md);
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
  height: var(--panel-tab-height);
}

.bottom-panel__tab {
  padding: var(--space-sm) var(--space-lg);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  border-bottom: 2px solid transparent;
  transition: all var(--transition-fast);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
}

.bottom-panel__tab:hover {
  color: var(--color-text-secondary);
}

.bottom-panel__tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.bottom-panel__actions {
  margin-left: auto;
  display: flex;
  gap: var(--space-xs);
  align-items: center;
}

.bottom-panel__action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
}

.bottom-panel__action-btn svg {
  width: 14px;
  height: 14px;
  transition: transform var(--transition-normal);
}

.bottom-panel:not(.collapsed)
  .bottom-panel__action-btn[id^="btn-collapse-panel"]
  svg {
  transform: rotate(180deg);
}

.bottom-panel__action-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

/* Active/toggled state (e.g. console auto-scroll on) */
.bottom-panel__action-btn.is-active {
  background: rgba(108, 99, 255, 0.12);
  color: var(--color-primary);
}

.bottom-panel__action-btn.is-active:hover {
  background: rgba(108, 99, 255, 0.2);
  color: var(--color-primary);
}

.bottom-panel__action-btn svg {
  width: 14px;
  height: 14px;
}

/* Panel content */
.bottom-panel__content {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0;
}

.panel-view {
  display: none;
  height: 100%;
  overflow: auto;
}

.panel-view.active {
  display: block;
}

/* Python preview */
.python-preview {
  padding: var(--space-md) var(--space-lg);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-wrap: break-word;
  background: var(--color-bg);
  min-height: 100%;
}

/* Python syntax highlighting (bluloco) */
.python-preview .keyword {
  color: #0098dd;
  font-weight: 500;
}

.python-preview .string {
  color: #c5a332;
}

.python-preview .number {
  color: #ce33c0;
}

.python-preview .comment {
  color: #a0a1a7;
  font-style: italic;
}

.python-preview .function {
  color: #23974a;
}

.python-preview .builtin {
  color: #d52753;
}

/* Console */
.console-output {
  padding: var(--space-md) var(--space-lg);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
  background: #1e1e2e;
  color: #cdd6f4;
  min-height: 100%;
}

.console-output .console-sent {
  color: var(--color-drive);
}

.console-output .console-received {
  color: #cdd6f4;
}

.console-output .console-error {
  color: var(--color-danger);
}

.console-output .console-system {
  color: var(--color-text-muted);
  font-style: italic;
}

/* --- Empty State --- */
.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
  z-index: 0;
  opacity: 0.6;
}

.empty-state__icon {
  width: 80px;
  height: 80px;
  margin-bottom: var(--space-lg);
  opacity: 0.3;
}

.empty-state__text {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-muted);
  margin-bottom: var(--space-sm);
}

.empty-state__subtext {
  font-size: 13px;
  color: var(--color-text-muted);
}

/* --- Tooltips --- */
[data-tooltip] {
  position: relative;
}

[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) scale(0.95);
  padding: var(--space-xs) var(--space-sm);
  background: var(--color-text);
  color: var(--color-text-on-accent);
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: all var(--transition-fast);
  z-index: 1000;
}

[data-tooltip]:hover::after {
  opacity: 1;
  transform: translateX(-50%) scale(1);
}

/* Panel action buttons sit flush against the right edge of the screen, so a
   centered tooltip overflows the viewport. Anchor those to the button's right
   edge instead, so the tooltip grows leftward (into the page) and stays visible. */
.bottom-panel__actions [data-tooltip]::after {
  left: auto;
  right: 0;
  transform: translateX(0) scale(0.95);
}

.bottom-panel__actions [data-tooltip]:hover::after {
  transform: translateX(0) scale(1);
}

/* --- Responsive --- */
@media (max-width: 768px) {
  .toolbar {
    padding: 0 var(--space-md);
    gap: var(--space-sm);
  }

  .toolbar__btn {
    padding: var(--space-sm) var(--space-md);
    font-size: 12px;
  }

  .toolbar__btn .btn-label {
    display: none;
  }

  .toolbar__logo-text {
    font-size: 15px;
  }

  .bottom-panel {
    --panel-height: 180px;
  }
}

/* --- Utility --- */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* --- Notification toast --- */
.toast {
  position: fixed;
  bottom: var(--space-xl);
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  padding: var(--space-md) var(--space-xl);
  background: var(--color-text);
  color: var(--color-text-on-accent);
  border-radius: var(--radius-full);
  font-weight: 700;
  font-size: 13px;
  box-shadow: var(--shadow-lg);
  opacity: 0;
  transition: all var(--transition-smooth);
  z-index: 9999;
  pointer-events: none;
}

.toast.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.toast.toast--success {
  background: var(--color-success);
}

.toast.toast--error {
  background: var(--color-danger);
}

/* ============================================================
   Lesson / Tutorial Panel
   ============================================================ */

/* Toolbar: Lesson button */
.toolbar__btn--lesson {
  background: var(--color-primary);
  color: #fff;
  border: none;
}

.toolbar__btn--lesson:hover {
  background: var(--color-primary-hover);
}

/* Lesson panel container */
.lesson-panel {
  background: linear-gradient(135deg, #fdf1f1 0%, #fbe7e8 100%);
  border-bottom: 2px solid #f0b3ba;
  box-shadow: 0 4px 16px rgba(209, 24, 44, 0.1);
  flex-shrink: 0;
  overflow: hidden;
  /* Slide transition */
  max-height: 220px;
  opacity: 1;
  transition:
    max-height 300ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.lesson-panel--hidden {
  max-height: 0 !important;
  opacity: 0 !important;
  border-bottom-width: 0;
  pointer-events: none;
}

/* Header row: title + step count + close */
.lesson-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 4px 16px;
  gap: var(--space-md);
}

.lesson-panel__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.lesson-panel__book-icon {
  width: 18px;
  height: 18px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.lesson-panel__title {
  font-weight: 800;
  font-size: 14px;
  color: #7a1220;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lesson-panel__header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.lesson-panel__step-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  background: rgba(209, 24, 44, 0.1);
  padding: 3px 10px;
  border-radius: var(--radius-full);
  white-space: nowrap;
}

.lesson-panel__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: rgba(209, 24, 44, 0.1);
  color: var(--color-primary);
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.lesson-panel__close:hover {
  background: rgba(209, 24, 44, 0.22);
  transform: scale(1.1);
}

.lesson-panel__close svg {
  width: 14px;
  height: 14px;
}

/* Progress bar */
.lesson-panel__progress {
  height: 4px;
  background: rgba(209, 24, 44, 0.15);
  margin: 6px 16px 0 16px;
  border-radius: var(--radius-full);
  overflow: hidden;
}

.lesson-panel__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary), #ef7a83);
  border-radius: var(--radius-full);
  transition: width 350ms cubic-bezier(0.4, 0, 0.2, 1);
  width: 0%;
}

/* Step text area */
.lesson-panel__step-text {
  flex: 1;
  padding: 10px 18px 6px 18px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.55;
  color: #2d3142;
  overflow-y: auto;
  /* Fade-in animation on step change */
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.lesson-panel__step-text.lesson-step--animating {
  animation: stepFadeIn 220ms ease forwards;
}

@keyframes stepFadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Navigation buttons */
.lesson-panel__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px 10px 16px;
  gap: var(--space-md);
}

.lesson-panel__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 18px;
  border-radius: var(--radius-full);
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 13px;
  border: none;
  cursor: pointer;
  transition: all var(--transition-normal);
}

.lesson-panel__btn svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.lesson-panel__btn--prev {
  background: rgba(209, 24, 44, 0.1);
  color: var(--color-primary);
}

.lesson-panel__btn--prev:hover:not(:disabled) {
  background: rgba(209, 24, 44, 0.2);
  transform: translateX(-2px);
}

.lesson-panel__btn--prev:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}

.lesson-panel__btn--next {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  color: #fff;
  box-shadow: 0 2px 8px rgba(209, 24, 44, 0.3);
}

.lesson-panel__btn--next:hover {
  background: linear-gradient(135deg, var(--color-primary-hover), #8a0f1f);
  transform: translateX(2px);
  box-shadow: 0 4px 12px rgba(209, 24, 44, 0.4);
}

/* "Finish" variant for the last step */
.lesson-panel__btn--finish {
  background: linear-gradient(135deg, #4caf50, #43a047) !important;
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3) !important;
}

.lesson-panel__btn--finish:hover {
  background: linear-gradient(135deg, #43a047, #388e3c) !important;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4) !important;
  transform: translateX(2px);
}

/* ============================================================
   Lesson Exit Confirmation Dialog
   ============================================================ */

/* Backdrop overlay */
.lesson-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(45, 49, 66, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms ease;
}

.lesson-confirm-overlay--visible {
  opacity: 1;
  pointer-events: auto;
}

/* Dialog card */
.lesson-confirm-dialog {
  background: #fff;
  border-radius: 20px;
  box-shadow:
    0 24px 64px rgba(45, 49, 66, 0.2),
    0 4px 16px rgba(45, 49, 66, 0.1);
  padding: 32px 32px 24px;
  max-width: 380px;
  width: calc(100vw - 48px);
  text-align: center;
  transform: translateY(12px) scale(0.97);
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.lesson-confirm-overlay--visible .lesson-confirm-dialog {
  transform: translateY(0) scale(1);
}

/* Warning icon */
.lesson-confirm-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fff3cd, #ffe082);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(255, 160, 0, 0.25);
}

.lesson-confirm-icon svg {
  width: 26px;
  height: 26px;
  color: #e65100;
  stroke: #e65100;
}

/* Title */
.lesson-confirm-title {
  font-family: var(--font-ui);
  font-weight: 800;
  font-size: 18px;
  color: #2d3142;
  margin: 0 0 10px;
}

/* Body text */
.lesson-confirm-body {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 500;
  color: #5c6378;
  line-height: 1.55;
  margin: 0 0 24px;
}

/* Action buttons row */
.lesson-confirm-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.lesson-confirm-btn {
  flex: 1;
  padding: 10px 16px;
  border-radius: var(--radius-full);
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 14px;
  border: none;
  cursor: pointer;
  transition: all var(--transition-normal);
}

/* "Keep going" — secondary */
.lesson-confirm-btn--no {
  background: #f0f2f8;
  color: #2d3142;
}

.lesson-confirm-btn--no:hover {
  background: #e2e6ef;
}

.lesson-confirm-btn--no:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* "Exit lesson" — danger */
.lesson-confirm-btn--yes {
  background: linear-gradient(135deg, #ef5350, #e53935);
  color: #fff;
  box-shadow: 0 2px 8px rgba(239, 83, 80, 0.3);
}

.lesson-confirm-btn--yes:hover {
  background: linear-gradient(135deg, #e53935, #c62828);
  box-shadow: 0 4px 12px rgba(239, 83, 80, 0.4);
  transform: translateY(-1px);
}

.lesson-confirm-btn--yes:focus-visible {
  outline: 2px solid #ef5350;
  outline-offset: 2px;
}
/* -------------------------------------------------------
   Connection Picker Modal
   ------------------------------------------------------- */

/* Overlay */
.connection-modal {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(45, 49, 66, 0.45);
  backdrop-filter: blur(4px);
  align-items: center;
  justify-content: center;
  padding: var(--space-lg);
}

.connection-modal.visible {
  display: flex;
  animation: modal-fade-in 0.2s ease;
}

@keyframes modal-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Panel */
.connection-modal__panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-2xl);
  width: min(480px, 96vw);
  box-shadow: var(--shadow-lg);
  animation: panel-slide-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes panel-slide-in {
  from {
    transform: translateY(24px) scale(0.97);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

/* Header */
.connection-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.75rem;
}

.connection-modal__title {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--color-text);
  letter-spacing: -0.01em;
  margin: 0;
}

.connection-modal__close {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--transition-fast);
  padding: 0;
}

.connection-modal__close svg {
  width: 14px;
  height: 14px;
}

.connection-modal__close:hover {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: var(--color-text-on-accent);
}

/* Options grid */
.connection-modal__options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

/* Option card */
.conn-opt {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  padding: 1.75rem 1rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  cursor: pointer;
  transition:
    background var(--transition-normal),
    border-color var(--transition-normal),
    transform var(--transition-normal),
    box-shadow var(--transition-normal);
  text-align: center;
  overflow: hidden;
}

.conn-opt:hover:not(:disabled) {
  background: var(--color-surface-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.conn-opt:active:not(:disabled) {
  transform: translateY(0);
}

/* USB option accent */
.conn-opt-usb:hover:not(:disabled) {
  border-color: var(--color-primary);
  box-shadow: 0 8px 24px rgba(108, 99, 255, 0.18);
}

/* Bluetooth option accent */
.conn-opt-bt:hover:not(:disabled) {
  border-color: var(--color-bt, #2196f3);
  box-shadow: 0 8px 24px rgba(33, 150, 243, 0.18);
}

/* Icons */
.conn-opt__icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: rgba(108, 99, 255, 0.12);
  border: 1.5px solid rgba(108, 99, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--transition-normal),
    border-color var(--transition-normal);
  color: rgba(108, 99, 255, 1);
}

.conn-opt__icon svg {
  width: 32px;
  height: 32px;
}

.conn-opt__icon--bt {
  background: rgba(33, 150, 243, 0.12);
  border-color: rgba(33, 150, 243, 0.25);
  color: var(--color-bt, #2196f3);
}

.conn-opt-usb:hover:not(:disabled) .conn-opt__icon {
  background: rgba(108, 99, 255, 0.2);
  border-color: rgba(108, 99, 255, 0.5);
}

.conn-opt-bt:hover:not(:disabled) .conn-opt__icon--bt {
  background: rgba(33, 150, 243, 0.2);
  border-color: rgba(33, 150, 243, 0.5);
}

/* Label and description */
.conn-opt__label {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.2;
}

.conn-opt__desc {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
  line-height: 1.3;
}

/* Not-supported state */
.conn-opt--unsupported {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

/* "Not supported" badge */
.conn-opt__badge {
  display: none; /* shown via JS when unsupported */
  position: absolute;
  top: 8px;
  right: 8px;
  align-items: center;
  gap: 3px;
  background: rgba(239, 83, 80, 0.12);
  border: 1px solid rgba(239, 83, 80, 0.3);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--color-danger);
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.conn-opt__badge svg {
  width: 10px;
  height: 10px;
}

/* Status dot � Bluetooth variant */
.connection-status__dot.connected-bt {
  background: #2196f3;
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.25);
}

/* ── Unsupported-browser modal ──────────────────────────────────────────── */
.unsupported-modal__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-lg);
}

.unsupported-modal__icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 167, 38, 0.12);
  border: 1.5px solid rgba(255, 167, 38, 0.3);
  color: var(--color-warning);
}

.unsupported-modal__icon svg {
  width: 32px;
  height: 32px;
}

.unsupported-modal__text {
  margin: 0;
  max-width: 38ch;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.unsupported-modal__hint {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text);
}

.unsupported-modal__hint svg {
  width: 18px;
  height: 18px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.unsupported-modal__btn {
  margin-top: var(--space-xs);
  padding: var(--space-sm) var(--space-xl);
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-text-on-accent);
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.2px;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.unsupported-modal__btn:hover {
  background: var(--color-primary-hover);
}

/* Confirmation dialog: two buttons side by side */
.confirm-modal__actions {
  margin-top: var(--space-xs);
  display: flex;
  gap: var(--space-md);
  justify-content: center;
  flex-wrap: wrap;
}

.confirm-modal__actions .unsupported-modal__btn {
  margin-top: 0;
}

.unsupported-modal__btn--ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1.5px solid var(--color-border, rgba(0, 0, 0, 0.18));
}

.unsupported-modal__btn--ghost:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--color-text-primary, inherit);
}


/* ── Dark mode ─────────────────────────────────────────────────────────
   Light mode is untouched. Dark mode swaps the tokens below, and the
   Blockly block colours are swapped separately in js/blockly/theme.js.
   Applied by app.js as <html data-theme="dark">.                        */
html[data-theme="dark"] {
  --color-bg: #191b22;
  --color-bg-warm: #1e2028;
  --color-surface: #242733;
  --color-surface-raised: #2a2e3b;
  --color-surface-hover: #323747;
  --color-border: #3a4054;
  --color-border-light: #2f3442;

  --color-text: #e6e9f2;
  --color-text-secondary: #b3b9cc;
  --color-text-muted: #7d8499;
  --color-text-on-accent: #ffffff;

  --color-primary: #e34a5c;
  --color-primary-hover: #f06274;
  --color-success: #4caf50;
  --color-success-hover: #5cbb60;
  --color-danger: #ef5350;
  --color-danger-hover: #f36a67;
  --color-warning: #ffb74d;

  --color-connected: #66bb6a;
  --color-disconnected: #6b7280;
  --color-bt: #64b5f6;

  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.45);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.55);
}

/* The workspace grid is drawn with a stroke attribute, which CSS outranks. */
html[data-theme="dark"] .injectionDiv pattern line {
  stroke: #2f3442;
}

/* Keep code and console panels legible on the dark surfaces. */
html[data-theme="dark"] .blocklyHtmlInput {
  color: #1c1f28;
}

html[data-theme="dark"] .unsupported-modal__btn--ghost:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* Theme toggle button: show the icon for the mode you would switch to. */
.toolbar__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-full, 999px);
  border: 1.5px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.toolbar__icon-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.toolbar__icon-btn svg {
  width: 18px;
  height: 18px;
}

.toolbar__icon-btn .icon-moon { display: block; }
.toolbar__icon-btn .icon-sun { display: none; }
html[data-theme="dark"] .toolbar__icon-btn .icon-moon { display: none; }
html[data-theme="dark"] .toolbar__icon-btn .icon-sun { display: block; }

/* Body scroll lock when modal open */
body.modal-open {
  overflow: hidden;
}

/* ── Lesson Picker Modal ──────────────────────────────────────────────── */
.lesson-modal__panel {
  width: min(420px, 94vw);
  display: flex;
  flex-direction: column;
}

.lesson-modal__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 3px;
  margin: -3px -3px calc(1.25rem - 3px);
}

.lesson-modal__status {
  padding: 1.5rem 0.5rem;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
}

.lesson-modal__status--error {
  color: var(--color-danger);
}

.lesson-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--color-text);
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast);
}

.lesson-item:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.lesson-item__icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: rgba(209, 24, 44, 0.1);
  border: 1.5px solid rgba(209, 24, 44, 0.25);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.lesson-item__icon svg {
  width: 18px;
  height: 18px;
}

.lesson-item__label {
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lesson-modal__upload-row {
  border-top: 1px solid var(--color-border);
  padding-top: 1rem;
}

.lesson-modal__upload-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: var(--radius-lg);
  border: 1.5px dashed var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.lesson-modal__upload-btn:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-primary);
  color: var(--color-text);
}

.lesson-modal__upload-btn svg {
  width: 16px;
  height: 16px;
}

.lesson-modal__error {
  margin-top: 0.6rem;
  font-size: 0.78rem;
  color: var(--color-danger);
  text-align: center;
}

/* ── Device Library Modal ─────────────────────────────────────────────── */
.library-modal__panel {
  width: min(520px, 94vw);
}

.library-modal__intro {
  margin: 0 0 1rem;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.library-modal__heading {
  margin: 0.35rem 0 0.1rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.library-modal__heading:not(:first-child) {
  margin-top: 0.9rem;
}

.library-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  text-align: left;
  color: var(--color-text);
}

.library-item__icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--color-border);
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.library-item__icon svg {
  width: 18px;
  height: 18px;
}

.library-item__body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  flex: 1;
}

.library-item__title {
  font-size: 0.9rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.library-item__subtitle {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.library-item__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
  padding: 0.4rem 0.7rem;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.library-item__btn svg {
  width: 14px;
  height: 14px;
}

.library-item__btn--add:hover {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.library-item__btn--remove:hover {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: #fff;
}

.library-modal__url-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.library-modal__url {
  flex: 1;
  min-width: 0;
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.82rem;
}

.library-modal__url:focus {
  outline: none;
  border-color: var(--color-primary);
}

.library-modal__fetch {
  flex-shrink: 0;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter var(--transition-fast);
}

.library-modal__fetch:hover {
  filter: brightness(1.08);
}
```

### 3.8 The device library system (change 14)


A device library is **one JSON file** describing a device: its blocks, the
Python each block generates, the category colour and icon, and the MicroPython
driver to install on the robot. Nothing in the file is executed. It is data all
the way down, which is what makes it safe to email one or fetch one from a web
address.

Three pieces of machinery:

- `manifest-compiler.js` turns a manifest into Blockly block definitions, Python
  generators and a toolbox category, and validates it. A manifest that does not
  pass is rejected whole with a list of faults, rather than half-loading and
  breaking the palette.
- `library-manager.js` fetches, registers, persists to `localStorage`, supplies
  theme colours and the driver install list, and refuses to remove a library
  whose blocks are still on the canvas.
- `library-modal.js` is the dialog behind the Library button.

Two things worth knowing before editing any of this. The **"Available to add"
list is exactly what `devices/index.json` contains**: a manifest sitting in
`devices/` but absent from the catalogue will not appear, which is a easy
half-hour to lose. And a manifest may give only a light colour, in which case the
manager darkens it in steps until white text on it passes WCAG AA, so a library
written by a teacher cannot produce an unreadable category.

**`js/devices/manifest-compiler.js`**

```js
/**
 * XRP Blocks — Device manifest compiler
 *
 * Turns a device library manifest (plain JSON, see devices/README.md) into
 * Blockly block definitions, Python generators and a toolbox category.
 *
 * Nothing in a manifest is executed. Every field is data: strings, numbers,
 * lists. That is the whole point — a manifest can be emailed, dropped into a
 * folder or fetched from a URL without running someone else's JavaScript.
 *
 * Manifest version supported: 1
 */

export const MANIFEST_VERSION = 1;

/** Blockly value-connection orders a manifest may name. */
const ORDERS = [
  'ATOMIC', 'COLLECTION', 'STRING_CONVERSION', 'MEMBER', 'FUNCTION_CALL',
  'EXPONENTIATION', 'UNARY_SIGN', 'BITWISE_NOT', 'MULTIPLICATIVE', 'ADDITIVE',
  'BITWISE_SHIFT', 'BITWISE_AND', 'BITWISE_XOR', 'BITWISE_OR', 'RELATIONAL',
  'LOGICAL_NOT', 'LOGICAL_AND', 'LOGICAL_OR', 'CONDITIONAL', 'LAMBDA', 'NONE',
];

/** Argument kinds a manifest may use, mapped to Blockly arg types. */
const FIELD_ARGS = {
  dropdown: 'field_dropdown',
  number_field: 'field_number',
  text_field: 'field_input',
  checkbox: 'field_checkbox',
  angle: 'field_angle',
  colour_field: 'field_colour',
};

const INPUT_ARGS = {
  number: 'Number',
  text: 'String',
  boolean: 'Boolean',
  value: null,   // `check` comes from the arg itself, or no check at all
};

// ── Language helpers ─────────────────────────────────────────────────────

/**
 * Read a translatable field. A manifest may give either a plain string or an
 * object keyed by language code. English is the fallback, then the first key
 * present, so a manifest written in one language still works everywhere.
 *
 * @param {string|Object|undefined} field
 * @param {string} lang - two-letter language code, e.g. 'en'
 * @param {string} [fallback='']
 * @returns {string}
 */
export function text(field, lang, fallback = '') {
  if (field === undefined || field === null) return fallback;
  if (typeof field === 'string') return field;
  if (typeof field !== 'object') return String(field);
  if (field[lang]) return field[lang];
  if (field.en) return field.en;
  const first = Object.values(field).find((v) => typeof v === 'string');
  return first !== undefined ? first : fallback;
}

// ── Validation ───────────────────────────────────────────────────────────

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const BLOCK_TYPE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Check a manifest hard enough that a bad file is rejected at the door rather
 * than half-registering and leaving the toolbox in pieces.
 *
 * @param {*} manifest
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateManifest(manifest) {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: ['The file is not a JSON object.'] };
  }

  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    fail(`manifestVersion must be ${MANIFEST_VERSION}, found ${JSON.stringify(manifest.manifestVersion)}.`);
  }
  if (typeof manifest.id !== 'string' || !ID_PATTERN.test(manifest.id)) {
    fail('id must be lowercase letters, digits, hyphen or underscore, e.g. "pcf8575".');
  }
  if (!manifest.name) fail('name is missing.');

  const cat = manifest.category;
  if (!cat || typeof cat !== 'object') {
    fail('category is missing.');
  } else {
    if (cat.colour && !/^#[0-9a-fA-F]{6}$/.test(cat.colour)) {
      fail('category.colour must be a six-digit hex colour like "#7E9BD8".');
    }
    if (cat.colourDark && !/^#[0-9a-fA-F]{6}$/.test(cat.colourDark)) {
      fail('category.colourDark must be a six-digit hex colour like "#3D71DF".');
    }
  }

  if (!Array.isArray(manifest.blocks) || manifest.blocks.length === 0) {
    fail('blocks must be a non-empty array.');
    return { ok: errors.length === 0, errors };
  }

  const lists = manifest.lists || {};
  const seen = new Set();

  manifest.blocks.forEach((block, i) => {
    const where = `blocks[${i}]`;
    if (!block || typeof block !== 'object') {
      fail(`${where} is not an object.`);
      return;
    }
    if (typeof block.type !== 'string' || !BLOCK_TYPE_PATTERN.test(block.type)) {
      fail(`${where}.type must be a plain identifier, e.g. "xrp_pcf_led".`);
      return;
    }
    if (seen.has(block.type)) fail(`${where}.type "${block.type}" appears twice.`);
    seen.add(block.type);

    if (!block.text) fail(`${where} ("${block.type}") has no text.`);

    const shape = block.shape || 'statement';
    if (shape !== 'statement' && shape !== 'value') {
      fail(`${where}.shape must be "statement" or "value".`);
    }
    if (shape === 'value' && block.order && !ORDERS.includes(block.order)) {
      fail(`${where}.order "${block.order}" is not a Blockly order name.`);
    }

    const args = block.args || [];
    if (!Array.isArray(args)) {
      fail(`${where}.args must be an array.`);
      return;
    }
    args.forEach((arg, j) => {
      const argWhere = `${where}.args[${j}]`;
      if (!arg || typeof arg !== 'object') {
        fail(`${argWhere} is not an object.`);
        return;
      }
      if (typeof arg.name !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(arg.name)) {
        fail(`${argWhere}.name must be UPPER_CASE, e.g. "PIN".`);
      }
      const kind = arg.type;
      if (!(kind in FIELD_ARGS) && !(kind in INPUT_ARGS)) {
        fail(`${argWhere}.type "${kind}" is not one of: ${[...Object.keys(FIELD_ARGS), ...Object.keys(INPUT_ARGS)].join(', ')}.`);
        return;
      }
      if (kind === 'dropdown') {
        const options = resolveOptions(arg.options, lists);
        if (!Array.isArray(options) || options.length === 0) {
          fail(`${argWhere}.options is empty, or names a list that is not in "lists".`);
        }
      }
    });

    // Every %n in the text must have an argument behind it.
    const label = text(block.text, 'en', '');
    const highest = highestPlaceholder(label);
    if (highest > args.length) {
      fail(`${where} ("${block.type}") uses %${highest} but only has ${args.length} argument(s).`);
    }

    if (block.code !== undefined && typeof block.code !== 'string') {
      fail(`${where}.code must be a string.`);
    }
    const unknown = unknownPlaceholders(block.code || '', args.map((a) => a && a.name));
    if (unknown.length) {
      fail(`${where}.code refers to {${unknown.join('}, {')}}, which is not an argument of this block.`);
    }
  });

  const inst = manifest.instance;
  if (inst) {
    if (typeof inst.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(inst.name)) {
      fail('instance.name must be a Python identifier, e.g. "expander".');
    }
    if (typeof inst.import !== 'string') fail('instance.import must be a string.');
    if (typeof inst.create !== 'string') fail('instance.create must be a string, e.g. "PCF8575()".');
  }

  const driver = manifest.driver;
  if (driver) {
    if (typeof driver.filename !== 'string' || !/^[\w.-]+\.py$/.test(driver.filename)) {
      fail('driver.filename must be a plain .py file name, e.g. "PCF8575.py".');
    }
    if (typeof driver.source !== 'string' || !driver.source.trim()) {
      fail('driver.source must contain the MicroPython source.');
    }
    if (driver.marker !== undefined && typeof driver.marker !== 'string') {
      fail('driver.marker must be a string.');
    }
  }

  if (manifest.toolbox !== undefined && !Array.isArray(manifest.toolbox)) {
    fail('toolbox must be an array.');
  }
  if (Array.isArray(manifest.toolbox)) {
    manifest.toolbox.forEach((entry, i) => {
      if (entry && typeof entry === 'object' && entry.block && !seen.has(entry.block)) {
        fail(`toolbox[${i}] names block "${entry.block}", which this manifest does not define.`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/** Highest %n used in a block's label text. */
function highestPlaceholder(label) {
  let highest = 0;
  const re = /%(\d+)/g;
  let m;
  while ((m = re.exec(label)) !== null) {
    highest = Math.max(highest, Number(m[1]));
  }
  return highest;
}

/** {NAMES} used in a code template that are not argument names. */
function unknownPlaceholders(template, argNames) {
  const known = new Set(argNames.filter(Boolean));
  const found = new Set();
  // Skip doubled braces, which mean a literal brace.
  const re = /\{\{|\}\}|\{([A-Z][A-Z0-9_]*)\}/g;
  let m;
  while ((m = re.exec(template)) !== null) {
    if (m[1] && !known.has(m[1])) found.add(m[1]);
  }
  return [...found];
}

// ── Options ──────────────────────────────────────────────────────────────

/**
 * Dropdown options are either an inline array, or "$listName" naming an entry
 * in the manifest's shared `lists` object so long pin lists are written once.
 */
function resolveOptions(options, lists) {
  if (typeof options === 'string' && options.startsWith('$')) {
    return lists[options.slice(1)];
  }
  return options;
}

/**
 * Normalise one option into {label, value, code}.
 * Accepts {label, value, code}, or the Blockly pair form ["Label", "VALUE"].
 */
function normaliseOption(option, lang) {
  if (Array.isArray(option)) {
    return { label: String(option[0]), value: String(option[1]), code: String(option[1]) };
  }
  const value = String(option.value);
  return {
    label: text(option.label, lang, value),
    value,
    code: option.code !== undefined ? String(option.code) : value,
  };
}

// ── Block definitions ────────────────────────────────────────────────────

/**
 * Register every block in a manifest with Blockly.
 *
 * Labels are resolved to the current language here rather than going through
 * Blockly.Msg: a manifest carries its own strings, and switching language
 * reloads the page anyway, so there is nothing to keep in step.
 *
 * @param {!Object} manifest - already validated
 * @param {string} lang
 * @returns {string[]} the block types that were registered
 */
export function registerManifestBlocks(manifest, lang) {
  const lists = manifest.lists || {};
  const styleName = blockStyleName(manifest.id);
  const registered = [];

  for (const block of manifest.blocks) {
    const shape = block.shape || 'statement';
    const args0 = (block.args || []).map((arg) => buildArg(arg, lists, lang));

    const json = {
      type: block.type,
      message0: text(block.text, lang, block.type),
      args0,
      style: styleName,
      tooltip: text(block.tooltip, lang, ''),
      helpUrl: block.helpUrl || '',
    };

    if (block.inline !== undefined) json.inputsInline = Boolean(block.inline);

    if (shape === 'value') {
      json.output = block.returns || null;
    } else {
      json.previousStatement = null;
      json.nextStatement = null;
    }

    Blockly.Blocks[block.type] = {
      init() {
        this.jsonInit(json);
      },
    };
    registered.push(block.type);
  }

  return registered;
}

/** One manifest argument → one Blockly args0 entry. */
function buildArg(arg, lists, lang) {
  if (arg.type in FIELD_ARGS) {
    const out = { type: FIELD_ARGS[arg.type], name: arg.name };
    if (arg.type === 'dropdown') {
      const options = resolveOptions(arg.options, lists) || [];
      out.options = options.map((o) => {
        const n = normaliseOption(o, lang);
        return [n.label, n.value];
      });
    } else {
      if (arg.default !== undefined) out.value = arg.default;
      if (arg.min !== undefined) out.min = arg.min;
      if (arg.max !== undefined) out.max = arg.max;
      if (arg.precision !== undefined) out.precision = arg.precision;
      if (arg.type === 'text_field' && arg.default !== undefined) out.text = String(arg.default);
    }
    return out;
  }

  // Value input
  const out = { type: 'input_value', name: arg.name };
  const check = arg.check !== undefined ? arg.check : INPUT_ARGS[arg.type];
  if (check) out.check = check;
  return out;
}

// ── Generators ───────────────────────────────────────────────────────────

/**
 * Register the Python generator for every block in a manifest.
 *
 * @param {!Object} manifest - already validated
 * @param {!Object} pythonModule - the Blockly Python module (window.python)
 * @param {string} lang
 */
export function registerManifestGenerators(manifest, pythonModule, lang) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;
  const lists = manifest.lists || {};

  for (const block of manifest.blocks) {
    const shape = block.shape || 'statement';
    const template = block.code || '';
    const args = block.args || [];
    const order = Order[block.order] !== undefined
      ? Order[block.order]
      : (shape === 'value' ? Order.FUNCTION_CALL : Order.NONE);

    python.forBlock[block.type] = function (blk, generator) {
      const values = readArgs(blk, generator, args, lists, Order);

      if (manifest.instance) {
        const configured = block.configuresInstance
          ? fill(manifest.instance.createConfigured || manifest.instance.create, values)
          : null;
        ensureInstance(generator, manifest, configured);
      }

      const code = fill(template, values);
      return shape === 'value' ? [code, order] : code;
    };
  }
}

/**
 * Collect the substitution values for one block: a field's dropdown code (or
 * raw value), or the generated code plugged into a value socket, falling back
 * to the argument's declared default when the socket is empty.
 */
function readArgs(blk, generator, args, lists, Order) {
  const values = {};

  for (const arg of args) {
    if (arg.type === 'dropdown') {
      const raw = blk.getFieldValue(arg.name);
      const options = resolveOptions(arg.options, lists) || [];
      const match = options
        .map((o) => normaliseOption(o, 'en'))
        .find((o) => o.value === raw);
      values[arg.name] = match ? match.code : raw;
    } else if (arg.type in FIELD_ARGS) {
      values[arg.name] = String(blk.getFieldValue(arg.name));
    } else {
      const code = generator.valueToCode(blk, arg.name, Order.NONE);
      values[arg.name] = (code === '' || code === null || code === undefined)
        ? String(arg.default !== undefined ? arg.default : '0')
        : code;
    }
  }

  return values;
}

/**
 * Substitute {NAME} placeholders. `{{` and `}}` stand for literal braces, so a
 * driver call that needs a Python dict or an f-string can still be written.
 */
function fill(template, values) {
  if (!template) return '';
  return String(template).replace(
    /\{\{|\}\}|\{([A-Z][A-Z0-9_]*)\}/g,
    (match, name) => {
      if (match === '{{') return '{';
      if (match === '}}') return '}';
      return values[name] !== undefined ? values[name] : match;
    }
  );
}

/**
 * Add the driver import and the shared object to the generated program.
 *
 * Any block of the library creates the object lazily, so a program still works
 * if the learner forgets the setup block; the setup block simply pins down the
 * address, pin or pixel count.
 */
function ensureInstance(generator, manifest, configuredCall) {
  const inst = manifest.instance;
  const importKey = `xrplib_import_${manifest.id}`;
  const instanceKey = `xrplib_instance_${manifest.id}`;

  if (inst.import) generator.definitions_[importKey] = inst.import;

  if (configuredCall) {
    generator.definitions_[instanceKey] = `${inst.name} = ${configuredCall}`;
  } else if (!generator.definitions_[instanceKey]) {
    generator.definitions_[instanceKey] = `${inst.name} = ${inst.create}`;
  }
}

// ── Toolbox ──────────────────────────────────────────────────────────────

/**
 * Build the toolbox category for a manifest.
 *
 * If the manifest has no `toolbox` array, every block is listed in the order
 * it was defined — enough for a simple device, and one less thing to get wrong.
 *
 * @param {!Object} manifest
 * @param {string} lang
 * @returns {!Object} a Blockly toolbox category definition
 */
export function buildToolboxCategory(manifest, lang) {
  const cat = manifest.category || {};
  const entries = Array.isArray(manifest.toolbox) && manifest.toolbox.length
    ? manifest.toolbox
    : manifest.blocks.map((b) => ({ block: b.type }));

  const contents = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.gap !== undefined) {
      contents.push({ kind: 'sep', gap: String(entry.gap) });
      continue;
    }
    if (!entry.block) continue;

    const item = { kind: 'block', type: entry.block };
    const shadows = entry.shadows || {};
    const inputs = {};
    for (const [name, spec] of Object.entries(shadows)) {
      const shadow = buildShadow(spec);
      if (shadow) inputs[name] = { shadow };
    }
    if (Object.keys(inputs).length) item.inputs = inputs;
    contents.push(item);
  }

  return {
    kind: 'category',
    categoryKey: cat.key || manifest.id,
    name: text(cat.label, lang, text(manifest.name, lang, manifest.id)),
    categorystyle: categoryStyleName(manifest.id),
    cssConfig: { icon: `cat-icon cat-icon-lib-${cssSafe(manifest.id)}` },
    libraryId: manifest.id,
    contents,
  };
}

/**
 * A shadow may be written as a bare number, a bare string, or the long form
 * {type, fields} for a block from this library (a colour picker, say).
 */
function buildShadow(spec) {
  if (spec === null || spec === undefined) return null;
  if (typeof spec === 'number') {
    return { type: 'math_number', fields: { NUM: spec } };
  }
  if (typeof spec === 'string') {
    return { type: 'text', fields: { TEXT: spec } };
  }
  if (typeof spec === 'object' && spec.type) {
    const shadow = { type: spec.type };
    if (spec.fields) shadow.fields = spec.fields;
    return shadow;
  }
  return null;
}

// ── Naming ───────────────────────────────────────────────────────────────

export function cssSafe(id) {
  return String(id).replace(/[^a-z0-9_-]/gi, '-');
}

export function blockStyleName(id) {
  return `lib_${cssSafe(id)}_blocks`;
}

export function categoryStyleName(id) {
  return `lib_${cssSafe(id)}_category`;
}
```

**`js/devices/library-manager.js`**

```js
/**
 * XRP Blocks — Device library manager
 *
 * Holds the device libraries the user has added, in whatever way they added
 * them: from the catalogue that ships in devices/, from a URL, or from a file
 * on their own computer. A library is a single JSON manifest; see
 * devices/README.md for the format.
 *
 * What the manager owns:
 *   - fetching and validating manifests
 *   - registering their blocks and Python generators
 *   - the theme colours and toolbox categories they contribute
 *   - the MicroPython driver each one installs on the robot
 *   - remembering the lot in localStorage, so a library added today is still
 *     there tomorrow and saved projects keep working
 */

import {
  validateManifest,
  registerManifestBlocks,
  registerManifestGenerators,
  buildToolboxCategory,
  blockStyleName,
  categoryStyleName,
  cssSafe,
  text,
} from './manifest-compiler.js';

const CATALOGUE_URL = 'devices/index.json';
const STORAGE_KEY = 'xrp_blocks_libraries';
const STYLE_ELEMENT_ID = 'xrp-library-icons';

/** Fallback icon: a plain chip outline, used when a manifest names none. */
const DEFAULT_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
  'stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="6" y="6" width="12" height="12" rx="2"/>' +
  '<path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>';

export class LibraryManager {
  /**
   * @param {{lang: string, onWarn?: function(string): void}} options
   */
  constructor({ lang = 'en', onWarn = null } = {}) {
    this.lang = lang;
    this.onWarn = onWarn;
    /** @type {Array<{manifest: Object, origin: Object}>} */
    this.installed = [];
    /** @type {Array<Object>|null} catalogue entries from devices/index.json */
    this.catalogue = null;
    this._registeredTypes = new Map(); // library id → block types
    this._generatorsFor = new Set();   // library ids whose generators are live
    this._pythonModule = null;
  }

  // ── Catalogue ──────────────────────────────────────────────────────────

  /**
   * Read devices/index.json, the list of libraries that ship with the IDE.
   * A missing or broken catalogue is not fatal: URL and file sources still work.
   *
   * @returns {Promise<Array<Object>>}
   */
  async loadCatalogue() {
    if (this.catalogue) return this.catalogue;
    try {
      const res = await fetch(CATALOGUE_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`index.json ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.libraries;
      if (!Array.isArray(list)) throw new Error('index.json has no libraries array');
      this.catalogue = list;
    } catch (err) {
      console.warn('[XRP Blocks] Could not read the device catalogue:', err);
      this.catalogue = [];
    }
    return this.catalogue;
  }

  /**
   * Which catalogue entry provides a given block type. Used to put a library
   * back automatically when a saved project needs it.
   *
   * @param {string} blockType
   * @returns {Object|null}
   */
  catalogueEntryProviding(blockType) {
    if (!this.catalogue) return null;
    return this.catalogue.find(
      (entry) => Array.isArray(entry.provides) && entry.provides.includes(blockType)
    ) || null;
  }

  // ── Adding and removing ────────────────────────────────────────────────

  has(id) {
    return this.installed.some((lib) => lib.manifest.id === id);
  }

  get(id) {
    return this.installed.find((lib) => lib.manifest.id === id) || null;
  }

  /**
   * Add a library from the built-in catalogue.
   * @param {string} id
   * @returns {Promise<Object>} the manifest
   */
  async addFromCatalogue(id) {
    await this.loadCatalogue();
    const entry = this.catalogue.find((e) => e.id === id);
    if (!entry) throw new Error(`"${id}" is not in the device catalogue.`);
    const url = entry.file.includes('/') ? entry.file : `devices/${entry.file}`;
    const manifest = await this._fetchManifest(url);
    return this._install(manifest, { type: 'builtin', ref: id });
  }

  /**
   * Add a library from a URL. Anything readable over HTTPS with permissive
   * CORS works — a raw file on a code host, or a school's own web server.
   * @param {string} url
   * @returns {Promise<Object>} the manifest
   */
  async addFromUrl(url) {
    const manifest = await this._fetchManifest(url);
    return this._install(manifest, { type: 'url', ref: url });
  }

  /**
   * Add a library from an already-parsed manifest, e.g. an uploaded file.
   * @param {Object} manifest
   * @param {string} [filename]
   * @returns {Object} the manifest
   */
  addFromManifest(manifest, filename = '') {
    return this._install(manifest, { type: 'file', ref: filename });
  }

  /**
   * Remove a library. Refuses while any of its blocks are still on the canvas,
   * because pulling the definitions out from under a live block breaks it.
   *
   * @param {string} id
   * @param {Blockly.Workspace} [workspace]
   * @returns {{ok: boolean, inUse?: string[]}}
   */
  remove(id, workspace = null) {
    const lib = this.get(id);
    if (!lib) return { ok: true };

    const types = this._registeredTypes.get(id) || [];

    if (workspace) {
      const inUse = types.filter((type) => workspace.getBlocksByType(type, false).length > 0);
      if (inUse.length) return { ok: false, inUse };
    }

    for (const type of types) {
      delete Blockly.Blocks[type];
      if (this._pythonModule?.pythonGenerator?.forBlock) {
        delete this._pythonModule.pythonGenerator.forBlock[type];
      }
    }

    this._registeredTypes.delete(id);
    this._generatorsFor.delete(id);
    this.installed = this.installed.filter((entry) => entry.manifest.id !== id);
    this._save();
    this._refreshIconStyles();
    return { ok: true };
  }

  // ── Restoring a previous session ───────────────────────────────────────

  /**
   * Put back everything the user had last time. Built-in and URL libraries are
   * re-fetched so a corrected manifest is picked up; the copy kept in
   * localStorage is the fallback when the fetch fails, which keeps a saved
   * project working offline.
   *
   * @returns {Promise<void>}
   */
  async restore() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (err) {
      saved = [];
    }
    if (!Array.isArray(saved) || saved.length === 0) return;

    for (const record of saved) {
      if (!record || !record.manifest) continue;
      const origin = record.origin || { type: 'file', ref: '' };
      let manifest = record.manifest;

      if (origin.type === 'builtin' || origin.type === 'url') {
        try {
          const url = origin.type === 'builtin'
            ? await this._catalogueUrl(origin.ref)
            : origin.ref;
          if (url) manifest = await this._fetchManifest(url);
        } catch (err) {
          console.warn(
            `[XRP Blocks] Could not refresh the "${record.manifest.id}" library; using the stored copy.`,
            err
          );
        }
      }

      try {
        this._install(manifest, origin, { save: false });
      } catch (err) {
        console.error(`[XRP Blocks] Dropping the "${record.manifest?.id}" library:`, err);
        this._warn(`The "${record.manifest?.id}" device library could not be loaded and was skipped.`);
      }
    }

    this._save();
  }

  async _catalogueUrl(id) {
    await this.loadCatalogue();
    const entry = this.catalogue.find((e) => e.id === id);
    if (!entry) return null;
    return entry.file.includes('/') ? entry.file : `devices/${entry.file}`;
  }

  // ── Registration ───────────────────────────────────────────────────────

  /**
   * Define every installed library's blocks. Called once before the workspace
   * is injected; adding a library later registers its own blocks immediately.
   */
  registerBlocks() {
    for (const { manifest } of this.installed) {
      if (this._registeredTypes.has(manifest.id)) continue;
      this._registeredTypes.set(manifest.id, registerManifestBlocks(manifest, this.lang));
    }
  }

  /**
   * Define every installed library's Python generators. Called once the Blockly
   * Python module exists; the module is kept so later additions can register
   * themselves straight away.
   *
   * @param {!Object} pythonModule
   */
  registerGenerators(pythonModule) {
    this._pythonModule = pythonModule;
    for (const { manifest } of this.installed) {
      if (this._generatorsFor.has(manifest.id)) continue;
      registerManifestGenerators(manifest, pythonModule, this.lang);
      this._generatorsFor.add(manifest.id);
    }
  }

  // ── What the app asks for ──────────────────────────────────────────────

  /**
   * Toolbox categories for every installed library, in the order added.
   * @returns {Array<Object>}
   */
  toolboxCategories() {
    return this.installed.map(({ manifest }) => buildToolboxCategory(manifest, this.lang));
  }

  /**
   * Theme block and category styles for every installed library.
   *
   * A manifest gives one colour. The dark variant is the manifest's own
   * `colourDark` if it has one, otherwise the colour deepened until white text
   * on it passes WCAG AA (4.5:1) — the same bar the built-in dark palette meets.
   *
   * @param {'light'|'dark'} mode
   * @returns {{blockStyles: Object, categoryStyles: Object}}
   */
  themeStyles(mode) {
    const blockStyles = {};
    const categoryStyles = {};

    for (const { manifest } of this.installed) {
      const cat = manifest.category || {};
      const base = normaliseHex(cat.colour) || '#8899AA';
      const primary = mode === 'dark'
        ? (normaliseHex(cat.colourDark) || deepenForWhiteText(base))
        : base;

      blockStyles[blockStyleName(manifest.id)] = {
        colourPrimary: primary,
        colourSecondary: mix(primary, '#FFFFFF', mode === 'dark' ? 0.35 : 0.4),
        colourTertiary: mix(primary, '#000000', 0.22),
        hat: '',
      };
      categoryStyles[categoryStyleName(manifest.id)] = { colour: primary };
    }

    return { blockStyles, categoryStyles };
  }

  /**
   * The MicroPython drivers installed libraries need on the robot.
   * @returns {Array<{marker: string, filename: string, source: string}>}
   */
  drivers() {
    const out = [];
    for (const { manifest } of this.installed) {
      const driver = manifest.driver;
      if (!driver || !driver.source) continue;
      out.push({
        marker: driver.marker || driver.filename.replace(/\.py$/, ''),
        filename: driver.filename,
        source: driver.source,
      });
    }
    return out;
  }

  /**
   * Block types provided by installed libraries, for spotting what a saved
   * project is missing.
   * @returns {Set<string>}
   */
  knownBlockTypes() {
    const types = new Set();
    for (const list of this._registeredTypes.values()) {
      for (const type of list) types.add(type);
    }
    return types;
  }

  /** A short human label for a library, in the current language. */
  label(manifest) {
    return text(manifest.name, this.lang, manifest.id);
  }

  // ── Internals ──────────────────────────────────────────────────────────

  async _fetchManifest(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.json();
  }

  /**
   * Validate, register and record one manifest.
   * @returns {Object} the manifest
   */
  _install(manifest, origin, { save = true } = {}) {
    const { ok, errors } = validateManifest(manifest);
    if (!ok) {
      throw new Error(`This is not a valid device library:\n• ${errors.join('\n• ')}`);
    }

    // Re-adding the same library replaces it rather than doubling it up. Its
    // own block types are already registered, so they are not a clash.
    const ownTypes = new Set(this._registeredTypes.get(manifest.id) || []);
    if (this.get(manifest.id)) {
      this.installed = this.installed.filter((e) => e.manifest.id !== manifest.id);
      this._registeredTypes.delete(manifest.id);
      this._generatorsFor.delete(manifest.id);
    }

    const clash = this._blockTypeClash(manifest, ownTypes);
    if (clash) {
      throw new Error(
        `The block "${clash}" already exists in this IDE. ` +
        'Two libraries cannot define the same block type.'
      );
    }

    this.installed.push({ manifest, origin });
    this._registeredTypes.set(manifest.id, registerManifestBlocks(manifest, this.lang));

    if (this._pythonModule) {
      registerManifestGenerators(manifest, this._pythonModule, this.lang);
      this._generatorsFor.add(manifest.id);
    }

    this._refreshIconStyles();
    if (save) this._save();
    return manifest;
  }

  /** A block type already defined by the core IDE or another library. */
  _blockTypeClash(manifest, ownTypes = new Set()) {
    for (const block of manifest.blocks) {
      if (ownTypes.has(block.type)) continue;
      if (Blockly.Blocks[block.type]) return block.type;
    }
    return null;
  }

  _save() {
    try {
      const records = this.installed.map(({ manifest, origin }) => ({ origin, manifest }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.warn('[XRP Blocks] Could not remember the installed libraries:', err);
      this._warn('Your device libraries could not be saved in this browser, so they will be gone after a reload.');
    }
  }

  /**
   * Category icons are CSS masks, so each library needs a rule of its own.
   * Rewriting the whole style element keeps adds and removes in step.
   */
  _refreshIconStyles() {
    let style = document.getElementById(STYLE_ELEMENT_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ELEMENT_ID;
      document.head.appendChild(style);
    }

    const rules = this.installed.map(({ manifest }) => {
      const url = iconUrl(manifest);
      const cls = `cat-icon-lib-${cssSafe(manifest.id)}`;
      return `.${cls}::before{mask-image:url("${url}");-webkit-mask-image:url("${url}");}`;
    });

    style.textContent = rules.join('\n');
  }

  _warn(message) {
    if (typeof this.onWarn === 'function') this.onWarn(message);
  }
}

// ── Icons ──────────────────────────────────────────────────────────────

/**
 * Where a category icon comes from, in order: an inline SVG in the manifest
 * (so one file really is the whole library), a path or data URI, or the
 * built-in fallback.
 */
function iconUrl(manifest) {
  const cat = manifest.category || {};
  if (typeof cat.iconSvg === 'string' && cat.iconSvg.trim().startsWith('<svg')) {
    return svgDataUri(cat.iconSvg);
  }
  if (typeof cat.icon === 'string' && cat.icon.trim()) {
    return cat.icon.replace(/"/g, '%22');
  }
  return svgDataUri(DEFAULT_ICON_SVG);
}

function svgDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ── Colour ─────────────────────────────────────────────────────────────

function normaliseHex(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null;
}

function toRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex([r, g, b]) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Blend two colours. amount 0 gives the first colour, 1 gives the second. */
function mix(hexA, hexB, amount) {
  const a = toRgb(hexA);
  const b = toRgb(hexB);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
}

/** WCAG relative luminance. */
function luminance(hex) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = toRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of white text on this colour. */
function contrastWithWhite(hex) {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * Deepen a colour until white text on it reaches WCAG AA for normal text
 * (4.5:1), keeping the hue so the category stays recognisable.
 */
function deepenForWhiteText(hex) {
  let current = hex;
  for (let i = 0; i < 24 && contrastWithWhite(current) < 4.5; i++) {
    current = mix(current, '#000000', 0.07);
  }
  return current;
}
```

**`js/ui/library-modal.js`**

```js
/**
 * XRP Blocks — Device Library Modal
 *
 * The "Library" button opens this. It lists what is already added, what is
 * available in the catalogue that ships with the IDE, and two ways to bring in
 * a library from elsewhere: a file on this computer, or a URL.
 *
 * Usage:
 *   await LibraryModal.open({ manager, workspace, onChange, onToast });
 */

import { text } from '../devices/manifest-compiler.js';

const ICON_ADD = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`;

const ICON_REMOVE = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`;

const ICON_CHIP = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>
  </svg>`;

export class LibraryModal {
  /**
   * @param {Object} options
   * @param {import('../devices/library-manager.js').LibraryManager} options.manager
   * @param {Blockly.Workspace} options.workspace
   * @param {function(): void} options.onChange - called after every add or remove
   * @param {function(string, string=): void} [options.onToast]
   * @returns {Promise<void>} resolves when the dialog closes
   */
  static open({ manager, workspace, onChange, onToast = null }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('library-modal');
      const listEl = document.getElementById('library-modal-list');
      const closeBtn = document.getElementById('library-modal-close');
      const uploadBtn = document.getElementById('library-modal-upload');
      const urlInput = document.getElementById('library-modal-url');
      const fetchBtn = document.getElementById('library-modal-fetch');
      const errorEl = document.getElementById('library-modal-error');

      if (!modal || !listEl) {
        resolve();
        return;
      }

      this._manager = manager;
      this._workspace = workspace;
      this._onChange = onChange;
      this._onToast = onToast;
      this._listEl = listEl;
      this._errorEl = errorEl;

      let settled = false;
      const close = () => {
        if (settled) return;
        settled = true;
        modal.classList.remove('visible');
        document.body.classList.remove('modal-open');
        cleanup();
        resolve();
      };

      const onOverlay = (e) => { if (e.target === modal) close(); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      const onUpload = () => this._addFromFile();
      const onFetch = () => this._addFromUrl(urlInput);
      const onUrlKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); this._addFromUrl(urlInput); } };

      const cleanup = () => {
        closeBtn?.removeEventListener('click', close);
        modal.removeEventListener('click', onOverlay);
        document.removeEventListener('keydown', onKey);
        uploadBtn?.removeEventListener('click', onUpload);
        fetchBtn?.removeEventListener('click', onFetch);
        urlInput?.removeEventListener('keydown', onUrlKey);
      };

      closeBtn?.addEventListener('click', close);
      modal.addEventListener('click', onOverlay);
      document.addEventListener('keydown', onKey);
      uploadBtn?.addEventListener('click', onUpload);
      fetchBtn?.addEventListener('click', onFetch);
      urlInput?.addEventListener('keydown', onUrlKey);

      if (errorEl) errorEl.hidden = true;
      modal.classList.add('visible');
      document.body.classList.add('modal-open');

      this._render();
    });
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  static async _render() {
    const manager = this._manager;
    const listEl = this._listEl;
    const lang = manager.lang;

    listEl.innerHTML =
      `<div class="lesson-modal__status">${Blockly.Msg['MSG_LIBRARY_LOADING'] || 'Loading device libraries…'}</div>`;

    await manager.loadCatalogue();

    const installed = manager.installed;
    const available = (manager.catalogue || []).filter((entry) => !manager.has(entry.id));

    listEl.innerHTML = '';

    if (installed.length) {
      listEl.appendChild(this._heading(Blockly.Msg['UI_LIBRARY_INSTALLED'] || 'Added to this IDE'));
      for (const { manifest, origin } of installed) {
        listEl.appendChild(this._row({
          title: text(manifest.name, lang, manifest.id),
          subtitle: this._subtitle(manifest, origin, lang),
          colour: manifest.category?.colour,
          actionLabel: Blockly.Msg['UI_LIBRARY_REMOVE'] || 'Remove',
          actionIcon: ICON_REMOVE,
          actionClass: 'library-item__btn--remove',
          onAction: () => this._remove(manifest.id),
        }));
      }
    }

    if (available.length) {
      listEl.appendChild(this._heading(Blockly.Msg['UI_LIBRARY_AVAILABLE'] || 'Available to add'));
      for (const entry of available) {
        listEl.appendChild(this._row({
          title: text(entry.name, lang, entry.id),
          subtitle: text(entry.description, lang, ''),
          colour: entry.colour,
          actionLabel: Blockly.Msg['UI_LIBRARY_ADD'] || 'Add',
          actionIcon: ICON_ADD,
          actionClass: 'library-item__btn--add',
          onAction: () => this._addFromCatalogue(entry.id),
        }));
      }
    }

    if (!installed.length && !available.length) {
      listEl.innerHTML =
        `<div class="lesson-modal__status">${Blockly.Msg['MSG_LIBRARY_EMPTY'] || 'No device libraries found. Add one from a file or a URL below.'}</div>`;
    }
  }

  static _heading(label) {
    const el = document.createElement('div');
    el.className = 'library-modal__heading';
    el.textContent = label;
    return el;
  }

  static _subtitle(manifest, origin, lang) {
    const description = text(manifest.description, lang, '');
    const blocks = Array.isArray(manifest.blocks) ? manifest.blocks.length : 0;
    const count = blocks === 1
      ? (Blockly.Msg['UI_LIBRARY_ONE_BLOCK'] || '1 block')
      : (Blockly.Msg['UI_LIBRARY_N_BLOCKS'] || '%1 blocks').replace('%1', String(blocks));
    const source = origin?.type === 'url'
      ? (Blockly.Msg['UI_LIBRARY_FROM_URL'] || 'from a URL')
      : origin?.type === 'file'
        ? (Blockly.Msg['UI_LIBRARY_FROM_FILE'] || 'from a file')
        : '';
    return [description, count, source].filter(Boolean).join(' · ');
  }

  static _row({ title, subtitle, colour, actionLabel, actionIcon, actionClass, onAction }) {
    const row = document.createElement('div');
    row.className = 'library-item';
    row.innerHTML = `
      <span class="library-item__icon">${ICON_CHIP}</span>
      <span class="library-item__body">
        <span class="library-item__title"></span>
        <span class="library-item__subtitle"></span>
      </span>
      <button type="button" class="library-item__btn ${actionClass}">
        ${actionIcon}<span class="library-item__btn-label"></span>
      </button>
    `;

    row.querySelector('.library-item__title').textContent = title;
    row.querySelector('.library-item__subtitle').textContent = subtitle || '';
    row.querySelector('.library-item__btn-label').textContent = actionLabel;

    if (colour && /^#[0-9a-fA-F]{6}$/.test(colour)) {
      const icon = row.querySelector('.library-item__icon');
      icon.style.color = colour;
      icon.style.borderColor = `${colour}55`;
      icon.style.background = `${colour}1A`;
    }

    row.querySelector('.library-item__btn').addEventListener('click', onAction);
    return row;
  }

  // ── Actions ────────────────────────────────────────────────────────────

  static async _addFromCatalogue(id) {
    try {
      const manifest = await this._manager.addFromCatalogue(id);
      this._changed(manifest);
    } catch (err) {
      this._showError(err);
    }
    this._render();
  }

  static async _addFromUrl(urlInput) {
    const url = (urlInput?.value || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      this._showError(new Error(Blockly.Msg['MSG_LIBRARY_URL_INVALID'] || 'Enter a full address starting with https://'));
      return;
    }
    try {
      const manifest = await this._manager.addFromUrl(url);
      urlInput.value = '';
      this._changed(manifest);
    } catch (err) {
      this._showError(err, Blockly.Msg['MSG_LIBRARY_FETCH_ERROR']
        || 'Could not fetch that library. Check the address, and that the server allows other sites to read it.');
    }
    this._render();
  }

  static _addFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const manifest = JSON.parse(await file.text());
        this._manager.addFromManifest(manifest, file.name);
        this._changed(manifest);
      } catch (err) {
        this._showError(err);
      }
      this._render();
    };
    input.click();
  }

  static _remove(id) {
    const manager = this._manager;
    const label = manager.label(manager.get(id)?.manifest || { id });
    const result = manager.remove(id, this._workspace);

    if (!result.ok) {
      // Not a fault: the user is being told why, so there is nothing to log.
      this._showMessage(Blockly.Msg['MSG_LIBRARY_IN_USE']
        || 'Those blocks are still being used in your program. Delete them first, then remove the library.');
      this._render();
      return;
    }

    this._onChange?.();
    this._toast((Blockly.Msg['MSG_LIBRARY_REMOVED'] || 'Removed %1').replace('%1', label));
    this._render();
  }

  static _changed(manifest) {
    this._onChange?.();
    const label = this._manager.label(manifest);
    this._toast((Blockly.Msg['MSG_LIBRARY_ADDED'] || 'Added %1').replace('%1', label));
    if (this._errorEl) this._errorEl.hidden = true;
  }

  static _toast(message, type = 'success') {
    if (typeof this._onToast === 'function') this._onToast(message, type);
  }

  static _showError(err, fallback = '') {
    console.error('[LibraryModal]', err);
    this._showMessage(fallback || err?.message || 'Something went wrong.');
  }

  /** Put a message under the dialog's buttons for a few seconds. */
  static _showMessage(message) {
    const el = this._errorEl;
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }
}
```

The format, written for somebody else to use rather than as notes to self:

**`devices/README.md`**

````markdown
# Device libraries

A device library is **one JSON file** that adds a category of blocks for one
device: the blocks themselves, the Python each one generates, and the
MicroPython driver to copy onto the robot.

Nothing in the file is executed. It is data all the way down — strings,
numbers, lists — so a library can be emailed, dropped in a folder or fetched
from a URL without running anyone's code.

Five libraries ship here: `pcf8575.json`, `neopixel.json`,
`ssd1315-oled.json`, `mecanum.json` and `remote-control.json`.
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
````

The catalogue, and the two moved categories. `provides` must list every block
type the manifest defines; it is what lets the IDE work out which library a
saved project is missing and put it back.

**`devices/index.json`**

```json
{
  "catalogueVersion": 1,
  "libraries": [
    {
      "id": "pcf8575",
      "file": "pcf8575.json",
      "name": {
        "en": "PCF8575 I/O expander",
        "nl": "PCF8575 I/O-uitbreiding"
      },
      "description": {
        "en": "Sixteen extra pins over the Qwiic connector, for LEDs and buttons.",
        "nl": "Zestien extra pinnen via de Qwiic-connector, voor LEDs en knoppen."
      },
      "version": "1.0.0",
      "colour": "#7E9BD8",
      "provides": [
        "xrp_pcf_setup",
        "xrp_pcf_pin_mode",
        "xrp_pcf_led",
        "xrp_pcf_all_off",
        "xrp_pcf_button",
        "xrp_pcf_set_pin",
        "xrp_pcf_read_pin"
      ]
    },
    {
      "id": "neopixel",
      "file": "neopixel.json",
      "name": {
        "en": "NeoPixel strip",
        "nl": "NeoPixel-strip"
      },
      "description": {
        "en": "WS2812 addressable LED strip on a servo header or a free GPIO.",
        "nl": "WS2812 adresseerbare LED-strip op een servo-aansluiting of vrije GPIO."
      },
      "version": "1.0.0",
      "colour": "#E27DA8",
      "provides": [
        "xrp_np_setup",
        "xrp_np_brightness",
        "xrp_np_colour",
        "xrp_np_rgb",
        "xrp_np_set_pixel",
        "xrp_np_fill",
        "xrp_np_clear",
        "xrp_np_rainbow",
        "xrp_np_shift",
        "xrp_np_show",
        "xrp_np_auto_show",
        "xrp_np_count"
      ]
    },
    {
      "id": "ssd1315-oled",
      "file": "ssd1315-oled.json",
      "name": {
        "en": "OLED screen (SSD1315 / SSD1306)",
        "nl": "OLED-scherm (SSD1315 / SSD1306)"
      },
      "description": {
        "en": "128x64 monochrome OLED on the Qwiic connector. Text, numbers, drawing, a compass arrow and sketched pictures.",
        "nl": "128x64 monochroom OLED op de Qwiic-connector. Tekst, getallen, tekenen, een kompaspijl en getekende plaatjes."
      },
      "version": "2.1.0",
      "colour": "#4DB6AC",
      "provides": [
        "xrp_oled_setup",
        "xrp_oled_clear",
        "xrp_oled_print",
        "xrp_oled_line",
        "xrp_oled_value",
        "xrp_oled_at",
        "xrp_oled_show",
        "xrp_oled_auto_show",
        "xrp_oled_brightness",
        "xrp_oled_invert",
        "xrp_oled_power",
        "xrp_oled_arrow",
        "xrp_oled_big",
        "xrp_oled_picture",
        "xrp_oled_pixel",
        "xrp_oled_draw_line",
        "xrp_oled_rect",
        "xrp_oled_circle",
        "xrp_oled_bar",
        "xrp_oled_connected",
        "xrp_oled_width",
        "xrp_oled_height",
        "xrp_oled_scroll_text"
      ]
    },
    {
      "id": "mecanum",
      "file": "mecanum.json",
      "name": {
        "en": "Mecanum wheels (4 motors)",
        "nl": "Mecanumwielen (4 motoren)"
      },
      "description": {
        "en": "Eight movement directions, speed %, encoder distance in cm and turns in degrees. Four encoded motors and X-pattern wheels."
      },
      "version": "1.1.0",
      "colour": "#527EC5",
      "provides": [
        "xrp_mec_setup",
        "xrp_mec_reverse",
        "xrp_mec_move",
        "xrp_mec_angle",
        "xrp_mec_drive",
        "xrp_mec_turn",
        "xrp_mec_stop",
        "xrp_mec_completed",
        "xrp_mec_ports",
        "xrp_mec_geometry"
      ]
    },
    {
      "id": "remote-control",
      "file": "remote-control.json",
      "name": {
        "en": "Remote control",
        "nl": "Afstandsbediening"
      },
      "description": {
        "en": "Wi-Fi HTML controller with six customizable buttons. Read inputs and control any device library."
      },
      "version": "1.1.1",
      "colour": "#497DA4",
      "provides": [
        "xrp_remote_start",
        "xrp_remote_title",
        "xrp_remote_label",
        "xrp_remote_update",
        "xrp_remote_pressed",
        "xrp_remote_clicked",
        "xrp_remote_connected",
        "xrp_remote_address",
        "xrp_remote_release",
        "xrp_remote_close"
      ]
    }
  ]
}
```

The `driver.source` field is blank here and holds `PCF8575.py` in the real file, 6439 characters of it. Run `tools/embed_drivers.py` after copying this in, as Part B says, and it is filled from `lib/`.

**`devices/pcf8575.json`**

```json
{
  "manifestVersion": 1,
  "id": "pcf8575",
  "name": {
    "en": "PCF8575 I/O expander",
    "nl": "PCF8575 I/O-uitbreiding"
  },
  "description": {
    "en": "Sixteen extra pins over the Qwiic connector, for LEDs and buttons.",
    "nl": "Zestien extra pinnen via de Qwiic-connector, voor LEDs en knoppen."
  },
  "version": "1.0.0",
  "author": "XRP Blocks (Limpopo DoE fork)",
  "licence": "MIT",
  "homepage": "",
  "category": {
    "key": "Expander",
    "label": {
      "en": "PCF8575",
      "nl": "PCF8575"
    },
    "colour": "#7E9BD8",
    "colourDark": "#3D71DF",
    "iconSvg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M8 2h1.6v2H8zm3.2 0h1.6v2h-1.6zm3.2 0H16v2h-1.6zM8 20h1.6v2H8zm3.2 0h1.6v2h-1.6zm3.2 0H16v2h-1.6zM2 8h2v1.6H2zm0 3.2h2v1.6H2zm0 3.2h2V16H2zm18-6.4h2v1.6h-2zm0 3.2h2v1.6h-2zm0 3.2h2V16h-2zM5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1.6 1.6v10.8h10.8V6.6z\"/></svg>"
  },
  "driver": {
    "filename": "PCF8575.py",
    "marker": "PCF8575",
    "source": ""
  },
  "instance": {
    "name": "expander",
    "import": "from PCF8575 import PCF8575, INPUT, OUTPUT",
    "create": "PCF8575()",
    "createConfigured": "PCF8575(address={ADDR})"
  },
  "lists": {
    "pins": [
      {
        "label": "0 (P00)",
        "value": "0"
      },
      {
        "label": "1 (P01)",
        "value": "1"
      },
      {
        "label": "2 (P02)",
        "value": "2"
      },
      {
        "label": "3 (P03)",
        "value": "3"
      },
      {
        "label": "4 (P04)",
        "value": "4"
      },
      {
        "label": "5 (P05)",
        "value": "5"
      },
      {
        "label": "6 (P06)",
        "value": "6"
      },
      {
        "label": "7 (P07)",
        "value": "7"
      },
      {
        "label": "8 (P10)",
        "value": "8"
      },
      {
        "label": "9 (P11)",
        "value": "9"
      },
      {
        "label": "10 (P12)",
        "value": "10"
      },
      {
        "label": "11 (P13)",
        "value": "11"
      },
      {
        "label": "12 (P14)",
        "value": "12"
      },
      {
        "label": "13 (P15)",
        "value": "13"
      },
      {
        "label": "14 (P16)",
        "value": "14"
      },
      {
        "label": "15 (P17)",
        "value": "15"
      }
    ],
    "addresses": [
      {
        "label": "0x20",
        "value": "0x20"
      },
      {
        "label": "0x21",
        "value": "0x21"
      },
      {
        "label": "0x22",
        "value": "0x22"
      },
      {
        "label": "0x23",
        "value": "0x23"
      },
      {
        "label": "0x24",
        "value": "0x24"
      },
      {
        "label": "0x25",
        "value": "0x25"
      },
      {
        "label": "0x26",
        "value": "0x26"
      },
      {
        "label": "0x27",
        "value": "0x27"
      }
    ]
  },
  "blocks": [
    {
      "type": "xrp_pcf_setup",
      "text": {
        "en": "set up PCF8575 at address %1",
        "nl": "stel PCF8575 in op adres %1"
      },
      "tooltip": {
        "en": "Find the PCF8575 on the Qwiic connector. Use this once, at the start.",
        "nl": "Zoek de PCF8575 op de Qwiic-connector. Gebruik dit een keer, aan het begin."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "ADDR",
          "options": "$addresses"
        }
      ],
      "shape": "statement",
      "configuresInstance": true,
      "code": ""
    },
    {
      "type": "xrp_pcf_pin_mode",
      "text": {
        "en": "use PCF8575 pin %1 as %2",
        "nl": "gebruik PCF8575-pin %1 als %2"
      },
      "tooltip": {
        "en": "Say what is wired to this pin. An LED pin is driven; a button pin is held high so it can be read.",
        "nl": "Geef aan wat er op deze pin is aangesloten."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "PIN",
          "options": "$pins"
        },
        {
          "type": "dropdown",
          "name": "MODE",
          "options": [
            {
              "label": {
                "en": "LED (output)",
                "nl": "LED (uitvoer)"
              },
              "value": "OUTPUT"
            },
            {
              "label": {
                "en": "button (input)",
                "nl": "knop (invoer)"
              },
              "value": "INPUT"
            }
          ]
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "expander.pin_mode({PIN}, {MODE})\n"
    },
    {
      "type": "xrp_pcf_led",
      "text": {
        "en": "PCF8575 LED on pin %1 %2",
        "nl": "PCF8575-LED op pin %1 %2"
      },
      "tooltip": {
        "en": "Switch an LED wired to this PCF8575 pin on or off.",
        "nl": "Zet een LED op deze PCF8575-pin aan of uit."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "PIN",
          "options": "$pins"
        },
        {
          "type": "dropdown",
          "name": "STATE",
          "options": [
            {
              "label": {
                "en": "on",
                "nl": "aan"
              },
              "value": "ON",
              "code": "True"
            },
            {
              "label": {
                "en": "off",
                "nl": "uit"
              },
              "value": "OFF",
              "code": "False"
            }
          ]
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "expander.led({PIN}, {STATE})\n"
    },
    {
      "type": "xrp_pcf_all_off",
      "text": {
        "en": "switch all PCF8575 LEDs off",
        "nl": "zet alle PCF8575-LEDs uit"
      },
      "tooltip": {
        "en": "Switch every PCF8575 LED off, leaving button pins alone.",
        "nl": "Zet elke PCF8575-LED uit, zonder de knoppen te storen."
      },
      "shape": "statement",
      "code": "expander.all_off()\n"
    },
    {
      "type": "xrp_pcf_button",
      "text": {
        "en": "PCF8575 button on pin %1 is pressed",
        "nl": "PCF8575-knop op pin %1 is ingedrukt"
      },
      "tooltip": {
        "en": "True while the button wired between this pin and GND is held down.",
        "nl": "Waar zolang de knop tussen deze pin en GND is ingedrukt."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "PIN",
          "options": "$pins"
        }
      ],
      "shape": "value",
      "returns": "Boolean",
      "order": "FUNCTION_CALL",
      "code": "expander.button({PIN})"
    },
    {
      "type": "xrp_pcf_set_pin",
      "text": {
        "en": "set PCF8575 pin %1 to %2",
        "nl": "zet PCF8575-pin %1 op %2"
      },
      "tooltip": {
        "en": "Drive a pin high or low directly, for a relay or buzzer.",
        "nl": "Zet een pin rechtstreeks hoog of laag, voor een relais of zoemer."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "PIN",
          "options": "$pins"
        },
        {
          "type": "dropdown",
          "name": "LEVEL",
          "options": [
            {
              "label": {
                "en": "high",
                "nl": "hoog"
              },
              "value": "HIGH",
              "code": "True"
            },
            {
              "label": {
                "en": "low",
                "nl": "laag"
              },
              "value": "LOW",
              "code": "False"
            }
          ]
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "expander.set_pin({PIN}, {LEVEL})\n"
    },
    {
      "type": "xrp_pcf_read_pin",
      "text": {
        "en": "PCF8575 pin %1 level",
        "nl": "PCF8575-pin %1 niveau"
      },
      "tooltip": {
        "en": "Read a pin as 1 (high) or 0 (low).",
        "nl": "Lees een pin als 1 (hoog) of 0 (laag)."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "PIN",
          "options": "$pins"
        }
      ],
      "shape": "value",
      "returns": "Number",
      "order": "FUNCTION_CALL",
      "code": "expander.get_pin({PIN})"
    }
  ],
  "toolbox": [
    {
      "block": "xrp_pcf_setup"
    },
    {
      "block": "xrp_pcf_pin_mode"
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_pcf_led"
    },
    {
      "block": "xrp_pcf_all_off"
    },
    {
      "block": "xrp_pcf_button"
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_pcf_set_pin"
    },
    {
      "block": "xrp_pcf_read_pin"
    }
  ]
}
```

The `driver.source` field is blank here and holds `NeoPixelStrip.py` in the real file, 6919 characters of it. Run `tools/embed_drivers.py` after copying this in, as Part B says, and it is filled from `lib/`.

**`devices/neopixel.json`**

```json
{
  "manifestVersion": 1,
  "id": "neopixel",
  "name": {
    "en": "NeoPixel strip",
    "nl": "NeoPixel-strip"
  },
  "description": {
    "en": "WS2812 addressable LED strip on a servo header or a free GPIO.",
    "nl": "WS2812 adresseerbare LED-strip op een servo-aansluiting of vrije GPIO."
  },
  "version": "1.0.0",
  "author": "XRP Blocks (Limpopo DoE fork)",
  "licence": "MIT",
  "homepage": "",
  "category": {
    "key": "NeoPixel",
    "label": {
      "en": "NeoPixel",
      "nl": "NeoPixel"
    },
    "colour": "#E27DA8",
    "colourDark": "#E5136D",
    "iconSvg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 9.5h20a1.5 1.5 0 0 1 1.5 1.5v2A1.5 1.5 0 0 1 22 14.5H2A1.5 1.5 0 0 1 .5 13v-2A1.5 1.5 0 0 1 2 9.5zm2.6 1.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm3.7 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm3.7 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm3.7 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm3.7 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM11 3h2v4.5h-2zm0 13.5h2V21h-2z\"/></svg>"
  },
  "driver": {
    "filename": "NeoPixelStrip.py",
    "marker": "NeoPixelStrip",
    "source": ""
  },
  "instance": {
    "name": "strip",
    "import": "from NeoPixelStrip import NeoPixelStrip, colour",
    "create": "NeoPixelStrip()",
    "createConfigured": "NeoPixelStrip(pin={PIN}, count={COUNT})"
  },
  "lists": {
    "pins": [
      {
        "label": "Servo 1 (GPIO 6)",
        "value": "6"
      },
      {
        "label": "Servo 2 (GPIO 9)",
        "value": "9"
      },
      {
        "label": "Servo 3 (GPIO 7)",
        "value": "7"
      },
      {
        "label": "Servo 4 (GPIO 8)",
        "value": "8"
      },
      {
        "label": "GPIO 12",
        "value": "12"
      },
      {
        "label": "GPIO 13",
        "value": "13"
      },
      {
        "label": "GPIO 14",
        "value": "14"
      },
      {
        "label": "GPIO 15",
        "value": "15"
      },
      {
        "label": "GPIO 16",
        "value": "16"
      },
      {
        "label": "GPIO 17",
        "value": "17"
      },
      {
        "label": "GPIO 18",
        "value": "18"
      },
      {
        "label": "GPIO 19",
        "value": "19"
      }
    ],
    "colours": [
      {
        "label": {
          "en": "red",
          "nl": "rood"
        },
        "value": "red"
      },
      {
        "label": {
          "en": "orange",
          "nl": "oranje"
        },
        "value": "orange"
      },
      {
        "label": {
          "en": "yellow",
          "nl": "geel"
        },
        "value": "yellow"
      },
      {
        "label": {
          "en": "green",
          "nl": "groen"
        },
        "value": "green"
      },
      {
        "label": {
          "en": "cyan",
          "nl": "cyaan"
        },
        "value": "cyan"
      },
      {
        "label": {
          "en": "blue",
          "nl": "blauw"
        },
        "value": "blue"
      },
      {
        "label": {
          "en": "purple",
          "nl": "paars"
        },
        "value": "purple"
      },
      {
        "label": {
          "en": "magenta",
          "nl": "magenta"
        },
        "value": "magenta"
      },
      {
        "label": {
          "en": "pink",
          "nl": "roze"
        },
        "value": "pink"
      },
      {
        "label": {
          "en": "white",
          "nl": "wit"
        },
        "value": "white"
      },
      {
        "label": {
          "en": "off",
          "nl": "uit"
        },
        "value": "off"
      }
    ]
  },
  "blocks": [
    {
      "type": "xrp_np_setup",
      "text": {
        "en": "set up NeoPixel strip on %1 with %2 pixels",
        "nl": "stel NeoPixel-strip in op %1 met %2 pixels"
      },
      "tooltip": {
        "en": "Tell the robot where the strip is plugged in and how long it is. Pixels are numbered from 0.",
        "nl": "Geef aan waar de strip is aangesloten en hoe lang hij is. Pixels tellen vanaf 0."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "PIN",
          "options": "$pins"
        },
        {
          "type": "number",
          "name": "COUNT",
          "default": 10
        }
      ],
      "inline": true,
      "shape": "statement",
      "configuresInstance": true,
      "code": ""
    },
    {
      "type": "xrp_np_brightness",
      "text": {
        "en": "set NeoPixel brightness to %1 %%",
        "nl": "stel NeoPixel-helderheid in op %1 %%"
      },
      "tooltip": {
        "en": "Brightness from 0 to 100 percent. Keep it low: a bright strip draws a lot of current.",
        "nl": "Helderheid van 0 tot 100 procent. Houd het laag: een felle strip gebruikt veel stroom."
      },
      "args": [
        {
          "type": "number",
          "name": "PERCENT",
          "default": 30
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "strip.set_brightness({PERCENT})\n"
    },
    {
      "type": "xrp_np_colour",
      "text": {
        "en": "colour %1",
        "nl": "kleur %1"
      },
      "tooltip": {
        "en": "A colour to plug into a NeoPixel block.",
        "nl": "Een kleur om in een NeoPixel-blok te zetten."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "NAME",
          "options": "$colours"
        }
      ],
      "shape": "value",
      "returns": "Colour",
      "order": "FUNCTION_CALL",
      "code": "colour('{NAME}')"
    },
    {
      "type": "xrp_np_rgb",
      "text": {
        "en": "colour red %1 green %2 blue %3",
        "nl": "kleur rood %1 groen %2 blauw %3"
      },
      "tooltip": {
        "en": "Mix your own colour from three values of 0 to 255.",
        "nl": "Meng je eigen kleur uit drie waarden van 0 tot 255."
      },
      "args": [
        {
          "type": "number",
          "name": "RED",
          "default": 0
        },
        {
          "type": "number",
          "name": "GREEN",
          "default": 0
        },
        {
          "type": "number",
          "name": "BLUE",
          "default": 0
        }
      ],
      "inline": true,
      "shape": "value",
      "returns": "Colour",
      "order": "ATOMIC",
      "code": "({RED}, {GREEN}, {BLUE})"
    },
    {
      "type": "xrp_np_set_pixel",
      "text": {
        "en": "set NeoPixel %1 to %2",
        "nl": "zet NeoPixel %1 op %2"
      },
      "tooltip": {
        "en": "Set one pixel. The first pixel on the strip is 0.",
        "nl": "Zet een pixel. De eerste pixel op de strip is 0."
      },
      "args": [
        {
          "type": "number",
          "name": "INDEX",
          "default": 0
        },
        {
          "type": "value",
          "name": "COLOUR",
          "check": "Colour",
          "default": "colour('off')"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "strip.set_pixel({INDEX}, {COLOUR})\n"
    },
    {
      "type": "xrp_np_fill",
      "text": {
        "en": "set whole NeoPixel strip to %1",
        "nl": "zet hele NeoPixel-strip op %1"
      },
      "tooltip": {
        "en": "Set every pixel on the strip to the same colour.",
        "nl": "Zet elke pixel op de strip op dezelfde kleur."
      },
      "args": [
        {
          "type": "value",
          "name": "COLOUR",
          "check": "Colour",
          "default": "colour('off')"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "strip.fill({COLOUR})\n"
    },
    {
      "type": "xrp_np_clear",
      "text": {
        "en": "switch NeoPixel strip off",
        "nl": "zet NeoPixel-strip uit"
      },
      "tooltip": {
        "en": "Switch every pixel off at once.",
        "nl": "Zet elke pixel in een keer uit."
      },
      "shape": "statement",
      "code": "strip.clear()\n"
    },
    {
      "type": "xrp_np_rainbow",
      "text": {
        "en": "rainbow across NeoPixel strip shifted by %1",
        "nl": "regenboog over NeoPixel-strip verschoven met %1"
      },
      "tooltip": {
        "en": "Spread a rainbow along the strip. Increase the shift a little at a time to make it move.",
        "nl": "Spreid een regenboog over de strip. Verhoog de verschuiving stap voor stap om hem te laten bewegen."
      },
      "args": [
        {
          "type": "number",
          "name": "OFFSET",
          "default": 0
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "strip.rainbow({OFFSET})\n"
    },
    {
      "type": "xrp_np_shift",
      "text": {
        "en": "shift NeoPixel strip by %1",
        "nl": "verschuif NeoPixel-strip met %1"
      },
      "tooltip": {
        "en": "Move the whole pattern along the strip and wrap it around.",
        "nl": "Verplaats het hele patroon over de strip en laat het rondlopen."
      },
      "args": [
        {
          "type": "number",
          "name": "STEP",
          "default": 1
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "strip.shift({STEP})\n"
    },
    {
      "type": "xrp_np_show",
      "text": {
        "en": "show NeoPixel changes",
        "nl": "toon NeoPixel-wijzigingen"
      },
      "tooltip": {
        "en": "Send the colours to the strip. Only needed when updating is set to \"only when I say show\".",
        "nl": "Stuur de kleuren naar de strip. Alleen nodig bij \"alleen als ik toon zeg\"."
      },
      "shape": "statement",
      "code": "strip.show()\n"
    },
    {
      "type": "xrp_np_auto_show",
      "text": {
        "en": "update NeoPixel strip %1",
        "nl": "werk NeoPixel-strip bij %1"
      },
      "tooltip": {
        "en": "Choose whether every change appears at once, or waits for the show block.",
        "nl": "Kies of elke wijziging meteen verschijnt of wacht op het toon-blok."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "MODE",
          "options": [
            {
              "label": {
                "en": "straight away",
                "nl": "meteen"
              },
              "value": "True"
            },
            {
              "label": {
                "en": "only when I say show",
                "nl": "alleen als ik toon zeg"
              },
              "value": "False"
            }
          ]
        }
      ],
      "shape": "statement",
      "code": "strip.set_auto_show({MODE})\n"
    },
    {
      "type": "xrp_np_count",
      "text": {
        "en": "number of NeoPixels",
        "nl": "aantal NeoPixels"
      },
      "tooltip": {
        "en": "How many pixels the strip was set up with.",
        "nl": "Hoeveel pixels de strip heeft."
      },
      "shape": "value",
      "returns": "Number",
      "order": "MEMBER",
      "code": "strip.count"
    }
  ],
  "toolbox": [
    {
      "block": "xrp_np_setup",
      "shadows": {
        "COUNT": 10
      }
    },
    {
      "block": "xrp_np_brightness",
      "shadows": {
        "PERCENT": 30
      }
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_np_colour"
    },
    {
      "block": "xrp_np_rgb",
      "shadows": {
        "RED": 255,
        "GREEN": 0,
        "BLUE": 0
      }
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_np_set_pixel",
      "shadows": {
        "INDEX": 0,
        "COLOUR": {
          "type": "xrp_np_colour",
          "fields": {
            "NAME": "red"
          }
        }
      }
    },
    {
      "block": "xrp_np_fill",
      "shadows": {
        "COLOUR": {
          "type": "xrp_np_colour",
          "fields": {
            "NAME": "blue"
          }
        }
      }
    },
    {
      "block": "xrp_np_clear"
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_np_rainbow",
      "shadows": {
        "OFFSET": 0
      }
    },
    {
      "block": "xrp_np_shift",
      "shadows": {
        "STEP": 1
      }
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_np_show"
    },
    {
      "block": "xrp_np_auto_show"
    },
    {
      "block": "xrp_np_count"
    }
  ]
}
```

### 3.9 The OLED screen (changes 15 and 16)


The first library written from scratch to the format in `devices/README.md`
rather than converted from existing code, and written without touching the IDE's
source. Change 16 then added nine blocks, a picture format and a whole drawing
tool, again with no change to the IDE. That was the test of whether the format
holds.

Twenty-two blocks: set up and clear; print, show on a line, show `label = value`,
write at x and y; arrow at N degrees, big text, show picture; pixel, line,
rectangle, circle, bar; update now, update mode, brightness, invert, screen on
and off; is connected, width, height.

Two design decisions to preserve:

- **A missing display does not raise.** Unlike `PCF8575.py`, the driver reports
  the problem on the console and then quietly does nothing, so a robot keeps
  driving when its screen falls off. `is_connected()` is how a program tells.
  The cost is that a program with no display looks like one that silently
  failed, so the Console tab is where the difference shows.
- **`circle()` uses the midpoint algorithm** rather than `framebuf.ellipse`, so
  the library does not depend on how new the firmware's `framebuf` is.

The arrow takes a compass angle with 0 up and 90 right, which is what the gyro
heading block reports, so that block plugs straight in.

**`lib/SSD1315.py`**

```python
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
```

The `driver.source` field is blank here and holds `SSD1315.py` in the real file, 20975 characters of it. Run `tools/embed_drivers.py` after copying this in, as Part B says, and it is filled from `lib/`.

**`devices/ssd1315-oled.json`**

```json
{
  "manifestVersion": 1,
  "id": "ssd1315-oled",
  "name": {
    "en": "OLED screen (SSD1315 / SSD1306)",
    "nl": "OLED-scherm (SSD1315 / SSD1306)"
  },
  "description": {
    "en": "128x64 monochrome OLED on the Qwiic connector. Text, numbers, drawing, a compass arrow and sketched pictures.",
    "nl": "128x64 monochroom OLED op de Qwiic-connector. Tekst, getallen, tekenen, een kompaspijl en getekende plaatjes."
  },
  "version": "2.1.0",
  "author": "XRP Blocks (Limpopo DoE fork)",
  "licence": "MIT",
  "homepage": "https://www.displaymodule.com/apps/resources/dm-oled096-636-controller-ic-datasheet",
  "category": {
    "key": "OLED",
    "label": {
      "en": "OLED",
      "nl": "OLED"
    },
    "colour": "#4DB6AC",
    "colourDark": "#00796B",
    "iconSvg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1.6 1.6v12.8h14.8V5.6z\"/><path d=\"M6.4 8h8v1.7h-8zm0 3.2h11.2v1.7H6.4zm0 3.2h6.4v1.7H6.4z\"/></svg>"
  },
  "driver": {
    "filename": "SSD1315.py",
    "marker": "SSD1315",
    "source": ""
  },
  "instance": {
    "name": "oled",
    "import": "from SSD1315 import SSD1315",
    "create": "SSD1315()",
    "createConfigured": "SSD1315(address={ADDR})"
  },
  "lists": {
    "lines": [
      {
        "label": "1",
        "value": "1"
      },
      {
        "label": "2",
        "value": "2"
      },
      {
        "label": "3",
        "value": "3"
      },
      {
        "label": "4",
        "value": "4"
      },
      {
        "label": "5",
        "value": "5"
      },
      {
        "label": "6",
        "value": "6"
      },
      {
        "label": "7",
        "value": "7"
      },
      {
        "label": "8",
        "value": "8"
      }
    ],
    "addresses": [
      {
        "label": "0x3C",
        "value": "0x3c"
      },
      {
        "label": "0x3D",
        "value": "0x3d"
      }
    ],
    "sizes": [
      {
        "label": {
          "en": "2x",
          "nl": "2x"
        },
        "value": "2"
      },
      {
        "label": {
          "en": "3x",
          "nl": "3x"
        },
        "value": "3"
      },
      {
        "label": {
          "en": "4x",
          "nl": "4x"
        },
        "value": "4"
      },
      {
        "label": {
          "en": "6x",
          "nl": "6x"
        },
        "value": "6"
      }
    ],
    "onoff": [
      {
        "label": {
          "en": "on",
          "nl": "aan"
        },
        "value": "ON",
        "code": "True"
      },
      {
        "label": {
          "en": "off",
          "nl": "uit"
        },
        "value": "OFF",
        "code": "False"
      }
    ],
    "fills": [
      {
        "label": {
          "en": "outline",
          "nl": "omtrek"
        },
        "value": "OUTLINE",
        "code": "False"
      },
      {
        "label": {
          "en": "filled",
          "nl": "gevuld"
        },
        "value": "FILLED",
        "code": "True"
      }
    ]
  },
  "blocks": [
    {
      "type": "xrp_oled_setup",
      "text": {
        "en": "set up OLED screen at address %1",
        "nl": "stel OLED-scherm in op adres %1"
      },
      "tooltip": {
        "en": "Find the OLED on a Qwiic connector. Almost every module is 0x3C; the link on the back changes it to 0x3D. Use this once, at the start.",
        "nl": "Zoek de OLED op een Qwiic-connector. Bijna elke module is 0x3C; de brug aan de achterkant maakt er 0x3D van. Gebruik dit een keer, aan het begin."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "ADDR",
          "options": "$addresses"
        }
      ],
      "shape": "statement",
      "configuresInstance": true,
      "code": ""
    },
    {
      "type": "xrp_oled_clear",
      "text": {
        "en": "clear the OLED screen",
        "nl": "wis het OLED-scherm"
      },
      "tooltip": {
        "en": "Wipe the screen and start printing from the top line again.",
        "nl": "Wis het scherm en begin weer bovenaan met printen."
      },
      "shape": "statement",
      "code": "oled.clear()\n"
    },
    {
      "type": "xrp_oled_print",
      "text": {
        "en": "OLED print %1",
        "nl": "OLED print %1"
      },
      "tooltip": {
        "en": "Print a line at the bottom, like the console. After eight lines the screen scrolls up.",
        "nl": "Print een regel onderaan, zoals de console. Na acht regels schuift het scherm omhoog."
      },
      "args": [
        {
          "type": "value",
          "name": "MESSAGE",
          "default": "''"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.println({MESSAGE})\n"
    },
    {
      "type": "xrp_oled_line",
      "text": {
        "en": "show %1 on OLED line %2",
        "nl": "toon %1 op OLED-regel %2"
      },
      "tooltip": {
        "en": "Put text on one of the eight lines, replacing whatever was there. Sixteen characters fit on a line.",
        "nl": "Zet tekst op een van de acht regels en vervang wat er stond. Er passen zestien tekens op een regel."
      },
      "args": [
        {
          "type": "value",
          "name": "MESSAGE",
          "default": "''"
        },
        {
          "type": "dropdown",
          "name": "LINE",
          "options": "$lines"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.write_line({MESSAGE}, {LINE})\n"
    },
    {
      "type": "xrp_oled_value",
      "text": {
        "en": "show %1 = %2 on OLED line %3",
        "nl": "toon %1 = %2 op OLED-regel %3"
      },
      "tooltip": {
        "en": "Show a named reading, like \"distance: 24\". Whole numbers lose their decimal point and long decimals are rounded to two places.",
        "nl": "Toon een meting met naam, zoals \"afstand: 24\". Hele getallen verliezen de komma en lange decimalen worden op twee cijfers afgerond."
      },
      "args": [
        {
          "type": "value",
          "name": "LABEL",
          "default": "''"
        },
        {
          "type": "value",
          "name": "VALUE",
          "default": "0"
        },
        {
          "type": "dropdown",
          "name": "LINE",
          "options": "$lines"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.write_value({LABEL}, {VALUE}, {LINE})\n"
    },
    {
      "type": "xrp_oled_at",
      "text": {
        "en": "write %1 on OLED at x %2 y %3",
        "nl": "schrijf %1 op OLED bij x %2 y %3"
      },
      "tooltip": {
        "en": "Put text anywhere by pixel. x runs 0 to 127 across, y runs 0 to 63 down. Nothing already on the screen is cleared.",
        "nl": "Zet tekst ergens neer per pixel. x loopt van 0 tot 127, y van 0 tot 63. Wat er al staat blijft staan."
      },
      "args": [
        {
          "type": "value",
          "name": "MESSAGE",
          "default": "''"
        },
        {
          "type": "number",
          "name": "X",
          "default": 0
        },
        {
          "type": "number",
          "name": "Y",
          "default": 0
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.write_at({MESSAGE}, {X}, {Y})\n"
    },
    {
      "type": "xrp_oled_show",
      "text": {
        "en": "update the OLED now",
        "nl": "werk de OLED nu bij"
      },
      "tooltip": {
        "en": "Send the picture to the screen. Only needed when updating is set to \"only when I say update\".",
        "nl": "Stuur de afbeelding naar het scherm. Alleen nodig bij \"alleen als ik bijwerk zeg\"."
      },
      "shape": "statement",
      "code": "oled.show()\n"
    },
    {
      "type": "xrp_oled_auto_show",
      "text": {
        "en": "update OLED %1",
        "nl": "werk OLED bij %1"
      },
      "tooltip": {
        "en": "Choose whether every change appears at once, or waits for the update block. Waiting is much faster when you write several lines in a row.",
        "nl": "Kies of elke wijziging meteen verschijnt of wacht op het bijwerk-blok. Wachten is veel sneller als je meerdere regels achter elkaar schrijft."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "MODE",
          "options": [
            {
              "label": {
                "en": "straight away",
                "nl": "meteen"
              },
              "value": "True"
            },
            {
              "label": {
                "en": "only when I say update",
                "nl": "alleen als ik bijwerk zeg"
              },
              "value": "False"
            }
          ]
        }
      ],
      "shape": "statement",
      "code": "oled.set_auto_show({MODE})\n"
    },
    {
      "type": "xrp_oled_brightness",
      "text": {
        "en": "set OLED brightness to %1 %%",
        "nl": "stel OLED-helderheid in op %1 %%"
      },
      "tooltip": {
        "en": "Brightness from 0 to 100 percent. The screen is easy to read well below 50, and a dim screen lasts longer.",
        "nl": "Helderheid van 0 tot 100 procent. Het scherm is ruim onder de 50 goed leesbaar, en een gedimd scherm gaat langer mee."
      },
      "args": [
        {
          "type": "number",
          "name": "PERCENT",
          "default": 50
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.set_brightness({PERCENT})\n"
    },
    {
      "type": "xrp_oled_invert",
      "text": {
        "en": "OLED colours %1",
        "nl": "OLED-kleuren %1"
      },
      "tooltip": {
        "en": "Swap lit and unlit pixels. What you have written stays where it is.",
        "nl": "Wissel brandende en donkere pixels om. Wat je hebt geschreven blijft staan."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "MODE",
          "options": [
            {
              "label": {
                "en": "normal",
                "nl": "normaal"
              },
              "value": "NORMAL",
              "code": "False"
            },
            {
              "label": {
                "en": "inverted",
                "nl": "omgekeerd"
              },
              "value": "INVERTED",
              "code": "True"
            }
          ]
        }
      ],
      "shape": "statement",
      "code": "oled.invert({MODE})\n"
    },
    {
      "type": "xrp_oled_power",
      "text": {
        "en": "switch the OLED screen %1",
        "nl": "zet het OLED-scherm %1"
      },
      "tooltip": {
        "en": "Switch the panel off to save current. The picture is kept and comes back when you switch it on.",
        "nl": "Zet het scherm uit om stroom te sparen. De afbeelding blijft bewaard en komt terug als je het aanzet."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "STATE",
          "options": [
            {
              "label": {
                "en": "on",
                "nl": "aan"
              },
              "value": "ON",
              "code": "True"
            },
            {
              "label": {
                "en": "off",
                "nl": "uit"
              },
              "value": "OFF",
              "code": "False"
            }
          ]
        }
      ],
      "shape": "statement",
      "code": "oled.power({STATE})\n"
    },
    {
      "type": "xrp_oled_arrow",
      "text": {
        "en": "show arrow on OLED pointing %1 degrees",
        "nl": "toon pijl op OLED die %1 graden wijst"
      },
      "tooltip": {
        "en": "0 is up, 90 is right, 180 is down, 270 is left. Plug the gyro heading block in and the arrow swings like a compass needle as the robot turns.",
        "nl": "0 is omhoog, 90 is rechts, 180 is omlaag, 270 is links. Sluit het gyro-kompasblok aan en de pijl draait mee als de robot draait."
      },
      "args": [
        {
          "type": "number",
          "name": "ANGLE",
          "default": 0
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.arrow({ANGLE})\n"
    },
    {
      "type": "xrp_oled_big",
      "text": {
        "en": "show %1 big on OLED, size %2",
        "nl": "toon %1 groot op OLED, grootte %2"
      },
      "tooltip": {
        "en": "The normal font blown up and centred. A \"^\" becomes a chunky arrow, and a countdown digit can be read from across the room.",
        "nl": "Het gewone lettertype vergroot en gecentreerd. Een \"^\" wordt een dikke pijl, en een aftelcijfer is van ver te lezen."
      },
      "args": [
        {
          "type": "value",
          "name": "MESSAGE",
          "default": "''"
        },
        {
          "type": "dropdown",
          "name": "SCALE",
          "options": "$sizes"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.big({MESSAGE}, {SCALE})\n"
    },
    {
      "type": "xrp_oled_picture",
      "text": {
        "en": "show picture %1 on OLED at x %2 y %3",
        "nl": "toon plaatje %1 op OLED bij x %2 y %3"
      },
      "tooltip": {
        "en": "Draw a picture you sketched with the mouse. Open tools/oled-designer.html, draw, press Copy for XRP Blocks, and paste it into the text block here.",
        "nl": "Teken een plaatje dat je met de muis hebt gemaakt. Open tools/oled-designer.html, teken, druk op Copy for XRP Blocks en plak het in het tekstblok hier."
      },
      "args": [
        {
          "type": "value",
          "name": "DATA",
          "default": "''"
        },
        {
          "type": "number",
          "name": "X",
          "default": 0
        },
        {
          "type": "number",
          "name": "Y",
          "default": 0
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.draw_picture({DATA}, {X}, {Y})\n"
    },
    {
      "type": "xrp_oled_pixel",
      "text": {
        "en": "set OLED pixel x %1 y %2 %3",
        "nl": "zet OLED-pixel x %1 y %2 %3"
      },
      "tooltip": {
        "en": "One dot. x runs 0 to 127 across, y runs 0 to 63 down.",
        "nl": "Een stip. x loopt van 0 tot 127, y van 0 tot 63."
      },
      "args": [
        {
          "type": "number",
          "name": "X",
          "default": 0
        },
        {
          "type": "number",
          "name": "Y",
          "default": 0
        },
        {
          "type": "dropdown",
          "name": "STATE",
          "options": "$onoff"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.set_pixel({X}, {Y}, {STATE})\n"
    },
    {
      "type": "xrp_oled_draw_line",
      "text": {
        "en": "OLED draw line from x %1 y %2 to x %3 y %4",
        "nl": "OLED teken lijn van x %1 y %2 naar x %3 y %4"
      },
      "tooltip": {
        "en": "A straight line between two points.",
        "nl": "Een rechte lijn tussen twee punten."
      },
      "args": [
        {
          "type": "number",
          "name": "X1",
          "default": 0
        },
        {
          "type": "number",
          "name": "Y1",
          "default": 0
        },
        {
          "type": "number",
          "name": "X2",
          "default": 127
        },
        {
          "type": "number",
          "name": "Y2",
          "default": 63
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.line({X1}, {Y1}, {X2}, {Y2})\n"
    },
    {
      "type": "xrp_oled_rect",
      "text": {
        "en": "OLED draw %1 rectangle at x %2 y %3 width %4 height %5",
        "nl": "OLED teken %1 rechthoek bij x %2 y %3 breedte %4 hoogte %5"
      },
      "tooltip": {
        "en": "A rectangle, either just the outline or solid.",
        "nl": "Een rechthoek, alleen de omtrek of gevuld."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "FILL",
          "options": "$fills"
        },
        {
          "type": "number",
          "name": "X",
          "default": 0
        },
        {
          "type": "number",
          "name": "Y",
          "default": 0
        },
        {
          "type": "number",
          "name": "W",
          "default": 40
        },
        {
          "type": "number",
          "name": "H",
          "default": 20
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.rect({X}, {Y}, {W}, {H}, {FILL})\n"
    },
    {
      "type": "xrp_oled_circle",
      "text": {
        "en": "OLED draw %1 circle at x %2 y %3 radius %4",
        "nl": "OLED teken %1 cirkel bij x %2 y %3 straal %4"
      },
      "tooltip": {
        "en": "A circle, either just the outline or solid. x and y are the middle.",
        "nl": "Een cirkel, alleen de omtrek of gevuld. x en y zijn het midden."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "FILL",
          "options": "$fills"
        },
        {
          "type": "number",
          "name": "X",
          "default": 64
        },
        {
          "type": "number",
          "name": "Y",
          "default": 32
        },
        {
          "type": "number",
          "name": "R",
          "default": 20
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.circle({X}, {Y}, {R}, {FILL})\n"
    },
    {
      "type": "xrp_oled_bar",
      "text": {
        "en": "OLED bar on line %1 showing %2 from %3 to %4",
        "nl": "OLED balk op regel %1 toont %2 van %3 tot %4"
      },
      "tooltip": {
        "en": "A bar across one text row that fills up as the reading rises. Good for a distance sensor or a battery level.",
        "nl": "Een balk over een tekstregel die voller wordt als de meting stijgt. Handig voor een afstandssensor of een accuniveau."
      },
      "args": [
        {
          "type": "dropdown",
          "name": "LINE",
          "options": "$lines"
        },
        {
          "type": "value",
          "name": "VALUE",
          "default": "0"
        },
        {
          "type": "number",
          "name": "MIN",
          "default": 0
        },
        {
          "type": "number",
          "name": "MAX",
          "default": 100
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.bar({VALUE}, {MIN}, {MAX}, {LINE})\n"
    },
    {
      "type": "xrp_oled_connected",
      "text": {
        "en": "OLED is connected",
        "nl": "OLED is aangesloten"
      },
      "tooltip": {
        "en": "True if the screen answers right now. A program keeps running with the screen unplugged, so this is how it can tell.",
        "nl": "Waar als het scherm nu antwoordt. Een programma loopt door zonder scherm, dus zo kan het dat merken."
      },
      "shape": "value",
      "returns": "Boolean",
      "order": "FUNCTION_CALL",
      "code": "oled.is_connected()"
    },
    {
      "type": "xrp_oled_width",
      "text": {
        "en": "OLED screen width",
        "nl": "OLED-schermbreedte"
      },
      "tooltip": {
        "en": "How many pixels across the screen is: 128.",
        "nl": "Hoeveel pixels het scherm breed is: 128."
      },
      "shape": "value",
      "returns": "Number",
      "order": "MEMBER",
      "code": "oled.width"
    },
    {
      "type": "xrp_oled_height",
      "text": {
        "en": "OLED screen height",
        "nl": "OLED-schermhoogte"
      },
      "tooltip": {
        "en": "How many pixels down the screen is: 64.",
        "nl": "Hoeveel pixels het scherm hoog is: 64."
      },
      "shape": "value",
      "returns": "Number",
      "order": "MEMBER",
      "code": "oled.height"
    },
    {
      "type": "xrp_oled_scroll_text",
      "text": {
        "en": "OLED scroll %1 on line %2 speed (pixels/sec) %3",
        "nl": "OLED schuif %1 op regel %2 snelheid (pixels/sec) %3"
      },
      "tooltip": {
        "en": "Put inside a forever loop with a short wait. Long text scrolls left and repeats; short text stays still. Speed 1–120 pixels/sec. Does not pause your program. In manual update mode, also use OLED update.",
        "nl": "Plaats in een herhaallus met een korte wachttijd. Lange tekst schuift en herhaalt; korte tekst blijft staan. Snelheid 1–120 pixels/sec. Gebruik bij handmatig bijwerken ook OLED update."
      },
      "args": [
        {
          "type": "value",
          "name": "MESSAGE",
          "default": "''"
        },
        {
          "type": "dropdown",
          "name": "LINE",
          "options": "$lines"
        },
        {
          "type": "number",
          "name": "SPEED",
          "default": 30
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "oled.scroll_text({MESSAGE}, {LINE}, {SPEED})\n"
    }
  ],
  "toolbox": [
    {
      "block": "xrp_oled_setup"
    },
    {
      "block": "xrp_oled_clear"
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_oled_print",
      "shadows": {
        "MESSAGE": "Hello XRP!"
      }
    },
    {
      "block": "xrp_oled_line",
      "shadows": {
        "MESSAGE": "Hello XRP!"
      }
    },
    {
      "block": "xrp_oled_scroll_text",
      "shadows": {
        "MESSAGE": "This message scrolls across the OLED",
        "SPEED": 30
      }
    },
    {
      "block": "xrp_oled_value",
      "shadows": {
        "LABEL": "distance",
        "VALUE": 0
      }
    },
    {
      "block": "xrp_oled_at",
      "shadows": {
        "MESSAGE": "XRP",
        "X": 0,
        "Y": 0
      }
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_oled_arrow",
      "shadows": {
        "ANGLE": 0
      }
    },
    {
      "block": "xrp_oled_big",
      "shadows": {
        "MESSAGE": "^"
      }
    },
    {
      "block": "xrp_oled_picture",
      "shadows": {
        "DATA": "",
        "X": 0,
        "Y": 0
      }
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_oled_pixel",
      "shadows": {
        "X": 0,
        "Y": 0
      }
    },
    {
      "block": "xrp_oled_draw_line",
      "shadows": {
        "X1": 0,
        "Y1": 0,
        "X2": 127,
        "Y2": 63
      }
    },
    {
      "block": "xrp_oled_rect",
      "shadows": {
        "X": 0,
        "Y": 0,
        "W": 40,
        "H": 20
      }
    },
    {
      "block": "xrp_oled_circle",
      "shadows": {
        "X": 64,
        "Y": 32,
        "R": 20
      }
    },
    {
      "block": "xrp_oled_bar",
      "shadows": {
        "VALUE": 0,
        "MIN": 0,
        "MAX": 100
      }
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_oled_show"
    },
    {
      "block": "xrp_oled_auto_show"
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_oled_brightness",
      "shadows": {
        "PERCENT": 50
      }
    },
    {
      "block": "xrp_oled_invert"
    },
    {
      "block": "xrp_oled_power"
    },
    {
      "gap": 16
    },
    {
      "block": "xrp_oled_connected"
    },
    {
      "block": "xrp_oled_width"
    },
    {
      "block": "xrp_oled_height"
    }
  ]
}
```

### 3.10 The sketch designer (change 16)


`tools/oled-designer.html` is a mouse-driven sketch pad the size of the screen.
It opens by double-clicking the file or at `/tools/oled-designer.html` on the
local server, and has no dependencies: everything is inline.

**Copy for XRP Blocks** puts a string on the clipboard to paste into the
`show picture` block, and the same string pastes back in to edit a drawing later.
The format is one line of plain text:

```
XRPI1:<width>:<height>:<base64>
```

The decoded bytes begin with a mode byte, 0 for raw and 1 for run-length pairs,
and the pixels are MONO_VLSB so they go straight to the panel. A blank 128 by 64
sketch is about forty characters; a noisy one falls back to raw at about
fourteen hundred.

**The encoder in this page and the decoder in `lib/SSD1315.py` are two separate
implementations of one format, in two languages.** That is where a silent drift
would hurt most, so it is checked directly: the page draws fourteen test
pictures and the driver's decoder must return the same pixels for every one, in
both compression modes. Keep that check if you change either side.

**`tools/oled-designer.html`**

```html
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OLED Designer — XRP Blocks</title>
  <meta name="description" content="Sketch a picture for the XRP's OLED screen and paste it into a block.">

  <link rel="icon" type="image/svg+xml"
    href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%234DB6AC'/><rect x='7' y='10' width='18' height='12' rx='2' fill='none' stroke='white' stroke-width='2'/></svg>">

  <style>
    :root {
      --bg: #1E2028;
      --surface: #242733;
      --surface-2: #2A2E3B;
      --border: #3A3F4F;
      --text: #E6E9F2;
      --text-dim: #9AA1B4;
      --accent: #4DB6AC;
      --accent-dark: #00796B;
      --danger: #E5556B;
      --radius: 10px;
      --font: 'Nunito', 'Segoe UI', system-ui, -apple-system, sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 15px;
      line-height: 1.5;
    }

    header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      padding: 0.9rem 1.25rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    header h1 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 800;
      letter-spacing: 0.01em;
    }

    header .sub {
      color: var(--text-dim);
      font-size: 0.82rem;
    }

    .spacer { flex: 1; }

    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 1.25rem;
      padding: 1.25rem;
      align-items: start;
    }

    @media (max-width: 900px) {
      main { grid-template-columns: minmax(0, 1fr); }
    }

    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem;
    }

    .panel h2 {
      margin: 0 0 0.75rem;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-dim);
    }

    .panel + .panel { margin-top: 1rem; }

    /* ── Toolbar ── */

    .tools {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 0.9rem;
    }

    button, select {
      font: inherit;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text);
      background: var(--surface-2);
      border: 1.5px solid var(--border);
      border-radius: 8px;
      padding: 0.45rem 0.7rem;
      cursor: pointer;
      transition: background 120ms, border-color 120ms, color 120ms;
    }

    button:hover, select:hover { border-color: var(--accent); }

    button.active {
      background: var(--accent-dark);
      border-color: var(--accent);
      color: #fff;
    }

    button.primary {
      background: var(--accent-dark);
      border-color: var(--accent-dark);
      color: #fff;
    }

    button.primary:hover { filter: brightness(1.15); }

    button.ghost { background: transparent; }

    button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      border-color: var(--border);
    }

    label.inline {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.85rem;
      color: var(--text-dim);
    }

    /* ── Canvas ── */

    .stage {
      background: #0D0F14;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.9rem;
      overflow: auto;
      display: flex;
      justify-content: center;
    }

    canvas {
      image-rendering: pixelated;
      display: block;
      touch-action: none;
      cursor: crosshair;
      background: #000;
    }

    .previews {
      display: flex;
      align-items: flex-end;
      gap: 1.25rem;
      flex-wrap: wrap;
    }

    .preview-item {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .preview-item span {
      font-size: 0.72rem;
      color: var(--text-dim);
    }

    .preview-item canvas {
      border: 1px solid var(--border);
      border-radius: 4px;
    }

    /* ── Export ── */

    textarea {
      width: 100%;
      min-height: 96px;
      resize: vertical;
      font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
      font-size: 0.72rem;
      line-height: 1.45;
      color: var(--text);
      background: var(--surface-2);
      border: 1.5px solid var(--border);
      border-radius: 8px;
      padding: 0.6rem;
      word-break: break-all;
    }

    textarea:focus { outline: none; border-color: var(--accent); }

    .row {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.6rem;
      flex-wrap: wrap;
    }

    .hint {
      margin: 0.75rem 0 0;
      font-size: 0.78rem;
      color: var(--text-dim);
    }

    .hint code {
      background: var(--surface-2);
      border-radius: 4px;
      padding: 0.05rem 0.3rem;
      font-size: 0.92em;
    }

    .status {
      margin-top: 0.6rem;
      min-height: 1.2em;
      font-size: 0.78rem;
      color: var(--accent);
    }

    .status.error { color: var(--danger); }

    .keys {
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.78rem;
      color: var(--text-dim);
    }

    .keys li {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.15rem 0;
    }

    .keys kbd {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-bottom-width: 2px;
      border-radius: 4px;
      padding: 0 0.35rem;
      font-family: inherit;
      font-size: 0.92em;
      color: var(--text);
    }
  </style>
</head>

<body>
  <header>
    <h1>OLED Designer</h1>
    <span class="sub">Sketch a picture, copy it into a <strong>show picture</strong> block</span>
    <span class="spacer"></span>
    <label class="inline">
      Size
      <select id="size">
        <option value="128x64" selected>128 x 64 — whole screen</option>
        <option value="64x32">64 x 32</option>
        <option value="32x32">32 x 32</option>
        <option value="32x16">32 x 16</option>
        <option value="16x16">16 x 16</option>
        <option value="8x8">8 x 8</option>
      </select>
    </label>
    <label class="inline">
      Zoom
      <select id="zoom">
        <option value="4">4x</option>
        <option value="6">6x</option>
        <option value="8" selected>8x</option>
        <option value="12">12x</option>
        <option value="16">16x</option>
      </select>
    </label>
    <label class="inline">
      <input type="checkbox" id="grid" checked> grid
    </label>
  </header>

  <main>
    <section>
      <div class="panel">
        <h2>Draw</h2>
        <div class="tools" id="tools">
          <button data-tool="pencil" class="active">Pencil</button>
          <button data-tool="eraser">Eraser</button>
          <button data-tool="line">Line</button>
          <button data-tool="rect">Rectangle</button>
          <button data-tool="rectfill">Filled rect</button>
          <button data-tool="circle">Circle</button>
          <button data-tool="circlefill">Filled circle</button>
        </div>
        <div class="tools">
          <button id="undo" class="ghost" disabled>Undo</button>
          <button id="redo" class="ghost" disabled>Redo</button>
          <button id="invert" class="ghost">Invert</button>
          <button id="fill" class="ghost">Fill all</button>
          <button id="clear" class="ghost">Clear</button>
        </div>
        <div class="stage">
          <canvas id="editor"></canvas>
        </div>
      </div>

      <div class="panel">
        <h2>Actual size on the screen</h2>
        <div class="previews">
          <div class="preview-item">
            <span>1 : 1</span>
            <canvas id="preview1"></canvas>
          </div>
          <div class="preview-item">
            <span>2 : 1</span>
            <canvas id="preview2"></canvas>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="panel">
        <h2>Block text</h2>
        <textarea id="output" readonly spellcheck="false"></textarea>
        <div class="row">
          <button id="copy" class="primary">Copy for XRP Blocks</button>
          <button id="download" class="ghost">Save as .txt</button>
        </div>
        <div class="status" id="status"></div>
        <p class="hint">
          Paste this into the text socket of the <code>show picture</code> block
          in the OLED category. It is plain text, so it travels in an email or a
          lesson file just as well.
        </p>
      </div>

      <div class="panel">
        <h2>Open an existing picture</h2>
        <textarea id="input" spellcheck="false" placeholder="Paste an XRPI1:... string here"></textarea>
        <div class="row">
          <button id="load">Load it</button>
          <button id="paste" class="ghost">Paste from clipboard</button>
        </div>
        <div class="status" id="load-status"></div>
      </div>

      <div class="panel">
        <h2>Keyboard</h2>
        <ul class="keys">
          <li><span>Undo</span><kbd>Ctrl</kbd> + <kbd>Z</kbd></li>
          <li><span>Redo</span><kbd>Ctrl</kbd> + <kbd>Y</kbd></li>
          <li><span>Pencil, eraser</span><kbd>P</kbd> <kbd>E</kbd></li>
          <li><span>Line, rectangle, circle</span><kbd>L</kbd> <kbd>R</kbd> <kbd>C</kbd></li>
          <li><span>Erase while drawing</span><kbd>right mouse</kbd></li>
        </ul>
      </div>
    </section>
  </main>

  <script>
    'use strict';

    // ── The picture ────────────────────────────────────────────────────────
    // Kept as one byte per pixel while editing, because that is far easier to
    // reason about. It is packed into the screen's own MONO_VLSB layout only
    // when the block text is produced.

    const state = {
      width: 128,
      height: 64,
      pixels: null,
      tool: 'pencil',
      zoom: 8,
      grid: true,
      drawing: false,
      erasing: false,
      start: null,
      undo: [],
      redo: [],
    };

    const editor = document.getElementById('editor');
    const context = editor.getContext('2d');
    const preview1 = document.getElementById('preview1');
    const preview2 = document.getElementById('preview2');
    const output = document.getElementById('output');
    const status = document.getElementById('status');
    const loadStatus = document.getElementById('load-status');

    function blank(width, height) {
      return new Uint8Array(width * height);
    }

    function resize(width, height) {
      state.width = width;
      state.height = height;
      state.pixels = blank(width, height);
      state.undo = [];
      state.redo = [];
      updateHistoryButtons();
      layout();
      redraw();
    }

    function layout() {
      editor.width = state.width * state.zoom;
      editor.height = state.height * state.zoom;
      preview1.width = state.width;
      preview1.height = state.height;
      preview2.width = state.width * 2;
      preview2.height = state.height * 2;
    }

    // ── Drawing on screen ──────────────────────────────────────────────────

    function redraw(overlay) {
      const { width, height, zoom } = state;
      const shown = overlay || state.pixels;

      context.fillStyle = '#000';
      context.fillRect(0, 0, editor.width, editor.height);

      context.fillStyle = '#DFF6F3';
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (shown[y * width + x]) {
            context.fillRect(x * zoom, y * zoom, zoom, zoom);
          }
        }
      }

      if (state.grid && zoom >= 4) {
        context.strokeStyle = 'rgba(120, 132, 160, 0.28)';
        context.lineWidth = 1;
        context.beginPath();
        for (let x = 0; x <= width; x++) {
          context.moveTo(x * zoom + 0.5, 0);
          context.lineTo(x * zoom + 0.5, height * zoom);
        }
        for (let y = 0; y <= height; y++) {
          context.moveTo(0, y * zoom + 0.5);
          context.lineTo(width * zoom, y * zoom + 0.5);
        }
        context.stroke();

        // Every eighth row is a page boundary on the real screen, and every
        // eighth column is one character of the font.
        context.strokeStyle = 'rgba(77, 182, 172, 0.45)';
        context.beginPath();
        for (let x = 0; x <= width; x += 8) {
          context.moveTo(x * zoom + 0.5, 0);
          context.lineTo(x * zoom + 0.5, height * zoom);
        }
        for (let y = 0; y <= height; y += 8) {
          context.moveTo(0, y * zoom + 0.5);
          context.lineTo(width * zoom, y * zoom + 0.5);
        }
        context.stroke();
      }

      drawPreview(preview1, shown, 1);
      drawPreview(preview2, shown, 2);
      output.value = encode(state.pixels, state.width, state.height);
    }

    function drawPreview(canvas, pixels, scale) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#DFF6F3';
      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          if (pixels[y * state.width + x]) {
            ctx.fillRect(x * scale, y * scale, scale, scale);
          }
        }
      }
    }

    // ── Pixel operations ───────────────────────────────────────────────────

    function setPixel(target, x, y, value) {
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) return;
      target[y * state.width + x] = value;
    }

    function drawLine(target, x1, y1, x2, y2, value) {
      // Bresenham, the same shape framebuf draws on the robot.
      let dx = Math.abs(x2 - x1);
      let dy = -Math.abs(y2 - y1);
      const sx = x1 < x2 ? 1 : -1;
      const sy = y1 < y2 ? 1 : -1;
      let error = dx + dy;
      for (;;) {
        setPixel(target, x1, y1, value);
        if (x1 === x2 && y1 === y2) break;
        const e2 = 2 * error;
        if (e2 >= dy) { error += dy; x1 += sx; }
        if (e2 <= dx) { error += dx; y1 += sy; }
      }
    }

    function drawRect(target, x1, y1, x2, y2, value, filled) {
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      if (filled) {
        for (let y = top; y <= bottom; y++) {
          for (let x = left; x <= right; x++) setPixel(target, x, y, value);
        }
      } else {
        drawLine(target, left, top, right, top, value);
        drawLine(target, left, bottom, right, bottom, value);
        drawLine(target, left, top, left, bottom, value);
        drawLine(target, right, top, right, bottom, value);
      }
    }

    function drawCircle(target, cx, cy, radius, value, filled) {
      // Midpoint circle, matching the driver's circle() on the robot.
      let x = radius;
      let y = 0;
      let error = 1 - radius;
      if (radius < 0) return;
      while (x >= y) {
        if (filled) {
          for (let i = cx - x; i <= cx + x; i++) {
            setPixel(target, i, cy + y, value);
            setPixel(target, i, cy - y, value);
          }
          for (let i = cx - y; i <= cx + y; i++) {
            setPixel(target, i, cy + x, value);
            setPixel(target, i, cy - x, value);
          }
        } else {
          [[x, y], [y, x], [-x, y], [-y, x], [-x, -y], [-y, -x], [x, -y], [y, -x]]
            .forEach(([ox, oy]) => setPixel(target, cx + ox, cy + oy, value));
        }
        y++;
        if (error < 0) {
          error += 2 * y + 1;
        } else {
          x--;
          error += 2 * (y - x) + 1;
        }
      }
    }

    function applyTool(target, from, to, value) {
      switch (state.tool) {
        case 'pencil':
        case 'eraser':
          drawLine(target, from.x, from.y, to.x, to.y, value);
          break;
        case 'line':
          drawLine(target, from.x, from.y, to.x, to.y, value);
          break;
        case 'rect':
          drawRect(target, from.x, from.y, to.x, to.y, value, false);
          break;
        case 'rectfill':
          drawRect(target, from.x, from.y, to.x, to.y, value, true);
          break;
        case 'circle':
        case 'circlefill': {
          const radius = Math.round(Math.hypot(to.x - from.x, to.y - from.y));
          drawCircle(target, from.x, from.y, radius, value, state.tool === 'circlefill');
          break;
        }
      }
    }

    const isFreehand = () => state.tool === 'pencil' || state.tool === 'eraser';

    // ── History ────────────────────────────────────────────────────────────

    function pushUndo() {
      state.undo.push(state.pixels.slice());
      if (state.undo.length > 60) state.undo.shift();
      state.redo = [];
      updateHistoryButtons();
    }

    function updateHistoryButtons() {
      document.getElementById('undo').disabled = state.undo.length === 0;
      document.getElementById('redo').disabled = state.redo.length === 0;
    }

    // ── Mouse ──────────────────────────────────────────────────────────────

    function pointOf(event) {
      const rect = editor.getBoundingClientRect();
      const scale = editor.width / rect.width;
      return {
        x: Math.floor((event.clientX - rect.left) * scale / state.zoom),
        y: Math.floor((event.clientY - rect.top) * scale / state.zoom),
      };
    }

    editor.addEventListener('contextmenu', (e) => e.preventDefault());

    editor.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      editor.setPointerCapture(event.pointerId);
      pushUndo();
      state.drawing = true;
      state.erasing = event.button === 2 || state.tool === 'eraser';
      state.start = pointOf(event);

      if (isFreehand()) {
        applyTool(state.pixels, state.start, state.start, state.erasing ? 0 : 1);
        redraw();
      }
    });

    editor.addEventListener('pointermove', (event) => {
      if (!state.drawing) return;
      const point = pointOf(event);
      const value = state.erasing ? 0 : 1;

      if (isFreehand()) {
        applyTool(state.pixels, state.start, point, value);
        state.start = point;
        redraw();
      } else {
        const overlay = state.pixels.slice();
        applyTool(overlay, state.start, point, value);
        redraw(overlay);
      }
    });

    editor.addEventListener('pointerup', (event) => {
      if (!state.drawing) return;
      const point = pointOf(event);
      if (!isFreehand()) {
        applyTool(state.pixels, state.start, point, state.erasing ? 0 : 1);
      }
      state.drawing = false;
      state.start = null;
      redraw();
    });

    editor.addEventListener('pointercancel', () => {
      state.drawing = false;
      state.start = null;
      redraw();
    });

    // ── Encoding, matched byte for byte by SSD1315.py ───────────────────────

    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    function toBase64(bytes) {
      let out = '';
      for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i];
        const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
        out += B64[a >> 2];
        out += B64[((a & 3) << 4) | (b >> 4)];
        out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
        out += i + 2 < bytes.length ? B64[c & 63] : '=';
      }
      return out;
    }

    function fromBase64(text) {
      const out = [];
      let accumulator = 0;
      let bits = 0;
      for (const char of text) {
        if (char === '=') break;
        const index = B64.indexOf(char);
        if (index < 0) continue;
        accumulator = (accumulator << 6) | index;
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          out.push((accumulator >> bits) & 0xFF);
        }
      }
      return Uint8Array.from(out);
    }

    /** One byte per eight vertical pixels, which is what the SSD1315 wants. */
    function pack(pixels, width, height) {
      const pages = height / 8;
      const packed = new Uint8Array(width * pages);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (pixels[y * width + x]) {
            packed[(y >> 3) * width + x] |= 1 << (y & 7);
          }
        }
      }
      return packed;
    }

    function unpack(packed, width, height) {
      const pixels = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const byte = packed[(y >> 3) * width + x] || 0;
          pixels[y * width + x] = (byte >> (y & 7)) & 1;
        }
      }
      return pixels;
    }

    function runLength(bytes) {
      const out = [];
      let i = 0;
      while (i < bytes.length) {
        const value = bytes[i];
        let run = 1;
        while (i + run < bytes.length && bytes[i + run] === value && run < 255) run++;
        out.push(run, value);
        i += run;
      }
      return Uint8Array.from(out);
    }

    function encode(pixels, width, height) {
      const packed = pack(pixels, width, height);
      const rle = runLength(packed);
      // Whichever is smaller wins; a mostly blank sketch shrinks enormously,
      // a noisy one would grow, so raw stays available.
      const useRle = rle.length < packed.length;
      const body = useRle ? rle : packed;
      const payload = new Uint8Array(body.length + 1);
      payload[0] = useRle ? 1 : 0;
      payload.set(body, 1);
      return `XRPI1:${width}:${height}:${toBase64(payload)}`;
    }

    function decode(text) {
      const trimmed = String(text).trim();
      if (!trimmed.startsWith('XRPI1:')) {
        throw new Error('That does not look like a picture string (it should start with XRPI1:).');
      }
      const parts = trimmed.split(':');
      if (parts.length < 4) throw new Error('The picture text is incomplete.');

      const width = parseInt(parts[1], 10);
      const height = parseInt(parts[2], 10);
      if (!width || !height || height % 8) {
        throw new Error('The size in the text is not usable.');
      }

      const raw = fromBase64(parts[3]);
      if (!raw.length) throw new Error('There is no picture in that text.');

      let body;
      if (raw[0] === 0) {
        body = raw.slice(1);
      } else {
        const out = [];
        for (let i = 1; i + 1 < raw.length; i += 2) {
          for (let n = 0; n < raw[i]; n++) out.push(raw[i + 1]);
        }
        body = Uint8Array.from(out);
      }

      const needed = width * (height / 8);
      if (body.length < needed) {
        throw new Error(`The picture is short: ${body.length} bytes for a ${width}x${height} that needs ${needed}.`);
      }
      return { width, height, pixels: unpack(body, width, height) };
    }

    // ── Buttons ────────────────────────────────────────────────────────────

    document.getElementById('tools').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-tool]');
      if (!button) return;
      state.tool = button.dataset.tool;
      document.querySelectorAll('#tools button').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
    });

    document.getElementById('size').addEventListener('change', (event) => {
      const [width, height] = event.target.value.split('x').map(Number);
      resize(width, height);
    });

    document.getElementById('zoom').addEventListener('change', (event) => {
      state.zoom = Number(event.target.value);
      layout();
      redraw();
    });

    document.getElementById('grid').addEventListener('change', (event) => {
      state.grid = event.target.checked;
      redraw();
    });

    document.getElementById('undo').addEventListener('click', () => {
      if (!state.undo.length) return;
      state.redo.push(state.pixels.slice());
      state.pixels = state.undo.pop();
      updateHistoryButtons();
      redraw();
    });

    document.getElementById('redo').addEventListener('click', () => {
      if (!state.redo.length) return;
      state.undo.push(state.pixels.slice());
      state.pixels = state.redo.pop();
      updateHistoryButtons();
      redraw();
    });

    document.getElementById('clear').addEventListener('click', () => {
      pushUndo();
      state.pixels.fill(0);
      redraw();
    });

    document.getElementById('fill').addEventListener('click', () => {
      pushUndo();
      state.pixels.fill(1);
      redraw();
    });

    document.getElementById('invert').addEventListener('click', () => {
      pushUndo();
      for (let i = 0; i < state.pixels.length; i++) {
        state.pixels[i] = state.pixels[i] ? 0 : 1;
      }
      redraw();
    });

    function say(element, message, isError) {
      element.textContent = message;
      element.classList.toggle('error', Boolean(isError));
      clearTimeout(element._timer);
      element._timer = setTimeout(() => { element.textContent = ''; }, 4000);
    }

    document.getElementById('copy').addEventListener('click', async () => {
      const text = output.value;
      try {
        await navigator.clipboard.writeText(text);
        say(status, 'Copied. Paste it into the show picture block.');
      } catch (err) {
        // Opened straight from a folder rather than served, most likely.
        output.removeAttribute('readonly');
        output.select();
        const ok = document.execCommand && document.execCommand('copy');
        output.setAttribute('readonly', '');
        say(status,
          ok ? 'Copied. Paste it into the show picture block.'
             : 'Could not reach the clipboard — select the text above and copy it yourself.',
          !ok);
      }
    });

    document.getElementById('download').addEventListener('click', () => {
      const blob = new Blob([output.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `oled-picture-${state.width}x${state.height}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      say(status, 'Saved.');
    });

    document.getElementById('load').addEventListener('click', () => {
      const text = document.getElementById('input').value;
      try {
        const picture = decode(text);
        pushUndo();
        state.width = picture.width;
        state.height = picture.height;
        state.pixels = picture.pixels;
        const size = `${picture.width}x${picture.height}`;
        const select = document.getElementById('size');
        if ([...select.options].some((o) => o.value === size)) select.value = size;
        layout();
        redraw();
        say(loadStatus, `Loaded a ${size} picture.`);
      } catch (err) {
        say(loadStatus, err.message, true);
      }
    });

    document.getElementById('paste').addEventListener('click', async () => {
      try {
        document.getElementById('input').value = await navigator.clipboard.readText();
        say(loadStatus, 'Pasted — now press Load it.');
      } catch (err) {
        say(loadStatus, 'Could not read the clipboard; paste into the box yourself.', true);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        document.getElementById('undo').click();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        document.getElementById('redo').click();
        return;
      }

      const shortcuts = { p: 'pencil', e: 'eraser', l: 'line', r: 'rect', c: 'circle' };
      const tool = shortcuts[event.key.toLowerCase()];
      if (tool) {
        const button = document.querySelector(`#tools button[data-tool="${tool}"]`);
        if (button) button.click();
      }
    });

    // Exposed so the verification harness can drive the same code the page uses.
    window.oledDesigner = { state, encode, decode, pack, unpack, toBase64, fromBase64 };

    resize(128, 64);
  </script>
</body>

</html>
```

### 3.11 Files that are no longer part of the installation

If you are updating an existing copy rather than replicating from clean, delete
these. Nothing imports them. They were the PCF8575 and NeoPixel categories
before change 14 moved those into the device library format, and the embedded
driver copies that `tools/embed_drivers.py` replaced.

```
js/blockly/blocks/expander.js        js/blockly/generators/expander.js
js/blockly/blocks/neopixel.js        js/blockly/generators/neopixel.js
js/lib/pcf8575-source.js             js/lib/neopixel-source.js
```

`apply_patches.py` from the previous revision of this guide is also gone;
`index.html` and `css/index.css` are given whole in section 3.7 instead.

`lib/PCF8575.py` and `lib/NeoPixelStrip.py` stay. They are the readable copy of
each driver and the source `tools/embed_drivers.py` reads.

---

## 4. Part B: fill in the drivers


Each manifest carries its driver inline so that one JSON file is a complete,
shareable library. The driver is also an ordinary `.py` file in `lib/`, which is
the readable copy and the one to edit. Keeping the same code in two places is
how things drift, so the `.py` file is the source of truth and this script
copies it into the manifest.

The manifests in section 3.8 and 3.9 are printed with `driver.source` blank, to
keep this document to a readable size. Run this once after copying them in:

```bash
python tools/embed_drivers.py            # fill devices/*.json from lib/*.py
python tools/embed_drivers.py --check    # report drift, change nothing
```

`--check` exits non-zero if any manifest is out of step, which is what a build
would call. Running it is also the replication check: if the manifests you
copied in are correct, `--check` passes without writing anything.

**`tools/embed_drivers.py`**

```python
#!/usr/bin/env python3
"""Put the MicroPython drivers into the device manifests.

Each manifest in `devices/` carries its driver inline, so that one JSON file is
a complete, shareable library: email it to a colleague and they have the blocks
and the driver together. The driver is also kept as an ordinary `.py` file in
`lib/`, which is the readable copy and the one to edit.

Keeping the same code in two places is how things drift, so the `.py` file is
the source of truth and this script copies it into the manifest. Run it after
editing any driver.

    python tools/embed_drivers.py            # copy lib/*.py into devices/*.json
    python tools/embed_drivers.py --check    # report drift, change nothing

--check exits non-zero if any manifest is out of step, which is what a build
would call.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# manifest -> the driver file whose contents belong in its driver.source
DRIVERS = {
    'devices/remote-control.json': 'lib/RemoteControl.py',
    'devices/mecanum.json': 'lib/MecanumDrive.py',
    'devices/pcf8575.json': 'lib/PCF8575.py',
    'devices/neopixel.json': 'lib/NeoPixelStrip.py',
    'devices/ssd1315-oled.json': 'lib/SSD1315.py',
}


def render(manifest):
    """Serialise a manifest the way every manifest in devices/ is written."""
    return json.dumps(manifest, indent=2, ensure_ascii=False) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='report drift without writing anything')
    args = parser.parse_args()

    problems = []
    changed = []

    for manifest_path, driver_path in DRIVERS.items():
        manifest_file = ROOT / manifest_path
        driver_file = ROOT / driver_path

        if not manifest_file.exists():
            problems.append(f'{manifest_path} is missing')
            continue
        if not driver_file.exists():
            problems.append(f'{driver_path} is missing')
            continue

        manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
        driver = manifest.setdefault('driver', {})
        source = driver_file.read_text(encoding='utf-8')
        if driver_file.name == 'RemoteControl.py':
            page = (ROOT / 'tools/remote-control.html').read_text(encoding='utf-8')
            source = source.replace("PAGE = ''  # Filled from tools/remote-control.html by embed_drivers.py.",
                                    'PAGE = ' + repr(page))

        expected_name = Path(driver_path).name
        if driver.get('filename') != expected_name:
            problems.append(
                f'{manifest_path}: driver.filename is '
                f'{driver.get("filename")!r}, expected {expected_name!r}')

        before = manifest_file.read_text(encoding='utf-8')
        driver['source'] = source
        after = render(manifest)

        if before == after:
            continue

        if args.check:
            problems.append(f'{manifest_path} is out of step with {driver_path}')
        else:
            manifest_file.write_text(after, encoding='utf-8')
            changed.append(f'{manifest_path}  <-  {driver_path} '
                           f'({len(source)} characters)')

    for line in changed:
        print('updated', line)
    for line in problems:
        print('PROBLEM', line, file=sys.stderr)

    if problems:
        return 1
    if args.check:
        print(f'all {len(DRIVERS)} manifests match their drivers')
    elif not changed:
        print(f'all {len(DRIVERS)} manifests were already up to date')
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

The previous revision of this guide had an `apply_patches.py` here, which made
surgical edits to `index.html` and `css/index.css`. Both files are now given
whole in section 3.7 and that script is gone.

---

## 5. Part C: verification


Historical verification reported before these updates: eight harnesses, 913 checks. These harnesses are not present and have not been rerun for changes 19-28. See the current addendum for new checks.

Eight harnesses, 913 checks. Five of them drive the real IDE in headless
Chromium rather than testing a copy of the logic, which is the only way to catch
something like change 17: the generator was correct in isolation and wrong in
the application.

| Checks | Harness | What it proves |
|--------|---------|----------------|
| 353 | Manifests against the old code | The PCF8575 and NeoPixel manifests reproduce the hand-written blocks exactly: labels, shapes, arguments, dropdown options, the Python generated for every dropdown combination with sockets full and empty, toolbox shadows, driver source byte for byte, and eleven kinds of bad manifest being rejected |
| 44 | Library manager | Adding, removing, refusing removal while blocks are in use, clash detection, persistence across a reload, falling back to the stored copy when a fetch fails, and the contrast rule |
| 39 | The IDE end to end | The dialog, adding, categories, flyouts, generated Python, reload, dark mode, and the change 17 functions regression |
| 194 | Every block validated | All 48 registered blocks built in the real IDE and their Python checked against the XRPLib API, with every dropdown exercised through every option. The harness asks the IDE which blocks it has registered and fails if any is uncovered |
| 169 | The OLED driver | Against stand-ins for `framebuf` and `machine`: the initialisation sequence, the 1025 byte frame, line arithmetic, number formatting, the console scroll, brightness, both Qwiic buses, a missing display, a display that dies mid-run, the drawing primitives, arrow direction and symmetry, picture decoding, six malformed pictures |
| 32 | The designer page | Real mouse drags, every tool, undo and redo, shape preview not committing until release, fill and invert and clear, shortcuts, resizing, loading a string back |
| 44 | Cross-language | The designer draws fourteen test pictures and the driver's Python decoder must return the same pixels for every one, in both compression modes |
| 38 | The OLED in the IDE | The validator, adding from a file, all 22 blocks rendering, a compass program with the gyro plugged into the arrow, the picture string surviving a text block unaltered, dark contrast, removal |

Two patterns in these worth keeping if you rewrite them.

**Coverage is derived, not listed by hand.** The block validator asks the running
IDE for `Object.keys(Blockly.Blocks)` and fails if any registered block is not in
its expectations table. A block added later cannot slip through untested.

**The cross-language check compares implementations, not outputs against a
fixture.** The JavaScript encoder and the Python decoder are run against each
other on generated data. A fixture file would have frozen whatever both sides
did on the day it was written.

---

## 6. What the blocks generate


A few representative programs, as they come out of the Python panel.

**Servo, in degrees (change 18).** The helper is emitted once however many
servo blocks are used:

```python
def xrp_servo_degrees(servo, degrees):
  SAFE_LOW = 5
  SAFE_HIGH = 175
  if degrees < SAFE_LOW:
    degrees = SAFE_LOW
  elif degrees > SAFE_HIGH:
    degrees = SAFE_HIGH
  servo.set_angle(degrees * 10 / 9)

xrp_servo_degrees(servo_one, 90)      # centre
xrp_servo_degrees(servo_two, 45)
```

**Drive effort, in percent (change 18):**

```python
def xrp_effort(percent, lowest=-1):
  effort = percent / 100
  if effort < lowest:
    effort = lowest
  elif effort > 1:
    effort = 1
  return effort

drivetrain.straight(20, max_effort=xrp_effort(75, 0))
drivetrain.set_effort(xrp_effort(60), xrp_effort(-60))
drivetrain.arcade(xrp_effort(50), xrp_effort(25))
```

**A compass on the OLED**, with the gyro heading block plugged into the arrow:

```python
from XRPLib.defaults import board, imu
from SSD1315 import SSD1315

oled = SSD1315()

oled.clear()
oled.arrow(imu.get_heading())
oled.show()
```

**A function, which before change 17 was missing its definition entirely:**

```python
def GO_FORWARD():
  drivetrain.straight(25)

GO_FORWARD()
```

### Design decisions worth preserving

- **Retired block types stay registered.** Every block replaced by a dropdown,
  and the 0 to 1 motor effort block replaced by the percent one, still has a
  definition and a generator. They are simply absent from the toolbox, so saved
  work keeps loading. Breaking a teacher's saved lesson is worse than carrying a
  few dead block types.
- **Clamping lives in generated Python, not in the block.** The learner can read
  `xrp_effort` in the Python panel and see exactly what the limit is. A limit
  enforced invisibly inside the IDE teaches nothing.
- **Device libraries are data, never code.** A manifest cannot express a dynamic
  dropdown, a mutator, or arbitrary validation. That is the price of being able
  to accept a file from a stranger.
- **The device driver is installed by the IDE**, the first time a program
  mentions its marker, so there is no separate step in XRPCode or Thonny.

## 7. Known issues and limits


### Not fixed

- XRPLib's `straight()` and `turn()` return `True` or `False` for whether the
  goal was reached before the timeout. No block surfaces that, so a learner
  cannot yet ask "did I actually get there".
- `drivetrain.set_speed` is centimetres per second while `motor.set_speed` is
  revolutions per minute. The tooltips now say so, but the underlying asymmetry
  is XRPLib's and remains.
- The lesson system filters categories by `categoryKey`. A device library
  supplies its own key, so a lesson written against a library the learner has not
  added will simply not show that category.

### Confirmed on hardware

- The IDE end to end, deploy, the servo blocks and the gyro blocks, on a
  SparkFun XRP Controller running MicroPython v1.25.0-preview.beta06.
- **The OLED library, 19 September 2026: works as expected.** That settles three
  things that had been open: this firmware does have `framebuf`, the module
  answers at 0x3C, and the driver install path over the raw REPL works for a
  library-supplied driver.

### Still unconfirmed on hardware

- The PCF8575 and NeoPixel drivers. Unchanged in behaviour by the move to the
  library format, but still never run on a robot.
- The servo end stops. Whether 0 and 180 degrees move freely, or the servo buzzes
  against its stop. Widen or narrow `SAFE_LOW` and `SAFE_HIGH` accordingly.
- Which way a positive `arcade` turn steers. The source computes
  `left = straight - turn` and `right = straight + turn`, so a positive turn runs
  the right wheel faster; the tooltip says that rather than naming left or right,
  because two readings of that code disagreed about the result. Five minutes on
  the floor settles it.
- Gyro drift. Yaw, pitch and roll are unbounded degrees integrated from the gyro,
  so they accumulate and drift; heading is bounded 0 to 360 and wraps. If a
  lesson depends on pitch or roll after a few minutes of driving, measure the
  drift before building a worksheet on it.
- Redraw speed. An arrow redrawn in a tight loop sends 1025 bytes over I2C each
  pass. If it drags, set updating to "only when I say update" and use one update
  block per pass.
- Whether the board pin names `I2C_SDA_0` and `I2C_SCL_0` exist in this
  firmware. All three drivers fall back to raw GPIO numbers, which is the path
  that has been exercised.

### Reapplying after an upstream update

Diff upstream against `cd39757` first. The files most likely to conflict are
`js/app.js`, `js/blockly/toolbox.js` and `css/index.css`, because those are the
three that were changed most. `devices/`, `js/devices/`, `lib/` and `tools/` are
entirely local additions and will not conflict at all.

## 8. Sources

- NXP PCF8575 datasheet: <https://www.nxp.com/docs/en/data-sheet/PCF8575.pdf>
- XRPLib API reference: <https://open-stem.github.io/XRP_MicroPython/api.html>
- XRPLib source (imu.py, servo.py, encoded_motor.py, defaults.py):
  <https://github.com/Open-STEM/XRP_MicroPython>
- SparkFun XRP Controller hardware overview:
  <https://docs.sparkfun.com/SparkFun_XRP_Controller/hardware_overview/>
- MicroPython `neopixel` module:
  <https://docs.micropython.org/en/latest/library/neopixel.html>
- XRPBlocks upstream: <https://github.com/Stichting-STEAMup/XRPBlocks>


## 9. Current updates: changes 19-28

# XRPBlocks: updates through 20 September 2026

This is the current addendum to changes 1-18 in the replication guide. It records
the final implementation, including corrections made during testing. Earlier
PDF pages are retained as historical documentation; this addendum takes
precedence where behavior differs.

## 19. Onboard RGB colour and brightness

The Board category adds a named-colour dropdown with brightness from 0 to 100%.
Eleven choices match the NeoPixel palette, including off. Default brightness is
30%. Generated Python clamps brightness and scales RGB values. It requires no
NeoPixel add-on library. English and Dutch labels are available. The original
three-channel RGB block remains available.

## 20. Delete unused blocks

Right-click the workspace or a block and choose Delete unused blocks. Cleanup
removes disconnected stacks and unreachable functions. It preserves start
blocks, explicitly protected blocks, and functions called directly or indirectly
by retained code, including recursive calls. Default shadow inputs do not
incorrectly protect a disconnected stack. Deletion is grouped for Undo. The
option is disabled when there is nothing eligible to remove.

## 21. Bottom panel and variable cleanup

The whole Python/Console panel starts collapsed unless pinned. Both tabs offer
a shared pin control, remembered in the browser. Unpinning hides the panel.
Unpinned tabs open manually; Run and Deploy do not force them open. Clicking
elsewhere no longer dismisses a manually opened panel. Resizing preserves the
expanded size without overriding the collapsed height.

Variables with no references anywhere in the workspace are removed on app
startup and before Run. References in loose blocks and procedure parameters
are retained. Cleanup is grouped for Undo and the workspace is saved.

## 22. Remembered connection and uninterrupted startup

Connect first tries the last successful authorised USB or Bluetooth device.
USB uses the exact in-session port when possible; after reload it matches USB
vendor/product IDs only when a single authorised port matches. Missing,
ambiguous or failed connections return to the chooser. Bluetooth reuse depends
on browser support for previously authorised devices. Repeated Connect clicks
are guarded while connection work is in progress.

Connect no longer sends a stop/REPL-recovery command. This preserves a web
server or other main.py program already running on power-up. Stop remains
available whenever connected. Run, Stop and Deploy can interrupt execution.
Deploy saves main.py but does not run it: click Run or restart the board.

## 23. Mecanum wheels library, version 1.1.0

Four encoded motors drive standard X-pattern mecanum wheels. Default ports are
1 front-left, 2 front-right, 3 rear-left and 4 rear-right. The palette provides
two compact setup blocks: motor assignment and chassis geometry. The older
combined setup block remains registered for saved-project compatibility.

Controls include eight directions, arbitrary movement angle, continuous drive,
distance in centimetres, turning in degrees, Stop, wheel reversal and a
last-move-completed Boolean. Speed is 0-100% of configured maximum wheel RPM,
not a guarantee of chassis speed. Distance and turns use encoder estimates,
with timeouts and stopping on completion/interruption. Wheel diameter and
wheelbase/track defaults are placeholders that must be measured and calibrated.
Mecanum hardware operation has not been verified in this session.

## 24. Remote control library

Remote control is independent of motors and mecanum. Its MicroPython driver
hosts an HTML page on port 80, either through a robot hotspot or by joining an
existing network. The page has six customizable hold buttons, local label
editing, connection status and Release all buttons. Blocks read held state,
one-shot press events, connection status and page address, and configure labels,
title, networking, updates and shutdown.

An active controller sends heartbeat messages. Button reads become false after
one second without messages. This does not stop actuators by itself: user code
must handle the false/disconnected branch with Stop or Off. Only one controller
owns the inputs at a time; sequence numbers reject stale messages. The web
service is cooperative, not a background thread. Button/connection reads also
service it automatically; use remote update in loops without those reads.
Avoid long blocking commands while controlling devices live.

## 25. Remote page layout choice

Choose Button grid or Game D-pad on the page. The browser remembers the layout
and custom labels. Button mapping stays fixed: Up=1, Left=2, Right=3, Down=4,
A=5, B=6. Switching layout releases held states. Symbols do not assign any
motor behavior. Space/Enter operate a focused button; mouse and touch are supported.

## 26. Remote networking fixes, current driver 1.1.1

The XRP CYW43 hotspot uses WPA2 AES authentication flags (0x400004), replacing
an incorrect generic enum value. A previous RemoteControl instance is closed
before rebinding port 80 on a subsequent run. Startup prints its driver version,
network status and the actual HTTP address.

Join network resets the old station association, supports an empty password for
open networks, reports progress every five seconds, and has a 30-second timeout.
It distinguishes a rejected password, missing network and general connection
failure. Use 2.4 GHz Wi-Fi; a router-assigned address replaces the hotspot
address. Captive portal and enterprise login are not implemented.

Latest hardware evidence: the updated driver ran but reported that network
Fibre was not found. Join mode is therefore not confirmed working on that
network. The user previously reported the remote/upload setup working before
testing join mode. This is not evidence of complete hardware validation.

## 27. Confirmed USB file uploads and module refresh

USB uploads now write UTF-8 data in 256-byte chunks, represented as hex, with a
raw-REPL acknowledgement after each command. Data goes to a temporary .upload
file. The byte count is checked before renaming it over the destination. Failed
driver installation aborts Run/Deploy instead of silently continuing.

After a driver upload, the USB path removes its cached module from sys.modules
so the next import loads the new file. RemoteControl's previous listener is
closed first. main.py is not treated as an imported driver. This corrected logs
where 1.1.1 had uploaded but cached 1.1.0 still ran. Upload acknowledgements remain
visible in Console. Bluetooth retains its existing separate binary uploader;
these confirmed-write/module-refresh changes apply to USB.

## 28. OLED scrolling text, library version 2.1.0

New block: OLED scroll [message] on line [1] speed (pixels/sec) [30]. Place it
inside a forever loop with a short wait, for example 0.02 seconds. Long text
scrolls left, pauses at the ends and repeats. Text that fits stays still.
Speed is clamped to 1-120 pixels/second; each line has independent state. The
method returns immediately, allowing other loop work to continue. In manual
display-update mode, also call OLED update. Static line replacement or Clear
resets the corresponding scrolling state. Hardware scrolling remains unverified.

## Verification and outstanding work

Current committed tests: tools/test_mecanum.py (7 simulated tests) and
tools/test_remote_control.py (8 protocol/network tests). Driver embedding is
checked by tools/embed_drivers.py --check. Additional session checks covered
Blockly registration and Python generation, all library flyouts, phone-width
page rendering, button press/release, D-pad mapping and persistence, real local
HTTP requests through the Remote control driver, simulated USB transfers/errors,
and OLED scrolling with a stub framebuffer. These do not replace XRP hardware tests.

The previous guide's 913 checks are historical reported results, not a newly
rerun suite. The older harnesses are not present in this checkout. Outstanding:
join-network testing on a visible 2.4 GHz network, mecanum calibration and
hardware validation, OLED scrolling on the display, and Bluetooth driver-update
parity. The six legacy expander/NeoPixel files listed in section 3.11 of the guide
remain present but unused; they have not been deleted.

## Reproduce and use

Use the refreshed source snapshots in XRPBlocks-replication-guide.md together
with its new additional-files section. Run python tools/embed_drivers.py, then
python tools/embed_drivers.py --check. Start locally with start-xrpblocks.bat
or python serve.py; do not open index.html through file://.

For a library update: refresh the IDE, connect USB, then Run or Deploy to upload
the new driver. Deploy alone leaves the program stopped. For standalone use,
restart after deploying main.py. New libraries are added through Library.

Detailed usage: docs/mecanum.md and docs/remote-control.md. The OLED scroll block
tooltip explains loop placement and manual-update behavior.


## 10. Additional source files for replication

RemoteControl.py contains a page placeholder. The updated embed_drivers.py embeds tools/remote-control.html when building its manifest.

**`js/blockly/unused-blocks.js`**

```js
/** Find disconnected stacks and functions unreachable from a start block. */
export function unusedRoots(workspace) {
  const roots = workspace.getTopBlocks(false);
  const kept = new Set();
  const pending = roots.filter(root => root.type === 'xrp_start' ||
    // Default input values are shadow blocks: they cannot be deleted on their
    // own, but must not protect an otherwise unused stack from cleanup.
    root.getDescendants(false).some(block => !block.isShadow() && !block.isDeletable()));
  const definitions = roots.filter(root => typeof root.getProcedureDef === 'function');

  while (pending.length) {
    const root = pending.pop();
    if (kept.has(root)) continue;
    kept.add(root);
    for (const block of root.getDescendants(false)) {
      if (typeof block.getProcedureCall !== 'function') continue;
      const name = block.getProcedureCall();
      for (const definition of definitions) {
        if (Blockly.Names.equals(definition.getProcedureDef()[0], name)) {
          pending.push(definition);
        }
      }
    }
  }
  return roots.filter(root => !kept.has(root));
}

export function deleteUnusedBlocks(workspace) {
  const roots = unusedRoots(workspace);
  const previousGroup = Blockly.Events.getGroup();
  Blockly.Events.setGroup(true);
  try {
    for (const root of roots) root.dispose(false);
  } finally {
    Blockly.Events.setGroup(previousGroup);
  }
}

export function registerUnusedBlocksMenu(workspace) {
  const registry = Blockly.ContextMenuRegistry.registry;
  for (const scopeType of [Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
    Blockly.ContextMenuRegistry.ScopeType.BLOCK]) {
    const id = 'xrp_delete_unused_' + scopeType;
    if (registry.getItem(id)) registry.unregister(id);
    registry.register({
      id,
      scopeType,
      weight: 95,
      displayText: () => Blockly.Msg['XRP_DELETE_UNUSED'] || 'Delete unused blocks',
      preconditionFn: scope => {
        const target = scope.block?.workspace || scope.workspace;
        if (target !== workspace || target.isFlyout || target.options.readOnly) return 'hidden';
        return unusedRoots(target).length ? 'enabled' : 'disabled';
      },
      callback: () => deleteUnusedBlocks(workspace),
    });
  }
}
```

**`js/serial/last-connection.js`**

```js
const KEY = 'xrp_blocks_last_connection';
let lastDevice = null;
let lastSettings = null;

export function rememberConnection(mode, device) {
  lastDevice = device;
  lastSettings = mode === 'usb'
    ? { mode, info: device.getInfo() }
    : { mode, id: device.id };
  try { localStorage.setItem(KEY, JSON.stringify(lastSettings)); } catch { /* Session only. */ }
}

export async function getLastConnection() {
  let settings = lastSettings;
  if (!settings) {
    try { settings = JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }
  if (!settings) return null;
  if (settings.mode === 'usb' && navigator.serial?.getPorts) {
    const ports = await navigator.serial.getPorts();
    if (lastDevice && ports.includes(lastDevice)) return { mode: 'usb', device: lastDevice };
    // Serial exposes product IDs, not a stable per-device ID. Never guess when
    // multiple authorised ports match (e.g. two identical classroom robots).
    if (!settings.info || settings.info.usbVendorId === undefined) return null;
    const matches = ports.filter(port => {
      const info = port.getInfo();
      return info.usbVendorId === settings.info.usbVendorId &&
        info.usbProductId === settings.info.usbProductId;
    });
    return matches.length === 1 ? { mode: 'usb', device: matches[0] } : null;
  }
  if (settings.mode === 'bluetooth' && navigator.bluetooth) {
    const devices = navigator.bluetooth.getDevices
      ? await navigator.bluetooth.getDevices() : (lastDevice ? [lastDevice] : []);
    const device = devices.find(item => item.id === settings.id);
    return device ? { mode: 'bluetooth', device } : null;
  }
  return null;
}
```

**`js/serial/base-transport.js`**

```js
/**
 * XRP Blocks — Base Transport
 * Shared MicroPython raw-REPL protocol logic.
 * Subclasses (XRPSerial, XRPBluetooth) implement connect / disconnect / send / _startReading.
 */

export class XRPTransportBase {
  constructor() {
    this.connected = false;
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();

    // Event callbacks (assigned by app.js)
    this.onConnect = null;
    this.onDisconnect = null;
    this.onData = null;
    this.onError = null;

    // Shared incoming-data buffer backing _waitForResponse()/checkPrompt().
    // XRPBluetooth overrides these with its own GATT-aware buffer.
    this._rxBuffer = '';
    this._rxWaiters = []; // [{ pattern, resolve, timer }]
  }

  // ── Abstract interface (must be implemented by subclass) ──────────────────

  /**
   * Open the physical connection and begin reading.
   * Subclass must set this.connected = true and call this.onConnect?.() when ready.
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Close the physical connection.
   * Subclass must set this.connected = false and call this.onDisconnect?.() when done.
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Send raw bytes to the device.
   * @param {string} data - UTF-8 string to encode and send
   */
  async send(data) {
    throw new Error('send() must be implemented by subclass');
  }

  // ── Shared MicroPython REPL protocol ──────────────────────────────────────

  /**
   * Interrupt any running program (Ctrl+C ×2)
   */
  async interrupt() {
    await this.send('\r\x03\x03');
    await this._delay(200);
  }

  /**
   * Enter raw REPL mode (Ctrl+A)
   */
  async enterRawRepl() {
    await this.interrupt();
    await this.send('\r\x01');
    await this._delay(200);
  }

  /**
   * Exit raw REPL mode back to normal (Ctrl+B)
   */
  async exitRawRepl() {
    await this.send('\x02');
    await this._delay(200);
  }

  /**
   * Execute Python code on the XRP via raw REPL
   * @param {string} pythonCode
   */
  async executeCode(pythonCode) {
    if (!this.connected) {
      throw new Error('Not connected to XRP');
    }

    try {
      await this.enterRawRepl();
      await this.send(pythonCode);
      await this._delay(50);
      await this.send('\x04'); // Ctrl+D — execute
      await this._delay(200);
    } catch (err) {
      if (this.onError) this.onError(err);
      throw err;
    } finally {
      // Always try to leave raw REPL, even if something above threw — otherwise
      // the board is left stuck in raw REPL and stops responding to the REPL.
      await this.exitRawRepl().catch(() => {});
    }
  }

  /**
   * Stop a running program and confirm the REPL is responsive again.
   *
   * A Ctrl+C interrupt only stops Python execution — it does not turn off a
   * motor that's already spinning, since interrupting mid-instruction (e.g.
   * inside an encoder poll) skips straight to the exception handler without
   * ever reaching a "stop motor" call. The official XRP web IDE hits this
   * same gap and works around it the same way: once the REPL is confirmed
   * back, explicitly force the robot's actuators to a safe stopped state.
   * @returns {Promise<boolean>} true once the board is confirmed idle at the REPL
   */
  async stopExecution() {
    if (!this.connected) return false;
    const atRepl = await this.getToREPL();
    if (atRepl) {
      await this._resetHardware();
    }
    return atRepl;
  }

  /**
   * Force motors/servos back to a safe, stopped state via XRPLib's hard
   * reset helper. Not every firmware build is guaranteed to have it, so a
   * failure here is reported but doesn't fail the overall stop.
   */
  async _resetHardware() {
    try {
      await this.executeCode(
        "import sys\n" +
        "if 'XRPLib.resetbot' in sys.modules:\n" +
        "    del sys.modules['XRPLib.resetbot']\n" +
        "from XRPLib.resetbot import reset_hard\n" +
        "reset_hard()\n"
      );
    } catch (err) {
      if (this.onError) this.onError(err);
    }
  }

  // ── Incoming-data buffering (used to detect REPL prompts) ───────────────────

  /**
   * Feed a chunk of incoming data through the shared response buffer, then
   * forward it to the app's onData callback. Subclasses' read loops should
   * call this instead of invoking onData directly, so checkPrompt()/
   * getToREPL() can see the board's output.
   */
  _feedIncomingData(text) {
    this._rxBuffer += text;
    if (this._rxBuffer.length > 256) {
      this._rxBuffer = this._rxBuffer.slice(-256);
    }
    this._checkWaiters();
    if (this.onData) this.onData(text);
  }

  _checkWaiters() {
    this._rxWaiters = this._rxWaiters.filter(waiter => {
      if (this._rxBuffer.includes(waiter.pattern)) {
        clearTimeout(waiter.timer);
        waiter.resolve();
        return false;
      }
      return true;
    });
  }

  /**
   * Resolve once `pattern` appears in the incoming-data buffer, or reject
   * after `timeoutMs`.
   */
  _waitForResponse(pattern, timeoutMs = 1000) {
    if (this._rxBuffer.includes(pattern)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = { pattern, resolve };
      waiter.timer = setTimeout(() => {
        const idx = this._rxWaiters.indexOf(waiter);
        if (idx !== -1) this._rxWaiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for: ${pattern}`));
      }, timeoutMs);
      this._rxWaiters.push(waiter);
    });
  }

  /**
   * Check whether the board is idle at the friendly REPL prompt right now,
   * without trying to interrupt anything.
   */
  async checkPrompt(timeoutMs = 400) {
    if (!this.connected) return false;
    // Clear stale buffer content first — otherwise a '>>>' left over from
    // before a silent, non-printing program started would look like a fresh
    // idle prompt and short-circuit the check below.
    this._rxBuffer = '';
    await this.send('\r');
    return this._waitForResponse('>>>', timeoutMs).then(() => true, () => false);
  }

  /**
   * Aggressively regain the REPL prompt, mirroring the official XRP web
   * IDE's recovery loop: a single Ctrl+C isn't always enough to interrupt a
   * program that's mid-instruction or driven by a timer/interrupt callback,
   * so retry a number of times before giving up.
   *
   * Each attempt clears the buffer once up front, then sends the interrupt
   * *and* an explicit exit-raw-REPL before checking for the prompt — as one
   * uninterrupted window. Interrupting a running program can itself cause
   * MicroPython to print the friendly-REPL banner (e.g. processing a Ctrl+B
   * that was queued earlier and only now gets read), so clearing the buffer
   * again in between those two sends — like checkPrompt() does for its own
   * one-shot check — would risk wiping that exact evidence out from under us
   * right as it arrives.
   * @param {number} attempts
   * @returns {Promise<boolean>} true once the board is confirmed idle at the REPL
   */
  async getToREPL(attempts = 10) {
    if (await this.checkPrompt()) return true;
    for (let i = 0; i < attempts; i++) {
      this._rxBuffer = ''; // fresh evidence window for this attempt only
      await this.send('\r\x03\x03'); // Ctrl+C ×2 — interrupts a running program
      await this._delay(200); // let any resulting traceback/prompt arrive
      await this.exitRawRepl(); // in case we're left at the raw '>' prompt
      if (this._rxBuffer.includes('>>>')) return true;
    }
    return false;
  }

  /**
   * Upload a Python file to the XRP filesystem via raw REPL.
   * Only writes the file — it does not run it. A saved main.py will run the
   * next time the board powers up or is reset, but saving alone leaves the
   * board idle at the REPL (and, over BLE, keeps advertising) so it's still
   * reachable right after a save.
   * @param {string} filename
   * @param {string} content
   */
  async uploadFile(filename, content) {
    if (!this.connected) throw new Error('Not connected to XRP');
    if (!/^[A-Za-z0-9_.-]+$/.test(filename)) throw new Error('Invalid upload filename');
    const data = this.encoder.encode(content);
    let sequence = 0;
    // Large HTML-containing drivers must not be sent as one huge Python
    // literal. Each small write is acknowledged after the flash operation.
    const command = async code => {
      const marker = `XRP_UPLOAD_${sequence++}_OK`;
      this._rxBuffer = '';
      await this.send(code + `\nprint('${marker}')\n`);
      await this.send('\x04');
      await this._waitForResponse('\x04>', 10000);
      if (!this._rxBuffer.includes(marker)) {
        throw new Error(`Upload of ${filename} failed: ${this._rxBuffer.replace(/[\x00-\x1f]/g, ' ').trim()}`);
      }
    };
    try {
      if (!await this.getToREPL()) throw new Error('Robot did not return to the REPL');
      this._rxBuffer = '';
      await this.send('\x01');
      await this._waitForResponse('raw REPL; CTRL-B to exit\r\n>', 3000);
      await command(`import ubinascii, os\n_xrp_upload = open('${filename}.upload', 'wb')`);
      for (let offset = 0; offset < data.length; offset += 256) {
        const bytes = data.slice(offset, offset + 256);
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        await command(`assert _xrp_upload.write(ubinascii.unhexlify('${hex}')) == ${bytes.length}`);
      }
      await command(`_xrp_upload.close()\nassert os.stat('${filename}.upload')[6] == ${data.length}\nos.rename('${filename}.upload', '${filename}')`);
      // Replacing a file does not replace MicroPython's cached module. Close
      // the remote listener before dropping its module so port 80 is released.
      if (/^[A-Za-z_][A-Za-z0-9_]*\.py$/.test(filename) && filename !== 'main.py') {
        const module = filename.slice(0, -3);
        const cleanup = module === 'RemoteControl'
          ? "    _xrp_active = getattr(_xrp_module, '_active_remote', None)\n" +
            "    if _xrp_active is not None:\n        _xrp_active.close()\n"
          : '';
        await command(`import sys\n_xrp_module = sys.modules.get('${module}')\n` +
          `if _xrp_module is not None:\n${cleanup}    del sys.modules['${module}']\n` +
          'del _xrp_module');
      }
      this.onData?.(`File saved: ${filename}\n`);
    } finally {
      await this.exitRawRepl().catch(() => {});
    }
  }

  /**
   * Run code directly via raw REPL
   * @param {string} pythonCode
   */
  async runProgram(pythonCode) {
    if (!this.connected) {
      throw new Error('Not connected to XRP');
    }
    await this.executeCode(pythonCode);
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**`js/serial/webserial.js`**

```js
/**
 * XRP Blocks — WebSerial Connection Manager
 * Handles USB serial: connect → read loop → disconnect.
 * REPL protocol (interrupt, raw REPL, executeCode, etc.) lives in XRPTransportBase.
 */

import { XRPTransportBase } from './base-transport.js';

export class XRPSerial extends XRPTransportBase {
  constructor() {
    super();

    // WebSerial-specific state
    this.port   = null;
    this.reader = null;
    this.writer = null;

    // Internal flag to stop the read loop cleanly
    this._stopReading = false;

    // Bound handler for the OS-level "device unplugged" signal (see connect())
    this._onNativeDisconnect = this._handleNativeDisconnect.bind(this);
  }

  // ── Static capability check ───────────────────────────────────────────────

  static isSupported() {
    return 'serial' in navigator;
  }

  // ── Connect / Disconnect ──────────────────────────────────────────────────

  async connect(port = null) {
    if (!XRPSerial.isSupported()) {
      throw new Error(
        'WebSerial is not supported in this browser. Please use Chrome or Edge.'
      );
    }

    try {
      // Request a serial port — user will see a browser picker dialog
      this.port = port || await navigator.serial.requestPort();

      // Open with standard MicroPython REPL settings
      await this.port.open({
        baudRate:    115200,
        dataBits:    8,
        stopBits:    1,
        parity:      'none',
        flowControl: 'none',
      });

      this.connected    = true;
      this._stopReading = false;

      // Listen for the OS reporting the USB device physically went away. On some
      // platforms a pending reader.read() never rejects when the cable is pulled,
      // so this event is the only reliable way to notice and release the port —
      // without it the port stays open forever and can't be reconnected.
      navigator.serial.addEventListener('disconnect', this._onNativeDisconnect);

      // Acquire a single writer for the session
      this.writer = this.port.writable.getWriter();

      // Start reading in background (fire-and-forget)
      this._startReading();

      if (this.onConnect) this.onConnect();

    } catch (err) {
      if (err.name === 'NotFoundError') {
        // User cancelled the dialog — not an error
        return;
      }
      this.connected = false;
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  async disconnect() {
    this.connected    = false;
    this._stopReading = true;
    this._rxBuffer    = '';
    this._rxWaiters   = [];

    navigator.serial.removeEventListener('disconnect', this._onNativeDisconnect);

    // Cancel and release the reader first so the port can be closed
    if (this.reader) {
      try { await this.reader.cancel(); }  catch (_) { /* ignore */ }
      try { this.reader.releaseLock(); }   catch (_) { /* ignore */ }
      this.reader = null;
    }

    // Release writer lock
    if (this.writer) {
      try { this.writer.releaseLock(); } catch (_) { /* ignore */ }
      this.writer = null;
    }

    // Close the port
    if (this.port) {
      try { await this.port.close(); } catch (_) { /* ignore */ }
      this.port = null;
    }

    if (this.onDisconnect) this.onDisconnect();
  }

  /**
   * Handle the Web Serial API's global 'disconnect' event, fired when the OS
   * reports a paired port's device is no longer present (e.g. cable unplugged).
   * This is distinct from the read loop noticing an error — on some platforms
   * a pending reader.read() simply never settles when the device disappears,
   * so this event is what actually lets us release the port and clean up.
   */
  _handleNativeDisconnect(event) {
    if (event.target !== this.port || !this.connected) return;
    this.disconnect();
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  async send(data) {
    if (!this.connected || !this.writer) {
      throw new Error('Not connected to XRP');
    }
    await this.writer.write(this.encoder.encode(data));
  }

  // ── Private read loop ─────────────────────────────────────────────────────

  /**
   * Start reading serial data in the background.
   * Uses a single reader held for the entire session.
   */
  async _startReading() {
    if (!this.port || !this.port.readable) return;

    this.reader = this.port.readable.getReader();

    try {
      while (!this._stopReading) {
        let result;
        try {
          result = await this.reader.read();
        } catch (err) {
          // Read error (e.g. device unplugged)
          if (this.connected && this.onError) this.onError(err);
          break;
        }

        if (result.done) break;

        if (result.value) {
          const text = this.decoder.decode(result.value);
          this._feedIncomingData(text);
        }
      }
    } finally {
      try { this.reader.releaseLock(); } catch (_) { /* ignore */ }

      // If we exited the loop unexpectedly (device disconnected), trigger disconnect
      if (this.connected) {
        this.connected    = false;
        this._stopReading = true;
        if (this.onDisconnect) this.onDisconnect();
      }
    }
  }
}
```

**`js/serial/webbluetooth.js`**

```js
/**
 * XRP Blocks — Web Bluetooth Connection Manager
 *
 * Connects to the XRP robot over BLE using the Nordic UART Service (NUS).
 * UUIDs sourced from Open-STEM/XRPWeb bluetoothconnection.ts (the official XRP web IDE).
 *
 * Service:  6e400001-b5a3-f393-e0a9-e50e24dcca9e  (NUS)
 * TX char:  6e400002-b5a3-f393-e0a9-e50e24dcca9e  (PC → Board, Write)
 * RX char:  6e400003-b5a3-f393-e0a9-e50e24dcca9e  (Board → PC, Notify)
 *
 * REPL protocol sourced from Open-STEM/XRPWeb connection.ts + bluetoothconnection.ts.
 * Key differences vs USB:
 *  - All writes are serialised through a promise queue (GATT can't handle concurrent writes)
 *  - We must wait for '>>>' or 'raw REPL' echo before sending code
 *  - '##XRPSTOP##' is the BLE-specific stop signal the XRP firmware listens for
 */

import { XRPTransportBase } from './base-transport.js';

// Nordic UART Service UUIDs (confirmed from Open-STEM/XRPWeb source)
const UART_SERVICE_UUID  = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TX_CHAR_UUID       = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // PC → Board (Write)
const RX_CHAR_UUID       = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Board → PC (Notify)

// Max bytes per BLE write (BLE 5.0 is 250 bytes; matches XRPWeb's XRP_SEND_BLOCK_SIZE)
const BLE_CHUNK_SIZE = 250;

// Magic stop string the XRP firmware BLE handler listens for
const BLE_STOP_MSG = '##XRPSTOP##';

export class XRPBluetooth extends XRPTransportBase {
  constructor() {
    super();

    // BLE GATT handles
    this._device    = null;
    this._server    = null;
    this._txChar    = null; // Write characteristic (PC → Board)
    this._rxChar    = null; // Notify characteristic (Board → PC)

    // Serial write queue — BLE GATT cannot handle concurrent writeValue() calls
    this._writeQueue = Promise.resolve();

    // Incoming data buffer for waitForResponse()
    this._rxBuffer = '';
    this._rxWaiters = []; // [{pattern, resolve}]

    // Bound handlers
    this._onNotify         = this._handleNotify.bind(this);
    this._onGattDisconnect = this._handleGattDisconnect.bind(this);
  }

  // ── Static capability check ───────────────────────────────────────────────

  static isSupported() {
    return 'bluetooth' in navigator;
  }

  // ── Connect / Disconnect ──────────────────────────────────────────────────

  async connect(device = null) {
    if (!XRPBluetooth.isSupported()) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please use Chrome or Edge.'
      );
    }

    try {
      // Filter by device name prefix — XRP doesn't advertise NUS service UUID in adverts
      // This matches xrpcode.wpi.edu (Open-STEM/XRPWeb)
      this._device = device || await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'XRP' }],
        optionalServices: [UART_SERVICE_UUID],
      });

      this._device.addEventListener('gattserverdisconnected', this._onGattDisconnect);

      // If previously connected, disconnect cleanly first (matches XRPWeb)
      if (this._device.gatt.connected) {
        await this._device.gatt.disconnect();
      }

      this._server = await this._device.gatt.connect();

      const service = await this._server.getPrimaryService(UART_SERVICE_UUID);

      // TX: Write (PC → Board)
      this._txChar = await service.getCharacteristic(TX_CHAR_UUID);

      // RX: Notify (Board → PC)
      this._rxChar = await service.getCharacteristic(RX_CHAR_UUID);
      await this._rxChar.startNotifications();
      this._rxChar.addEventListener('characteristicvaluechanged', this._onNotify);

      this.connected = true;
      if (this.onConnect) this.onConnect();

    } catch (err) {
      if (err.name === 'NotFoundError') {
        return; // User cancelled the picker
      }
      this.connected = false;
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  async disconnect() {
    this.connected = false;

    if (this._rxChar) {
      try { await this._rxChar.stopNotifications(); } catch (_) {}
      this._rxChar.removeEventListener('characteristicvaluechanged', this._onNotify);
      this._rxChar = null;
    }

    this._txChar = null;

    if (this._device) {
      this._device.removeEventListener('gattserverdisconnected', this._onGattDisconnect);
    }

    if (this._server && this._server.connected) {
      try { this._server.disconnect(); } catch (_) {}
    }

    this._server = null;
    this._device = null;
    this._rxBuffer = '';
    this._rxWaiters = [];

    if (this.onDisconnect) this.onDisconnect();
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  /**
   * Enqueue a write to the TX characteristic.
   * BLE GATT cannot handle concurrent writeValue() calls — all writes go through a serial queue.
   * Data is chunked at BLE_CHUNK_SIZE bytes (250, matching XRPWeb).
   */
  async send(data) {
    if (!this.connected || !this._txChar) {
      throw new Error('Not connected to XRP');
    }

    const bytes = this.encoder.encode(data);

    for (let i = 0; i < bytes.length; i += BLE_CHUNK_SIZE) {
      const chunk = bytes.slice(i, i + BLE_CHUNK_SIZE);
      await this._enqueue(chunk);
    }
  }

  /**
   * Send a raw Uint8Array (already bytes, not a string) in BLE_CHUNK_SIZE blocks.
   * Used by the streaming file upload, which sends binary file content directly.
   */
  async _sendRawBytes(bytes) {
    if (!this.connected || !this._txChar) {
      throw new Error('Not connected to XRP');
    }
    for (let i = 0; i < bytes.length; i += BLE_CHUNK_SIZE) {
      await this._enqueue(bytes.slice(i, i + BLE_CHUNK_SIZE));
    }
  }

  /**
   * Enqueue a raw Uint8Array write through the serial BLE write queue.
   * Returns a Promise that resolves only after the write has completed.
   */
  _enqueue(bytes) {
    // Chain onto the existing queue — never run two writeValue() calls in parallel
    const result = this._writeQueue.then(() =>
      this._txChar?.writeValue(bytes)
    );
    // Update the queue tail; swallow errors so the queue never stops
    this._writeQueue = result.catch(err => {
      console.error('[XRPBluetooth] BLE write failed:', err);
    });
    return result;
  }

  // ── Override REPL protocol ────────────────────────────────────────────────
  //
  // Over BLE the raw-REPL handshake is the same Ctrl+C / Ctrl+A sequence as USB —
  // we just wait for the board's echo before streaming code, because GATT writes
  // can outrun the firmware if we don't.
  //
  // IMPORTANT: the magic string "##XRPSTOP##" is NOT used here. The XRP firmware
  // reacts to it by rebooting, which tears down the BLE/GATT link — every write
  // after that fails with "GATT operation failed for unknown reason". It is only
  // used by stopExecution() (the Stop button), where a reboot is the desired
  // outcome. This mirrors Open-STEM/XRPWeb, whose run path (goCommand) never
  // sends the stop message.

  /**
   * Interrupt + enter raw REPL, then wait for the board's confirmation echo.
   */
  async enterRawRepl() {
    // Standard MicroPython raw REPL entry sequence (no reboot — see note above)
    await this.send('\r\x03\x03'); // Ctrl+C × 2: interrupt any running program
    await this._delay(100);
    await this.send('\r\x01');     // Ctrl+A → raw REPL

    // Wait up to 3 s for the board to echo "raw REPL" (or ">")
    await this._waitForResponse('raw REPL', 3000).catch(() => {
      // Timed out waiting — board may already be at prompt, continue anyway
    });
    await this._delay(100);
  }

  /**
   * Execute code: enter raw REPL, send code in 250-byte chunks, Ctrl+D to run.
   */
  async executeCode(pythonCode) {
    if (!this.connected) throw new Error('Not connected to XRP');

    await this.enterRawRepl();

    try {
      // Send code in BLE_CHUNK_SIZE chunks (matching XRPWeb goCommand)
      const chunks = Math.ceil(pythonCode.length / BLE_CHUNK_SIZE) + 1;
      for (let i = 0; i < chunks; i++) {
        const slice = pythonCode.slice(i * BLE_CHUNK_SIZE, (i + 1) * BLE_CHUNK_SIZE);
        await this.send(slice);
      }

      await this.send('\x04'); // Ctrl+D — execute
      await this._delay(200);
    } finally {
      // Always try to leave raw REPL, even if something above threw — otherwise
      // the board is left stuck in raw REPL and stops responding to the REPL.
      await this.exitRawRepl().catch(() => {});
    }
  }

  /**
   * Exit raw REPL (Ctrl+B) and wait for normal prompt.
   */
  async exitRawRepl() {
    await this.send('\x02'); // Ctrl+B
    await this._delay(200);
  }

  /**
   * Upload a file to the board — overridden for BLE.
   *
   * The base implementation builds one big `f.write('<escaped>')` and runs it in a
   * single burst. On the RP2040 that flash write starves the BLE radio long enough
   * to drop the GATT link ("GATT operation failed for unknown reason"). It works
   * over USB only because the wired REPL survives the stall.
   *
   * Instead we mirror Open-STEM/XRPWeb: prime the board with a small writer script
   * that disables the Ctrl-C interrupt (so binary bytes pass through) and writes the
   * file ONE 250-byte block at a time, looping back to read the next block from the
   * BLE stream between writes. That interleaving keeps the radio serviced, so the
   * link survives. File content is streamed as raw bytes, not an escaped string.
   */
  async uploadFile(filename, content) {
    if (!this.connected) throw new Error('Not connected to XRP');

    const data = this.encoder.encode(content);
    const blocksize = BLE_CHUNK_SIZE;

    // Writer script — runs on the board, blocks on stdin reading `data.length` bytes.
    // Indentation must stay valid Python; keep it exactly as written.
    const script =
      'import micropython\n' +
      'import sys\n' +
      'import time\n' +
      'blocksize = ' + blocksize + '\n' +
      'micropython.kbd_intr(-1)\n' +          // disable Ctrl-C so binary bytes pass through
      'time.sleep(0.035)\n' +
      "print('started')\n" +                  // handshake: we wait for this before streaming
      "w = open('" + filename + "','wb')\n" +
      'byte_count_to_read = ' + data.length + '\n' +
      'read_byte_count = 0\n' +
      'read_buffer = bytearray(blocksize)\n' +
      'specialEndIndex = blocksize\n' +
      'if byte_count_to_read > 0:\n' +
      '  while True:\n' +
      '    read_byte_count = read_byte_count + sys.stdin.buffer.readinto(read_buffer, blocksize)\n' +
      '    if read_byte_count >= byte_count_to_read:\n' +
      '        specialEndIndex = blocksize - (read_byte_count - byte_count_to_read)\n' +
      '        read_byte_count = read_byte_count - blocksize + specialEndIndex\n' +
      '    w.write(bytearray(read_buffer[0:specialEndIndex]))\n' +
      '    if read_byte_count >= byte_count_to_read:\n' +
      '        break\n' +
      'w.close()\n' +
      'micropython.kbd_intr(0x03)\n';         // restore Ctrl-C

    // Enter raw REPL, run the writer, and wait until it signals it's ready for bytes.
    await this.enterRawRepl();
    await this.send(script);
    await this.send('\x04'); // Ctrl+D — execute the writer script
    await this._waitForResponse('started', 5000);

    // Stream the content as fixed-size blocks. The final short block is padded to a
    // full blocksize (0xFF) so the board's readinto() always gets a complete block;
    // the script trims the padding via specialEndIndex.
    const numberOfChunks = Math.ceil(data.length / blocksize);
    for (let b = 0; b < numberOfChunks; b++) {
      let block = data.slice(b * blocksize, (b + 1) * blocksize);
      if (block.length < blocksize) {
        const padded = new Uint8Array(blocksize).fill(0xFF);
        padded.set(block, 0);
        block = padded;
      }
      await this._sendRawBytes(block);
    }

    // Let the writer finish and the raw prompt return, then leave raw REPL.
    await this._waitForResponse('>', 5000).catch(() => {});
    await this._delay(100);
    await this.exitRawRepl();

    // Deploy only saves the file — it does not run it. main.py will run on the
    // next power-up/reset; running it immediately here would occupy the board
    // for as long as the program runs, leaving it unable to service further
    // REPL/BLE traffic.
  }

  /**
   * Stop a running program via the BLE-specific stop signal.
   *
   * "##XRPSTOP##" is the only reliable way to interrupt a running program over
   * BLE: the firmware watches for it and reboots into a fresh REPL. That reboot
   * drops the GATT link, so we send the stop message and nothing more — any
   * follow-up write would land on a disconnected server and throw. The board
   * (and our gattserverdisconnected handler) takes it from here.
   */
  async stopExecution() {
    if (!this.connected || !this._txChar) return false;
    try {
      await this.send(BLE_STOP_MSG);
    } catch (_) {
      // Link may already be dropping as the board reboots — ignore.
    }
    return false;
  }

  /**
   * Regain the REPL over BLE — overridden because USB's approach (hammer
   * Ctrl+C and recheck) isn't reliable here: a busy program can starve the
   * BLE radio the same way a big flash write does (see uploadFile() above),
   * so repeated writes are more likely to drop the GATT link than help.
   * Mirrors the official XRP web IDE: if the board isn't already idle, send
   * the stop signal to force a firmware reboot and let the resulting
   * gattserverdisconnected event (_handleGattDisconnect) drive reconnection.
   */
  async getToREPL() {
    if (await this.checkPrompt()) return true;
    await this.stopExecution();
    return false;
  }

  // ── Incoming data handling ────────────────────────────────────────────────

  _handleNotify(event) {
    const text = this.decoder.decode(event.target.value);

    // Append to buffer for waitForResponse() callers
    this._rxBuffer += text;
    this._checkWaiters();

    // Forward to the app's onData callback (terminal display)
    if (this.onData) this.onData(text);
  }

  /**
   * Wait until the RX stream contains `pattern` (or timeout ms pass).
   */
  _waitForResponse(pattern, timeout = 5000) {
    return new Promise((resolve, reject) => {
      // Check if already in buffer
      if (this._rxBuffer.includes(pattern)) {
        this._rxBuffer = '';
        resolve();
        return;
      }

      const waiter = { pattern, resolve, reject };
      this._rxWaiters.push(waiter);

      const timer = setTimeout(() => {
        const idx = this._rxWaiters.indexOf(waiter);
        if (idx !== -1) this._rxWaiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for: ${pattern}`));
      }, timeout);

      waiter.timer = timer;
    });
  }

  _checkWaiters() {
    this._rxWaiters = this._rxWaiters.filter(waiter => {
      if (this._rxBuffer.includes(waiter.pattern)) {
        clearTimeout(waiter.timer);
        this._rxBuffer = '';
        waiter.resolve();
        return false; // remove from list
      }
      return true; // keep waiting
    });
  }

  _handleGattDisconnect() {
    if (!this.connected) return;
    this.connected = false;
    this._txChar = null;
    this._rxChar = null;
    this._server = null;
    if (this.onDisconnect) this.onDisconnect();
  }
}
```

**`lib/MecanumDrive.py`**

```python
"""Four encoded XRP motors, standard X-pattern mecanum wheels.

Order: front-left, front-right, rear-left, rear-right. Positive wheel motion
must propel that side forward. Distances are encoder estimates, not ground
measurements: roller slip and geometry require physical calibration.
"""
import math
import time
from XRPLib.encoded_motor import EncodedMotor


class MecanumDrive:
    def __init__(self):
        self.motors = None
        self.signs = [1, 1, 1, 1]
        self.configure(1, 2, 3, 4, 6, 15, 15, 100)
        self.last_move_completed = False

    def configure(self, fl, fr, rl, rr, diameter, wheelbase, track, max_rpm):
        ports = [int(p) for p in (fl, fr, rl, rr)]
        values = [float(v) for v in (diameter, wheelbase, track, max_rpm)]
        if len(set(ports)) != 4 or any(p not in (1, 2, 3, 4) for p in ports):
            raise ValueError('Choose four different motor ports, 1 to 4')
        if any(not math.isfinite(v) or v <= 0 for v in values):
            raise ValueError('Wheel/chassis dimensions and maximum RPM must be positive')
        if self.motors:
            self.stop()
        self.motors = [EncodedMotor.get_default_encoded_motor(p) for p in ports]
        if any(not hasattr(m, 'set_speed') for m in self.motors):
            self.motors = None
            raise ValueError('This board must support four encoded motors')
        self.diameter, self.wheelbase, self.track, self.max_rpm = values
        self.ports = ports

    def set_ports(self, fl, fr, rl, rr):
        self.configure(fl, fr, rl, rr, self.diameter, self.wheelbase, self.track, self.max_rpm)

    def set_geometry(self, diameter, wheelbase, track, max_rpm):
        self.configure(*self.ports, diameter, wheelbase, track, max_rpm)

    def reverse(self, wheel, reversed):
        self.stop()
        self.signs[int(wheel)] = -1 if reversed else 1

    @staticmethod
    def _number(value):
        value = float(value)
        if not math.isfinite(value):
            raise ValueError('Movement values must be finite numbers')
        return value

    def _speed(self, percent):
        return max(0, min(100, self._number(percent))) * self.max_rpm / 100

    @staticmethod
    def _direction(angle):
        # 0 forward, 90 right, 180 backward, 270 left.
        radians = angle * math.pi / 180
        forward, right = math.cos(radians), math.sin(radians)
        values = [forward + right, forward - right, forward - right, forward + right]
        return [0 if abs(v) < 1e-9 else v for v in values]

    def _wheel_speed(self, index, rpm):
        motor = self.motors[index]
        motor.set_speed(rpm * self.signs[index])
        if rpm == 0:
            motor.brake()

    def stop(self):
        # Disable background speed controllers before braking all four motors.
        error = None
        for motor in self.motors or []:
            try:
                motor.set_speed(None)
                motor.brake()
            except Exception as exc:
                error = exc
        if error:
            raise error

    def drive(self, angle, speed):
        try:
            factors = self._direction(self._number(angle))
            rpm = self._speed(speed) / max(abs(v) for v in factors)
            for i in range(4):
                self._wheel_speed(i, factors[i] * rpm)
        except BaseException:
            self.stop()
            raise

    def _travel(self, wheel_cm, speed, timeout):
        self.last_move_completed = False
        try:
            rpm = self._speed(speed)
            timeout = self._number(timeout)
            if timeout <= 0:
                raise ValueError('Timeout must be positive')
            targets = [cm / (math.pi * self.diameter) for cm in wheel_cm]
            largest = max(abs(v) for v in targets)
            if largest == 0:
                self.last_move_completed = True
                return True
            if rpm == 0:
                return False
            initial = [m.get_position() for m in self.motors]
            active = [abs(v) > 1e-9 for v in targets]
            started = time.ticks_ms()
            for i in range(4):
                self._wheel_speed(i, rpm * targets[i] / largest)
            while any(active):
                if time.ticks_diff(time.ticks_ms(), started) >= timeout * 1000:
                    print('Mecanum: move timed out; all motors stopped')
                    return False
                for i in range(4):
                    progress = (self.motors[i].get_position() - initial[i]) * self.signs[i]
                    if active[i] and progress * (1 if targets[i] > 0 else -1) >= abs(targets[i]):
                        self._wheel_speed(i, 0)
                        active[i] = False
                time.sleep_ms(10)
            self.last_move_completed = True
            return True
        finally:
            self.stop()

    def move(self, angle, speed, distance, timeout=15):
        self.last_move_completed = False
        try:
            distance = self._number(distance)
            if distance < 0:
                raise ValueError('Distance must be non-negative; choose a direction')
            factors = self._direction(self._number(angle))
            return self._travel([v * distance for v in factors], speed, timeout)
        finally:
            self.stop()

    def turn(self, clockwise, speed, degrees, timeout=15):
        self.last_move_completed = False
        try:
            degrees = self._number(degrees)
            if degrees < 0:
                raise ValueError('Degrees must be non-negative; choose left or right')
            arc = degrees * math.pi / 180 * (self.wheelbase + self.track) / 2
            if not clockwise:
                arc = -arc
            return self._travel([arc, -arc, arc, -arc], speed, timeout)
        finally:
            self.stop()
```

**`lib/RemoteControl.py`**

```python
"""Cooperative Wi-Fi button panel. Call update() frequently in your main loop.

No motor or device dependencies. Expired button states become false; the user's
program must act on those states and explicitly stop any ongoing actuator.
"""
import network
import socket
import select
import time
import json

PAGE = ''  # Filled from tools/remote-control.html by embed_drivers.py.
_active_remote = None


class RemoteControl:
    def __init__(self):
        self.labels = ['Button %d' % i for i in range(1, 7)]
        self.title = 'Remote control'
        self.buttons = [False] * 6
        self.edges = [False] * 6
        self.owner = None
        self.sequence = -1
        self.last_seen = 0
        self.server = None
        self.clients = []
        self.wlan = None
        self.poller = select.poll()
        self.ip = ''

    def label(self, button, text):
        self.labels[self._index(button)] = str(text)[:32]

    def set_title(self, text):
        self.title = str(text)[:60]

    @staticmethod
    def _index(button):
        index = int(button) - 1
        if index < 0 or index >= 6:
            raise ValueError('Button must be 1 to 6')
        return index

    def _expire(self):
        if self.owner is not None and time.ticks_diff(time.ticks_ms(), self.last_seen) > 1000:
            self.release()
            self.owner = None
            self.sequence = -1

    def release(self):
        self.buttons = [False] * 6
        self.edges = [False] * 6

    def connected(self):
        self.update()
        return self.owner is not None

    def pressed(self, button):
        self.update()
        return self.buttons[self._index(button)]

    def clicked(self, button):
        self.update()
        index = self._index(button)
        result = self.edges[index]
        self.edges[index] = False
        return result

    def _state(self, data):
        self._expire()
        session, sequence, mask = data.get('session'), data.get('seq'), data.get('mask')
        if not isinstance(session, str) or not 1 <= len(session) <= 48:
            raise ValueError('Invalid session')
        if type(sequence) is not int or sequence < 0 or type(mask) is not int or not 0 <= mask < 64:
            raise ValueError('Invalid button state')
        if self.owner is not None and self.owner != session:
            return 409
        if self.owner == session and sequence <= self.sequence:
            return 409
        self.owner, self.sequence = session, sequence
        self.last_seen = time.ticks_ms()
        for i in range(6):
            down = bool(mask & (1 << i))
            if down and not self.buttons[i]:
                self.edges[i] = True
            self.buttons[i] = down
        return 200

    def start(self, mode, ssid, password):
        global _active_remote
        print('Remote control driver 1.1.1')
        # The REPL retains imported modules between runs. Close the previous
        # program's listener before a new RemoteControl instance binds port 80.
        if _active_remote is not None and _active_remote is not self:
            _active_remote.close()
        self.close()
        ap = mode == 'ap'
        if mode not in ('ap', 'station'):
            raise ValueError('Choose ap or station')
        if ap and not 8 <= len(password) <= 63:
            raise ValueError('Hotspot password must have 8 to 63 characters')
        if not ssid or len(ssid.encode()) > 32:
            raise ValueError('Wi-Fi name must be 1 to 32 bytes')
        interface = getattr(network, 'AP_IF' if ap else 'STA_IF', None)
        if interface is None:
            interface = getattr(network.WLAN, 'IF_AP' if ap else 'IF_STA')
        self.wlan = network.WLAN(interface)
        try:
            if ap:
                self.wlan.active(False)
                try:
                    # CYW43 uses authentication bit flags, not ESP32's enum 3.
                    # WPA2 AES PSK = WPA2 (0x400000) | AES (0x4).
                    self.wlan.config(ssid=ssid, key=password, security=0x400004, channel=6)
                except (ValueError, TypeError):
                    self.wlan.config(essid=ssid, password=password, authmode=3)
                self.wlan.active(True)
                print('Remote control: hotspot "' + ssid + '" started')
            else:
                self._join_network(ssid, password)
            self.ip = self.wlan.ifconfig()[0]
            self.server = socket.socket()
            self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server.bind(('0.0.0.0', 80))
            self.server.listen(3)
            self.server.setblocking(False)
            self.poller.register(self.server, select.POLLIN)
            _active_remote = self
            print('Remote control: http://' + self.ip)
            if not ap:
                print('Open this address on a phone/laptop connected to "' + ssid + '"')
        except BaseException:
            self.close()
            raise

    def _join_network(self, ssid, password):
        # Clear a previous association before connecting to the requested SSID.
        # Otherwise isconnected() can report success for the previous router.
        self.wlan.active(False)
        self.wlan.active(True)
        print('Remote control: joining "' + ssid + '" (2.4 GHz Wi-Fi)...')
        if password:
            self.wlan.connect(ssid, password)
        else:
            self.wlan.connect(ssid)
        started = time.ticks_ms()
        last_progress = started
        while not self.wlan.isconnected():
            status = self.wlan.status()
            failures = (
                ('STAT_WRONG_PASSWORD', -3, 'Wi-Fi password rejected; check the password'),
                ('STAT_NO_AP_FOUND', -2, 'Wi-Fi network not found; check its name and 2.4 GHz availability'),
                ('STAT_CONNECT_FAIL', -1, 'Wi-Fi connection failed; check signal and router settings'),
            )
            for constant, fallback, message in failures:
                if status == getattr(network, constant, fallback):
                    raise OSError(message)
            now = time.ticks_ms()
            if time.ticks_diff(now, started) >= 30000:
                raise OSError('Wi-Fi join timed out (status %s); check 2.4 GHz, credentials and DHCP' % status)
            if time.ticks_diff(now, last_progress) >= 5000:
                print('Remote control: waiting for Wi-Fi/IP address (status %s)...' % status)
                last_progress = now
            time.sleep_ms(100)
        if self.wlan.ifconfig()[0] == '0.0.0.0':
            raise OSError('Wi-Fi connected but no IPv4 address was assigned')

    def _drop(self, client):
        try:
            self.poller.unregister(client['socket'])
        except Exception:
            pass
        client['socket'].close()
        self.clients.remove(client)

    def _response(self, client, status, body='', content_type='text/plain'):
        body = body.encode() if isinstance(body, str) else body
        header = ('HTTP/1.1 %d OK\r\nContent-Type: %s; charset=utf-8\r\n'
                  'Content-Length: %d\r\nCache-Control: no-store\r\n'
                  'Connection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n') % (status, content_type, len(body))
        client['output'] = header.encode() + body
        client['sent'] = 0
        self.poller.modify(client['socket'], select.POLLOUT)

    def _request(self, client):
        raw = client['input']
        if b'\r\n\r\n' not in raw:
            return
        head, body = raw.split(b'\r\n\r\n', 1)
        lines = head.decode().split('\r\n')
        method, path, _ = lines[0].split(' ')
        headers = {}
        for line in lines[1:]:
            key, value = line.split(':', 1)
            headers[key.lower()] = value.strip()
        length = int(headers.get('content-length', '0'))
        if length < 0 or length > 512:
            raise ValueError('Request too large')
        if len(body) < length:
            return
        if method == 'GET' and path == '/':
            self._response(client, 200, PAGE, 'text/html')
        elif method == 'GET' and path == '/config':
            self._response(client, 200, json.dumps({'title': self.title, 'labels': self.labels}), 'application/json')
        elif method == 'POST' and path == '/state' and headers.get('x-remote-control') == '1':
            self._response(client, self._state(json.loads(body[:length].decode())))
        else:
            self._response(client, 404)

    def update(self):
        """Serve a bounded amount of network work, then return to user blocks."""
        self._expire()
        if self.server is None:
            return
        for obj, flags in self.poller.poll(0):
            if obj == self.server:
                if flags & select.POLLIN:
                    conn, _ = self.server.accept()
                    conn.setblocking(False)
                    if len(self.clients) >= 4:
                        conn.close()
                    else:
                        client = {'socket': conn, 'input': b'', 'output': None, 'started': time.ticks_ms()}
                        self.clients.append(client)
                        self.poller.register(conn, select.POLLIN)
                continue
            client = None
            for candidate in self.clients:
                if candidate['socket'] == obj:
                    client = candidate
                    break
            if client is None:
                continue
            try:
                if flags & (select.POLLERR | select.POLLHUP):
                    self._drop(client)
                elif client['output'] is not None and flags & select.POLLOUT:
                    sent = obj.send(memoryview(client['output'])[client['sent']:client['sent'] + 1024])
                    client['sent'] += sent
                    if client['sent'] == len(client['output']):
                        self._drop(client)
                elif flags & select.POLLIN:
                    chunk = obj.recv(512)
                    if not chunk:
                        self._drop(client)
                        continue
                    client['input'] += chunk
                    if len(client['input']) > 2048:
                        self._drop(client)
                        continue
                    self._request(client)
            except OSError as exc:
                if exc.args[0] not in (11, 35):
                    self._drop(client)
            except (ValueError, TypeError, KeyError):
                self._drop(client)
        for client in self.clients[:]:
            if time.ticks_diff(time.ticks_ms(), client['started']) > 2000:
                self._drop(client)
        self._expire()

    def close(self):
        global _active_remote
        if _active_remote is self:
            _active_remote = None
        self.release()
        self.owner, self.sequence = None, -1
        for client in self.clients[:]:
            self._drop(client)
        if self.server:
            self.poller.unregister(self.server)
            self.server.close()
            self.server = None
        if self.wlan:
            self.wlan.active(False)
            self.wlan = None
        self.ip = ''
```

**`devices/mecanum.json`**

```json
{
  "manifestVersion": 1,
  "id": "mecanum",
  "name": {
    "en": "Mecanum wheels (4 motors)",
    "nl": "Mecanumwielen (4 motoren)"
  },
  "description": {
    "en": "Eight movement directions, speed %, encoder distance in cm and turns in degrees. Four encoded motors and X-pattern wheels."
  },
  "version": "1.1.0",
  "licence": "MIT",
  "category": {
    "key": "Mecanum",
    "label": "Mecanum",
    "colour": "#527EC5"
  },
  "driver": {
    "filename": "MecanumDrive.py",
    "marker": "MecanumDrive",
    "source": ""
  },
  "instance": {
    "name": "mecanum",
    "import": "from MecanumDrive import MecanumDrive",
    "create": "MecanumDrive()"
  },
  "blocks": [
    {
      "type": "xrp_mec_setup",
      "text": "mecanum FL %1 FR %2 RL %3 RR %4 wheel diameter (cm) %5 wheelbase (cm) %6 track width (cm) %7 max wheel speed (RPM) %8",
      "tooltip": "Use four different ports. Measure wheel diameter and axle-centre spacing in cm. Max RPM defines 100% speed. Default geometry is a placeholder.",
      "args": [
        {
          "type": "dropdown",
          "name": "FL",
          "options": [
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "3",
              "value": "3"
            },
            {
              "label": "4",
              "value": "4"
            }
          ]
        },
        {
          "type": "dropdown",
          "name": "FR",
          "options": [
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "3",
              "value": "3"
            },
            {
              "label": "4",
              "value": "4"
            }
          ]
        },
        {
          "type": "dropdown",
          "name": "RL",
          "options": [
            {
              "label": "3",
              "value": "3"
            },
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "4",
              "value": "4"
            }
          ]
        },
        {
          "type": "dropdown",
          "name": "RR",
          "options": [
            {
              "label": "4",
              "value": "4"
            },
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "3",
              "value": "3"
            }
          ]
        },
        {
          "type": "number",
          "name": "DIAMETER",
          "default": "6"
        },
        {
          "type": "number",
          "name": "BASE",
          "default": "15"
        },
        {
          "type": "number",
          "name": "TRACK",
          "default": "15"
        },
        {
          "type": "number",
          "name": "RPM",
          "default": "100"
        }
      ],
      "inline": false,
      "shape": "statement",
      "code": "mecanum.configure({FL}, {FR}, {RL}, {RR}, {DIAMETER}, {BASE}, {TRACK}, {RPM})\n"
    },
    {
      "type": "xrp_mec_reverse",
      "text": "mecanum wheel %1 direction %2",
      "tooltip": "Stops the robot and changes this wheel direction. Positive rotation must drive that side forward.",
      "args": [
        {
          "type": "dropdown",
          "name": "WHEEL",
          "options": [
            {
              "label": "front left",
              "value": "0"
            },
            {
              "label": "front right",
              "value": "1"
            },
            {
              "label": "rear left",
              "value": "2"
            },
            {
              "label": "rear right",
              "value": "3"
            }
          ]
        },
        {
          "type": "dropdown",
          "name": "REVERSE",
          "options": [
            {
              "label": "normal",
              "value": "False"
            },
            {
              "label": "reversed",
              "value": "True"
            }
          ]
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "mecanum.reverse({WHEEL}, {REVERSE})\n"
    },
    {
      "type": "xrp_mec_move",
      "text": "mecanum move %1 speed %2 %% distance %3 cm timeout %4 seconds",
      "tooltip": "Move relative to the robot without turning. Speed 0–100% of maximum wheel RPM. Encoder distance is approximate. Waits until finished or timeout, then stops.",
      "args": [
        {
          "type": "dropdown",
          "name": "DIRECTION",
          "options": [
            {
              "label": "forward",
              "value": "0"
            },
            {
              "label": "forward right",
              "value": "45"
            },
            {
              "label": "right",
              "value": "90"
            },
            {
              "label": "backward right",
              "value": "135"
            },
            {
              "label": "backward",
              "value": "180"
            },
            {
              "label": "backward left",
              "value": "225"
            },
            {
              "label": "left",
              "value": "270"
            },
            {
              "label": "forward left",
              "value": "315"
            }
          ]
        },
        {
          "type": "number",
          "name": "SPEED",
          "default": "30"
        },
        {
          "type": "number",
          "name": "DISTANCE",
          "default": "20"
        },
        {
          "type": "number",
          "name": "TIMEOUT",
          "default": "15"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "mecanum.move({DIRECTION}, {SPEED}, {DISTANCE}, {TIMEOUT})\n"
    },
    {
      "type": "xrp_mec_angle",
      "text": "mecanum move angle %1 degrees speed %2 %% distance %3 cm timeout %4 seconds",
      "tooltip": "0 forward, 90 right, 180 backward, 270 left. Distance in the chosen direction; waits and stops. Encoders estimate distance.",
      "args": [
        {
          "type": "number",
          "name": "ANGLE",
          "default": "0"
        },
        {
          "type": "number",
          "name": "SPEED",
          "default": "30"
        },
        {
          "type": "number",
          "name": "DISTANCE",
          "default": "20"
        },
        {
          "type": "number",
          "name": "TIMEOUT",
          "default": "15"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "mecanum.move({ANGLE}, {SPEED}, {DISTANCE}, {TIMEOUT})\n"
    },
    {
      "type": "xrp_mec_drive",
      "text": "mecanum drive %1 speed %2 %%",
      "tooltip": "Continues moving until another movement or stop command. Add a stop block after your loop. Speed 0–100%.",
      "args": [
        {
          "type": "dropdown",
          "name": "DIRECTION",
          "options": [
            {
              "label": "forward",
              "value": "0"
            },
            {
              "label": "forward right",
              "value": "45"
            },
            {
              "label": "right",
              "value": "90"
            },
            {
              "label": "backward right",
              "value": "135"
            },
            {
              "label": "backward",
              "value": "180"
            },
            {
              "label": "backward left",
              "value": "225"
            },
            {
              "label": "left",
              "value": "270"
            },
            {
              "label": "forward left",
              "value": "315"
            }
          ]
        },
        {
          "type": "number",
          "name": "SPEED",
          "default": "30"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "mecanum.drive({DIRECTION}, {SPEED})\n"
    },
    {
      "type": "xrp_mec_turn",
      "text": "mecanum turn %1 speed %2 %% angle %3 degrees timeout %4 seconds",
      "tooltip": "Turn in place using encoders and measured chassis dimensions. Approximate angle, not gyro feedback. Waits and stops.",
      "args": [
        {
          "type": "dropdown",
          "name": "CLOCKWISE",
          "options": [
            {
              "label": "right (clockwise)",
              "value": "True"
            },
            {
              "label": "left (anticlockwise)",
              "value": "False"
            }
          ]
        },
        {
          "type": "number",
          "name": "SPEED",
          "default": "30"
        },
        {
          "type": "number",
          "name": "DEGREES",
          "default": "90"
        },
        {
          "type": "number",
          "name": "TIMEOUT",
          "default": "15"
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "mecanum.turn({CLOCKWISE}, {SPEED}, {DEGREES}, {TIMEOUT})\n"
    },
    {
      "type": "xrp_mec_stop",
      "text": "mecanum stop",
      "tooltip": "Disable speed control and brake all four wheels.",
      "args": [],
      "inline": true,
      "shape": "statement",
      "code": "mecanum.stop()\n"
    },
    {
      "type": "xrp_mec_completed",
      "text": "mecanum last move completed",
      "tooltip": "True if the last distance move or turn reached its encoder targets; false for timeout or zero speed.",
      "args": [],
      "inline": true,
      "shape": "value",
      "code": "mecanum.last_move_completed",
      "returns": "Boolean",
      "order": "MEMBER"
    },
    {
      "type": "xrp_mec_ports",
      "text": "mecanum motors FL %1 FR %2 RL %3 RR %4",
      "tooltip": "Motor ports: FL = front left, FR = front right, RL = rear left, RR = rear right. Choose four different ports.",
      "args": [
        {
          "type": "dropdown",
          "name": "FL",
          "options": [
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "3",
              "value": "3"
            },
            {
              "label": "4",
              "value": "4"
            }
          ]
        },
        {
          "type": "dropdown",
          "name": "FR",
          "options": [
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "3",
              "value": "3"
            },
            {
              "label": "4",
              "value": "4"
            }
          ]
        },
        {
          "type": "dropdown",
          "name": "RL",
          "options": [
            {
              "label": "3",
              "value": "3"
            },
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "4",
              "value": "4"
            }
          ]
        },
        {
          "type": "dropdown",
          "name": "RR",
          "options": [
            {
              "label": "4",
              "value": "4"
            },
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "3",
              "value": "3"
            }
          ]
        }
      ],
      "inline": true,
      "shape": "statement",
      "code": "mecanum.set_ports({FL}, {FR}, {RL}, {RR})\n"
    },
    {
      "type": "xrp_mec_geometry",
      "text": "mecanum wheel diameter (cm) %1 wheelbase (cm) %2 track width (cm) %3 max wheel speed (RPM) %4",
      "tooltip": "Use four different ports. Measure wheel diameter and axle-centre spacing in cm. Max RPM defines 100% speed. Default geometry is a placeholder.",
      "args": [
        {
          "type": "number",
          "name": "DIAMETER",
          "default": "6"
        },
        {
          "type": "number",
          "name": "BASE",
          "default": "15"
        },
        {
          "type": "number",
          "name": "TRACK",
          "default": "15"
        },
        {
          "type": "number",
          "name": "RPM",
          "default": "100"
        }
      ],
      "inline": false,
      "shape": "statement",
      "code": "mecanum.set_geometry({DIAMETER}, {BASE}, {TRACK}, {RPM})\n"
    }
  ],
  "toolbox": [
    {
      "block": "xrp_mec_ports"
    },
    {
      "block": "xrp_mec_geometry",
      "shadows": {
        "DIAMETER": 6,
        "BASE": 15,
        "TRACK": 15,
        "RPM": 100
      }
    },
    {
      "gap": 20
    },
    {
      "block": "xrp_mec_reverse",
      "shadows": {}
    },
    {
      "block": "xrp_mec_move",
      "shadows": {
        "SPEED": 30,
        "DISTANCE": 20,
        "TIMEOUT": 15
      }
    },
    {
      "block": "xrp_mec_angle",
      "shadows": {
        "ANGLE": 0,
        "SPEED": 30,
        "DISTANCE": 20,
        "TIMEOUT": 15
      }
    },
    {
      "block": "xrp_mec_drive",
      "shadows": {
        "SPEED": 30
      }
    },
    {
      "block": "xrp_mec_turn",
      "shadows": {
        "SPEED": 30,
        "DEGREES": 90,
        "TIMEOUT": 15
      }
    },
    {
      "block": "xrp_mec_stop",
      "shadows": {}
    },
    {
      "block": "xrp_mec_completed",
      "shadows": {}
    }
  ]
}
```

**`devices/remote-control.json`**

```json
{
  "manifestVersion": 1,
  "id": "remote-control",
  "name": {
    "en": "Remote control",
    "nl": "Afstandsbediening"
  },
  "description": {
    "en": "Wi-Fi HTML controller with six customizable buttons. Read inputs and control any device library."
  },
  "version": "1.1.1",
  "licence": "MIT",
  "category": {
    "key": "RemoteControl",
    "label": "Remote control",
    "colour": "#497DA4"
  },
  "driver": {
    "filename": "RemoteControl.py",
    "marker": "RemoteControl",
    "source": ""
  },
  "instance": {
    "name": "remote",
    "import": "from RemoteControl import RemoteControl",
    "create": "RemoteControl()"
  },
  "blocks": [
    {
      "type": "xrp_remote_start",
      "text": "remote Wi-Fi %1 name %2 password %3",
      "args": [
        {
          "type": "dropdown",
          "name": "MODE",
          "options": [
            {
              "label": "create hotspot",
              "value": "AP",
              "code": "'ap'"
            },
            {
              "label": "join network",
              "value": "STA",
              "code": "'station'"
            }
          ]
        },
        {
          "type": "text",
          "name": "SSID",
          "default": "\"XRP-Remote\""
        },
        {
          "type": "text",
          "name": "PASSWORD",
          "default": "\"xrpremote\""
        }
      ],
      "code": "remote.start({MODE}, {SSID}, {PASSWORD})\n",
      "tooltip": "Start the web page on port 80. Hotspot password: 8–63 characters. Join network waits up to 30 seconds. The address prints in Console. Join a 2.4 GHz network and use the new address printed in Console.",
      "shape": "statement",
      "inline": false
    },
    {
      "type": "xrp_remote_title",
      "text": "remote page title %1",
      "args": [
        {
          "type": "text",
          "name": "TITLE",
          "default": "\"Remote control\""
        }
      ],
      "code": "remote.set_title({TITLE})\n",
      "tooltip": "Set before starting. Refresh the controller page to see changes.",
      "shape": "statement",
      "inline": true
    },
    {
      "type": "xrp_remote_label",
      "text": "remote button %1 label %2",
      "args": [
        {
          "type": "dropdown",
          "name": "BUTTON",
          "options": [
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "3",
              "value": "3"
            },
            {
              "label": "4",
              "value": "4"
            },
            {
              "label": "5",
              "value": "5"
            },
            {
              "label": "6",
              "value": "6"
            }
          ]
        },
        {
          "type": "text",
          "name": "LABEL",
          "default": "\"Action\""
        }
      ],
      "code": "remote.label({BUTTON}, {LABEL})\n",
      "tooltip": "Give this button a name. Button numbers remain 1–6. Set before starting.",
      "shape": "statement",
      "inline": true
    },
    {
      "type": "xrp_remote_update",
      "text": "remote update",
      "args": [],
      "code": "remote.update()\n",
      "tooltip": "Put first in a forever loop, with a short wait (0.02 seconds). Serves the page and processes button messages without waiting for a client.",
      "shape": "statement",
      "inline": true
    },
    {
      "type": "xrp_remote_pressed",
      "text": "remote button %1 held",
      "args": [
        {
          "type": "dropdown",
          "name": "BUTTON",
          "options": [
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "3",
              "value": "3"
            },
            {
              "label": "4",
              "value": "4"
            },
            {
              "label": "5",
              "value": "5"
            },
            {
              "label": "6",
              "value": "6"
            }
          ]
        }
      ],
      "code": "remote.pressed({BUTTON})",
      "tooltip": "True while held, false on release or after 1 second without messages. Call remote update frequently. Also services the web page automatically.",
      "shape": "value",
      "inline": true,
      "returns": "Boolean",
      "order": "FUNCTION_CALL"
    },
    {
      "type": "xrp_remote_clicked",
      "text": "remote button %1 just pressed",
      "args": [
        {
          "type": "dropdown",
          "name": "BUTTON",
          "options": [
            {
              "label": "1",
              "value": "1"
            },
            {
              "label": "2",
              "value": "2"
            },
            {
              "label": "3",
              "value": "3"
            },
            {
              "label": "4",
              "value": "4"
            },
            {
              "label": "5",
              "value": "5"
            },
            {
              "label": "6",
              "value": "6"
            }
          ]
        }
      ],
      "code": "remote.clicked({BUTTON})",
      "tooltip": "True once per press; reading consumes the event. Useful for lights or single actions. Also services the web page automatically.",
      "shape": "value",
      "inline": true,
      "returns": "Boolean",
      "order": "FUNCTION_CALL"
    },
    {
      "type": "xrp_remote_connected",
      "text": "remote controller connected",
      "args": [],
      "code": "remote.connected()",
      "tooltip": "True while a controller sends messages. False after 1 second without a heartbeat. Also services the web page automatically.",
      "shape": "value",
      "inline": true,
      "returns": "Boolean",
      "order": "FUNCTION_CALL"
    },
    {
      "type": "xrp_remote_address",
      "text": "remote page address",
      "args": [],
      "code": "'http://' + remote.ip",
      "tooltip": "Open this address on a device connected to the same network or robot hotspot.",
      "shape": "value",
      "inline": true,
      "returns": "String",
      "order": "ADDITIVE"
    },
    {
      "type": "xrp_remote_release",
      "text": "remote release all buttons",
      "args": [],
      "code": "remote.release()\n",
      "tooltip": "Clears current input states. Does not stop motors or other devices. Held buttons may return on the next message.",
      "shape": "statement",
      "inline": true
    },
    {
      "type": "xrp_remote_close",
      "text": "remote close",
      "args": [],
      "code": "remote.close()\n",
      "tooltip": "Close the server, release buttons and switch off the Wi-Fi interface used by this library.",
      "shape": "statement",
      "inline": true
    }
  ],
  "toolbox": [
    {
      "block": "xrp_remote_start",
      "shadows": {
        "SSID": "XRP-Remote",
        "PASSWORD": "xrpremote"
      }
    },
    {
      "block": "xrp_remote_title",
      "shadows": {
        "TITLE": "Remote control"
      }
    },
    {
      "block": "xrp_remote_label",
      "shadows": {
        "LABEL": "Action"
      }
    },
    {
      "block": "xrp_remote_update",
      "shadows": {}
    },
    {
      "block": "xrp_remote_pressed",
      "shadows": {}
    },
    {
      "block": "xrp_remote_clicked",
      "shadows": {}
    },
    {
      "block": "xrp_remote_connected",
      "shadows": {}
    },
    {
      "block": "xrp_remote_address",
      "shadows": {}
    },
    {
      "block": "xrp_remote_release",
      "shadows": {}
    },
    {
      "block": "xrp_remote_close",
      "shadows": {}
    }
  ]
}
```

**`tools/remote-control.html`**

```html
<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Remote control</title>
<style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#10151e;color:#edf4ff}*{box-sizing:border-box}body{margin:0;padding:24px}main{max-width:620px;margin:auto}header{display:flex;justify-content:space-between;align-items:center;gap:12px}h1{font-size:28px;margin:8px 0}p{color:#a9b7cd;line-height:1.5}#status{font-size:13px;color:#9daec5}#status.live{color:#79e2b1}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:24px 0}button,input{font:inherit}button{border:1px solid #354459;color:inherit;background:#202d40;border-radius:16px;padding:20px;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #83b7ff;outline-offset:3px}.pad{min-height:110px;touch-action:none;user-select:none;font-size:20px;overflow-wrap:anywhere}.pad small{display:block;color:#a9b7cd;font-size:12px;margin-top:10px}.pad.held{background:#2d6596;border-color:#9dcfff}.pad:disabled{opacity:.45}#release{width:100%;background:#542633;border-color:#a74660}details{margin-top:26px;color:#a9b7cd}label{display:block;margin:14px 0}input{display:block;width:100%;padding:12px;border:1px solid #354459;border-radius:8px;background:#182231;color:#fff}summary{cursor:pointer}footer{font-size:12px;color:#8293ac;margin-top:28px}#retry{padding:8px 14px;font-size:13px} @media(max-width:380px){body{padding:14px}h1{font-size:23px}.pad{font-size:17px}}
.layout{display:flex;align-items:center;gap:12px}.layout select{font:inherit;padding:10px;background:#202d40;color:#edf4ff;border:1px solid #354459;border-radius:10px}.arrow{display:none}.grid.dpad{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.dpad .pad{padding:12px 6px;font-size:15px;min-height:104px}.dpad .arrow{display:block;font-size:25px;margin-bottom:6px}.dpad .pad:nth-child(1){grid-area:1/2}.dpad .pad:nth-child(2){grid-area:2/1}.dpad .pad:nth-child(3){grid-area:2/3}.dpad .pad:nth-child(4){grid-area:3/2}.dpad .pad:nth-child(5){grid-area:4/1;background:#284736}.dpad .pad:nth-child(6){grid-area:4/3;background:#443156}.dpad .pad.held{background:#2d6596}.dpad .pad small{font-size:10px}.dpad .pad:nth-child(n+5){margin-top:8px}
</style>
<main><header><h1 id="title">Remote control</h1><button id="retry">Connect</button></header>
<div id="status" role="status" aria-live="polite">Connecting…</div>
<p>Hold a button to send its signal. Your program decides what it does.</p>
<label class="layout" for="layout">Layout <select id="layout"><option value="grid">Button grid</option><option value="dpad">Game D-pad</option></select></label>
<div class="grid" id="buttons"></div><button id="release">Release all buttons</button>
<details><summary>Customize button names</summary><p>Names here are saved on this browser. Button numbers stay the same.</p><div id="names"></div><button id="reset">Use program labels</button></details>
<footer>Keep this page visible. Lost connection releases button states; your program must handle stopping devices.</footer></main>
<script>
const $=id=>document.getElementById(id), session=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
let labels=Array.from({length:6},(_,i)=>'Button '+(i+1)), names=[], seq=0, ready=false, busy=false, active=true;
const held=new Map(), keys=new Set(), pads=[], inputs=[];
try{const stored=JSON.parse(localStorage.getItem('remote-labels')||'[]');if(Array.isArray(stored))names=stored;}catch{}
function save(){try{localStorage.setItem('remote-labels',JSON.stringify(names));}catch{}}
function paint(){pads.forEach((p,i)=>{p.firstChild.textContent=names[i]||labels[i];p.classList.toggle('held',[...held.values()].includes(i)||keys.has(i));p.setAttribute('aria-pressed',String(p.classList.contains('held')));p.disabled=!ready;});}
function clear(){held.clear();keys.clear();paint();}
function status(text,live){$('status').textContent=text;$('status').classList.toggle('live',live);}
function release(){clear();send();}
for(let i=0;i<6;i++){
 const b=document.createElement('button');b.className='pad';b.append(document.createTextNode(labels[i]));const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent=['▲','◀','▶','▼','A','B'][i];arrow.setAttribute('aria-hidden','true');b.append(arrow);const hint=document.createElement('small');hint.textContent='BUTTON '+(i+1);b.append(hint);b.setAttribute('aria-pressed','false');$('buttons').append(b);pads.push(b);
 b.onpointerdown=e=>{if(!ready)return;e.preventDefault();b.setPointerCapture(e.pointerId);held.set(e.pointerId,i);paint();send();};
 const up=e=>{held.delete(e.pointerId);paint();send();};b.onpointerup=up;b.onpointercancel=up;b.onlostpointercapture=up;
 b.onkeydown=e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat&&ready){e.preventDefault();keys.add(i);paint();send();}};
 b.onkeyup=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();keys.delete(i);paint();send();}};b.onblur=()=>{keys.delete(i);paint();};
 const label=document.createElement('label');label.textContent='Button '+(i+1);const input=document.createElement('input');input.maxLength=32;input.value=names[i]||'';input.placeholder=labels[i];input.oninput=()=>{names[i]=input.value;save();paint();};label.append(input);$('names').append(label);inputs.push(input);
}
function setLayout(value){
 const dpad=value==='dpad';$('layout').value=dpad?'dpad':'grid';$('buttons').classList.toggle('dpad',dpad);
 pads.forEach((b,i)=>{b.title=dpad?['Up · button 1','Left · button 2','Right · button 3','Down · button 4','A · button 5','B · button 6'][i]:'Button '+(i+1);});
}
try{setLayout(localStorage.getItem('remote-layout'));}catch{setLayout('grid');}
$('layout').onchange=()=>{release();setLayout($('layout').value);try{localStorage.setItem('remote-layout',$('layout').value);}catch{}};
async function send(){
 if(busy||!active||document.hidden)return;
 busy=true;const abort=new AbortController(), timer=setTimeout(()=>abort.abort(),800);
 try{
  const mask=ready?[...new Set([...held.values(),...keys])].reduce((n,i)=>n|(1<<i),0):0;
  const r=await fetch('/state',{method:'POST',headers:{'Content-Type':'application/json','X-Remote-Control':'1'},body:JSON.stringify({session,seq:++seq,mask}),signal:abort.signal});
  if(!r.ok)throw Error(r.status===409?'Another controller is active':'Connection unavailable');
  ready=true;status('Connected · buttons ready',true);
 }catch(e){ready=false;clear();status(e.message==='Another controller is active'?e.message:'Disconnected · reconnecting…',false);}
 finally{clearTimeout(timer);busy=false;paint();}
}
$('release').onclick=release;$('retry').onclick=()=>{active=true;clear();send();};
$('reset').onclick=()=>{names=[];save();inputs.forEach(i=>i.value='');paint();};
window.addEventListener('blur',()=>{clear();send();});
document.addEventListener('visibilitychange',()=>{clear();ready=false;if(!document.hidden)send();});
window.addEventListener('pagehide',()=>{clear();active=false;fetch('/state',{method:'POST',headers:{'Content-Type':'application/json','X-Remote-Control':'1'},body:JSON.stringify({session,seq:++seq,mask:0}),keepalive:true}).catch(()=>{});});
fetch('/config').then(r=>{if(!r.ok)throw Error();return r.json();}).then(c=>{$('title').textContent=c.title;document.title=c.title;labels=c.labels;inputs.forEach((input,i)=>input.placeholder=labels[i]);paint();}).catch(()=>{});
paint();send();setInterval(send,150);
</script></html>
```

**`tools/test_mecanum.py`**

```python
"""Run on desktop Python: python tools/test_mecanum.py."""
import importlib.util
import math
from pathlib import Path
import sys
import types
import unittest


class Motor:
    def __init__(self):
        self.rpm = 0
        self.position = 0
        self.stalled = False

    def set_speed(self, rpm):
        self.rpm = rpm or 0

    def brake(self):
        self.rpm = 0

    def get_position(self):
        return self.position


motors = [Motor() for _ in range(4)]
encoded = types.ModuleType('XRPLib.encoded_motor')
encoded.EncodedMotor = types.SimpleNamespace(get_default_encoded_motor=lambda p: motors[p - 1])
sys.modules['XRPLib'] = types.ModuleType('XRPLib')
sys.modules['XRPLib.encoded_motor'] = encoded
spec = importlib.util.spec_from_file_location('mecanum', Path(__file__).resolve().parents[1] / 'lib/MecanumDrive.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DriveTests(unittest.TestCase):
    def setUp(self):
        motors[:] = [Motor() for _ in range(4)]
        self.clock = 0
        def sleep(ms):
            self.clock += ms
            for motor in motors:
                if not motor.stalled:
                    motor.position += motor.rpm * ms / 60000
        module.time = types.SimpleNamespace(ticks_ms=lambda: self.clock,
            ticks_diff=lambda a, b: a - b, sleep_ms=sleep)
        self.drive = module.MecanumDrive()

    def test_eight_directions_and_limits(self):
        expected = [(1,1,1,1),(1,0,0,1),(1,-1,-1,1),(0,-1,-1,0),
                    (-1,-1,-1,-1),(-1,0,0,-1),(-1,1,1,-1),(0,1,1,0)]
        for angle, signs in zip(range(0,360,45), expected):
            self.drive.drive(angle, 150)
            self.assertEqual(tuple(0 if m.rpm == 0 else int(math.copysign(1,m.rpm)) for m in motors), signs)
            self.assertLessEqual(max(abs(m.rpm) for m in motors), 100)

    def test_distance_and_diagonal(self):
        for angle in (0,45,90,180,270):
            initial = [m.position for m in motors]
            self.assertTrue(self.drive.move(angle, 50, 10))
            for i, factor in enumerate(self.drive._direction(angle)):
                self.assertAlmostEqual(motors[i].position-initial[i], factor*10/(math.pi*6), delta=.01)
            self.assertTrue(all(m.rpm == 0 for m in motors))

    def test_turn_geometry(self):
        self.assertTrue(self.drive.turn(True, 50, 90))
        target = (math.pi/2 * 15)/(math.pi*6)
        for motor, sign in zip(motors,(1,-1,1,-1)):
            self.assertAlmostEqual(motor.position, sign*target, delta=.01)

    def test_stall_timeout_and_zero_speed(self):
        motors[0].stalled = True
        self.assertFalse(self.drive.move(0,50,20,.1))
        self.assertFalse(self.drive.last_move_completed)
        self.assertTrue(all(m.rpm == 0 for m in motors))
        self.assertFalse(self.drive.move(0,0,20))

    def test_reversal(self):
        self.drive.reverse(0, True)
        self.assertTrue(self.drive.move(0,50,10))
        self.assertLess(motors[0].position, 0)

    def test_invalid_input_stops(self):
        self.drive.drive(0,50)
        with self.assertRaises(ValueError):
            self.drive.move(0,50,-1)
        self.assertTrue(all(m.rpm == 0 for m in motors))

    def test_interrupt_stops(self):
        def interrupted(ms):
            raise KeyboardInterrupt
        module.time.sleep_ms = interrupted
        with self.assertRaises(KeyboardInterrupt):
            self.drive.move(0,50,10)
        self.assertTrue(all(m.rpm == 0 for m in motors))


if __name__ == '__main__':
    unittest.main()
```

**`tools/test_remote_control.py`**

```python
"""Desktop protocol tests: python tools/test_remote_control.py."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest

sys.modules['network'] = types.ModuleType('network')
spec = importlib.util.spec_from_file_location('remote', Path(__file__).resolve().parents[1] / 'lib/RemoteControl.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RemoteTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        module.select = types.SimpleNamespace(poll=lambda: object())
        module.time = types.SimpleNamespace(ticks_ms=lambda: self.now, ticks_diff=lambda a,b:a-b)
        self.remote = module.RemoteControl()

    def state(self, mask, seq=1, session='a'):
        return self.remote._state({'session':session,'seq':seq,'mask':mask})

    def test_all_buttons_edges_and_release(self):
        self.assertEqual(self.state(63),200)
        for i in range(1,7):
            self.assertTrue(self.remote.pressed(i))
            self.assertTrue(self.remote.clicked(i))
            self.assertFalse(self.remote.clicked(i))
        self.state(0,2)
        self.assertFalse(any(self.remote.buttons))

    def test_heartbeat_expiry(self):
        self.state(1)
        self.now=900
        self.state(1,2)
        self.now=1500
        self.assertTrue(self.remote.connected())
        self.now=1901
        self.assertFalse(self.remote.pressed(1))
        self.assertFalse(self.remote.connected())
        self.assertFalse(self.remote.clicked(1))

    def test_owner_and_out_of_order(self):
        self.state(1,2)
        self.assertEqual(self.state(0,1),409)
        self.assertEqual(self.state(2,3,'b'),409)
        self.assertTrue(self.remote.pressed(1))
        self.now=1001
        self.assertEqual(self.state(2,1,'b'),200)

    def test_invalid_requests_do_not_press(self):
        for mask in (-1,64,'1',None):
            with self.assertRaises(ValueError): self.state(mask)
        self.assertFalse(any(self.remote.buttons))

    def test_labels_and_button_bounds(self):
        self.remote.label(1,'Lights')
        self.assertEqual(self.remote.labels[0],'Lights')
        for i in (0,7):
            with self.assertRaises(ValueError): self.remote.pressed(i)

    def test_partial_http_and_header(self):
        responses=[]
        self.remote._response=lambda client,status,*args:responses.append(status)
        client={'input':b'POST /state HTTP/1.1\r\nContent-Length: 10\r\n\r\n{}'}
        self.remote._request(client)
        self.assertEqual(responses,[])
        client['input']=b'POST /state HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}'
        self.remote._request(client)
        self.assertEqual(responses,[404])

    def test_join_resets_old_network_and_accepts_open_network(self):
        calls=[]
        wlan=types.SimpleNamespace(active=lambda value:calls.append(('active',value)),
            connect=lambda *args:calls.append(('connect',args)),isconnected=lambda:True,
            ifconfig=lambda:('192.168.1.25','','',''))
        self.remote.wlan=wlan
        self.remote._join_network('Home','secret')
        self.assertEqual(calls,[('active',False),('active',True),('connect',('Home','secret'))])
        calls.clear()
        self.remote._join_network('Open','')
        self.assertEqual(calls[-1],('connect',('Open',)))

    def test_join_failure_reasons_and_timeout(self):
        def sleep(ms): self.now += ms
        module.time.sleep_ms=sleep
        for status, message in [(-3,'password rejected'),(-2,'network not found'),(-1,'connection failed'),(1,'timed out')]:
            self.now=0
            self.remote.wlan=types.SimpleNamespace(active=lambda value:None,
                connect=lambda *args:None,isconnected=lambda:False,status=lambda:status)
            with self.assertRaisesRegex(OSError,message):
                self.remote._join_network('Home','secret')
        self.assertEqual(self.now,30000)


if __name__ == '__main__': unittest.main()
```

