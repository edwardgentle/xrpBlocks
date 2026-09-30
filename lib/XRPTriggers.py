"""XRPTriggers - "when this happens, do that" for the XRP.

A small rule engine that runs in the background while your program drives,
waits or does anything else. Rules look like:

    while braking            show red solid on the brake light
    while turning left       show orange blink on the left indicator
    while trigger A          move servo 1 to 150 degrees, then back to 90
    emergency stop when      pin 12 is pressed

HOW IT RUNS
-----------
One virtual machine.Timer (id -1) calls the engine about 20 times a second.
On the XRP's port that callback is a *soft* callback: MicroPython runs it on
the main thread between two bytecodes of your program. So it borrows a little
time from your program rather than running in parallel. XRPLib already works
this way (every encoded motor updates its speed on a 20 ms virtual timer, and
the IMU reads itself on one too), so this adds one more of the same.

To keep that borrowed time small, the engine:
  * only reads things that are quick: the wheel encoders (PIO counters),
    digital pins, the ADC (line sensors, battery), the clock, and values your
    program posts with set_value();
  * never talks I2C (the gyro, colour sensor, OLED, LCD): read those in your
    own program and post the result with set_value();
  * writes a light or a servo only when it has to change;
  * times itself, and checks less often if a tick takes too long.

WHAT IT WILL NOT DO
-------------------
Drive the wheels. A rule that set motor efforts would fight drive straight and
turn and ruin their distances and angles, and a stuck rule would be a safety
problem. The one exception is the opt-in emergency stop, which only ever
switches motors OFF: it brakes every motor and makes motor commands do nothing
until clear_estop() is called.

STOPPING
--------
Only one engine runs at a time: making a new one stops the old one. The
XRP Blocks Stop button calls stop() as well. A program that simply ends leaves
the engine running (lights keep working) until Stop, a new Run or a reset.
"""

import time
from machine import Pin, Timer

VERSION = '1.0.0'

# Named colours at full value; brightness is applied when a light is written.
# Same names and values as the Board RGB block and the NeoPixel library.
COLOURS = {
    'off': (0, 0, 0),
    'red': (255, 0, 0),
    'orange': (255, 80, 0),
    'yellow': (255, 200, 0),
    'green': (0, 255, 0),
    'cyan': (0, 255, 255),
    'blue': (0, 0, 255),
    'purple': (128, 0, 255),
    'magenta': (255, 0, 255),
    'pink': (255, 80, 120),
    'white': (255, 255, 255),
}

# Light roles, highest priority first. When two roles share one light, the
# one earlier in this list wins, so a brake light always beats an indicator.
ROLES = ('brake', 'reverse', 'left', 'right', 'head', 'status')

# Events a rule can react to.
MOTION_EVENTS = ('moving', 'forward', 'reverse', 'left', 'right', 'braking', 'stopped')
EVENTS = ('always',) + MOTION_EVENTS + ('button', 'estop', 'A', 'B', 'C', 'D')
SLOTS = ('A', 'B', 'C', 'D')

# Things a custom trigger can measure.
MOTION_MEASURES = ('speed', 'turn', 'distance')
MEASURES = MOTION_MEASURES + ('battery', 'line_left', 'line_right', 'time')

# Braking = the robot's speed falling faster than this many cm/s per second.
BRAKE_LEVELS = {'low': 30.0, 'medium': 15.0, 'high': 8.0}

# Thresholds for the movement events (cm/s and degrees/s).
STILL_CM_S = 0.5        # both wheels slower than this: not moving
MOVE_CM_S = 2.0         # forward / reverse above this
TURN_DEG_S = 20.0       # turning left / right above this
STOPPED_AFTER_MS = 200  # "stopped" once still for this long

# Caps (safety limits).
RATE_MIN, RATE_MAX = 2, 50          # ticks per second
BUDGET_US = 1500                    # one tick should take less than this
STRIP_MAX = 30                      # pixels: a long strip write takes time
SERVO_LOW, SERVO_HIGH = 5, 175      # degrees, same as the Servo blocks

BLINK_MS = 300          # blink: 300 ms on, 300 ms off
PULSE_MS = 1200         # pulse: one fade up and down


def _num(value, name='value'):
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError('%s must be a number, not %r' % (name, value))


def _pick(value, allowed, name):
    value = str(value)
    if value not in allowed:
        raise ValueError('Unknown %s %r; choose one of %s' % (name, value, ', '.join(allowed)))
    return value


def _colour(value):
    if isinstance(value, str):
        key = value.lower()
        if key not in COLOURS:
            raise ValueError('Unknown colour %r' % value)
        return COLOURS[key]
    r, g, b = value
    return (max(0, min(255, int(r))), max(0, min(255, int(g))), max(0, min(255, int(b))))


def _compare(a, op, b):
    if a is None:
        return False
    if op == '>':
        return a > b
    if op == '<':
        return a < b
    if op == '=':
        return a == b
    if op == '!=':
        return a != b
    return False


def _as_number_or_text(value):
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return str(value)


def _no_effort(effort):
    # Put in place of a motor's set_effort while the emergency stop is on.
    pass


class XRPTriggers:
    def __init__(self, rate=20):
        rate = max(RATE_MIN, min(RATE_MAX, _num(rate, 'rate')))
        self._board = None
        try:
            from XRPLib.board import Board
            self._board = Board.get_default_board()
        except Exception:
            pass

        # Only one engine at a time. The running one is remembered on the
        # XRPLib Board object, which outlives a re-upload of this driver.
        old = _find_running(self._board)
        if old is not None and old is not self:
            try:
                old.stop()
            except Exception:
                pass

        self.enabled = True
        self.brightness = 30
        self.hold_ms = 300
        self.brake_threshold = BRAKE_LEVELS['medium']

        self._light_rules = []      # (event, rgb, pattern, role)
        self._servo_rules = {}      # servo number -> list of rule dicts
        self._servo_state = {}      # servo number -> [servo, current, target, engaged, back, speed]
        self._estop_events = []
        self._em = None
        self._estop = False
        self._estop_reason = ''
        self._patched = []
        self._manual = {}           # role -> (rgb, pattern)
        self._bindings = {}         # role -> list of unit keys
        self._units = {}            # unit key -> [kind, object, last value]
        self._unit_roles = {}       # unit key -> roles, priority order
        self._strip = None
        self._strip_pin = None
        self._custom = {}           # slot -> definition list
        self._values = {}
        self._raw = {}
        self._last_true = {}
        self._needs_button = False

        # Movement, from the two drive wheels' encoders.
        self._motion = False
        self._ml = self._mr = None
        self._circ = 3.14159265 * 6.0
        self._track = 15.5
        self._pl = self._pr = 0.0
        self._mt = 0
        self._vl = self._vr = 0.0
        self._hist_s = [0.0] * 5
        self._hist_t = [0] * 5
        self._hist_i = 0
        self._odo = 0.0
        self._still_since = None
        self._battery = None
        self._reflectance = None

        self._t0 = time.ticks_ms()
        self._every_due = {}
        self._skip = 1
        self._count = 0
        self._slow = 0
        self._warned = False
        self._failed = None
        self._running = False

        self._timer = Timer(-1)
        self._period = int(1000 / rate)
        self._start_timer()
        if self._board is not None:
            try:
                self._board._xrp_triggers = self
            except Exception:
                pass
        global _RUNNING
        _RUNNING = self
        print('Triggers %s: checking %d times a second' % (VERSION, int(rate)))

    # -- set-up from the program (main thread) ---------------------------------

    def _start_timer(self):
        self._timer.init(period=self._period, mode=Timer.PERIODIC, callback=self._tick)
        self._running = True

    def _use_event(self, event):
        event = _pick(event, EVENTS, 'event')
        if event in MOTION_EVENTS:
            self._need_motion()
        if event == 'button':
            self._needs_button = True
        return event

    def _need_motion(self):
        if self._motion:
            return
        from XRPLib.encoded_motor import EncodedMotor
        self._ml = EncodedMotor.get_default_encoded_motor(1)
        self._mr = EncodedMotor.get_default_encoded_motor(2)
        try:
            from XRPLib.board import Board
            if Board.get_type() == Board.NANO:
                self._circ = 3.14159265 * 3.46
                self._track = 7.8
        except Exception:
            pass
        self._pl = self._ml.get_position() * self._circ
        self._pr = self._mr.get_position() * self._circ
        self._mt = time.ticks_ms()
        self._motion = True

    def light_rule(self, event, colour, pattern, role):
        """While event is happening, show colour (solid/blink/pulse) on a light role."""
        event = self._use_event(event)
        rule = (event, _colour(colour), _pick(pattern, ('solid', 'blink', 'pulse'), 'pattern'),
                _pick(role, ROLES, 'light'))
        self._light_rules = self._light_rules + [rule]
        self._rebuild()

    def set_light(self, role, colour, pattern='solid'):
        """Set a light by hand. Any rule for the same light takes priority."""
        role = _pick(role, ROLES, 'light')
        rgb = _colour(colour)
        manual = dict(self._manual)
        if rgb == (0, 0, 0):
            manual.pop(role, None)
        else:
            manual[role] = (rgb, _pick(pattern, ('solid', 'blink', 'pulse'), 'pattern'))
        self._manual = manual
        self._rebuild()

    def all_off(self):
        """Clear every light set by hand. Rules keep working."""
        self._manual = {}

    def use_rgb(self, role):
        self._bind(role, ['rgb'])

    def use_board_led(self, role):
        self._bind(role, ['led'])

    def use_pin(self, role, pin):
        pin = int(pin)
        key = 'pin%d' % pin
        if key not in self._units:
            self._units[key] = ['pin', Pin(pin, Pin.OUT), None]
            self._units[key][1].value(0)
        self._bind(role, [key])

    def strip(self, pin, count):
        """A NeoPixel strip used only by the trigger lights."""
        import neopixel
        count = int(count)
        if count < 1 or count > STRIP_MAX:
            raise ValueError('Trigger strip: 1 to %d pixels' % STRIP_MAX)
        self._strip = neopixel.NeoPixel(Pin(int(pin), Pin.OUT), count)
        self._strip_pin = int(pin)
        for i in range(count):
            self._strip[i] = (0, 0, 0)
        self._strip.write()

    def use_pixels(self, role, first, last):
        if self._strip is None:
            self.strip(6, 10)
            print('Triggers: no strip set up; using 10 pixels on Servo 1 (GPIO 6)')
        n = len(self._strip)
        first, last = int(first), int(last)
        if first > last:
            first, last = last, first
        if first < 0 or last >= n:
            raise ValueError('Strip pixels are 0 to %d' % (n - 1))
        keys = []
        for i in range(first, last + 1):
            key = 'px%d' % i
            if key not in self._units:
                self._units[key] = ['px', i, None]
            keys.append(key)
        self._bind(role, keys)

    def _bind(self, role, keys):
        role = _pick(role, ROLES, 'light')
        bindings = dict(self._bindings)
        bindings[role] = list(bindings.get(role, [])) + [k for k in keys if k not in bindings.get(role, [])]
        self._bindings = bindings
        self._rebuild()

    def _rebuild(self):
        # Work out which physical lights each role drives. A role nobody has
        # bound uses the onboard RGB light. Built whole, then swapped in, so a
        # tick in between always sees a complete table.
        used = set(r[3] for r in self._light_rules) | set(self._manual)
        unit_roles = {}
        for role in ROLES:
            keys = self._bindings.get(role)
            if not keys:
                keys = ['rgb'] if role in used else []
            for key in keys:
                unit_roles.setdefault(key, []).append(role)
        # A light the engine has driven stays its own (with no roles, so it
        # is switched off) rather than being left lit.
        for key in self._unit_roles:
            if key not in unit_roles:
                unit_roles[key] = []
        for key in unit_roles:
            if key == 'rgb' and key not in self._units:
                self._units[key] = ['rgb', None, None]
            elif key == 'led' and key not in self._units:
                self._units[key] = ['led', None, None]
        self._unit_roles = unit_roles

    def servo_rule(self, event, servo, angle, speed=0, back=90):
        """While event is happening, move a servo to angle; then return to back."""
        event = self._use_event(event)
        n = int(servo)
        if n not in (1, 2, 3, 4):
            raise ValueError('Servo must be 1 to 4')
        if n not in self._servo_state:
            from XRPLib.servo import Servo
            self._servo_state[n] = [Servo.get_default_servo(n), None, None, False, None, 0.0]
        rule = {'event': event, 'angle': self._servo_angle(angle),
                'speed': max(0.0, _num(speed, 'speed')), 'back': self._servo_angle(back)}
        rules = dict(self._servo_rules)
        rules[n] = list(rules.get(n, [])) + [rule]
        self._servo_rules = rules

    @staticmethod
    def _servo_angle(value):
        return max(SERVO_LOW, min(SERVO_HIGH, _num(value, 'angle')))

    def estop_rule(self, event):
        """Emergency stop: when event happens, brake every motor and keep them off."""
        event = self._use_event(event)
        from XRPLib.encoded_motor import EncodedMotor
        self._em = EncodedMotor
        self._estop_events = self._estop_events + [event]

    def clear_estop(self):
        """Let the motors run again after an emergency stop."""
        self._restore_motors()
        self._estop = False
        self._estop_reason = ''
        self._last_true.pop('estop', None)
        print('Triggers: emergency stop cleared')

    def estop_active(self):
        return self._estop

    def define(self, slot, measure, op, value):
        """Custom trigger slot A-D: measure op value, e.g. speed > 20."""
        slot = _pick(slot, SLOTS, 'trigger')
        measure = _pick(measure, MEASURES, 'measurement')
        if measure in MOTION_MEASURES:
            self._need_motion()
        self._prepare_measure(measure)
        self._set_custom(slot, ['measure', measure, _pick(op, ('>', '<', '=', '!='), 'comparison'),
                                _num(value)])

    def define_pin(self, slot, pin, state):
        """Custom trigger: a digital pin (pull-up). 'low' = switch pressed to GND."""
        slot = _pick(slot, SLOTS, 'trigger')
        want = 0 if _pick(state, ('low', 'high'), 'pin state') == 'low' else 1
        self._set_custom(slot, ['pin', Pin(int(pin), Pin.IN, Pin.PULL_UP), want])

    def define_value(self, slot, name, op, value):
        """Custom trigger on a value the program posts with set_value()."""
        slot = _pick(slot, SLOTS, 'trigger')
        self._set_custom(slot, ['value', str(name), _pick(op, ('>', '<', '=', '!='), 'comparison'),
                                _as_number_or_text(value)])

    def define_every(self, slot, seconds):
        """Custom trigger that happens once every N seconds."""
        slot = _pick(slot, SLOTS, 'trigger')
        period = int(max(0.1, _num(seconds, 'seconds')) * 1000)
        self._set_custom(slot, ['every', period, time.ticks_add(time.ticks_ms(), period)])

    def _set_custom(self, slot, definition):
        custom = dict(self._custom)
        custom[slot] = definition
        self._custom = custom

    def _prepare_measure(self, measure):
        if measure in ('line_left', 'line_right') and self._reflectance is None:
            from XRPLib.reflectance import Reflectance
            self._reflectance = Reflectance.get_default_reflectance()

    def set_value(self, name, value):
        """Post a value (gyro angle, distance, colour name...) for triggers to use."""
        self._values[str(name)] = _as_number_or_text(value)

    def reset_distance(self):
        self._odo = 0.0

    def set_enabled(self, on):
        self.enabled = bool(on)

    def set_brightness(self, percent):
        self.brightness = max(0, min(100, _num(percent, 'brightness')))

    def set_hold(self, seconds):
        self.hold_ms = int(max(0, min(10, _num(seconds, 'seconds'))) * 1000)

    def set_braking(self, level):
        self.brake_threshold = BRAKE_LEVELS[_pick(level, tuple(BRAKE_LEVELS), 'sensitivity')]

    def happening(self, event):
        """True while event is happening (the same test the rules use)."""
        event = self._use_event(event)
        if not self._running:
            return False
        return self._active(event, time.ticks_ms())

    def measure(self, name):
        name = _pick(name, MEASURES, 'measurement')
        if name in MOTION_MEASURES:
            self._need_motion()
        self._prepare_measure(name)
        return self._measure(name, time.ticks_ms())

    def stop(self):
        """Stop the engine, switch its lights off and let the motors run again."""
        self._running = False
        try:
            self._timer.deinit()
        except Exception:
            pass
        self._restore_motors()
        self._estop = False
        for key in list(self._unit_roles):
            try:
                self._write_unit(key, (0, 0, 0), True)
            except Exception:
                pass
        if self._strip is not None:
            try:
                self._strip.write()
            except Exception:
                pass
        global _RUNNING
        if _RUNNING is self:
            _RUNNING = None

    # -- the tick (soft timer callback) ------------------------------------------

    def _tick(self, timer):
        self._count += 1
        if self._count < self._skip:
            return
        self._count = 0
        start = time.ticks_us()
        try:
            self._step(time.ticks_ms())
        except Exception as exc:
            self._fail(exc)
            return
        used = time.ticks_diff(time.ticks_us(), start)
        if used > BUDGET_US:
            self._slow += 1
            # Three slow ticks in a row (so one garbage collection does not
            # count): check half as often.
            if self._slow >= 3 and self._skip < 8:
                self._skip *= 2
                self._slow = 0
                print('Triggers: a check took %d us; now checking every %d ticks' % (used, self._skip))
        else:
            self._slow = 0

    def _fail(self, exc):
        self._failed = exc
        self._running = False
        try:
            self._timer.deinit()
        except Exception:
            pass
        print('Triggers stopped after an error: %r' % (exc,))

    def _step(self, now):
        if self._motion:
            self._update_motion(now)
        raw = self._raw
        if self._needs_button and self._board is not None:
            raw['button'] = self._board.is_button_pressed()
        raw['estop'] = self._estop
        for slot, definition in self._custom.items():
            raw[slot] = self._custom_state(definition, now)
        for event, value in raw.items():
            if value:
                self._last_true[event] = now

        if self.enabled and not self._estop:
            for event in self._estop_events:
                if event == 'always' or raw.get(event, False):
                    self._latch(event)
                    break

        self._update_servos(now)
        self._update_lights(now)

    def _active(self, event, now):
        if event == 'always':
            return True
        if self._raw.get(event, False):
            return True
        last = self._last_true.get(event)
        return last is not None and time.ticks_diff(now, last) < self.hold_ms

    # -- movement ------------------------------------------------------------------

    def _update_motion(self, now):
        dt = time.ticks_diff(now, self._mt) / 1000
        if dt <= 0:
            return
        pl = self._ml.get_position() * self._circ
        pr = self._mr.get_position() * self._circ
        dl, dr = pl - self._pl, pr - self._pr
        self._pl, self._pr, self._mt = pl, pr, now
        self._odo += (abs(dl) + abs(dr)) / 2
        # Smooth the wheel speeds a little: one encoder count is 0.03 cm.
        self._vl += 0.5 * (dl / dt - self._vl)
        self._vr += 0.5 * (dr / dt - self._vr)
        vl, vr = self._vl, self._vr
        v = (vl + vr) / 2
        w = (vr - vl) / self._track * 57.29578   # degrees/s, left positive
        s = abs(v)

        still = abs(vl) < STILL_CM_S and abs(vr) < STILL_CM_S
        if still:
            if self._still_since is None:
                self._still_since = now
        else:
            self._still_since = None

        # Braking: speed now against speed about a quarter of a second ago.
        i = self._hist_i
        old_s, old_t = self._hist_s[i], self._hist_t[i]
        self._hist_s[i], self._hist_t[i] = s, now
        self._hist_i = (i + 1) % len(self._hist_s)
        span = time.ticks_diff(now, old_t) / 1000 if old_t else 0
        braking = False
        if span > 0 and old_s > MOVE_CM_S and old_s - s > 1.5:
            braking = (old_s - s) / span > self.brake_threshold

        raw = self._raw
        raw['moving'] = not still
        raw['stopped'] = still and time.ticks_diff(now, self._still_since) >= STOPPED_AFTER_MS
        raw['forward'] = v > MOVE_CM_S
        raw['reverse'] = v < -MOVE_CM_S
        raw['left'] = w > TURN_DEG_S
        raw['right'] = w < -TURN_DEG_S
        raw['braking'] = braking

    def _measure(self, name, now):
        if name == 'speed':
            return (self._vl + self._vr) / 2
        if name == 'turn':
            return (self._vr - self._vl) / self._track * 57.29578
        if name == 'distance':
            return self._odo
        if name == 'time':
            return time.ticks_diff(now, self._t0) / 1000
        if name == 'battery':
            volts = self._read_battery()
            if volts is None:
                return None
            # Smooth: the reading dips while the motors pull current.
            if self._battery is None:
                self._battery = volts
            self._battery += 0.1 * (volts - self._battery)
            return self._battery
        if name == 'line_left':
            return self._reflectance.get_left()
        if name == 'line_right':
            return self._reflectance.get_right()
        return None

    def _read_battery(self):
        board = self._board
        if board is None:
            return None
        if hasattr(board, 'get_battery_voltage'):
            return board.get_battery_voltage()
        # Older XRPLib: the same 14 V full-scale divider on the power switch pin.
        if hasattr(board, 'on_switch'):
            return board.on_switch.read_u16() / (65536 / 14)
        return None

    def _custom_state(self, d, now):
        kind = d[0]
        if kind == 'measure':
            return _compare(self._measure(d[1], now), d[2], d[3])
        if kind == 'pin':
            return d[1].value() == d[2]
        if kind == 'value':
            value = self._values.get(d[1])
            target = d[3]
            if isinstance(value, float) != isinstance(target, float):
                if d[2] == '!=':
                    return value is not None
                return False
            return _compare(value, d[2], target)
        if kind == 'every':
            if time.ticks_diff(now, d[2]) >= 0:
                due = time.ticks_add(d[2], d[1])
                if time.ticks_diff(now, due) >= 0:     # fell behind: catch up
                    due = time.ticks_add(now, d[1])
                d[2] = due
                return True
            return False
        return False

    # -- emergency stop ------------------------------------------------------------

    def _latch(self, event):
        self._estop = True
        self._estop_reason = event
        self._raw['estop'] = True
        EM = self._em
        for name in ('_DEFAULT_LEFT_MOTOR_INSTANCE', '_DEFAULT_RIGHT_MOTOR_INSTANCE',
                     '_DEFAULT_MOTOR_THREE_INSTANCE', '_DEFAULT_MOTOR_FOUR_INSTANCE'):
            motor = getattr(EM, name, None)
            if motor is None:
                continue
            try:
                motor.target_speed = None
                inner = motor._motor
                if inner not in self._patched:
                    inner.set_effort = _no_effort
                    self._patched.append(inner)
                inner.brake()
            except Exception:
                pass
        print('EMERGENCY STOP (%s): motors stay off until "clear emergency stop"' % event)

    def _restore_motors(self):
        for inner in self._patched:
            try:
                del inner.set_effort
            except Exception:
                pass
        self._patched = []

    # -- servos --------------------------------------------------------------------

    def _update_servos(self, now):
        for n, rules in self._servo_rules.items():
            st = self._servo_state[n]
            target = None
            if self.enabled:
                for rule in rules:
                    if self._active(rule['event'], now):
                        target = rule['angle']
                        st[4] = rule['back']
                        st[5] = rule['speed']
                        break
            if target is not None:
                st[3] = True
            elif st[3]:
                target = st[4]
            else:
                continue            # leave the servo to the rest of the program
            current = st[1]
            if current is None or st[5] <= 0:
                current = target
            else:
                step = st[5] * self._period * self._skip / 1000
                if abs(target - current) <= step:
                    current = target
                elif target > current:
                    current += step
                else:
                    current -= step
            if current != st[1]:
                st[0].set_angle(current * 10 / 9)
                st[1] = current
            if not any(self._active(r['event'], now) for r in rules) and current == st[4]:
                st[3] = False       # back where it rests: hand the servo back

    # -- lights --------------------------------------------------------------------

    def _level(self, pattern, now):
        if pattern == 'solid':
            return 1.0
        if pattern == 'blink':
            return 1.0 if (now // BLINK_MS) % 2 == 0 else 0.0
        half = PULSE_MS // 2
        p = now % PULSE_MS
        x = p / half if p < half else (PULSE_MS - p) / half
        return 0.1 + 0.9 * x

    def _update_lights(self, now):
        requests = {}
        if self.enabled:
            for event, rgb, pattern, role in self._light_rules:
                if role not in requests and self._active(event, now):
                    requests[role] = (rgb, pattern)
        for role, setting in self._manual.items():
            if role not in requests:
                requests[role] = setting
        scale = self.brightness / 100
        strip_changed = False
        for key, roles in self._unit_roles.items():
            colour = (0, 0, 0)
            for role in roles:
                setting = requests.get(role)
                if setting is not None:
                    level = self._level(setting[1], now) * scale
                    rgb = setting[0]
                    colour = (int(rgb[0] * level), int(rgb[1] * level), int(rgb[2] * level))
                    if key in ('led',) or key.startswith('pin'):
                        colour = (1, 1, 1) if self._level(setting[1], now) >= 0.5 and rgb != (0, 0, 0) else (0, 0, 0)
                    break
            if self._write_unit(key, colour, False):
                strip_changed = True
        if strip_changed:
            self._strip.write()

    def _write_unit(self, key, colour, force):
        unit = self._units.get(key)
        if unit is None:
            return False
        if unit[2] == colour and not force:
            return False
        unit[2] = colour
        kind = unit[0]
        on = 1 if colour != (0, 0, 0) else 0
        if kind == 'rgb':
            if self._board is not None:
                try:
                    self._board.set_rgb_led(colour[0], colour[1], colour[2])
                except NotImplementedError:
                    pass
        elif kind == 'led':
            if self._board is not None:
                self._board.led.value(on)
        elif kind == 'pin':
            unit[1].value(on)
        elif kind == 'px':
            if self._strip is not None:
                self._strip[unit[1]] = colour
                return True
        return False


_RUNNING = None


def _find_running(board):
    found = getattr(board, '_xrp_triggers', None) if board is not None else None
    return found if found is not None else _RUNNING


def stop_all():
    """Stop whichever engine is running. Used by the XRP Blocks Stop button."""
    engine = None
    try:
        from XRPLib.board import Board
        engine = getattr(Board.get_default_board(), '_xrp_triggers', None)
    except Exception:
        pass
    if engine is None:
        engine = _RUNNING
    if engine is not None:
        engine.stop()
