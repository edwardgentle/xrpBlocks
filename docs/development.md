# Development guide

[Documentation](README.md) · [Project home](../README.md)

## Source layout

| Location | Contents |
| --- | --- |
| `index.html`, `css/`, `js/` | Editor, Blockly blocks and generators, UI and robot transports |
| `devices/` | Device catalogue and installable JSON manifests |
| `lib/` | MicroPython driver sources |
| `phone/` | Bluetooth controller page |
| `tools/` | OLED designer, embedded Wi-Fi controller, packaging and checks |
| `delphiSource/` | Windows local-server and encrypted-pack projects |
| `examples/lessons/`, `lessons/` | Lesson files |
| `working programs/` | Saved example and validation projects |

Serve the current checkout as described in [Getting started](getting-started.md). To rebuild the application from upstream, use the [replication guide](../XRPBlocks-replication-guide.md) (changes 1 to 46). Do not use the 20 September snapshot in `docs/history/` for that: it stops at change 28.

## Editing drivers and libraries

Driver source in `lib/` is embedded into device manifests. After changing a driver, run these commands from the repository root:

```text
python tools/embed_drivers.py
python tools/embed_drivers.py --check
```

For the Wi-Fi remote, also embed after editing `tools/remote-control.html`. See the [manifest reference](../devices/README.md) before changing a library's structure.

Refresh the editor and re-add an updated library as needed, then use USB Run or Deploy to install its driver. Check Console for upload errors. Deploy saves the program without starting it.

## Available checks

These are maintenance commands, not a claim that they have been run for this documentation update.

| Area | Command |
| --- | --- |
| Mecanum | `python tools/test_mecanum.py` |
| Wi-Fi remote | `python tools/test_remote_control.py` |
| LCD driver | `python tools/test_lcd1602.py` |
| Triggers | `python tools/test_triggers.py` |
| Bluetooth driver | `python tools/test_ble_remote.py` |
| Phone page | `python tools/test_phone_page.py` |

The browser checks require Python Playwright and its browser installation. Inspect each tool's imports and usage before running it in a new environment.

`tools/wp_check.py IN_DIR OUT_DIR` loads and re-saves example programs through Blockly using an editor served at `http://localhost:8799`. Its output includes generated Python. `tools/wp_run.py PY_DIR [names...]` runs that Python against a simulated robot. Use a separate output directory so you can review generated changes.

Simulation does not establish hardware behaviour. Record new robot results in [Testing status](testing-status.md), with the tested setup and remaining limitations.

## Packaging

- [Build the Delphi server](../delphiSource/README.md).
- [Build an encrypted pack](../delphiSource/PACKING.md) only when that distribution is needed.
- Keep `PackKey.inc`, pack files and the executable containing the private key out of Git. These are excluded by `.gitignore`.

## Documentation maintenance

Keep the README short and use [Documentation](README.md) as the guide map. Put instructions in the relevant topic guide, verification evidence in [Testing status](testing-status.md), and dated changes in [Change history](CHANGELOG.md).

Regenerate the [replication guide](../XRPBlocks-replication-guide.md) after each numbered change with `python tools/gen_replication_guide.py . ../upstream XRPBlocks-replication-guide.md` (upstream checked out at `cd39757`; add the change to the table in the script first). It embeds every new or changed text file and writes a SHA-256 manifest with a verification script.

Preserve original authorship and license notices. Historical snapshots retain their original scope; do not treat their embedded source as the current implementation.
