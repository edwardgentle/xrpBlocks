# XRPServe (Delphi background app)

A Python-free replacement for `serve.py` / `start-xrpblocks.bat`. It serves
this folder over `http://localhost:8765/`, sends the same three no-cache
headers, and opens the default browser — nothing else. Runs with **no
visible window** — no console, no form, nothing in the taskbar. See
`XRPServe.dpr` for the full commented source.

## Building

1. Open `XRPServe.dpr` in Delphi (any recent version — it only uses Indy,
   which ships in the box; no extra packages to install).
2. It's a GUI-subsystem app with no window of its own, so no VCL/FMX
   platform is required either. Build for Win32 or Win64, Release
   configuration.
3. Compile. You get one file: `XRPServe.exe`.

If Delphi complains it can't find the Indy units, they are not installed for
your target platform in Tools > Manage Platforms — tick the box for the
platform you're building and rebuild.

(Delphi's own Project Options may still list this as a "Console" app type in
the IDE — that's just IDE metadata left over from the earlier console
version and is harmless; what actually controls whether Windows shows a
window is the `{$APPTYPE GUI}` directive at the top of `XRPServe.dpr`, and
that's already set correctly.)

## Deploying

Copy the compiled `XRPServe.exe` into the XRPBlocks app folder, i.e. next to
`index.html` (the same folder as `serve.py` and `start-xrpblocks.bat`).
No other files are needed and no Python install is required on the target
PC — this is the one and only runtime dependency `serve.py` had.

## Running

Double-click `XRPServe.exe`, or from a command prompt:

    XRPServe.exe [port]

Default port is 8765, matching `serve.py`. It prints nothing and shows no
window — it just starts listening, opens the browser after ~1.5 seconds,
and then sits quietly in the background. Check Task Manager > Details if
you ever need to confirm it's running (`XRPServe.exe`).

To stop it, either:

    XRPServe.exe stop [port]

(signals the running instance to shut down cleanly — same port you started
it on, defaulting to 8765 if you omit it), or just end the process from
Task Manager. There's no window to close any more.

Starting a second instance on a port that's already running shows a small
"already running" message box instead of silently colliding with the first
one.

## What was NOT ported (on purpose)

These are development-time Python scripts, never touched by the running app,
so they stay as-is and Python stays installed only on the dev machine (yours),
never on an end user's PC:

- `tools/embed_drivers.py` — bakes `lib/*.py` drivers into `devices/*.json`
  before you ship a build.
- `tools/test_mecanum.py`, `tools/test_remote_control.py` — dev test
  harnesses.

The app itself (`js/*`) runs entirely client-side; MicroPython code is
generated in the browser by Blockly's Python module, and the robot
connection uses WebSerial/WebBluetooth — neither depends on `serve.py` or on
Python at all.

## Notes / things worth checking before relying on this in the field

- Not yet run against real hardware/browsers as a background/no-window app
  — build and smoke-test it (start it, confirm no window appears, confirm
  the browser opens and loads the IDE, connect to the XRP, run a program,
  then confirm `XRPServe.exe stop` shuts it down cleanly) before retiring
  the console version or `serve.py` from your distributed copies.
- MIME type list covers the extensions this repo currently uses. If you add
  a new asset type later, add its extension to `MimeTypeFor`.
- The path-traversal guard in `ResolvePath` blocks `..` escapes; if you ever
  serve symlinked folders outside `DocRoot`, review that logic again.
- Fatal startup errors (missing `index.html`, bad port, port already in
  use, already running) now show as a small Windows message box instead of
  console text, since there's no console any more to print to. A
  successful start is silent by design — the browser opening is the only
  confirmation you get, so if the browser never opens, check for one of
  those message boxes or check Task Manager.
