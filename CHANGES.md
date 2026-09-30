# XRPBlocks local fork changes

This repository is a fork of the upstream project at https://github.com/Stichting-STEAMup/XRPBlocks. The local fork keeps the upstream MIT-licensed project, but adds a set of classroom-focused, learner-friendly changes and local deployment work.

## Fork summary

The local fork is intended for schools and classroom use. It adds local web serving, a more stable browser workflow, better robot safety, device libraries, and a cleaner teaching environment.

Key differences from upstream include:

- Local running without relying on a direct `file://` page load
- No-cache local server and Windows launcher
- Dark mode and improved accessibility
- Block cleanup and variable cleanup
- Guardrails for deploy/robot safety
- Additional device libraries (PCF8575, NeoPixel, OLED, Mecanum, Remote control, Bluetooth, TCS34725, LCDs, triggers)
- Improved drive/turn controls and calibration helpers
- Live variable/list watching
- Better USB upload handling and module refresh
- PNG export for block programs
- Local server packaging and encrypted pack support

## Change log

### Changes 1-18

Historical local changes documented in the original replication guide:

- Local web server with no-cache headers
- `repeat forever` block
- Shadow value fix for variable assignment
- MicroPython compatibility patch for Blockly-generated code
- PCF8575 I/O expander driver and blocks
- NeoPixel strip driver and blocks
- Confirmation before deploy
- Servo category rebuild and safety fixes
- Motors category rebuild and safety fixes
- Gyro reset and heading blocks
- Dropdowns replacing repeated blocks
- Toolbox tolerance for unloaded blocks
- Dark mode
- Device library system
- OLED screen library
- OLED drawing and sketch designer
- Function definitions generation fix
- Block audit and standardisation

### Changes 19-28

The addendum in `docs/changes-2026-09-20.md` records the next round of work:

- Onboard RGB colour and brightness
- Delete unused blocks
- Bottom panel and variable cleanup
- Remembered connection and non-interrupting connect
- Mecanum wheels library
- Remote control library
- Remote page layout choice
- Networking and join fixes
- Confirmed USB uploads and module refresh
- OLED scrolling text

### Changes 29-43

The addendum in `docs/changes-2026-09-28.md` continues the fork evolution:

- TCS34725 colour sensor library
- Python no longer required to run the IDE locally (Delphi server)
- Scratch-style lists in Variables category
- Live variable/list watching
- Wait block compatibility with stored text values
- Improved XRPServe startup and no-window operation
- Character LCD 16x2 library
- Character LCD 20x4 library
- Encrypted pack and licensing banner
- Smoother, more accurate turns
- Gentle, accurate drive straight
- Mecanum turn checks using the gyro
- Single acceleration block for all movement types
- Triggers library for background lights/servos
- Export blocks to PNG

## Practical fork notes

This fork is not a neutral upstream sync. It is a classroom-oriented local build with priorities such as:

- reliable offline/local operation
- safer deployment to the robot
- simpler block editing for beginners
- more device support without editing the core app
- add-on libraries as data files rather than hard-coded source changes

## Main documentation locations

- `README.md` — project overview and entry point
- `docs/changes-2026-09-20.md` — detailed change summary for changes 19-28
- `docs/changes-2026-09-28.md` — detailed change summary for changes 29-43
- `XRPBlocks-replication-guide.md` — historical replication guide for changes 1-28; kept for reference
- `docs/` — deeper setup and usage notes for specific features

## Upstream status

This fork tracks the upstream XRPBlocks project but diverges in multiple areas. The most important differences are educational and operational rather than purely cosmetic: the fork focuses on classroom deployment, device expandability, and robot-safe runtime behaviour.

If you need to document a local fork version for a school deployment, use this file together with the project README and the detailed change addenda in `docs/`.
