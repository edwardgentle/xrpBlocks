"""Four encoded XRP motors, standard X-pattern mecanum wheels.

Order: front-left, front-right, rear-left, rear-right. Positive wheel motion
must propel that side forward. Distances are encoder estimates, not ground
measurements: roller slip and geometry require physical calibration.
"""
import math
import time
from XRPLib.encoded_motor import EncodedMotor


class MecanumDrive:
    def __init__(self):
        self.motors = None
        self._gyro = None
        self.accel = 0.5  # medium; set by the Drive category's acceleration block
        self.signs = [1, 1, 1, 1]
        self.configure(1, 2, 3, 4, 6, 15, 15, 100)
        self.last_move_completed = False

    def configure(self, fl, fr, rl, rr, diameter, wheelbase, track, max_rpm):
        ports = [int(p) for p in (fl, fr, rl, rr)]
        values = [float(v) for v in (diameter, wheelbase, track, max_rpm)]
        if len(set(ports)) != 4 or any(p not in (1, 2, 3, 4) for p in ports):
            raise ValueError('Choose four different motor ports, 1 to 4')
        if any(not math.isfinite(v) or v <= 0 for v in values):
            raise ValueError('Wheel/chassis dimensions and maximum RPM must be positive')
        if self.motors:
            self.stop()
        self.motors = [EncodedMotor.get_default_encoded_motor(p) for p in ports]
        if any(not hasattr(m, 'set_speed') for m in self.motors):
            self.motors = None
            raise ValueError('This board must support four encoded motors')
        self.diameter, self.wheelbase, self.track, self.max_rpm = values
        self.ports = ports

    def set_ports(self, fl, fr, rl, rr):
        self.configure(fl, fr, rl, rr, self.diameter, self.wheelbase, self.track, self.max_rpm)

    def set_geometry(self, diameter, wheelbase, track, max_rpm):
        self.configure(*self.ports, diameter, wheelbase, track, max_rpm)

    def reverse(self, wheel, reversed):
        self.stop()
        self.signs[int(wheel)] = -1 if reversed else 1

    @staticmethod
    def _number(value):
        value = float(value)
        if not math.isfinite(value):
            raise ValueError('Movement values must be finite numbers')
        return value

    def _speed(self, percent):
        return max(0, min(100, self._number(percent))) * self.max_rpm / 100

    @staticmethod
    def _direction(angle):
        # 0 forward, 90 right, 180 backward, 270 left.
        radians = angle * math.pi / 180
        forward, right = math.cos(radians), math.sin(radians)
        values = [forward + right, forward - right, forward - right, forward + right]
        return [0 if abs(v) < 1e-9 else v for v in values]

    def _wheel_speed(self, index, rpm):
        motor = self.motors[index]
        motor.set_speed(rpm * self.signs[index])
        if rpm == 0:
            motor.brake()

    def stop(self):
        # Disable background speed controllers before braking all four motors.
        error = None
        for motor in self.motors or []:
            try:
                motor.set_speed(None)
                motor.brake()
            except Exception as exc:
                error = exc
        if error:
            raise error

    def drive(self, angle, speed):
        try:
            factors = self._direction(self._number(angle))
            rpm = self._speed(speed) / max(abs(v) for v in factors)
            for i in range(4):
                self._wheel_speed(i, factors[i] * rpm)
        except BaseException:
            self.stop()
            raise

    def _travel(self, wheel_cm, speed, timeout):
        self.last_move_completed = False
        try:
            rpm = self._speed(speed)
            timeout = self._number(timeout)
            if timeout <= 0:
                raise ValueError('Timeout must be positive')
            targets = [cm / (math.pi * self.diameter) for cm in wheel_cm]
            largest = max(abs(v) for v in targets)
            if largest == 0:
                self.last_move_completed = True
                return True
            if rpm == 0:
                return False
            initial = [m.get_position() for m in self.motors]
            active = [abs(v) > 1e-9 for v in targets]
            started = time.ticks_ms()
            # Acceleration: medium reaches full speed in 0.4 s and slows over
            # the last quarter wheel turn; slow takes twice as long, fast less.
            accel = max(0.1, float(self.accel))
            full_after = 0.4 / accel
            slow_zone = 0.25 / accel
            while any(active):
                elapsed = time.ticks_diff(time.ticks_ms(), started) / 1000
                if elapsed >= timeout:
                    print('Mecanum: move timed out; all motors stopped')
                    return False
                done = 0.0
                count = 0
                for i in range(4):
                    progress = (self.motors[i].get_position() - initial[i]) * self.signs[i]
                    if active[i] and progress * (1 if targets[i] > 0 else -1) >= abs(targets[i]):
                        self._wheel_speed(i, 0)
                        active[i] = False
                    if abs(targets[i]) > 1e-9:
                        done += min(1, max(0, progress / targets[i]))
                        count += 1
                left = largest * (1 - done / max(count, 1))
                scale = min(1, max(0.15, elapsed / full_after), max(0.3, left / slow_zone))
                for i in range(4):
                    if active[i]:
                        self._wheel_speed(i, rpm * scale * targets[i] / largest)
                time.sleep_ms(10)
            self.last_move_completed = True
            return True
        finally:
            self.stop()

    def move(self, angle, speed, distance, timeout=15):
        self.last_move_completed = False
        try:
            distance = self._number(distance)
            if distance < 0:
                raise ValueError('Distance must be non-negative; choose a direction')
            factors = self._direction(self._number(angle))
            return self._travel([v * distance for v in factors], speed, timeout)
        finally:
            self.stop()

    def _imu(self):
        # The XRP's gyro, if this board has one; None otherwise.
        if self._gyro is None:
            try:
                from XRPLib.imu import IMU
                self._gyro = IMU.get_default_imu()
            except Exception:
                self._gyro = False
        return self._gyro or None

    def _arc_turn(self, clockwise, speed, degrees, timeout):
        arc = degrees * math.pi / 180 * (self.wheelbase + self.track) / 2
        if not clockwise:
            arc = -arc
        return self._travel([arc, -arc, arc, -arc], speed, timeout)

    def turn(self, clockwise, speed, degrees, timeout=15):
        # Turn by the encoders, then check with the gyro: settle for 0.2 s and,
        # if more than 0.5 degrees off, nudge at up to 20% speed, up to 20
        # times. Which way the gyro counts is taken from the main turn itself,
        # and nudging stops if a nudge ever makes the error worse. Without a
        # gyro it is the plain encoder turn, as before.
        self.last_move_completed = False
        try:
            degrees = self._number(degrees)
            if degrees < 0:
                raise ValueError('Degrees must be non-negative; choose left or right')
            gyro = self._imu()
            start = gyro.get_yaw() if gyro else 0
            done = self._arc_turn(clockwise, speed, degrees, timeout)
            if not gyro or not done:
                return done
            ccw = -1 if clockwise else 1
            time.sleep_ms(200)
            moved = gyro.get_yaw() - start
            sense = 1 if moved * ccw >= 0 else -1
            goal = start + sense * ccw * degrees
            nudge = min(self._number(speed), 20)
            before = None
            for attempt in range(20):
                left = goal - gyro.get_yaw()
                if abs(left) <= 0.5:
                    break
                if before is not None and abs(left) > abs(before) + 0.5:
                    print('Mecanum: gyro correction made it worse; stopped correcting')
                    break
                before = left
                self._arc_turn(left * sense < 0, nudge, abs(left), 3)
                time.sleep_ms(200)
            self.last_move_completed = True
            return True
        finally:
            self.stop()
