#!/usr/bin/env python3
"""Mock-hardware tests for lib/XRPTriggers.py.

Runs the driver under CPython with stand-ins for machine, neopixel and the
parts of XRPLib it touches. A fake clock and a fake timer let each test step
the engine tick by tick while scripted wheel speeds play out. Checks which
events fire, which lights and servos change, the emergency stop, the time
budget and stopping.

    python tools/test_triggers.py

This does not replace a test on the robot: it cannot show how long a tick
really takes, or whether the thresholds suit a real floor.
"""

import math
import sys
import time as _time
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# -- fake clock ------------------------------------------------------------------

CLOCK = {'ms': 1000, 'extra_us': 0}


def ticks_ms():
    return CLOCK['ms']


def ticks_us():
    return CLOCK['ms'] * 1000 + CLOCK['extra_us']


def ticks_diff(a, b):
    return a - b


def ticks_add(a, b):
    return a + b


for name, fn in (('ticks_ms', ticks_ms), ('ticks_us', ticks_us),
                 ('ticks_diff', ticks_diff), ('ticks_add', ticks_add)):
    setattr(_time, name, fn)

# -- fake machine ----------------------------------------------------------------

machine = types.ModuleType('machine')


class Pin:
    OUT, IN, PULL_UP = 1, 0, 2
    levels = {}
    writes = []

    def __init__(self, pin, mode=None, pull=None):
        self.pin = pin
        if mode == Pin.IN and pin not in Pin.levels:
            Pin.levels[pin] = 1 if pull == Pin.PULL_UP else 0

    def value(self, v=None):
        if v is None:
            return Pin.levels.get(self.pin, 0)
        Pin.levels[self.pin] = v
        Pin.writes.append((self.pin, v))


class Timer:
    PERIODIC = 1
    live = []

    def __init__(self, tid):
        self.cb = None

    def init(self, period=None, mode=None, callback=None):
        self.period, self.cb = period, callback
        if self not in Timer.live:
            Timer.live.append(self)

    def deinit(self):
        self.cb = None
        if self in Timer.live:
            Timer.live.remove(self)


machine.Pin, machine.Timer = Pin, Timer
sys.modules['machine'] = machine

neopixel = types.ModuleType('neopixel')


class NeoPixel:
    def __init__(self, pin, n):
        self.buf = [(0, 0, 0)] * n
        self.writes = 0

    def __len__(self):
        return len(self.buf)

    def __setitem__(self, i, v):
        self.buf[i] = v

    def __getitem__(self, i):
        return self.buf[i]

    def write(self):
        self.writes += 1


neopixel.NeoPixel = NeoPixel
sys.modules['neopixel'] = neopixel

# -- fake XRPLib -----------------------------------------------------------------

xrplib = types.ModuleType('XRPLib')
xrplib.__path__ = []
sys.modules['XRPLib'] = xrplib


class Board:
    XRP, BETA, NANO = 0, 1, 2
    _inst = None

    @classmethod
    def get_type(cls):
        return cls.XRP

    @classmethod
    def get_default_board(cls):
        if cls._inst is None:
            cls._inst = cls()
        return cls._inst

    def __init__(self):
        self.rgb = (0, 0, 0)
        self.rgb_writes = 0
        self.button = False
        self.led = Pin('LED', Pin.OUT)
        self.volts = 7.2

    def set_rgb_led(self, r, g, b):
        self.rgb = (r, g, b)
        self.rgb_writes += 1

    def is_button_pressed(self):
        return self.button

    def get_battery_voltage(self):
        return self.volts


class PWMMotor:
    def __init__(self):
        self.effort = 0.0
        self.braked = False

    def set_effort(self, e):
        self.effort = e
        self.braked = False

    def brake(self):
        self.braked = True
        self.effort = 0.0


class EncodedMotor:
    _DEFAULT_LEFT_MOTOR_INSTANCE = None
    _DEFAULT_RIGHT_MOTOR_INSTANCE = None
    _DEFAULT_MOTOR_THREE_INSTANCE = None
    _DEFAULT_MOTOR_FOUR_INSTANCE = None

    @classmethod
    def get_default_encoded_motor(cls, index=1):
        name = ['_DEFAULT_LEFT_MOTOR_INSTANCE', '_DEFAULT_RIGHT_MOTOR_INSTANCE',
                '_DEFAULT_MOTOR_THREE_INSTANCE', '_DEFAULT_MOTOR_FOUR_INSTANCE'][index - 1]
        if getattr(cls, name) is None:
            setattr(cls, name, cls())
        return getattr(cls, name)

    def __init__(self):
        self._motor = PWMMotor()
        self.revs = 0.0
        self.target_speed = None

    def get_position(self):
        return self.revs

    def set_effort(self, e):
        self._motor.set_effort(e)


class Servo:
    _inst = {}

    @classmethod
    def get_default_servo(cls, n):
        if n not in cls._inst:
            cls._inst[n] = cls()
        return cls._inst[n]

    def __init__(self):
        self.units = None
        self.writes = []

    def set_angle(self, u):
        self.units = u
        self.writes.append(u)


class Reflectance:
    _inst = None

    @classmethod
    def get_default_reflectance(cls):
        if cls._inst is None:
            cls._inst = cls()
        return cls._inst

    left = 0.2
    right = 0.2

    def get_left(self):
        return self.left

    def get_right(self):
        return self.right


for mod, attrs in (('board', {'Board': Board}), ('encoded_motor', {'EncodedMotor': EncodedMotor}),
                   ('servo', {'Servo': Servo}), ('reflectance', {'Reflectance': Reflectance})):
    m = types.ModuleType('XRPLib.' + mod)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules['XRPLib.' + mod] = m

sys.path.insert(0, str(ROOT / 'lib'))
import XRPTriggers as T  # noqa: E402

CIRC = math.pi * 6.0

# -- helpers ---------------------------------------------------------------------

RESULTS = []


def check(name, cond, detail=''):
    RESULTS.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (('  ' + detail) if detail and not cond else ''))


def reset_world():
    Board._inst = None
    for n in ('_DEFAULT_LEFT_MOTOR_INSTANCE', '_DEFAULT_RIGHT_MOTOR_INSTANCE',
              '_DEFAULT_MOTOR_THREE_INSTANCE', '_DEFAULT_MOTOR_FOUR_INSTANCE'):
        setattr(EncodedMotor, n, None)
    Servo._inst = {}
    Pin.levels, Pin.writes = {}, []
    Timer.live = []
    T._RUNNING = None
    CLOCK['ms'] = 1000
    CLOCK['extra_us'] = 0


def run(engine, seconds, left_cm_s=0.0, right_cm_s=None, record=None):
    """Advance the clock tick by tick with the wheels at the given speeds."""
    if right_cm_s is None:
        right_cm_s = left_cm_s
    ml = EncodedMotor.get_default_encoded_motor(1)
    mr = EncodedMotor.get_default_encoded_motor(2)
    steps = int(round(seconds * 1000 / engine._period))
    for _ in range(steps):
        dt = engine._period / 1000
        lv = left_cm_s(CLOCK['ms']) if callable(left_cm_s) else left_cm_s
        rv = right_cm_s(CLOCK['ms']) if callable(right_cm_s) else right_cm_s
        ml.revs += lv * dt / CIRC
        mr.revs += rv * dt / CIRC
        CLOCK['ms'] += engine._period
        for timer in list(Timer.live):
            if timer.cb:
                timer.cb(timer)
        if record is not None:
            record.append(dict(engine._raw))


def ever(record, key):
    return any(r.get(key) for r in record)


# -- tests -----------------------------------------------------------------------

def test_motion_events():
    reset_world()
    e = T.XRPTriggers(20)
    e.light_rule('braking', 'red', 'solid', 'brake')
    rec = []
    run(e, 1.0, 0, record=rec)
    check('standing still: stopped, not moving', rec[-1].get('stopped') and not rec[-1].get('moving'))
    rec = []
    run(e, 1.0, 20, record=rec)
    check('driving forward at 20 cm/s: forward', rec[-1].get('forward') and not rec[-1].get('reverse'))
    check('steady speed: no braking', not ever(rec[5:], 'braking'))
    rec = []
    run(e, 1.0, -15, record=rec)
    check('reversing at 15 cm/s: reverse', rec[-1].get('reverse'))
    rec = []
    run(e, 1.0, -10, 10, record=rec)
    check('left wheel back, right forward: turning left', rec[-1].get('left') and not rec[-1].get('right'))
    rec = []
    run(e, 1.0, 10, -10, record=rec)
    check('right wheel back, left forward: turning right', rec[-1].get('right'))
    rec = []
    run(e, 1.0, 22, 18, record=rec)
    check('small steering difference on a straight: not a turn',
          not ever(rec[5:], 'left') and not ever(rec[5:], 'right'))


def test_braking_profiles():
    # Deceleration like the end of a drive straight: 30 cm/s down to 0 over d cm.
    for setting, decel in (('gentle stop (60 cm/s2)', 60.0), ('fast stop (200 cm/s2)', 200.0)):
        reset_world()
        e = T.XRPTriggers(20)
        e.light_rule('braking', 'red', 'solid', 'brake')
        run(e, 1.0, 30)
        start = CLOCK['ms']

        def speed(ms, start=start, decel=decel):
            return max(0.0, 30 - decel * (ms - start) / 1000)
        rec = []
        run(e, 1.5, speed, record=rec)
        check('braking seen on ' + setting, ever(rec, 'braking'))
        check('red brake light lit on ' + setting,
              Board.get_default_board().rgb_writes > 0)
    # Very gentle: extra slow acceleration setting, 20 cm/s over 2 s = 10 cm/s2.
    reset_world()
    e = T.XRPTriggers(20)
    e.light_rule('braking', 'red', 'solid', 'brake')
    run(e, 1.0, 20)
    start = CLOCK['ms']
    rec = []
    run(e, 2.5, lambda ms: max(0.0, 20 - 10 * (ms - start) / 1000), record=rec)
    check('10 cm/s2 slowdown missed at medium sensitivity (expected)', not ever(rec, 'braking'))
    e.set_braking('high')
    run(e, 1.0, 20)
    start = CLOCK['ms']
    rec = []
    run(e, 2.5, lambda ms: max(0.0, 20 - 10 * (ms - start) / 1000), record=rec)
    check('10 cm/s2 slowdown seen at high sensitivity', ever(rec, 'braking'))


def test_noise_no_false_braking():
    import random
    random.seed(4)
    reset_world()
    e = T.XRPTriggers(20)
    e.light_rule('braking', 'red', 'solid', 'brake')
    rec = []
    run(e, 5.0, lambda ms: 25 + random.uniform(-2, 2), lambda ms: 25 + random.uniform(-2, 2), record=rec)
    n = sum(1 for r in rec[10:] if r.get('braking'))
    check('+/-2 cm/s wheel noise at 25 cm/s: no false braking', n == 0, '%d ticks' % n)


def test_lights_priority_and_patterns():
    reset_world()
    e = T.XRPTriggers(20)
    b = Board.get_default_board()
    e.light_rule('always', 'white', 'solid', 'head')
    e.light_rule('braking', 'red', 'solid', 'brake')
    run(e, 0.5, 0)
    check('headlight (always) shows white at 30% on the onboard RGB', b.rgb == (76, 76, 76), str(b.rgb))
    writes = b.rgb_writes
    run(e, 1.0, 0)
    check('unchanged light is not rewritten', b.rgb_writes == writes, '%d extra writes' % (b.rgb_writes - writes))
    e._raw['braking'] = True
    e._last_true['braking'] = CLOCK['ms']
    e._update_lights(CLOCK['ms'])
    check('brake outranks headlight on a shared light', b.rgb == (76, 0, 0), str(b.rgb))
    e.set_brightness(100)
    e._update_lights(CLOCK['ms'])
    check('brightness 100% gives full red', b.rgb == (255, 0, 0), str(b.rgb))
    # blink
    reset_world()
    e = T.XRPTriggers(20)
    b = Board.get_default_board()
    e.set_light('status', 'green', 'blink')
    seen = set()
    for _ in range(40):
        run(e, 0.05, 0)
        seen.add(b.rgb)
    check('manual blink alternates green and off', (0, 76, 0) in seen and (0, 0, 0) in seen, str(seen))
    e.set_light('status', 'off')
    run(e, 0.1, 0)
    check('manual off clears the light', b.rgb == (0, 0, 0))


def test_indicators_on_strip_and_pins():
    reset_world()
    e = T.XRPTriggers(20)
    e.strip(9, 8)
    e.use_pixels('left', 0, 1)
    e.use_pixels('right', 6, 7)
    e.use_pin('brake', 12)
    e.light_rule('left', 'orange', 'solid', 'left')
    e.light_rule('right', 'orange', 'solid', 'right')
    e.light_rule('braking', 'red', 'solid', 'brake')
    run(e, 1.0, -10, 10)
    buf = e._strip.buf
    check('turning left lights pixels 0-1 only', buf[0] != (0, 0, 0) and buf[1] != (0, 0, 0)
          and buf[6] == (0, 0, 0), str(buf))
    run(e, 1.0, 10, -10)
    buf = e._strip.buf
    check('turning right lights pixels 6-7, left ones go out', buf[6] != (0, 0, 0)
          and buf[0] == (0, 0, 0), str(buf))
    check('onboard RGB untouched when every used role is bound', Board.get_default_board().rgb_writes == 0)
    run(e, 1.0, 30, 30)
    start = CLOCK['ms']
    run(e, 1.0, lambda ms: max(0.0, 30 - 100 * (ms - start) / 1000))
    check('brake LED on GPIO 12 switched on while braking', (12, 1) in Pin.writes)
    run(e, 1.0, 0)
    check('brake LED off again once stopped', Pin.levels.get(12) == 0)
    try:
        e.strip(9, 31)
        check('strip over 30 pixels refused', False)
    except ValueError:
        check('strip over 30 pixels refused', True)


def test_hold_time():
    reset_world()
    e = T.XRPTriggers(20)
    b = Board.get_default_board()
    e.define_every('A', 2)
    e.light_rule('A', 'blue', 'solid', 'status')
    on_ticks = 0
    for _ in range(60):          # 3 s
        run(e, 0.05, 0)
        if b.rgb != (0, 0, 0):
            on_ticks += 1
    check('every 2 s trigger + 0.3 s hold gives a visible flash (about 6 ticks)', 5 <= on_ticks <= 8,
          '%d ticks lit' % on_ticks)


def test_custom_triggers():
    reset_world()
    e = T.XRPTriggers(20)
    e.define('A', 'speed', '>', 15)
    e.define('B', 'battery', '<', 6.5)
    e.define_pin('C', 12, 'low')
    e.define_value('D', 'tilt', '>', 20)
    rec = []
    run(e, 1.0, 20, record=rec)
    check('trigger A: speed > 15 while driving at 20', rec[-1].get('A'))
    run(e, 1.0, 10, record=rec)
    check('trigger A off at 10 cm/s', not rec[-1].get('A'))
    check('trigger B: battery 7.2 V is not < 6.5', not rec[-1].get('B'))
    Board.get_default_board().volts = 6.0
    rec = []
    run(e, 3.0, 0, record=rec)
    check('trigger B: smoothed battery falls below 6.5 V after a drop to 6.0', rec[-1].get('B'))
    check('trigger C: pull-up pin reads high = not pressed', not rec[-1].get('C'))
    Pin.levels[12] = 0
    run(e, 0.1, 0, record=rec)
    check('trigger C: pin pulled low = pressed', rec[-1].get('C'))
    run(e, 0.1, 0, record=rec)
    check('trigger D: no value posted yet = false', not rec[-1].get('D'))
    e.set_value('tilt', 25)
    run(e, 0.1, 0, record=rec)
    check('trigger D: posted tilt 25 > 20', rec[-1].get('D'))
    e.define_value('D', 'colour', '=', 'red')
    e.set_value('colour', 'red')
    run(e, 0.1, 0, record=rec)
    check('trigger D: posted text "red" = "red"', rec[-1].get('D'))
    e.set_value('colour', 'blue')
    run(e, 0.1, 0, record=rec)
    check('trigger D: "blue" is not "red"', not rec[-1].get('D'))
    e.set_value('colour', 3)
    run(e, 0.1, 0, record=rec)
    check('trigger D: a number never equals text', not rec[-1].get('D'))
    e.reset_distance()
    run(e, 1.0, 20)
    d = e.measure('distance')
    check('distance measure: 1 s at 20 cm/s is about 20 cm', 18.5 < d < 21, '%.2f' % d)
    check('happening() reports the same as the rules', e.happening('forward'))


def test_servo_rules():
    reset_world()
    e = T.XRPTriggers(20)
    e.define_value('A', 'go', '=', 1)
    e.servo_rule('A', 1, 150, 0, 90)
    s = Servo.get_default_servo(1)
    run(e, 0.5, 0)
    check('servo untouched before its rule ever fires', s.writes == [])
    e.set_value('go', 1)
    run(e, 0.2, 0)
    check('servo jumps to 150 degrees (166.7 units)', abs(s.units - 150 * 10 / 9) < 1e-6)
    n = len(s.writes)
    run(e, 1.0, 0)
    check('servo not rewritten while holding', len(s.writes) == n)
    e.set_value('go', 0)
    run(e, 0.5, 0)
    check('servo returns to 90 degrees when the rule ends', abs(s.units - 100) < 1e-6)
    n = len(s.writes)
    run(e, 1.0, 0)
    check('servo handed back after returning (no more writes)', len(s.writes) == n)
    # sweep
    e.servo_rule('B', 2, 180, 60, 0)   # clamps to 175 and 5
    e.define_value('B', 'arm', '=', 1)
    s2 = Servo.get_default_servo(2)
    e.set_value('arm', 1)
    run(e, 0.5, 0)
    first = s2.writes[0] * 9 / 10
    check('sweep: first write jumps from unknown to 175 (no start angle known)', abs(first - 175) < 1e-6)
    e.set_value('arm', 0)
    run(e, 1.0, 0)
    mid = s2.units * 9 / 10
    # The rule stays on for the 0.3 s hold time, so the sweep runs for 0.7 s.
    check('sweep back at 60 deg/s after the 0.3 s hold: about 42 degrees in 1 s', 128 < mid < 136, '%.1f' % mid)
    run(e, 3.0, 0)
    check('sweep reaches the return angle, clamped to 5', abs(s2.units * 9 / 10 - 5) < 1e-6)


def test_estop():
    reset_world()
    e = T.XRPTriggers(20)
    ml = EncodedMotor.get_default_encoded_motor(1)
    mr = EncodedMotor.get_default_encoded_motor(2)
    m3 = EncodedMotor.get_default_encoded_motor(3)
    e.define_pin('A', 13, 'low')
    e.estop_rule('A')
    e.light_rule('estop', 'red', 'blink', 'status')
    ml.set_effort(0.5)
    mr.target_speed = 12
    run(e, 0.2, 0)
    check('no emergency stop while the bumper is not pressed', not e.estop_active() and ml._motor.effort == 0.5)
    Pin.levels[13] = 0
    run(e, 0.1, 0)
    check('bumper pressed: emergency stop latched', e.estop_active())
    check('all existing motors braked', ml._motor.braked and mr._motor.braked and m3._motor.braked)
    check('speed control switched off', mr.target_speed is None)
    ml.set_effort(0.8)
    check('motor commands ignored while stopped', ml._motor.effort == 0.0 and ml._motor.braked)
    Pin.levels[13] = 1
    run(e, 0.5, 0)
    check('still stopped after the bumper is released (latched)', e.estop_active())
    check('estop event lights the status light', Board.get_default_board().rgb_writes > 0)
    e.clear_estop()
    ml.set_effort(0.3)
    check('clear emergency stop: motors respond again', ml._motor.effort == 0.3)
    e.set_enabled(False)
    Pin.levels[13] = 0
    run(e, 0.2, 0)
    check('automatic triggers off: no emergency stop', not e.estop_active())
    e.set_enabled(True)
    run(e, 0.1, 0)
    check('automatic triggers on again: stops', e.estop_active())
    e2 = T.XRPTriggers(20)
    e2.estop_rule('always')
    run(e2, 0.1, 0)
    check('"emergency stop when always" stops at once', e2.estop_active())
    check('a new engine replaced the old one (one timer)', len(Timer.live) == 1)
    T.stop_all()
    ml.set_effort(0.4)
    check('Stop button (stop_all) restores the motors', ml._motor.effort == 0.4)
    check('stop_all ends the timer', Timer.live == [])


def test_budget_and_failure():
    reset_world()
    e = T.XRPTriggers(20)
    e.light_rule('always', 'white', 'solid', 'head')
    orig = e._step

    def slow_step(now):
        CLOCK['extra_us'] += 2000
        orig(now)
    e._step = slow_step
    run(e, 0.5, 0)
    check('slow ticks: engine checks half as often', e._skip >= 2, 'skip %d' % e._skip)

    def bad_step(now):
        raise ValueError('boom')
    e._step = bad_step
    run(e, 0.5, 0)
    check('an error inside a tick stops the engine, not the program', e._failed is not None
          and Timer.live == [])


def test_single_engine():
    reset_world()
    a = T.XRPTriggers(20)
    a.light_rule('always', 'white', 'solid', 'head')
    run(a, 0.2, 0)
    b = T.XRPTriggers(10)
    check('a new engine stops the old one', not a._running and len(Timer.live) == 1)
    check('old engine switched its light off', Board.get_default_board().rgb == (0, 0, 0))
    check('rate 10 gives a 100 ms tick', b._period == 100)
    c = T.XRPTriggers(500)
    check('rate capped at 50', c._period == 20)


def test_validation():
    reset_world()
    e = T.XRPTriggers(20)
    bad = 0
    for call in (lambda: e.light_rule('flying', 'red', 'solid', 'brake'),
                 lambda: e.light_rule('always', 'mauve', 'solid', 'brake'),
                 lambda: e.light_rule('always', 'red', 'wobble', 'brake'),
                 lambda: e.light_rule('always', 'red', 'solid', 'roof'),
                 lambda: e.servo_rule('always', 5, 90),
                 lambda: e.define('E', 'speed', '>', 1),
                 lambda: e.define('A', 'speed', '>', 'fast')):
        try:
            call()
        except ValueError:
            bad += 1
    check('bad arguments rejected with ValueError (7 cases)', bad == 7, '%d of 7' % bad)


def main():
    for test in (test_motion_events, test_braking_profiles, test_noise_no_false_braking,
                 test_lights_priority_and_patterns, test_indicators_on_strip_and_pins,
                 test_hold_time, test_custom_triggers, test_servo_rules, test_estop,
                 test_budget_and_failure, test_single_engine, test_validation):
        print('--', test.__name__)
        test()
    failed = [n for n, ok in RESULTS if not ok]
    print('\n%d checks, %d failed' % (len(RESULTS), len(failed)))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
