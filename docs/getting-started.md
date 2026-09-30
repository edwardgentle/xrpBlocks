# Getting started

[Documentation](README.md) · [Project home](../README.md)

## Open the editor

Open [XRP Blocks](https://edwardgentle.github.io/xrpBlocks/) in Chrome or Edge for a USB robot connection. There is no build step.

To run a downloaded copy locally, extract the complete repository, including its folders:

- **Windows:** run `XRP Robotics.exe` next to `index.html`.
- **With Python installed:** run `python serve.py` from the repository folder.

The local address is `http://localhost:8765/`. Open that address in Chrome or Edge if the default browser cannot connect to the robot. Opening `index.html` directly as a file does not work with the editor's JavaScript modules.

See the [Delphi server guide](../delphiSource/README.md) if you are compiling your own server.

## Connect and run

1. Connect the XRP by USB and click **Connect XRP**.
2. Build a program under **when program starts**, or use **Load** to open an [example program](../working%20programs/README.md).
3. Click **Run** to execute it. Use **Stop** to interrupt it.
4. Use **Save** to keep a project file on your computer.

**Connect** preserves a program already running on the robot. **Deploy** saves `main.py` but does not run it; click Run or restart the robot afterwards. Run, Stop and Deploy can interrupt execution.

Loading a project replaces the workspace. Save your current work first. Some example programs start moving immediately; read each program's notes before running it.

## Add devices and lessons

Click **Library** to add a device's blocks. Libraries used by a saved program are restored from the catalogue when available. See [Device libraries](../devices/README.md) for installation and wiring notes.

Click **Lesson** and select a lesson JSON file. Lessons can provide starter blocks and restrict the toolbox. The [lesson guide](lessons.md) explains the format and links to examples.

## Companion pages

| Page | How to use it |
| --- | --- |
| [OLED designer](https://edwardgentle.github.io/xrpBlocks/oled-designer/) | Draw a picture, choose **Copy for XRP Blocks**, then paste into a show-picture block |
| [Phone controller](https://edwardgentle.github.io/xrpBlocks/phone/) | Open in Android Chrome and follow [Bluetooth setup](ble-remote.md) |
| Wi-Fi remote controller | Run a remote-control program and open the robot's printed address; follow [Wi-Fi setup](remote-control.md) |

A phone controller and a Bluetooth IDE cannot connect to the robot at the same time. A USB IDE connection can remain connected.

## Next steps

Use the [learner manual](../XRP-Robotics-Learner-Manual-v3.pdf), [keyboard shortcuts](keyboard-shortcuts.md), and [documentation index](README.md). Check [Testing status](testing-status.md) before relying on a feature that still needs hardware validation.
