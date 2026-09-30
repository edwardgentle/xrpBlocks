# Testing status

[Documentation](README.md) · [Development guide](development.md)

This page consolidates the repository's recorded results through 30 September 2026. These are prior reports, not new hardware tests performed during the documentation cleanup.

## Recorded hardware results

| Area | Recorded evidence | Limits |
| --- | --- | --- |
| OLED display | The previous project README reports the OLED library and scrolling working on the robot | Does not establish every display feature or wiring combination |
| Wi-Fi remote | The previous project README reports joining a home network successfully | Earlier September notes describe a failed network lookup; full remote-control coverage is not established |
| Drive and turn | The 28 September record reports turns and drive straight with acceleration working | Distance carry-over and line keeping still need hardware checks |
| Bluetooth phone | The working-program notes dated 30 September report that program 23 connected to the phone | Driving was not confirmed |
| Lists and watches | A first hardware run exposed bugs that were subsequently fixed | Fixes 33–34 and broader list/watch behaviour still need retesting |

## Outstanding checks

- LCD 16x2 and 20x4, TCS34725 colour sensor, and Triggers on real hardware.
- Mecanum wiring, geometry, calibration and movement changes.
- Direction of positive arcade turning, including phone-controller steering.
- List numeric conversions, live-watch behaviour and serial output split across chunks.
- Drive-straight carry-over and line keeping.
- Delphi server and encrypted-pack startup, browser loading and shutdown.
- Exported PNG font appearance when the web font is available.

The [working-program catalogue](../working%20programs/README.md) identifies the equipment and expected behaviour for individual checks.

## Recorded automated checks

The dated records describe JavaScript syntax checks, driver compilation, simulated driver tests, manifest embedding checks, browser rendering, PNG export and pack verification. The working-program catalogue reports successful Blockly loading, Python generation/compilation and simulated runs for the documented program sets.

These results apply to the versions tested at the time. See [Development](development.md) for the available commands. The older replication guide's reported 913 checks are historical; its older harnesses are not included in this checkout.

## Source and documentation discrepancies

The Delphi README previously described a windowless build. The checked-in `XRPServe.dpr` instead declares `APPTYPE CONSOLE`, prints startup text and waits for Enter. It also has a `stop` command that signals an event, but the serving path waits on console input rather than that event. Do not assume that command cleanly shuts down this source version.

The bundled executable has not been rebuilt or inspected as part of this documentation update, so its behaviour is not inferred from the current source.
