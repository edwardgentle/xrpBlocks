# Mecanum wheels library

[Documentation](README.md) · [Testing status](testing-status.md)

In **Library**, add **Mecanum wheels (4 motors)**. Its driver is uploaded
automatically when a program uses a Mecanum block.

Assumes four encoded XRP motors and standard 45-degree mecanum wheels in an
X roller arrangement viewed from above. Default connections:

| Corner | Motor port |
|---|---|
| Front left | 1 |
| Front right | 2 |
| Rear left | 3 |
| Rear right | 4 |

Place the motor assignment and chassis settings blocks first under **when program starts**. Choose each port
once. Enter actual wheel diameter, front-to-rear axle spacing (wheelbase), and
left-to-right wheel-centre spacing (track), all in centimetres. Defaults of
6/15/15 cm are placeholders. Maximum wheel RPM defaults to 100; speed percentage
scales this RPM target, not motor power or measured chassis speed.

If a wheel turns the wrong way, use its direction block before moving. These
settings are relative to XRPLib's default direction, which already reverses
ports 1 and 3. Test at low speed with wheels lifted first.

## Acceleration (1.4.0)

The Drive category's **acceleration [extra slow | slow | medium | fast | extra
fast]** block also sets how gently Mecanum distance moves and turns speed up
and slow down (medium if the program has no acceleration block). Continuous
drive is not ramped. The ramp has not yet been tested on hardware.

If you added this library in the IDE before version 1.4.0, re-add it through
**Library** (or reload the IDE) so the new driver is uploaded.

## Blocks

- Compact motor assignment (FL/FR/RL/RR) and separate chassis settings with one value per row.
- Reverse one wheel.
- Move in eight directions at a speed percentage for a distance in cm.
- Move at an arbitrary angle: 0 forward, 90 right, 180 backward, 270 left.
- Drive continuously in a selected direction; follow with Stop when finished.
- Turn left/right in place by degrees at a speed percentage.
- Stop all four motors.
- Report whether the last distance move or turn completed.

Example: setup → move right at 30% for 20 cm → turn right at 30% for 90°.
Existing combined setup blocks still load; replace them with the two new blocks
to use the compact layout. Keep your previous dimensions when replacing them.
Distance/turn blocks wait, then stop. Each has a timeout (default 15 seconds);
increase it for long or slow moves. Zero speed stops without moving. Speed is
clamped to 0–100%; distances and turn angles must be non-negative.

Encoder rotation estimates distance and turn angle; these are not
ground-truth position measurements. Since version 1.2.0 a turn is checked with
the gyro when one is available: after the encoder turn the driver waits 200 ms,
reads the gyro and makes up to 20 small corrections (at no more than 20% speed)
until the robot is within 0.5 degrees of the target. It stops correcting, with
a Console message, if a correction makes the error worse. Without a gyro the
turn is encoder-only, as before. The Drive category's **set turn calibration**
block does not apply to Mecanum turns. Wheel slip, uneven floors and chassis
geometry still affect distance accuracy. Diagonal commands account for the different
wheel travel required. Avoid mixing Drive/Motors commands with Mecanum commands
while the robot is moving, since they share motor instances and controllers.

Desktop tests cover direction signs, speed limits, straight/diagonal distance,
turn geometry, reversal, stalls/timeouts, invalid input, and interruption.
Physical robot validation and calibration remain outstanding.

API and kinematics references:
- https://github.com/Open-STEM/XRP_MicroPython/blob/main/XRPLib/encoded_motor.py
- https://docs.wpilib.org/en/stable/docs/software/kinematics-and-odometry/mecanum-drive-kinematics.html

Driver source: `lib/MecanumDrive.py`. After editing, run
`python tools/embed_drivers.py` to update the shareable JSON library.
