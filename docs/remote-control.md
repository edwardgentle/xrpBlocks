# Remote control

[Documentation](README.md) · [Testing status](testing-status.md)

Add **Remote control** from Library. This standalone library uses Wi-Fi and a
robot-hosted HTML page. It has no motor, mecanum, servo, or LED dependencies.

## First program

Under **when program starts**:

1. Set the page title and button labels if desired.
2. Add **remote Wi-Fi**, choose **create hotspot**, and set a Wi-Fi name and
   password (8–63 characters). Defaults: `XRP-Remote` / `xrpremote`.
3. Add **repeat forever**:
   - **remote update**
   - If **remote button 1 held**, turn the onboard LED on; else turn it off.
   - Wait **0.02 seconds**.

Run over USB, open Console to read the printed address, then connect your phone
or laptop to the robot's Wi-Fi and open that `http://` address. Stay connected
even if the phone says the network has no internet. Alternatively use **join
network** with your existing Wi-Fi credentials; both devices must be on a network
that allows them to communicate. The installed firmware must support `network.WLAN`.

Join mode requires a 2.4 GHz network. It prints progress every five seconds,
reports password/network errors, and times out after 30 seconds. The router
assigns a new address; use the address printed in Console, not the hotspot's
192.168.4.1 address. Leave the password empty for an open network. Captive portal
and enterprise login flows are not supported by these name/password blocks.

The page has six buttons, touch/mouse/keyboard support, connection status and
**Release all buttons**. Expand **Customize button names** to rename buttons in
that browser; these local names override program labels until reset. Keyboard:
focus a button with Tab, then hold Space or Enter. One controller is active at a time.

Choose **Button grid** or **Game D-pad** from the page's Layout selector. The
choice is remembered in that browser. D-pad mapping: Up = 1, Left = 2,
Right = 3, Down = 4, A = 5, B = 6. Labels and program behavior remain unchanged;
direction symbols do not automatically drive motors. Switching layouts releases
held buttons.

## Using the inputs

- **held**: true while held, suitable for continuous actions.
- **just pressed**: true once per press (consumed when read), suitable for a
  single action. Very short taps can be missed on a slow connection.
- **controller connected**: true while messages arrive, not merely while Wi-Fi
  is connected.
- **page address**: use with Print or an OLED block.
- **close**: shut down the server and its Wi-Fi interface.

Button and connection reads also service the web server automatically (v1.0.2).
Use **remote update** in loops that do not read these inputs. No background thread is used. Keep the loop
short and avoid long waits or blocking distance/turn blocks while controlling
something live. Button reads expire to false after one second without messages.
This does not automatically stop actuators: explicitly put Stop/Off in the
else/disconnected branch. For mecanum, add that separate library and use its
continuous drive and stop blocks in these branches.

Wi-Fi passwords appear in saved projects and generated Python. Use a dedicated
robot password. The HTTP controller is intended for a private local network;
it is not an internet-facing authenticated service.

## Maintenance and validation

Driver: `lib/RemoteControl.py`. Page: `tools/remote-control.html`. Run
`python tools/embed_drivers.py` after editing either. The shareable
`devices/remote-control.json` contains both; no separate page upload is needed.
The standalone driver source has a page placeholder; the embedded manifest driver
is the deployable copy. Run `python tools/test_remote_control.py` for protocol tests.
Joining a home network was later reported working; full controller validation remains incomplete. See [Testing status](testing-status.md).

Reference: https://docs.micropython.org/en/latest/library/network.WLAN.html
