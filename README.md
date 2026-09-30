# XRP Blocks

This is Edward Gentle's modified version of [XRPBlocks by Stichting STEAMup](https://github.com/Stichting-STEAMup/XRPBlocks). Credit for the original project goes to its authors; the original MIT licence applies to the upstream project.

A browser-based block-programming IDE for the [XRP robot](https://experiencerobotics.org/), designed with a didactic focus for beginners.

Built on [Blockly](https://developers.google.com/blockly), XRP Blocks lets students drag and drop blocks to write real MicroPython programs and run them directly on the robot over USB using the Web Serial API.

## What is different in this fork?

This repository is a local fork of the upstream project. It includes a substantial set of local classroom- and school-focused changes. The fork is not just a cosmetic variation; it adds significant functionality and deployment improvements intended for local classroom use.

See [CHANGES.md](CHANGES.md) for a concise summary of what differs from upstream, including the change log and the local fork rationale.

## Features

- 🧩 Block-based programming with XRP-specific categories and standard Blockly tools
- 🐍 Live Python preview of generated MicroPython
- 🤖 Direct robot connection over WebSerial in Chrome / Edge
- 📖 Lesson system and toolbox filtering
- 🌐 English and Dutch UI
- 💾 Save / load workspace JSON
- 🧪 Local classroom-focused additions: dark mode, device libraries, USB safety checks, better block cleanup, and more

## Getting started

Open the [OLED image designer](https://edwardgentle.github.io/xrpBlocks/oled-designer/) to draw pictures for the robot's OLED screen.

XRP Blocks runs entirely in the browser; no build step is required.

1. Start the local server: double-click `XRP Robotics.exe` (a build of XRPServe, no Python needed), or run `python serve.py`.
2. Click Connect XRP to pair with your robot over USB.
3. Drag blocks onto the canvas and click Run to execute the program.

## Documentation

For the main fork summary:

- [CHANGES.md](CHANGES.md)

For detailed updates and technical notes:

- [docs/changes-2026-09-20.md](docs/changes-2026-09-20.md)
- [docs/changes-2026-09-28.md](docs/changes-2026-09-28.md)
- [docs/lessons.md](docs/lessons.md)
- [docs/mecanum.md](docs/mecanum.md)
- [docs/remote-control.md](docs/remote-control.md)
- [docs/ble-remote.md](docs/ble-remote.md)
- [docs/triggers.md](docs/triggers.md)
- [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md)
- [devices/README.md](devices/README.md)
- [delphiSource/README.md](delphiSource/README.md)

## Historical reference

The original replication guide is retained for historical context:

- [XRPBlocks-replication-guide.md](XRPBlocks-replication-guide.md)

This is the earlier, more detailed document covering changes 1-28. The addenda in `docs/changes-2026-09-20.md` and `docs/changes-2026-09-28.md` are the current authoritative summaries for later fork changes.

## Browser support

WebSerial is required to connect to the robot. Use Chrome 89+ or Edge 89+.

The IDE itself (without robot connection) works in any modern browser.

## License

[MIT](LICENSE)
