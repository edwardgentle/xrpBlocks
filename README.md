# XRP Blocks

A browser-based block programming editor for the XRP robot. Build programs with Blockly and run the generated MicroPython on the robot.

This is Edward Gentle's modified version of [Stichting STEAMup's XRPBlocks](https://github.com/Stichting-STEAMup/XRPBlocks). The original authors' copyright and [MIT license](LICENSE) are preserved.

## Open the tools

| Tool | Link |
| --- | --- |
| XRP Blocks editor | [Open the editor](https://edwardgentle.github.io/xrpBlocks/) |
| OLED image designer | [Draw an OLED picture](https://edwardgentle.github.io/xrpBlocks/oled-designer/) |
| Bluetooth phone controller | [Open on your phone](https://edwardgentle.github.io/xrpBlocks/phone/) |

Use Chrome or Edge for a USB robot connection. The phone controller is documented for Android Chrome. The Wi-Fi remote controller runs on the robot; use the address printed in its Console.

## Start learning

1. Follow [Getting started](docs/getting-started.md) to open the editor online or locally and connect your robot.
2. Read the [XRP Robotics Learner Manual](XRP-Robotics-Learner-Manual-v3.pdf).
3. Load a program from [Working programs](working%20programs/README.md), or follow a [guided lesson](docs/lessons.md).

Loading a program replaces the workspace, so save your work first.

## What this edition adds

See [Fork changes](CHANGES.md) for the classroom focus and a concise summary of differences from upstream.

- Device libraries for displays, lights, sensors, mecanum wheels, Wi-Fi and Bluetooth control.
- Lists, live watches, keyboard shortcuts, workspace cleanup and export of blocks to PNG.
- Adjustable acceleration, turn calibration and movement diagnostics.
- A local Windows server and an experimental encrypted-pack build.

See [Documentation](docs/README.md) for the complete guide map and [Testing status](docs/testing-status.md) for recorded hardware results and outstanding checks.

## Development and history

Start with the [development guide](docs/development.md). The [change history](docs/CHANGELOG.md) combines the dated development notes; older embedded source snapshots are historical references, not installation instructions.

## License and credits

- [Original MIT license and copyright](LICENSE)
- [Bundled component licenses and preview terms](LICENCES.txt)
- [Original project](https://github.com/Stichting-STEAMup/XRPBlocks) and [original lesson documentation](https://github.com/Stichting-STEAMup/XRPBlocks/blob/main/docs/lessons.md)
