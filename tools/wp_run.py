"""Run the generated Python of working programs against a stand-in robot.

    python tools/wp_run.py PY_DIR [names...]

A desktop smoke test, not a hardware test: XRPLib is replaced by simple
stand-ins (sensors return plausible changing values, motors do nothing), time
is simulated, and the real lib/BLERemote.py driver talks to a scripted phone
that says hello, asks for robot messages and then presses every button and
moves the joystick in turn. Each program runs for 60 simulated seconds (or
until it finishes). Any exception other than the end of the run is a failure.
"""
import importlib.util
import math
import sys
import traceback
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY_DIR = Path(sys.argv[1])
ONLY = sys.argv[2:]


class End(Exception):
    pass


class Clock:
    def __init__(self):
        self.ms = 0
        self.sleeps = 0

    def advance(self, ms):
        self.ms += max(1, int(ms))
        self.sleeps += 1
        if self.ms > 60000 or self.sleeps > 20000:
            raise End()


def make_time(clock):
    t = types.ModuleType('time')
    t.sleep = lambda s: clock.advance(float(s) * 1000)
    t.sleep_ms = lambda ms: clock.advance(ms)
    t.sleep_us = lambda us: clock.advance(us / 1000)
    t.ticks_ms = lambda: (clock.advance(0.2) or clock.ms)
    t.ticks_us = lambda: clock.ms * 1000
    t.ticks_diff = lambda a, b: a - b
    t.ticks_add = lambda a, b: a + b
    t.time = lambda: clock.ms / 1000
    t.monotonic = t.time
    return t


class Anything:
    """Callable stand-in: every attribute is another stand-in, calls return 0."""

    def __init__(self, name='x', ret=0.0):
        self._name, self._ret = name, ret

    def __getattr__(self, k):
        if k.startswith('__'):
            raise AttributeError(k)
        v = Anything(self._name + '.' + k)
        setattr(self, k, v)
        return v

    def __call__(self, *a, **k):
        return self._ret


def make_xrplib(clock):
    pkg = types.ModuleType('XRPLib')
    pkg.__path__ = []
    d = types.ModuleType('XRPLib.defaults')

    def wave(period, lo, hi):
        return lambda *a: lo + (hi - lo) * (0.5 + 0.5 * math.sin(clock.ms / period))

    board = Anything('board')
    board.is_button_pressed = lambda: (clock.ms // 3000) % 2 == 1
    board.wait_for_button = lambda: clock.advance(500)
    d.board = board
    imu = Anything('imu')
    imu.get_yaw = wave(900, -180, 180)
    imu.get_heading = wave(900, 0, 359)
    imu.get_pitch = wave(700, -15, 15)
    imu.get_roll = wave(500, -15, 15)
    imu.calibrate = lambda *a, **k: clock.advance(1000)
    d.imu = imu
    rf = Anything('rangefinder')
    rf.distance = wave(1500, 5, 80)
    d.rangefinder = rf
    rl = Anything('reflectance')
    rl.get_left = wave(400, 0, 1)
    rl.get_right = wave(450, 0, 1)
    d.reflectance = rl
    dt = Anything('drivetrain')
    dt.imu = imu
    dt.turn = lambda *a, **k: (clock.advance(300), True)[1]
    dt.straight = lambda *a, **k: (clock.advance(300), True)[1]
    d.drivetrain = dt
    for n in ('one', 'two', 'three', 'four'):
        setattr(d, 'servo_' + n, Anything('servo_' + n))
    for n in ('left_motor', 'right_motor', 'motor_three', 'motor_four'):
        setattr(d, n, Anything(n))
    pid = types.ModuleType('XRPLib.pid')

    class PID:
        def __init__(self, *a, **k):
            self.__dict__.update(k)

        def update(self, *a, **k):
            return 0.0

        tick = update

        def is_done(self, *a, **k):
            return True

        def clear_history(self, *a, **k):
            pass
    pid.PID = PID
    ctl = types.ModuleType('XRPLib.controller')
    ctl.Controller = PID
    mods = {'XRPLib': pkg, 'XRPLib.defaults': d, 'XRPLib.pid': pid, 'XRPLib.controller': ctl}
    for sub, cls, getter in (('encoded_motor', 'EncodedMotor', 'get_default_encoded_motor'),
                             ('board', 'Board', 'get_default_board'),
                             ('servo', 'Servo', 'get_default_servo'),
                             ('reflectance', 'Reflectance', 'get_default_reflectance'),
                             ('imu', 'IMU', 'get_default_imu')):
        m = types.ModuleType('XRPLib.' + sub)
        c = Anything(cls)
        setattr(c, getter, lambda *a, _n=sub, **k: Anything(_n))
        setattr(m, cls, c)
        mods['XRPLib.' + sub] = m
    return mods


def make_machine():
    m = types.ModuleType('machine')

    class Timer:
        PERIODIC = ONE_SHOT = 0

        def __init__(self, *a, **k):
            pass

        def init(self, *a, **k):
            pass

        def deinit(self):
            pass
    m.Timer = Timer
    m.Pin = Anything('Pin')
    m.I2C = Anything('I2C')
    m.unique_id = lambda: b'\x01\x02\x03\x04\x05\x06\x07\x08'
    m.reset_cause = lambda: 0
    mp = types.ModuleType('micropython')
    mp.const = lambda x: x
    mp.schedule = lambda f, a: f(a)
    mp.alloc_emergency_exception_buf = lambda n: None
    return {'machine': m, 'micropython': mp}


class Phone:
    """Scripted phone on the other end of the Bluetooth link."""

    def __init__(self, clock):
        self.clock = clock
        self.buf = ''
        self.last = -1000
        self.step = 0
        self.received = []

    def pending(self):
        now = self.clock.ms
        if self.step == 0:
            self.buf += '#xrp h\r\n#xrp o 1\r\n'
            self.step = 1
            self.last = now
        elif now - self.last >= 250:
            self.last = now
            k = (now // 1000) % 10          # a new input every second
            mask = (1 << k) if k < 6 else 0
            x = [0, 0, 0, 0, 0, 0, 60, -60, 0, 0][k]
            y = [0, 0, 0, 0, 0, 0, 40, 40, 80, -50][k]
            self.buf += '#xrp s %d %d %d\r\n' % (mask, x, y)
        return self.buf

    def read(self, n):
        self.pending()
        out, self.buf = self.buf[:n], self.buf[n:]
        return out


def run(pyfile):
    clock = Clock()
    saved = {k: sys.modules.get(k) for k in ('time', 'XRPLib', 'XRPLib.defaults', 'XRPLib.pid',
                                              'XRPLib.controller', 'XRPLib.encoded_motor', 'XRPLib.board',
                                              'XRPLib.servo', 'XRPLib.reflectance', 'XRPLib.imu',
                                              'machine', 'micropython', 'BLERemote', 'XRPTriggers')}
    fake_time = make_time(clock)
    sys.modules['time'] = fake_time
    sys.modules.update(make_xrplib(clock))
    sys.modules.update(make_machine())
    phone = Phone(clock)
    try:
        spec = importlib.util.spec_from_file_location('BLERemote', ROOT / 'lib' / 'BLERemote.py')
        ble = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ble)
        ble.sys = types.SimpleNamespace(stdin=phone)

        class Poll:
            def register(self, *a):
                pass

            def poll(self, t):
                return [1] if phone.pending() else []
        ble.select = types.SimpleNamespace(poll=Poll, POLLIN=1)
        ble.time = fake_time
        ble.BLERemote._ensure_bluetooth = staticmethod(lambda: 'running')
        ble.BLERemote._find_uart = staticmethod(lambda: None)
        ble.BLERemote._write = lambda self, text: phone.received.append(text)
        sys.modules['BLERemote'] = ble
        if (ROOT / 'lib' / 'XRPTriggers.py').exists():
            spec = importlib.util.spec_from_file_location('XRPTriggers', ROOT / 'lib' / 'XRPTriggers.py')
            trig = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(trig)
            sys.modules['XRPTriggers'] = trig
        code = compile(pyfile.read_text(encoding='utf-8'), str(pyfile), 'exec')
        g = {'__name__': '__main__'}
        out = []
        g['print'] = lambda *a, **k: out.append(' '.join(str(x) for x in a))
        try:
            exec(code, g)
            result = 'finished'
        except End:
            result = 'ran 60 s'
        return result, clock.ms, out, phone.received
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


import os, tempfile
os.chdir(tempfile.mkdtemp())
failures = 0
for f in sorted(PY_DIR.glob('*.py')):
    if ONLY and not any(o in f.name for o in ONLY):
        continue
    try:
        result, ms, out, rx = run(f)
        tiles = sorted({l.split('|')[0][7:] for l in rx if l.startswith('#xrp v ')})
        logs = [l[7:] for l in rx if l.startswith('#xrp p ')]
        print('OK   %-45s %-9s %5.1fs  prints %3d  tiles %s  phone log %d' %
              (f.stem, result, ms / 1000, len(out), tiles, len(logs)))
    except Exception:
        failures += 1
        print('FAIL %s' % f.stem)
        traceback.print_exc(limit=3)
print(failures, 'failures')
