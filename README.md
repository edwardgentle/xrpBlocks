# XRP Blocks

This is Edward Gentle's modified version of [XRPBlocks by Stichting STEAMup](https://github.com/Stichting-STEAMup/XRPBlocks). Credit for the original project goes to its authors; the original MIT license and copyright notice are preserved in [LICENSE](LICENSE).

The original project's [lesson documentation](https://github.com/Stichting-STEAMup/XRPBlocks/blob/main/docs/lessons.md) is available upstream. For this version's additions and changes, see [Local edition: 28 September 2026](#local-edition-28-september-2026) below.

A browser-based block-programming IDE for the [XRP robot](https://experiencerobotics.org/), designed with a didactic focus for beginners.

Built on [Blockly](https://developers.google.com/blockly), XRP Blocks lets students drag and drop blocks to write real MicroPython programs and run them directly on the robot over USB using the WebSerial API — no installation required.

## Features

- 🧩 **Block-based programming** — Blockly workspace with XRP-specific categories (Drive, Motors, Servo, Sensors, Board) plus standard logic, loops, math, text, variables, and functions
- 🐍 **Live Python preview** — generated MicroPython code updates in real time as blocks are placed
- 🤖 **Direct robot connection** — run programs on the XRP over WebSerial (Chrome / Edge)
- 📖 **Procedural tutorials** — step-by-step lesson system with toolbox filtering and pre-built templates
- 🌐 **Multilingual** — English and Dutch UI, easily extensible
- 💾 **Save / Load** — export and import workspace JSON files

## Getting Started

XRP Blocks runs entirely in the browser — no build step needed.

1. Start the local server: double-click `XRP Robotics.exe` (a build of XRPServe, no Python needed; see [delphiSource/README.md](delphiSource/README.md)), or run `python serve.py`. The IDE opens at `http://localhost:8765` in Chrome or Edge. Opening `index.html` directly does not work with the app's ES modules.
2. Click **Connect XRP** to pair with your robot over USB
3. Drag blocks onto the canvas and click **Run** to execute the program

## Lesson System

XRP Blocks includes a procedural tutorial system inspired by MakeCode for micro:bit.

- Click the **📖 Lesson** button in the toolbar and upload any `.json` lesson file
- The lesson panel slides in above the workspace with step-by-step instructions
- Each lesson can restrict the toolbox to a curated set of categories and blocks
- Each lesson can pre-load a partial workspace template for students to build on

**→ See [docs/lessons.md](docs/lessons.md) for the full lesson format specification.**

Example lessons are in [`examples/lessons/`](examples/lessons/):

| File | Language | Difficulty | Topic |
|---|---|---|---|
| [`les-01-hallo-robot.json`](examples/lessons/les-01-hallo-robot.json) | Dutch | ⭐ Beginner | Driving straight |
| [`les-02-vierkant.json`](examples/lessons/les-02-vierkant.json) | Dutch | ⭐⭐ Intermediate | Driving in a square |
| [`les-03-obstakel.json`](examples/lessons/les-03-obstakel.json) | Dutch | ⭐⭐⭐ Advanced | Obstacle avoidance with sensors |


## Browser Support

WebSerial is required to connect to the robot. Use **Chrome 89+** or **Edge 89+**.

The IDE itself (without robot connection) works in any modern browser.

## License

[MIT](LICENSE)

## Local edition: 28 September 2026

The local edition adds dark mode; onboard RGB colour/brightness; workspace and
variable cleanup; a collapsible, pinnable output panel; remembered connections;
confirmed USB driver uploads; Scratch-style lists; live watching of variables
and lists on the robot; keyboard shortcuts; smoother, more accurate turns and
drive straight with one acceleration block; and export of blocks to PNG.
Connect preserves programs already running. Deploy saves main.py but does not
run it.

Ten optional device libraries are available through **Library**: PCF8575,
NeoPixel, OLED (scrolling text and icons), Mecanum wheels, Remote control
(Wi-Fi), Phone control (Bluetooth, Android), TCS34725 colour sensor, Character
LCD 16x2, Character LCD 20x4 and Triggers (lights and servos that react while
the robot moves).

The IDE runs locally without Python through the Delphi server XRPServe. A test
build, XRPServePack, serves it from one encrypted file so schools get no
editable source files. The preview's terms and the component licences are in
[LICENCES.txt](LICENCES.txt).

- [Changes 29-43 and verification limits](docs/changes-2026-09-28.md)
- [Changes 19-28](docs/changes-2026-09-20.md)
- [Device libraries](devices/README.md)
- [Mecanum setup and calibration](docs/mecanum.md)
- [Remote control setup](docs/remote-control.md)
- [Phone control over Bluetooth](docs/ble-remote.md) (phone page: `phone/index.html`)
- [Triggers](docs/triggers.md)
- [Keyboard shortcuts](docs/keyboard-shortcuts.md)
- [XRPServe (local server)](delphiSource/README.md) and [encrypted pack](delphiSource/PACKING.md)
- [Source replication guide](XRPBlocks-replication-guide.md) (covers changes 1-28 only)
- [Local modifications PDF](XRPBlocks-local-modifications.pdf) (changes 1-18)

Confirmed on the robot: OLED library and scrolling, Remote control joining a
home network, and turns and drive straight with the acceleration block. Still
to be tested on hardware: lists and live watch, both LCDs, the TCS34725,
triggers and the Mecanum library (including calibration).
