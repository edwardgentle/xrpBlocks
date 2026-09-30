# Change history

[Documentation](README.md) · [Testing status](testing-status.md)

These records preserve the development history. Setup instructions and validation statements describe their date, not necessarily the current checkout. Use [Getting started](getting-started.md) and [Development](development.md) for current instructions.

- [Through 28 September 2026: changes 29–43](#through-28-september-2026)
- [Through 20 September 2026: changes 19–28](#through-20-september-2026)
- [Changes 1–28: historical replication snapshot](../XRPBlocks-replication-guide.md)

## Through 28 September 2026

Two changes were numbered 37: LCD 20x4 and the encrypted pack. Both original labels are retained.

### 29. TCS34725 colour sensor library, 1.0.0

`devices/tcs34725.json`, driver `lib/TCS34725.py`. I2C/Qwiic at 0x29. Register
map, gain and integration-time tables and the colour-temperature formula are
ported from Adafruit_TCS34725 (BSD licence). Blocks: set up (gain 1x/4x/16x/60x,
integration time 2.4 ms to 614 ms), red, green and blue (0-255), light level
(raw clear channel), brightness (lux, approximate), colour temperature (K,
approximate) and nearest colour name (a teaching aid matching 8 colours, not a
calibrated reference). A breakout's illumination LED, if any, is not controlled
by the driver. Not yet tested on hardware.

### 30. Python no longer needed to run the IDE

A Delphi server, XRPServe, replaces `serve.py` and `start-xrpblocks.bat` for
running the IDE locally (the batch file is kept as
`depricated start-xrpblocks.bat`). It serves this folder on
`http://localhost:8765/` with the same no-cache headers and opens the browser.
`serve.py` is still in the folder; whether it can be removed has not been
decided. Python is still used on the development PC for the tools in `tools/`.

### 31. Lists in the Variables category

Scratch-style lists live in the Variables flyout under a **Make a List**
button. Sixteen `xrp_list_*` blocks: get, set, add, delete item, delete all,
insert, replace, item, last item, random item, item number of, length,
contains, is empty, split text into a list and join a list into text. Indexes
are 1-based on the block face. Generated code uses plain Python lists.
Files: `js/blockly/blocks/lists.js`, `js/blockly/generators/lists.js`.

### 32. Watching variables and lists live

Right-click a block with a variable or list dropdown (or press **W**) and
choose **Watch this value**. Watched "get" blocks glow, and hovering over one
shows its latest value from the robot and how long ago it changed. Values are
sent only when you click **Run**; **Deploy** never adds the watch code to
`main.py`. The watch lines are removed from the Console output. File:
`js/blockly/watch-vars.js`. Known limits: a watch line split across two serial
chunks shows as odd Console text; the tooltip is only on the list "get" and
variable "get" blocks.

This is a live watch of the real robot, not a simulator. A full in-browser
block emulator was considered and not built.

### 33. List and watch fixes from the first hardware run

- A list that is only ever added to (no "set" block first) crashed with
  `'NoneType' object has no attribute 'append'`. Every list now starts as `[]`.
- The watch glow now marks only the "get" blocks, instead of every block that
  uses the variable (which merged into one yellow blob).

### 34. Wait accepts numbers stored as text

Items typed into a list's default text slot are text (`'0.2'`), so
`wait item i of LIST seconds` crashed. `wait` now generates
`time.sleep(float(seconds))`. Other number inputs fed straight from a list item
have not yet been checked for the same problem; use a Number block when adding
numbers to a list.

### 35. XRPServe runs without a window

`delphiSource/XRPServe.dpr` is now a GUI-subsystem program with no window.
Errors (missing `index.html`, bad port, port in use, already running) show as
a message box. Stop it with `XRPServe.exe stop [port]` or Task Manager. See
[delphiSource/README.md](../delphiSource/README.md). A build dated 24 September
2026 is in `delphiSource/`; the smoke test in that README has not been
recorded as done.

### 36. Character LCD 16x2 library, 1.1.0

`devices/lcd1602.json` for 16x2 HD44780 panels with a PCF8574 I2C backpack.
Driver `lib/LCD1602.py` runs the bus at 100 kHz and tries 0x27 then 0x3F
(never a PCF8575 at 0x20). A missing display prints one message and the program
carries on; it redraws when the display comes back. Blocks: set up, clear,
print, show on a line, show a named reading, write at a column, scroll text,
bar, backlight, text on/off, cursor and "LCD is connected". Wiring notes are in
[devices/README.md](../devices/README.md). `tools/test_lcd1602.py` checks the
driver against a simulated panel.

### 37 (LCD 20x4). Character LCD 20x4 library, 1.0.0

`devices/lcd2004.json`: the same blocks for 20x4 panels (lines 1-4, columns
1-20), as `xrp_lcd4_*` blocks using the object `lcd4`, so both LCD libraries
can be added together. Both share `lib/LCD1602.py` (classes `LCD1602` and
`LCD2004`); run `tools/embed_drivers.py` after editing it so both manifests are
updated.

### 37 (pack). Encrypted pack and licence banner (test build)

So that schools do not get loose, editable HTML/JS/CSS, `tools/build_pack.py`
builds one encrypted, tamper-checked file, `xrpblocks.pak`, and
`delphiSource/XRPServePack.dpr` serves the IDE from it in memory. A damaged or
modified pack is refused. `LICENCES.txt` holds the preview terms and the
licences of every bundled component (XRPBlocks, Blockly, Lucide icons,
Adafruit_TCS34725, Indy); the server prints a banner and shows the full texts
when you type L and ENTER. Steps and limits are in
[delphiSource/PACKING.md](../delphiSource/PACKING.md).

`delphiSource/PackKey.inc` is the secret key. Never give it to schools, never
publish it, and keep a backup.

### 38. Smoother, more accurate turns

**turn X degrees** (both versions) now uses a generated helper, `xrp_turn`:
power builds up gently, eases off near the target and stops within 0.5 degrees
where possible, then checks the gyro after a short pause and makes up to 20
small corrections. New block: **set turn calibration to [100] %**. To find the
value, turn 360 degrees four times and set calibration to 100 x 1440 / the
angle actually turned.

### 39. Gentle, accurate drive straight

**drive straight** (both versions) now uses a generated helper,
`xrp_straight`: speed builds up over a distance set by the acceleration block,
with a stall guard so a slow start never leaves the robot standing still. It
also:

- carries small leftover distance errors (under 2 cm) into the next drive, so
  repeated back-and-forth drives no longer creep;
- keeps the heading between drives and steers back onto its line, so repeated
  drives no longer fan out or drift sideways.

A square on the slowest acceleration setting was "near perfect" on the robot.
The carry-over and line keeping have not yet been tested on hardware.

### 40. Mecanum turn checked with the gyro (mecanum 1.2.0)

After the encoder turn, `lib/MecanumDrive.py` checks the gyro and makes up to
20 small corrections until it is within 0.5 degrees. Without a gyro it behaves
as before. See [mecanum.md](mecanum.md).

### 41. One acceleration block for every movement (mecanum 1.4.0)

**acceleration [extra slow | slow | medium | fast | extra fast]** (values
0.125, 0.25, 0.5, 1.0, 1.75) sets how gently turns, drive straight and
mecanum moves and turns start and stop. Default, and the value used with no
block, is medium. It does not affect continuous blocks (set effort, set speed,
arcade, single motors, mecanum continuous drive). Programs saved before the
names were final keep their value but show the next name up (an old "medium"
now reads "fast").

The generated code still writes a report line to the Console after each turn
and drive and saves the last three runs in `turnlog.txt` on the robot. This was
added for tuning; whether to keep it, remove it or make it optional is not yet
decided.

### 42. Triggers library, 1.0.0

`devices/triggers.json`, driver `lib/XRPTriggers.py`: background rules such as
"while braking show red on the brake light", checked about 20 times a second
while the program runs. Lights (onboard RGB, board LED, LEDs on pins, a strip
of up to 30 pixels), servos and an opt-in emergency stop; it never drives the
wheels. Pressing **Stop** in the IDE now also stops the trigger engine
(`js/serial/base-transport.js`). Full guide: [triggers.md](triggers.md). Tested
against mocks only.

### 43. Export blocks to PNG

Right-click the workspace: **Export blocks to PNG** saves every block as
`xrp-blocks-program.png`. Right-click a block: **Export this stack to PNG**
saves that stack. The image uses the current light or dark theme at double
resolution (selection and watch glows are left out). Text uses the Nunito font
when Google Fonts can be reached, otherwise the system font. File:
`js/blockly/export-png.js`.

### Other additions in this period

- Keyboard shortcuts: see [keyboard-shortcuts.md](keyboard-shortcuts.md).
- OLED library 2.2.0: 14 bundled icons at 16, 24 and 32 pixels; see
  [devices/README.md](../devices/README.md).

### Libraries in the catalogue

| Library | Version |
|---|---|
| PCF8575 I/O expander | 1.0.0 |
| NeoPixel strip | 1.0.0 |
| OLED screen (SSD1315 / SSD1306) | 2.2.0 |
| Mecanum wheels (4 motors) | 1.4.0 |
| Remote control | 1.1.1 |
| TCS34725 colour sensor | 1.0.0 |
| Character LCD 16x2 (I2C) | 1.1.0 |
| Character LCD 20x4 (I2C) | 1.0.0 |
| Triggers (lights and servos) | 1.0.0 |

If a library was added in the IDE before its latest version, re-add it through
**Library** (or reload the IDE) so the new driver is uploaded.

### Verification and limits

Every JavaScript change was syntax-checked with `node --check`; drivers were
compiled (`py_compile`, and `mpy-cross` for triggers) and tested against
simulated hardware (`tools/test_lcd1602.py`, `tools/test_triggers.py`, mock
robots for turn and drive straight). `tools/embed_drivers.py --check` passes
for all nine manifests. The pack was built and verified, loaded in a headless
browser and rejected after a one-byte change. Export to PNG was tested in a
headless browser in light and dark mode.

Confirmed on the robot: turns and drive straight with the acceleration block
(changes 38, 39, 41).

Not yet confirmed on the robot: the fixes in 33 and 34, lists and live watch
in general, both LCDs, the TCS34725, triggers, the mecanum changes, drive
straight carry-over and line keeping, the Nunito font in exported images, and
the smoke tests for XRPServe and XRPServePack. The `working programs` folder
holds ready-made test programs for most of these.

### Reproduce and use

Start the IDE with XRPServe (or `python serve.py` on a PC with Python). Do not
open `index.html` through file://. After editing a driver in `lib/`, run
`python tools/embed_drivers.py`, then `python tools/embed_drivers.py --check`.
After changing the IDE, rebuild the pack with `python tools/build_pack.py` and
check it with `--verify`.

## Through 20 September 2026

Later entries and the testing-status page supersede these earlier behaviour and validation reports. References to batch launchers describe historical files not shipped in the current checkout.

### 19. Onboard RGB colour and brightness

The Board category adds a named-colour dropdown with brightness from 0 to 100%.
Eleven choices match the NeoPixel palette, including off. Default brightness is
30%. Generated Python clamps brightness and scales RGB values. It requires no
NeoPixel add-on library. English and Dutch labels are available. The original
three-channel RGB block remains available.

### 20. Delete unused blocks

Right-click the workspace or a block and choose Delete unused blocks. Cleanup
removes disconnected stacks and unreachable functions. It preserves start
blocks, explicitly protected blocks, and functions called directly or indirectly
by retained code, including recursive calls. Default shadow inputs do not
incorrectly protect a disconnected stack. Deletion is grouped for Undo. The
option is disabled when there is nothing eligible to remove.

### 21. Bottom panel and variable cleanup

The whole Python/Console panel starts collapsed unless pinned. Both tabs offer
a shared pin control, remembered in the browser. Unpinning hides the panel.
Unpinned tabs open manually; Run and Deploy do not force them open. Clicking
elsewhere no longer dismisses a manually opened panel. Resizing preserves the
expanded size without overriding the collapsed height.

Variables with no references anywhere in the workspace are removed on app
startup and before Run. References in loose blocks and procedure parameters
are retained. Cleanup is grouped for Undo and the workspace is saved.

### 22. Remembered connection and uninterrupted startup

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

### 23. Mecanum wheels library, version 1.1.0

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

### 24. Remote control library

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

### 25. Remote page layout choice

Choose Button grid or Game D-pad on the page. The browser remembers the layout
and custom labels. Button mapping stays fixed: Up=1, Left=2, Right=3, Down=4,
A=5, B=6. Switching layout releases held states. Symbols do not assign any
motor behavior. Space/Enter operate a focused button; mouse and touch are supported.

### 26. Remote networking fixes, current driver 1.1.1

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

### 27. Confirmed USB file uploads and module refresh

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

### 28. OLED scrolling text, library version 2.1.0

New block: OLED scroll [message] on line [1] speed (pixels/sec) [30]. Place it
inside a forever loop with a short wait, for example 0.02 seconds. Long text
scrolls left, pauses at the ends and repeats. Text that fits stays still.
Speed is clamped to 1-120 pixels/second; each line has independent state. The
method returns immediately, allowing other loop work to continue. In manual
display-update mode, also call OLED update. Static line replacement or Clear
resets the corresponding scrolling state. Hardware scrolling remains unverified.

### Verification and outstanding work

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

### Reproduce and use

Use the refreshed source snapshots in XRPBlocks-replication-guide.md together
with its new additional-files section. Run python tools/embed_drivers.py, then
python tools/embed_drivers.py --check. Start locally with start-xrpblocks.bat
or python serve.py; do not open index.html through file://.

For a library update: refresh the IDE, connect USB, then Run or Deploy to upload
the new driver. Deploy alone leaves the program stopped. For standalone use,
restart after deploying main.py. New libraries are added through Library.

Detailed usage: docs/mecanum.md and docs/remote-control.md. The OLED scroll block
tooltip explains loop placement and manual-update behavior.
