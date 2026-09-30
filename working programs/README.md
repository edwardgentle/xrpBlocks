# Working programs: XRPBlocks test set

[Documentation](../docs/README.md) · [Testing status](../docs/testing-status.md)

Open any file with **Load** in XRPBlocks. Device libraries a program needs (OLED, LCD, colour sensor and so on) are added automatically when it loads. Each program has a comment on its "when program starts" block saying what you should see. Test programs 01 to 22 that move the robot wait for the board button first; the manual programs are copied exactly and start moving straight away.

Built 26 September 2026; updated 30 September 2026 (programs 23 to 40, the phone programs, and the manual programs renumbered for manual v3.1). Every file was loaded into the real IDE (headless browser): all blocks kept, none disabled, no empty inputs, Python generated and compiled. The core, phone and new programs were also run for up to 60 simulated seconds against a stand-in robot and a scripted phone (`tools/wp_run.py`). **Only program 23 has been tried on the robot so far (the phone connected; driving not yet confirmed).**

**Phone programs (23 to 31, 38 to 40)** need the Phone control (Bluetooth) library, an Android phone with Chrome, and the phone page at [the phone controller](https://edwardgentle.github.io/xrpBlocks/phone/). Disconnect any Bluetooth IDE first (USB is fine). They start as soon as they run and stop the robot when the phone disconnects, instead of waiting for the board button.

## Core

| File | Needs | What it checks |
|---|---|---|
| 01 Board - LED and RGB | robot only | LED blink/on/off, 11 named RGB colours, brightness ramp, 3-channel RGB |
| 02 Board - button, print and wait | robot only | wait for button, button pressed, counting with a variable |
| 03 Lists - flash pattern (bug-fix retest) | robot only | **Retests changes 33 and 34**: list with no "set" block, text items fed to wait. Expect 8 flashes |
| 04 Lists - every list block | robot only | all 16 list blocks, each printed with its expected value, incl. edge cases |
| 05 Logic - functions, maths and text | robot only | functions with parameters and return, maths, if/else if, and/not, break |
| 06 Drive - square (turn, straight, acceleration) | floor space | straight, turn, acceleration setting, turn calibration, effort versions |
| 07 Drive - turn calibration (360 x 4) | floor space | turns 1440 degrees so you can work out the calibration percentage |
| 08 Drive - effort, arcade and encoders | lift wheels | set effort, arcade (**settles which way a positive turn steers**), speed control, encoders |
| 09 Motors - each motor | lift wheels | every motor port: effort, rpm, turns, counts, brake, coast, speed control |
| 10 Servo - angle, sweep, continuous | servo on port 1 (and 2) | angles, sweep, clamping of -20 and 200, end stops, continuous rotation |
| 11 Sensors - live readout | robot only | distance, line L/R, yaw, heading, pitch, roll, button, printed twice a second |
| 12 Sensors - drive until obstacle | floor space | drives until under 15 cm, RGB green then red, turns round |

## Displays

| File | Needs | What it checks |
|---|---|---|
| 13 OLED - text, values, bar, scroll | OLED at 0x3C | lines, big text, print, invert, brightness, live value, bar, scrolling text |
| 14 OLED - drawing and compass | OLED at 0x3C | lines, rectangles, circles, pixels, icons, gyro compass in manual update mode |
| 15 LCD - 16x2 | I2C 16x2 LCD | lines, write at column, cursor, backlight, power, print wrap, value, bar |
| 16 LCD - 20x4 | I2C 20x4 LCD | as above on 4 lines plus scrolling text |
| 17 LCD - 16x2 scrolling text | I2C 16x2 LCD | line 2 scrolls, line 1 stays still |

## Add-ons

| File | Needs | What it checks |
|---|---|---|
| 18 Colour sensor - TCS34725 readout | TCS34725 on Qwiic | R, G, B, raw light, lux, colour temperature, nearest colour name; RGB LED copies the colour |
| 19 PCF8575 - LED chase and button | PCF8575 at 0x20, LEDs on P00-P07, button on P10 | pin modes, LED chase, set and read pin, button |
| 20 NeoPixel - fill, pixels, rainbow | 8-pixel strip on Servo 1 (GPIO 6) | fill, single pixels, manual show, shift, rainbow |
| 21 Triggers - brake lights and emergency stop | floor space | brake/reverse/indicator/forward lights on the RGB, braking, button emergency stop, distance and battery measurements |
| 22 Remote control - D-pad driving | phone | hotspot XRP-Test / xrprobot, D-pad drives, B = lights, A = horn, stops when the phone disconnects |

## Phone (Bluetooth) and more examples

| File | Needs | What it checks |
|---|---|---|
| 23 Phone - Bluetooth joystick driving | Android phone | joystick arcade driving, A = LED, stops within about a second when the phone goes away |
| 24 Phone - readings and messages | Android phone | three reading tiles and a message log; tick box and Messages layout |
| 25 Phone - D-pad driving and lights | Android phone, floor space | Game D-pad driving, B toggles the LED, A "horn"; spin directions |
| 26 Phone - servo gripper | Android phone, servo on port 1 | joystick driving, hold A/B to open/close, angle kept 10 to 170 and shown as a tile |
| 27 Phone - sensor dashboard | Android phone | Messages layout with 8 tiles: distance, both line sensors, yaw, heading, pitch, roll, button; A zeroes yaw |
| 28 Phone - obstacle guard | Android phone, floor space | refuses to drive forward closer than 15 cm (can still turn and reverse), logs "Too close!" once |
| 29 Phone - RGB colour mixer | Android phone | D-pad chooses and changes red, green, blue; values stay 0 to 255 however long you hold |
| 30 Phone - brightness with limits | Android phone | the fixed brightness program: Up/Down by 5, stops at 0 and 255 without crashing, A mixes blue |
| 31 Phone - line follower tuning | Android phone, dark line | A starts/stops, Up/Down speed 10 to 60%, Right/Left threshold 0.1 to 0.9, line tiles |
| 32 Functions - polygon gallery | floor space | a function with an input: triangle, square, pentagon, hexagon, one per button press |
| 33 Drive - figure of eight | floor space | arcade curves with timing; tune turn and time until both loops match |
| 34 Sensors - spirit level | robot only | RGB green/yellow/red by tilt, pitch and roll in the Console; also a gyro drift check |
| 35 Logic - patrol state machine | floor space with walls | states drive, turn and done in a "repeat until" loop; RGB shows the state; stops after 5 turns |
| 36 Lists - route from text | floor space | "20,90,30,-90,20,180" split into a list and driven two items at a time |
| 37 Functions - dance routine | floor space | a function with an input and a function that returns a value (speed kept to ±60%) |
| 38 Phone - driving with trigger lights | Android phone, floor space | Triggers lights (brake, reverse, indicators, forward) while driving from the phone; speed and battery tiles |
| 39 Phone - tap counter | Android phone | "just pressed" reliability: tap A 20 times quickly, the tile should read 20 |
| 40 Phone - connection watchdog | Android phone, USB Console | green while connected, flashing red when not; counts connections; lock the phone to test |
| 41 Arcade drive with held rpm (ArcadeS) | floor space | an XRPCode "ArcadeS" function rebuilt: held rpm per wheel from straight and turn (-1 to 1). A better "arcade rpm" version (percent, limits, dead zone) is in the file, switched off; enable it and its test stack to try it |
| 42 Lists maths, accelerometer and motor reverse | USB Console; wheels off the table for part 3 | change 46: sum 25, average 5.0, smallest 1, largest 9, median 5; sorted lists; items 2 to 4; accelerometer X/Y/Z (Z about 1 g flat); left motor turns opposite ways with "reversed" on and off, and both positions count up |

## Manual programs

Download the [learner manual](../XRP-Robotics-Learner-Manual-v3.pdf). The filenames below retain the page numbering recorded for manual v3.1.

Every example program from *XRP Robotics Learner Manual v3.1* (PDF), rebuilt block for block. The number after p is the page in the v3.1 PDF (renumbered on 30 September 2026: Chapter 11 grew by five pages); a letter (a, b, c) means there is more than one program on that page. Each program's comment names its page (and section where known). Where the manual used a Wi-Fi name and password, the same ones are used here.

| File | Notes |
|---|---|
| p07 - First drive |  |
| p08 - Hello XRP |  |
| p12 - Traffic light |  |
| p16a - Drive for 2 seconds |  |
| p16b - Square with repeat |  |
| p17a - Any polygon | Change sides to draw other shapes. |
| p17b - Drive speed |  |
| p17c - Stop by encoder | Drives until the left wheel has gone 50 cm. |
| p21a - Servo sweep forever |  |
| p21b - Servo on button |  |
| p24a - Line sensor readout | Move the sensor over black and white to find your threshold. |
| p24b - Line follower | Follows the edge of a line with the left sensor. Threshold 0.5 not yet tested on the robot. |
| p25a - Start on button |  |
| p25b - Gyro heading | Keep the robot still during calibrate. |
| p26 - Keep 20 cm away | Gain 3 not yet tested on the robot. |
| p30 - Avoid obstacles |  |
| p31 - Distance and button light | Red only when something is close AND the button is held. |
| p32 - Random dance |  |
| p34 - Counting | Try 7.2: right-click count and choose Watch this value. |
| p36 - List of servo angles |  |
| p39a - Drive a square function | The function is the separate green stack. |
| p39b - Shape with sides | Triangle then pentagon. |
| p43a - OLED distance |  |
| p43b - OLED compass |  |
| p46 - NeoPixel rainbow | 10-pixel strip on Servo 1 (GPIO 6). |
| p49 - Brake lights and indicators | Triggers library: lights run by themselves while the square drives. |
| p51 - First remote program | Join Wi-Fi XRP-Remote, password xrpremote. |
| p52 - D-pad driving | Spin directions not yet tested on the robot. |
| p55 - Phone joystick driving | Section 11.5. Same program as working program 23. |
| p57 - Phone readings and messages | Section 11.6. Choose the Messages layout on the phone. |
| p61 - Mecanum first moves | Needs the four-motor mecanum chassis. Measure and change the geometry values. |
| p63 - State machine |  |

## Notes

- Change pins, addresses and pixel counts in the first blocks to match your wiring.
- To test the live watch (change 32), open 03, right-click the TEST block, choose "Watch this value", then Run and hover over it. Watches are stored in the browser, so they cannot be saved inside these files.
- Loading a program replaces what is on the canvas. Save your own work first.
- Programs that drive or turn by distance write `turnlog.txt` on the robot and print a report line per move (the movement diagnostics from changes 38 to 41).
