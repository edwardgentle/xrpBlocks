"""Run on desktop Python: python tools/test_mecanum.py."""
import importlib.util
import math
from pathlib import Path
import sys
import types
import unittest


class Motor:
    def __init__(self):
        self.rpm = 0
        self.position = 0
        self.stalled = False

    def set_speed(self, rpm):
        self.rpm = rpm or 0

    def brake(self):
        self.rpm = 0

    def get_position(self):
        return self.position


motors = [Motor() for _ in range(4)]
encoded = types.ModuleType('XRPLib.encoded_motor')
encoded.EncodedMotor = types.SimpleNamespace(get_default_encoded_motor=lambda p: motors[p - 1])
sys.modules['XRPLib'] = types.ModuleType('XRPLib')
sys.modules['XRPLib.encoded_motor'] = encoded
spec = importlib.util.spec_from_file_location('mecanum', Path(__file__).resolve().parents[1] / 'lib/MecanumDrive.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DriveTests(unittest.TestCase):
    def setUp(self):
        motors[:] = [Motor() for _ in range(4)]
        self.clock = 0
        def sleep(ms):
            self.clock += ms
            for motor in motors:
                if not motor.stalled:
                    motor.position += motor.rpm * ms / 60000
        module.time = types.SimpleNamespace(ticks_ms=lambda: self.clock,
            ticks_diff=lambda a, b: a - b, sleep_ms=sleep)
        self.drive = module.MecanumDrive()

    def test_eight_directions_and_limits(self):
        expected = [(1,1,1,1),(1,0,0,1),(1,-1,-1,1),(0,-1,-1,0),
                    (-1,-1,-1,-1),(-1,0,0,-1),(-1,1,1,-1),(0,1,1,0)]
        for angle, signs in zip(range(0,360,45), expected):
            self.drive.drive(angle, 150)
            self.assertEqual(tuple(0 if m.rpm == 0 else int(math.copysign(1,m.rpm)) for m in motors), signs)
            self.assertLessEqual(max(abs(m.rpm) for m in motors), 100)

    def test_distance_and_diagonal(self):
        for angle in (0,45,90,180,270):
            initial = [m.position for m in motors]
            self.assertTrue(self.drive.move(angle, 50, 10))
            for i, factor in enumerate(self.drive._direction(angle)):
                self.assertAlmostEqual(motors[i].position-initial[i], factor*10/(math.pi*6), delta=.01)
            self.assertTrue(all(m.rpm == 0 for m in motors))

    def test_turn_geometry(self):
        self.assertTrue(self.drive.turn(True, 50, 90))
        target = (math.pi/2 * 15)/(math.pi*6)
        for motor, sign in zip(motors,(1,-1,1,-1)):
            self.assertAlmostEqual(motor.position, sign*target, delta=.01)

    def test_stall_timeout_and_zero_speed(self):
        motors[0].stalled = True
        self.assertFalse(self.drive.move(0,50,20,.1))
        self.assertFalse(self.drive.last_move_completed)
        self.assertTrue(all(m.rpm == 0 for m in motors))
        self.assertFalse(self.drive.move(0,0,20))

    def test_reversal(self):
        self.drive.reverse(0, True)
        self.assertTrue(self.drive.move(0,50,10))
        self.assertLess(motors[0].position, 0)

    def test_invalid_input_stops(self):
        self.drive.drive(0,50)
        with self.assertRaises(ValueError):
            self.drive.move(0,50,-1)
        self.assertTrue(all(m.rpm == 0 for m in motors))

    def test_interrupt_stops(self):
        def interrupted(ms):
            raise KeyboardInterrupt
        module.time.sleep_ms = interrupted
        with self.assertRaises(KeyboardInterrupt):
            self.drive.move(0,50,10)
        self.assertTrue(all(m.rpm == 0 for m in motors))


if __name__ == '__main__':
    unittest.main()
