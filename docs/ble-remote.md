# Phone control over Bluetooth

Add **Phone control (Bluetooth)** from Library. It lets an Android phone drive
the robot with a joystick, a D-pad and six buttons, with no Wi-Fi network or
hotspot. It is independent of motors and every other library: your program
decides what each input does.

For Wi-Fi control from any phone or laptop, use the separate
[Remote control](remote-control.md) library instead.

## What you need

- An **Android phone with Chrome**. The phone page uses Web Bluetooth, which
  Chrome on Android supports. iPhone Safari does not support Web Bluetooth.
- The phone page, `phone/index.html`, opened from an **https://** address
  (see "Hosting the phone page" below). Chrome refuses Bluetooth on plain
  `http://` pages and on files opened from the phone's storage.
- The robot's own Bluetooth files in `/lib/ble` on the robot. The official
  XRPCode IDE installs these with XRPLib. If they are missing, the start block
  prints a message in Console and the program carries on without phone control.

## How it works

The XRP already has a Bluetooth serial link (Nordic UART Service, advertised
as `XRP-` followed by part of the board's ID). It is the link an IDE uses when
you connect over Bluetooth. This library does not take over the radio:

1. **phone control over Bluetooth: start** checks that the link is running and
   starts it if not (the same check the official XRPCode `main.py` makes).
2. The phone page connects to that link, just as an IDE would, and writes
   short text lines. While a program runs, they arrive on the robot's input.
3. The reading blocks collect those lines. The robot answers with short status
   lines, which the page uses to know a program is listening.

Consequences worth knowing:

- **The phone and a Bluetooth IDE cannot be connected at the same time.**
  Disconnect the IDE first. A USB connection to the IDE is fine alongside the
  phone, and the Console hides the library's status lines.
- Every line the phone sends starts with `#`, so if the program has stopped
  and the robot's REPL receives one, Python treats it as a comment. The page
  never sends Ctrl+C or the IDE's stop signal.
- The robot only answers while a program reads phone blocks, and the phone
  only sends button states while it hears those answers, so nothing piles up
  when no program is listening.

## First program

Working program **23 Phone - Bluetooth joystick driving** is this program:

Under **when program starts**:

1. **phone page title** "XRP phone drive" and **phone button 5 A label**
   "Light" (optional).
2. **phone control over Bluetooth: start**.
3. **repeat forever**:
   - **if phone connected**:
     - **arcade drive forward** = **phone joystick forward/back**,
       **turn** = 0 minus **phone joystick left/right**.
     - If **phone button 5 A held**, LED on; else LED off.
   - **else**: **stop** and LED off.
   - **wait 0.02 seconds**.

Deploy it, or Run it over USB. Then on the phone: open the page, tap
**Connect**, choose the robot (`XRP-...`). The status line turns green when
the program is listening.

The arcade block's turn input is positive towards the left
(the right wheel runs faster), which is why the program uses **0 minus**
left/right. Which way a positive arcade turn really steers is still to be
confirmed on hardware (working program 08); if the robot turns the wrong way,
remove the "0 minus".

## Blocks

| Block | What it does |
| --- | --- |
| **phone control over Bluetooth: start** | Makes sure the Bluetooth link is on, then listens. Put under "when program starts". |
| **phone page title** | Text at the top of the phone page (up to 40 characters). |
| **phone button N label** | Name on a button (up to 16 characters). Numbers stay 1 to 6. |
| **phone update** | Reads waiting messages. Only needed in a loop that reads no phone blocks. |
| **phone connected** | True while the page is sending; false one second after it stops. |
| **phone button N held** | True while held; false on release or one second after the phone stops. |
| **phone button N just pressed** | True once per press; reading uses it up. |
| **phone joystick forward/back** or **left/right** | -100 to 100; 0 in the middle or when disconnected. Forward and right are positive. |
| **phone show text** | A short line (up to 60 characters) shown under the title. Once or twice a second is plenty. |
| **phone show value** *name* = *value* | A named reading as a tile, e.g. Distance cm = 23.4. Up to 8 names; decimals rounded to 2 places. Only shown when **Show robot messages** is ticked. |
| **phone print** | Adds a line (up to 60 characters) to the phone's message log. Only shown when **Show robot messages** is ticked. |
| **phone release all buttons** | Clears button and joystick states. Does not stop anything. |

Button map on every layout: Up = 1, Left = 2, Right = 3, Down = 4, A = 5,
B = 6. The phone page offers four layouts (Joystick, Game D-pad, Button grid, Messages),
remembered by that phone's browser.

## Readings and messages from the robot (1.1.0)

Tick **Show robot messages** on the phone page (the choice is remembered on
that phone). The page then shows:

- **Tiles** for every **phone show value** the program uses: one tile per
  name, updated in place and briefly highlighted when the value changes.
- **Messages from the robot**: the last 20 **phone print** lines with the
  time they arrived, and a Clear button.

The robot only sends these while the box is ticked, so they cost nothing
when nobody is watching. **phone show value** can go in every pass of a fast
loop: the robot sends changes at most five times a second and repeats every
reading every two seconds. Keep **phone print** for events ("Obstacle!",
"Lap 3"), since each line is sent once. When you tick the box, the last 8 log
lines the program printed are sent straight away.

**Messages view:** choose **Messages** in the page's Layout list for a screen
with no controls: one large block listing every reading (name on the left,
value on the right) and the message log below it. It works whether or not the
tick box is ticked; the tick box keeps its own setting for the other layouts.
The robot still sees the phone as connected, with no buttons held and the
joystick at 0.

Ordinary **print** blocks still go to the IDE Console only; the phone does
not receive them.

Working program **24 Phone - readings and messages** shows the distance
sensor, heading and left line sensor as tiles and logs a line each time you
tap A.

## Safety

- **Stopping is the program's job.** If the phone locks, switches app, leaves
  range or disconnects, every input returns to released/0 within about a
  second and **phone connected** becomes false. Put **stop** (and any other
  Off blocks) in the "else" branch, as in the first program.
- The page releases everything when it loses focus or is hidden.
- The library is cooperative, not a background thread. Keep the loop short:
  a long **drive 50 cm** or **turn 90 degrees** block inside the loop means
  the robot does not read the phone until that block finishes.

## Hosting the phone page

Chrome only allows Web Bluetooth on a secure page. Options, in order of
preference:

1. **Any https web host.** `phone/index.html` is one self-contained file with
   no other files or internet resources, so it can go on GitHub Pages or any
   school web server that uses https. Add it to the phone's home screen from
   Chrome's menu for one-tap access.
2. **For testing only:** serve the IDE folder from the laptop (XRPServe) and,
   on the phone, open `chrome://flags`, find "Insecure origins treated as
   secure", add the laptop's address (for example `http://192.168.1.20:8765`)
   and restart Chrome. Whether XRPServe accepts connections from other devices
   on the network has not been checked. Do not leave this flag set on
   learners' phones.

The same page also works in Chrome or Edge on a Windows laptop with Bluetooth,
which is handy for testing without a phone.

## Limits

- Android Chrome only (plus desktop Chrome/Edge). iPhone would need a
  third-party Web Bluetooth browser; not tested.
- One phone per robot, and not while a Bluetooth IDE is connected.
- Relies on the Bluetooth REPL files installed by the official IDE and on
  the robot's input being readable while a program runs; **not yet confirmed on
  hardware** (see the checklist in the change record).
- Short taps shorter than one message (about a tenth of a second on a busy
  link) could be missed by **just pressed**; use **held** for anything that
  must not be missed.

## Files

- `lib/BLERemote.py`: the driver (source of truth; `tools/embed_drivers.py`
  copies it into the manifest).
- `devices/ble-remote.json`: the library (12 blocks, English and Dutch).
- `phone/index.html`: the phone page.
- `tools/test_ble_remote.py`: driver tests with stand-in input.
- `tools/test_phone_page.py`: the real phone page in headless Chromium talking
  to the real driver through a stand-in Bluetooth link.
