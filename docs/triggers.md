# Triggers library (lights and servos)

[Documentation](README.md) · [Testing status](testing-status.md)

Version 1.0.0. Library file `devices/triggers.json`, driver `lib/XRPTriggers.py`.

The Triggers library lets a program say "when this happens, do that" once, at
the start, and then forget about it. Brake lights come on while the robot
brakes, an indicator blinks while it turns, a servo lifts a flag while a
button is held, and the program itself carries on driving without having to
check anything.

## A first program

    set up triggers, check 20 times a second
    while braking         show red    solid    on the brake light
    while turning left    show orange blinking on the left indicator
    while turning right   show orange blinking on the right indicator
    repeat 4
        drive straight 30 cm
        turn 90 degrees

With nothing else assigned, all three lights use the onboard RGB light. The
brake light wins when two want it at once (see "Priority" below).

## How it works

One virtual `machine.Timer` calls the engine about 20 times a second. On the
XRP this is a soft callback: MicroPython runs it on the main thread between
two steps of your program, so it borrows a little time rather than running in
parallel. XRPLib already does the same thing for every encoded motor (a 20 ms
timer each) and for the gyro.

Each check reads a few quick things (the wheel encoders, pins, the line
sensors, the battery, the clock and any values your program has posted), then
changes a light or a servo only if it needs to change.

The engine never uses I2C. The gyro, the distance sensor, the colour sensor,
the OLED and the LCD are read by your own program, which can post a reading
with **set trigger value** for a trigger to test.

## Events

| Event | Happens while |
|---|---|
| always | always (a headlight, for example) |
| moving | either drive wheel turns faster than 0.5 cm/s |
| driving forward | the robot's speed is above 2 cm/s forwards |
| reversing | the robot's speed is above 2 cm/s backwards |
| turning left / right | the robot turns faster than 20 degrees per second |
| braking | the robot's speed drops faster than the braking sensitivity |
| stopped | both wheels have been still for 0.2 seconds |
| board button pressed | the user button on the XRP is held |
| emergency stop is on | after an emergency stop, until it is cleared |
| trigger A to D | a trigger you define (below) |

Movement is read from the left and right drive wheels (motor ports 1 and 2),
so it works with every Drive block, the motor blocks, arcade drive and the
remote control. Wheel sizes are the standard XRP ones (6 cm wheels, 15.5 cm
track). On a mecanum robot, ports 1 and 2 are the two front wheels, so
sideways moves are not seen reliably.

**Braking sensitivity** is how fast the speed must fall: low 30, medium 15,
high 8 cm/s each second. The gentler acceleration settings (change 41) slow
down gently too; with "extra slow" or "slow", choose high.

## Your own triggers: A, B, C and D

- **define trigger A: speed (cm/s) > 20**: speed, turning speed, distance
  travelled, battery voltage, line sensor left or right (0 white to 1 black)
  or seconds since start, compared with >, <, = or not equal.
- **define trigger B: GPIO 12 is pressed**: a switch or bumper wired between
  the pin and GND. The pin is pulled up inside, so pressed reads low.
- **define trigger C: value "tilt" > 20**: a value your program posts with
  **set trigger value "tilt" to (pitch)**. The value may be text as well, for
  example a colour name from the colour sensor.
- **define trigger D: every 2 seconds**: a short pulse every so many seconds.

**trigger measurement** reports what the engine sees. Print it while the
robot moves to choose thresholds for your own robot and floor.

## Lights

A rule shows a colour, **solid**, **blinking** (0.3 s on, 0.3 s off) or
**pulsing** (a 1.2 s fade), on one of six lights: brake light, reversing
light, left indicator, right indicator, headlight and status light.

Assign each to real hardware:

- **use the onboard RGB light as the ...**
- **use the board LED as the ...** (single colour: any colour lights it)
- **use the LED on GPIO 13 as the ...** (an LED with a 220 ohm resistor to GND)
- **trigger LED strip on Servo 2 (GPIO 9) with 8 pixels**, then
  **use strip pixels 0 to 1 as the left indicator**

A light with no assignment uses the onboard RGB light.

**Priority.** When two lights share one output: brake, then reversing, then
left, right, headlight and status. When two rules drive the same light, the
first one in the program wins. **set the status light to green solid** sets a
light by hand; any rule for the same light takes over while it is happening.

**Brightness** is 30% unless set otherwise (0 to 100%).

**Hold time.** After an event ends, its lights and servos stay on for at least
0.3 seconds, so a short brake or a tap on a button is still visible. Change it
with **keep trigger actions on for at least ... seconds**.

## Servos

**while trigger A move servo 1 to 150 degrees at 60 degrees/s, then back to
90 degrees.** Speed 0 moves at once. When the rule ends the servo returns to
its resting angle, and after that it is free for the Servo blocks again.
Angles are held between 5 and 175 degrees, as in the Servo category.

A servo that moves while the wheels are driving adds a current spike on the
battery. If the robot resets or the gyro jumps when a servo moves, that is
the likely cause.

## Emergency stop (opt-in)

**emergency stop when trigger A** brakes every motor the moment trigger A
happens, and from then on ignores every motor command until **clear
emergency stop**. It stays on after the trigger ends (it is latched).

Your program keeps running: a drive straight or turn in progress waits out
its time limit with the wheels held still. Use **emergency stop is on** to
react, for example:

    if emergency stop is on
        set the status light to red blinking
        wait for button
        clear emergency stop

Treat this as a classroom safety aid, not a guarantee: it acts at the next
check (within 50 ms at 20 checks a second), and it relies on the program and
the engine still running.

## Limits and safety caps

- 2 to 50 checks a second (20 by default).
- Each check should take less than 1.5 ms. If three in a row take longer, the
  engine checks half as often and prints a line in the Console.
- A trigger LED strip is limited to 30 pixels, because writing a long strip
  holds up everything else.
- An error inside the engine stops the engine and prints the error; your
  program carries on.
- **automatic triggers off** pauses every rule, including the emergency stop
  rule. Lights set by hand stay on.

## Stopping

Only one engine runs at a time: running a program again replaces it. The
**Stop** button stops it and switches its lights off (USB). Over Bluetooth,
Stop restarts the robot, which ends it as well. A program that simply
finishes leaves the engine running, so its lights keep working until Stop.

## Do not mix with

- the Board category's RGB blocks, once the onboard RGB light is used by a
  trigger light: both would write to it;
- the NeoPixel library on the same pin as the trigger strip;
- the Servo blocks on a servo, while a servo rule for it is active.

## Testing

`tools/test_triggers.py` runs the driver against stand-ins for the timer,
encoders, pins, strip and servos (69 checks: events from scripted speed
profiles, false braking under noisy wheel speeds, priority, patterns, hold
time, custom triggers, servo sweeps, the emergency stop, the time budget and
stopping). It does not replace a test on the robot.
