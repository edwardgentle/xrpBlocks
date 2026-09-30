# XRPServe local server

[Documentation](../docs/README.md) · [Development](../docs/development.md) · [Encrypted pack](PACKING.md)

XRPServe serves the application folder at `http://localhost:8765/` and opens the default browser. It is a Windows alternative to `python serve.py`; users do not need Python to run a compiled server.

For the supplied application, start with [Getting started](../docs/getting-started.md).

## Build

1. Open `XRPServe.dpr` in Delphi with Indy available for the target platform.
2. Build a Release configuration for Win32 or Win64.
3. Copy the resulting `XRPServe.exe` beside the application's `index.html`.

Keep the full application folder, including CSS, JavaScript and device files. The server executable alone does not contain the editor.

## Run

```text
XRPServe.exe
XRPServe.exe 8766
```

The second example selects a different port. Open the printed localhost address in Chrome or Edge when using USB robot connection.

## Console and shutdown behaviour

The checked-in source currently uses `APPTYPE CONSOLE`, prints the serving address and waits for **Enter** to stop. Earlier development notes describe a windowless version; that description does not match this source.

A `stop [port]` command remains in the source, but signals an event that the serving path does not wait on. Use Enter in the server console for this version. The supplied executables have not been rebuilt or behaviourally verified during this documentation cleanup.

## Verification

After building, check startup, browser loading, robot connection and shutdown. Test a second launch and a port already in use. See [Testing status](../docs/testing-status.md) for the outstanding checks.

The MIME table and path-resolution guard live in `XRPServe.dpr`. Review them when adding new asset types or changing the served folder.

Python remains a development dependency for driver embedding and checks; see the [development guide](../docs/development.md).
