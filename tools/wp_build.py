"""Build the new working programs (25 onwards) and the new manual programs.

    python tools/wp_build.py OUTDIR

Writes Blockly serialisation JSON, the same format XRPBlocks saves. Run
tools/wp_check.py afterwards: it loads each file into the real IDE, checks
nothing was dropped, and re-saves it through Blockly.
"""
import json
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)


class P:
    """One program: ids, variables and helpers."""

    def __init__(self, prefix):
        self.prefix = prefix
        self.n = 0
        self.vars = {}

    def id(self):
        self.n += 1
        return '%s%03d' % (self.prefix, self.n)

    def var(self, name, list_=False):
        if name not in self.vars:
            self.vars[name] = {'name': name, 'id': 'v_' + name.replace(' ', '_')}
            if list_:
                self.vars[name]['type'] = 'List'
        return {'id': self.vars[name]['id']}

    # ---- block helpers -------------------------------------------------
    def B(self, t, fields=None, inputs=None, extra=None, **kw):
        b = {'type': t, 'id': self.id()}
        if extra:
            b['extraState'] = extra
        if fields:
            b['fields'] = fields
        if inputs:
            b['inputs'] = inputs
        b.update(kw)
        return b

    def num(self, v, block=None):
        d = {'shadow': {'type': 'math_number', 'id': self.id(), 'fields': {'NUM': v}}}
        if block is not None:
            d['block'] = block
        return d

    def txt(self, v, block=None):
        d = {'shadow': {'type': 'text', 'id': self.id(), 'fields': {'TEXT': v}}}
        if block is not None:
            d['block'] = block
        return d

    def val(self, block):
        return {'block': block}

    def stack(self, *blocks):
        blocks = [b for b in blocks if b is not None]
        for a, b in zip(blocks, blocks[1:]):
            a['next'] = {'block': b}
        return {'block': blocks[0]}

    # common blocks
    def get(self, name):
        return self.B('variables_get', fields={'VAR': self.var(name)})

    def set(self, name, value_block):
        return self.B('variables_set', fields={'VAR': self.var(name)}, inputs={'VALUE': {'block': value_block}})

    def change(self, name, by):
        return self.B('math_change', fields={'VAR': self.var(name)}, inputs={'DELTA': self.num(by)})

    def number(self, v):
        return self.B('math_number', fields={'NUM': v})

    def text(self, v):
        return self.B('text', fields={'TEXT': v})

    def compare(self, a, op, b):
        return self.B('logic_compare', fields={'OP': op}, inputs={'A': self.val(a), 'B': self.val(b)})

    def logic(self, a, op, b):
        return self.B('logic_operation', fields={'OP': op}, inputs={'A': self.val(a), 'B': self.val(b)})

    def arith(self, a, op, b):
        return self.B('math_arithmetic', fields={'OP': op}, inputs={'A': self.num(0, a), 'B': self.num(0, b)})

    def constrain(self, v, low, high):
        return self.B('math_constrain', inputs={'VALUE': self.num(0, v), 'LOW': self.num(low), 'HIGH': self.num(high)})

    def abs(self, v):
        return self.B('math_single', fields={'OP': 'ABS'}, inputs={'NUM': self.num(0, v)})

    def round(self, v):
        return self.B('math_round', fields={'OP': 'ROUND'}, inputs={'NUM': self.num(0, v)})

    def join(self, *parts):
        ins = {}
        for i, p in enumerate(parts):
            ins['ADD%d' % i] = self.txt('', p) if not isinstance(p, str) else self.txt(p)
        return self.B('text_join', extra={'itemCount': len(parts)}, inputs=ins)

    def if_(self, cond, do, else_=None, elifs=()):
        ins = {'IF0': self.val(cond), 'DO0': do}
        for i, (c, d) in enumerate(elifs, 1):
            ins['IF%d' % i] = self.val(c)
            ins['DO%d' % i] = d
        extra = {}
        if elifs:
            extra['elseIfCount'] = len(elifs)
        if else_ is not None:
            ins['ELSE'] = else_
            extra['hasElse'] = True
        return self.B('controls_if', extra=extra or None, inputs=ins)

    def forever(self, body):
        return self.B('xrp_forever', inputs={'DO': body})

    def repeat(self, times, body):
        return self.B('controls_repeat_ext', inputs={'TIMES': self.num(times), 'DO': body})

    def wait(self, s):
        return self.B('xrp_wait_seconds', inputs={'SECONDS': self.num(s)})

    def print(self, block_or_text):
        v = self.txt(block_or_text) if isinstance(block_or_text, str) else self.txt('', block_or_text)
        return self.B('xrp_print', inputs={'TEXT': v})

    def rgb(self, colour, brightness=30):
        return self.B('xrp_rgb_colour', fields={'COLOUR': colour}, inputs={'BRIGHTNESS': self.num(brightness)})

    def rgb3(self, r, g, b):
        def s(x):
            return self.num(x) if isinstance(x, (int, float)) else self.num(0, x)
        return self.B('xrp_rgb_led', inputs={'RED': s(r), 'GREEN': s(g), 'BLUE': s(b)})

    def arcade(self, speed, turn):
        def s(x):
            return self.num(x) if isinstance(x, (int, float)) else self.num(0, x)
        return self.B('xrp_drive_arcade', inputs={'SPEED': s(speed), 'TURN': s(turn)})

    def stop(self):
        return self.B('xrp_drive_stop')

    def straight(self, cm, block=None):
        return self.B('xrp_drive_straight', inputs={'DISTANCE': self.num(cm, block)})

    def turn(self, deg, block=None):
        return self.B('xrp_drive_turn', inputs={'ANGLE': self.num(deg, block)})

    def distance(self):
        return self.B('xrp_distance_sensor')

    def imu(self, reading):
        return self.B('xrp_imu_angle', fields={'READING': reading})

    def line(self, side):
        return self.B('xrp_line_reflectance', fields={'SIDE': side})

    # phone
    def ph_start(self):
        return self.B('xrp_ble_start')

    def ph_title(self, t):
        return self.B('xrp_ble_title', inputs={'TITLE': self.txt(t)})

    def ph_label(self, b, t):
        return self.B('xrp_ble_label', fields={'BUTTON': str(b)}, inputs={'LABEL': self.txt(t)})

    def ph_connected(self):
        return self.B('xrp_ble_connected')

    def ph_held(self, b):
        return self.B('xrp_ble_pressed', fields={'BUTTON': str(b)})

    def ph_pressed(self, b):
        return self.B('xrp_ble_clicked', fields={'BUTTON': str(b)})

    def ph_joy(self, axis):
        return self.B('xrp_ble_joystick', fields={'AXIS': axis})

    def ph_show(self, t):
        return self.B('xrp_ble_show', inputs={'TEXT': self.txt(t) if isinstance(t, str) else self.txt('', t)})

    def ph_value(self, name, block):
        return self.B('xrp_ble_value', inputs={'NAME': self.txt(name), 'VALUE': self.num(0, block)})

    def ph_print(self, t):
        return self.B('xrp_ble_print', inputs={'TEXT': self.txt('', self.text(t)) if isinstance(t, str) else self.txt('', t)})

    def ph_update(self):
        return self.B('xrp_ble_update')

    def start(self, comment, *blocks):
        s = self.B('xrp_start', x=40, y=40, deletable=False,
                   icons={'comment': {'text': comment, 'pinned': False, 'height': 220, 'width': 460}})
        return s, self.stack(s, *blocks)

    def save(self, name, *tops):
        state = {'blocks': {'languageVersion': 0, 'blocks': list(tops)}}
        if self.vars:
            state['variables'] = list(self.vars.values())
        (OUT / (name + '.json')).write_text(json.dumps(state, indent=2), encoding='utf-8')


def drive_by_joystick(p):
    """arcade forward = joystick forward/back, turn = 0 minus left/right"""
    return p.arcade(p.ph_joy('Y'), p.arith(p.number(0), 'MINUS', p.ph_joy('X')))


PROGRAMS = []


def program(fn):
    PROGRAMS.append(fn)
    return fn


@program
def p25():
    p = P('w25_')
    body = p.stack(
        p.if_(p.ph_connected(),
              p.stack(p.if_(p.ph_held(1), p.stack(p.arcade(50, 0)),
                            p.stack(p.stop()),
                            elifs=[(p.ph_held(4), p.stack(p.arcade(-40, 0))),
                                   (p.ph_held(2), p.stack(p.arcade(0, 40))),
                                   (p.ph_held(3), p.stack(p.arcade(0, -40)))]),
                      p.if_(p.ph_pressed(6),
                            p.stack(p.set('lights', p.B('logic_negate', inputs={'BOOL': p.val(p.get('lights'))})))),
                      p.if_(p.get('lights'), p.stack(p.B('xrp_led_on')), p.stack(p.B('xrp_led_off'))),
                      p.if_(p.ph_pressed(5), p.stack(p.ph_print('Horn!'), p.rgb('yellow', 40), p.wait(0.2), p.rgb('off', 0)))),
              p.stack(p.stop(), p.B('xrp_led_off'))),
        p.wait(0.02))
    s, _ = p.start(
        'Bluetooth D-pad driving. On the phone choose Game D-pad. Up forward 50%, Down back 40%, Left and Right spin at 40%. '
        'B switches the board LED on and off, A flashes the RGB yellow and prints "Horn!" (tick Show robot messages to see it). '
        'Lock the phone: the robot must stop within about a second. Left should spin left; if not, see working program 08.',
        p.ph_title('XRP D-pad'), p.ph_label(5, 'Horn'), p.ph_label(6, 'Lights'),
        p.set('lights', p.B('logic_boolean', fields={'BOOL': 'FALSE'})),
        p.ph_start(), p.forever(body))
    p.save('25 Phone - D-pad driving and lights', s)


@program
def p26():
    p = P('w26_')
    body = p.stack(
        p.if_(p.ph_connected(), p.stack(drive_by_joystick(p)), p.stack(p.stop())),
        p.if_(p.ph_held(5), p.stack(p.change('gripper', 3))),
        p.if_(p.ph_held(6), p.stack(p.change('gripper', -3))),
        p.set('gripper', p.constrain(p.get('gripper'), 10, 170)),
        p.B('xrp_servo_set_angle', fields={'SERVO': '1'}, inputs={'ANGLE': p.num(90, p.get('gripper'))}),
        p.ph_value('Gripper', p.get('gripper')),
        p.wait(0.02))
    s, _ = p.start(
        'Servo gripper on servo port 1, driven from the phone. Joystick drives; hold A to open, hold B to close. '
        'The angle is kept between 10 and 170 degrees and shown as a tile (tick Show robot messages). '
        'Check the servo moves smoothly and stops at the limits.',
        p.ph_title('XRP gripper'), p.ph_label(5, 'Open'), p.ph_label(6, 'Close'),
        p.set('gripper', p.number(90)), p.ph_start(), p.forever(body))
    p.save('26 Phone - servo gripper', s)


@program
def p27():
    p = P('w27_')
    body = p.stack(
        p.ph_value('Distance cm', p.round(p.distance())),
        p.ph_value('Line left', p.line('left')),
        p.ph_value('Line right', p.line('right')),
        p.ph_value('Yaw', p.imu('get_yaw')),
        p.ph_value('Heading', p.imu('get_heading')),
        p.ph_value('Pitch', p.imu('get_pitch')),
        p.ph_value('Roll', p.imu('get_roll')),
        p.ph_value('Button', p.B('xrp_button_is_pressed')),
        p.if_(p.ph_pressed(5), p.stack(p.B('xrp_imu_reset_yaw', fields={'AXIS': 'yaw'}), p.ph_print('Yaw set to zero'))),
        p.wait(0.1))
    s, _ = p.start(
        'Sensor dashboard. On the phone choose the Messages layout: eight tiles (the most the phone shows) for distance, both line sensors, '
        'yaw, heading, pitch, roll and the board button. Tilt the robot, move a hand in front, press the board button. '
        'Switch to Joystick and tap A to set yaw to zero. The robot does not move.',
        p.ph_title('XRP dashboard'), p.ph_label(5, 'Zero yaw'), p.ph_start(),
        p.ph_print('Dashboard started'), p.forever(body))
    p.save('27 Phone - sensor dashboard', s)


@program
def p28():
    p = P('w28_')
    too_close = p.compare(p.distance(), 'LT', p.number(15))
    pushing = p.compare(p.ph_joy('Y'), 'GT', p.number(0))
    body = p.stack(
        p.if_(p.ph_connected(),
              p.stack(p.if_(p.logic(too_close, 'AND', pushing),
                            p.stack(p.arcade(0, p.arith(p.number(0), 'MINUS', p.ph_joy('X'))),
                                    p.rgb('red', 40),
                                    p.if_(p.B('logic_negate', inputs={'BOOL': p.val(p.get('warned'))}),
                                          p.stack(p.ph_print('Too close!'), p.set('warned', p.B('logic_boolean', fields={'BOOL': 'TRUE'}))))),
                            p.stack(drive_by_joystick(p), p.rgb('green', 20),
                                    p.set('warned', p.B('logic_boolean', fields={'BOOL': 'FALSE'}))))),
              p.stack(p.stop(), p.rgb('off', 0))),
        p.ph_value('Distance cm', p.round(p.distance())),
        p.wait(0.02))
    s, _ = p.start(
        'Obstacle guard. Drive with the joystick; closer than 15 cm the robot refuses to go forward (it can still turn and reverse), '
        'the RGB turns red and the phone log shows "Too close!" once. Test slowly towards a wall.',
        p.ph_title('XRP guard'), p.set('warned', p.B('logic_boolean', fields={'BOOL': 'FALSE'})),
        p.ph_start(), p.forever(body))
    p.save('28 Phone - obstacle guard', s)


@program
def p29():
    p = P('w29_')
    chan = p.get
    body = p.stack(
        p.if_(p.ph_pressed(2), p.stack(p.set('channel', p.constrain(p.arith(p.get('channel'), 'MINUS', p.number(1)), 1, 3)))),
        p.if_(p.ph_pressed(3), p.stack(p.set('channel', p.constrain(p.arith(p.get('channel'), 'ADD', p.number(1)), 1, 3)))),
        p.if_(p.logic(p.ph_held(1), 'OR', p.ph_held(4)),
              p.stack(p.if_(p.ph_held(1), p.stack(p.set('step', p.number(5))), p.stack(p.set('step', p.number(-5)))),
                      p.if_(p.compare(chan('channel'), 'EQ', p.number(1)),
                            p.stack(p.set('red', p.constrain(p.arith(p.get('red'), 'ADD', p.get('step')), 0, 255))),
                            p.stack(p.set('blue', p.constrain(p.arith(p.get('blue'), 'ADD', p.get('step')), 0, 255))),
                            elifs=[(p.compare(chan('channel'), 'EQ', p.number(2)),
                                    p.stack(p.set('green', p.constrain(p.arith(p.get('green'), 'ADD', p.get('step')), 0, 255))))]))),
        p.if_(p.ph_pressed(6), p.stack(p.set('red', p.number(0)), p.set('green', p.number(0)), p.set('blue', p.number(0)),
                                        p.ph_print('All channels off'))),
        p.rgb3(p.get('red'), p.get('green'), p.get('blue')),
        p.ph_value('Channel', p.B('logic_ternary', inputs={
            'IF': p.val(p.compare(chan('channel'), 'EQ', p.number(1))), 'THEN': p.val(p.text('red')),
            'ELSE': p.val(p.B('logic_ternary', inputs={'IF': p.val(p.compare(chan('channel'), 'EQ', p.number(2))),
                                                          'THEN': p.val(p.text('green')), 'ELSE': p.val(p.text('blue'))}))})),
        p.ph_value('Red', p.get('red')), p.ph_value('Green', p.get('green')), p.ph_value('Blue', p.get('blue')),
        p.wait(0.05))
    s, _ = p.start(
        'RGB colour mixer. Choose Game D-pad and tick Show robot messages. Left and Right choose the channel (red, green, blue), '
        'hold Up or Down to raise or lower it by 5 at a time; values stay between 0 and 255 however long you hold. B switches all off. '
        'The robot does not move.',
        p.ph_title('XRP colour mixer'), p.ph_label(6, 'Off'),
        p.set('channel', p.number(1)), p.set('red', p.number(0)), p.set('green', p.number(0)), p.set('blue', p.number(0)),
        p.set('step', p.number(5)), p.ph_start(), p.forever(body))
    p.save('29 Phone - RGB colour mixer', s)


@program
def p30():
    p = P('w30_')
    body = p.stack(
        p.if_(p.ph_pressed(1), p.stack(p.change('brightness', 5))),
        p.if_(p.ph_pressed(4), p.stack(p.change('brightness', -5))),
        p.if_(p.compare(p.get('brightness'), 'GT', p.number(255)),
              p.stack(p.set('brightness', p.number(255)), p.ph_print('Top of the range: 255'))),
        p.if_(p.compare(p.get('brightness'), 'LT', p.number(0)),
              p.stack(p.set('brightness', p.number(0)), p.ph_print('Bottom of the range: 0'))),
        p.if_(p.ph_held(5), p.stack(p.rgb3(100, 0, p.get('brightness'))),
              p.stack(p.rgb3(p.get('brightness'), 0, 0))),
        p.ph_value('Brightness', p.get('brightness')),
        p.wait(0.02))
    s, _ = p.start(
        'Brightness with limits (the fixed version of the brightness test program). Tap Up or Down to change the red brightness by 5. '
        'It stops at 0 and 255 and the log says so, instead of the program stopping with an error. Hold A to mix in blue. '
        'The tile shows the value live.',
        p.ph_title('XRP brightness'), p.ph_label(5, 'Blue mix'),
        p.set('brightness', p.number(100)), p.ph_start(), p.forever(body))
    p.save('30 Phone - brightness with limits', s)


@program
def p31():
    p = P('w31_')
    follow = p.if_(p.compare(p.line('left'), 'GT', p.get('threshold')),
                   p.stack(p.arcade(p.get('speed'), 20)),
                   p.stack(p.arcade(p.get('speed'), -20)))
    body = p.stack(
        p.if_(p.ph_pressed(5), p.stack(p.set('running', p.B('logic_negate', inputs={'BOOL': p.val(p.get('running'))})),
                                        p.ph_print(p.join('Following: ', p.get('running'))))),
        p.if_(p.ph_pressed(1), p.stack(p.set('speed', p.constrain(p.arith(p.get('speed'), 'ADD', p.number(5)), 10, 60)))),
        p.if_(p.ph_pressed(4), p.stack(p.set('speed', p.constrain(p.arith(p.get('speed'), 'MINUS', p.number(5)), 10, 60)))),
        p.if_(p.ph_pressed(3), p.stack(p.set('threshold', p.constrain(p.arith(p.get('threshold'), 'ADD', p.number(0.05)), 0.1, 0.9)))),
        p.if_(p.ph_pressed(2), p.stack(p.set('threshold', p.constrain(p.arith(p.get('threshold'), 'MINUS', p.number(0.05)), 0.1, 0.9)))),
        p.if_(p.logic(p.get('running'), 'AND', p.ph_connected()), p.stack(follow), p.stack(p.stop())),
        p.ph_value('Speed %', p.get('speed')), p.ph_value('Threshold', p.get('threshold')),
        p.ph_value('Line left', p.line('left')), p.ph_value('Line right', p.line('right')),
        p.wait(0.02))
    s, _ = p.start(
        'Line follower tuned from the phone. Put the robot on the left edge of a dark line. Tick Show robot messages, then tap A to start or stop. '
        'Up/Down change speed (10 to 60%), Right/Left raise or lower the threshold (0.1 to 0.9). Watch the line tiles over black and white '
        'to pick the threshold. Stops if the phone disconnects.',
        p.ph_title('XRP line tuner'), p.ph_label(5, 'Go/Stop'),
        p.set('speed', p.number(25)), p.set('threshold', p.number(0.5)),
        p.set('running', p.B('logic_boolean', fields={'BOOL': 'FALSE'})), p.ph_start(), p.forever(body))
    p.save('31 Phone - line follower tuning', s)


@program
def p32():
    p = P('w32_')
    p.vars['sides'] = {'name': 'sides', 'id': 'v_sides'}
    define = p.B('procedures_defnoreturn', x=560, y=40,
                 extra={'params': [{'name': 'sides', 'id': 'v_sides'}]},
                 fields={'NAME': 'draw polygon'},
                 inputs={'STACK': p.stack(
                     p.print(p.join('Drawing a shape with ', p.get('sides'), ' sides')),
                     p.B('controls_repeat_ext', inputs={'TIMES': p.num(4, p.get('sides')), 'DO': p.stack(
                         p.straight(20),
                         p.turn(0, p.arith(p.number(360), 'DIVIDE', p.get('sides'))))}))})

    def call(n):
        return p.B('procedures_callnoreturn', extra={'name': 'draw polygon', 'params': ['sides']},
                   inputs={'ARG0': p.val(p.number(n))})
    s, _ = p.start(
        'Polygon gallery using a function with an input. Press the board button before each shape: triangle, square, pentagon, hexagon. '
        'Each should close up where it started; if not, check turn calibration (program 07).',
        p.B('xrp_drive_accel', fields={'LEVEL': '0.25'}),
        p.B('xrp_wait_for_button'), call(3),
        p.B('xrp_wait_for_button'), call(4),
        p.B('xrp_wait_for_button'), call(5),
        p.B('xrp_wait_for_button'), call(6),
        p.print('Gallery finished'))
    p.save('32 Functions - polygon gallery', s, define)


@program
def p33():
    p = P('w33_')
    s, _ = p.start(
        'Figure of eight with arcade drive and timing. Press the board button. The robot curves one way for 4 seconds, then the other way, twice. '
        'The loops will not be perfect circles: change the turn and time values until the two loops are the same size.',
        p.B('xrp_wait_for_button'),
        p.repeat(2, p.stack(
            p.rgb('cyan', 30), p.arcade(40, 30), p.wait(4),
            p.rgb('magenta', 30), p.arcade(40, -30), p.wait(4))),
        p.stop(), p.rgb('off', 0))
    p.save('33 Drive - figure of eight', s)


@program
def p34():
    p = P('w34_')
    tilt = p.B('math_single', fields={'OP': 'ABS'}, inputs={'NUM': p.num(0, p.imu('get_pitch'))})
    tilt2 = p.abs(p.imu('get_roll'))
    body = p.stack(
        p.set('tilt', p.B('logic_ternary', inputs={'IF': p.val(p.compare(tilt, 'GT', tilt2)),
                                                   'THEN': p.val(p.abs(p.imu('get_pitch'))),
                                                   'ELSE': p.val(p.abs(p.imu('get_roll')))})),
        p.if_(p.compare(p.get('tilt'), 'LT', p.number(3)),
              p.stack(p.rgb('green', 30), p.B('xrp_led_on')),
              p.stack(p.rgb('red', 30), p.B('xrp_led_off')),
              elifs=[(p.compare(p.get('tilt'), 'LT', p.number(10)), p.stack(p.rgb('yellow', 30), p.B('xrp_led_off')))]),
        p.print(p.join('pitch ', p.round(p.imu('get_pitch')), '  roll ', p.round(p.imu('get_roll')))),
        p.wait(0.25))
    s, _ = p.start(
        'Spirit level. Keep the robot still while it calibrates, then tilt it. Green RGB and LED on: level (under 3 degrees). '
        'Yellow: under 10 degrees. Red: more. Pitch and roll print in the Console four times a second. Also a gyro drift check: '
        'leave it flat for a minute and watch the numbers.',
        p.B('xrp_imu_calibrate'), p.forever(body))
    p.save('34 Sensors - spirit level', s)


@program
def p35():
    p = P('w35_')
    st = lambda v: p.compare(p.get('state'), 'EQ', p.text(v))  # noqa: E731
    body = p.stack(
        p.if_(st('drive'),
              p.stack(p.arcade(40, 0), p.rgb('green', 20),
                      p.if_(p.compare(p.distance(), 'LT', p.number(20)),
                            p.stack(p.stop(), p.set('state', p.text('turn'))))),
              elifs=[(st('turn'),
                      p.stack(p.rgb('orange', 30), p.change('turns', 1),
                              p.turn(0, p.B('math_random_int', inputs={'FROM': p.num(100), 'TO': p.num(160)})),
                              p.print(p.join('Turn ', p.get('turns'))),
                              p.if_(p.compare(p.get('turns'), 'GTE', p.number(5)),
                                    p.stack(p.set('state', p.text('done'))),
                                    p.stack(p.set('state', p.text('drive'))))))]),
        p.wait(0.02))
    s, _ = p.start(
        'Patrol state machine. Press the board button. States: drive (until something is closer than 20 cm), turn (a random 100 to 160 degrees), '
        'done (after 5 turns). The RGB shows the state: green drive, orange turn, off done. Use an open floor with some walls or boxes.',
        p.set('state', p.text('drive')), p.set('turns', p.number(0)),
        p.B('xrp_wait_for_button'),
        p.B('controls_whileUntil', fields={'MODE': 'UNTIL'}, inputs={'BOOL': p.val(st('done')), 'DO': body}),
        p.stop(), p.rgb('off', 0), p.print(p.join('Finished after ', p.get('turns'), ' turns')))
    p.save('35 Logic - patrol state machine', s)


@program
def p36():
    p = P('w36_')
    lst = p.var('path', list_=True)
    body = p.stack(
        p.straight(0, p.B('xrp_list_item', fields={'VAR': lst}, inputs={'INDEX': p.num(1, p.get('i'))})),
        p.turn(0, p.B('xrp_list_item', fields={'VAR': lst},
                      inputs={'INDEX': p.num(1, p.arith(p.get('i'), 'ADD', p.number(1)))})))
    s, _ = p.start(
        'Path from text with a list. The text "20,90,30,-90,20,180" is split into a list and read two items at a time: drive that many cm, '
        'then turn that many degrees. Press the board button to run it. Change the text to make your own route. '
        'Also checks that list items made from text work in drive and turn blocks.',
        p.B('xrp_list_set', fields={'VAR': lst}, inputs={'VALUE': p.val(p.B('xrp_list_from_text', inputs={
            'TEXT': p.txt('20,90,30,-90,20,180'), 'DELIM': p.txt(',')}))}),
        p.print(p.join('Steps: ', p.B('xrp_list_length', fields={'VAR': lst}))),
        p.B('xrp_wait_for_button'),
        p.B('controls_for', fields={'VAR': p.var('i')}, inputs={
            'FROM': p.num(1), 'TO': p.num(1, p.B('xrp_list_length', fields={'VAR': lst})), 'BY': p.num(2), 'DO': body}),
        p.stop(), p.print('Route finished'))
    p.save('36 Lists - route from text', s)


@program
def p37():
    p = P('w37_')
    p.vars['times'] = {'name': 'times', 'id': 'v_times'}
    p.vars['percent'] = {'name': 'percent', 'id': 'v_percent'}
    wiggle = p.B('procedures_defnoreturn', x=620, y=40, extra={'params': [{'name': 'times', 'id': 'v_times'}]},
                 fields={'NAME': 'wiggle'},
                 inputs={'STACK': p.stack(p.B('controls_repeat_ext', inputs={'TIMES': p.num(3, p.get('times')), 'DO': p.stack(
                     p.turn(25), p.turn(-25))}))})
    safe = p.B('procedures_defreturn', x=620, y=260, extra={'params': [{'name': 'percent', 'id': 'v_percent'}]},
               fields={'NAME': 'safe speed'},
               inputs={'STACK': p.stack(p.print(p.join('asked for ', p.get('percent'), '%'))),
                       'RETURN': p.val(p.constrain(p.get('percent'), -60, 60))})

    def call_w(n):
        return p.B('procedures_callnoreturn', extra={'name': 'wiggle', 'params': ['times']},
                   inputs={'ARG0': p.val(p.number(n))})

    def call_s(n):
        return p.B('procedures_callreturn', extra={'name': 'safe speed', 'params': ['percent']},
                   inputs={'ARG0': p.val(p.number(n))})
    s, _ = p.start(
        'Dance routine with two functions: "wiggle" takes how many times, "safe speed" returns a speed kept between -60 and 60%. '
        'Press the board button. Expect: wiggle 2, forward 1 s at 60% (asked for 90), wiggle 3, back 1 s at 40%, spin, lights. '
        'The Console shows each speed asked for.',
        p.B('xrp_wait_for_button'),
        call_w(2),
        p.arcade(call_s(90), 0), p.wait(1), p.stop(),
        call_w(3),
        p.arcade(call_s(-40), 0), p.wait(1), p.stop(),
        p.turn(360), p.B('xrp_led_blink', inputs={'COUNT': p.num(5), 'DELAY': p.num(0.2)}),
        p.print('Dance finished'))
    p.save('37 Functions - dance routine', s, wiggle, safe)


@program
def p38():
    p = P('w38_')
    body = p.stack(
        p.if_(p.ph_connected(), p.stack(drive_by_joystick(p)), p.stack(p.stop())),
        p.if_(p.B('xrp_trig_happening', fields={'EVENT': 'braking'}), p.stack(p.ph_show('Braking'))),
        p.ph_value('Speed cm/s', p.round(p.B('xrp_trig_measure', fields={'MEASURE': 'speed'}))),
        p.ph_value('Battery V', p.B('xrp_trig_measure', fields={'MEASURE': 'battery'})),
        p.wait(0.02))
    s, _ = p.start(
        'Phone driving with automatic lights (Triggers library). Drive with the joystick: the RGB shows white when reversing, orange blinking '
        'when turning, red when braking, green while moving forward. Speed and battery show as tiles. Checks that triggers and the phone '
        'work together without slowing the controls down.',
        p.ph_title('XRP lights'),
        p.B('xrp_trig_setup', inputs={'RATE': p.num(20)}),
        p.B('xrp_trig_use_rgb', fields={'ROLE': 'brake'}),
        p.B('xrp_trig_light_rule', fields={'EVENT': 'braking', 'COLOUR': 'red', 'PATTERN': 'solid', 'ROLE': 'brake'}),
        p.B('xrp_trig_light_rule', fields={'EVENT': 'reverse', 'COLOUR': 'white', 'PATTERN': 'solid', 'ROLE': 'reverse'}),
        p.B('xrp_trig_light_rule', fields={'EVENT': 'left', 'COLOUR': 'orange', 'PATTERN': 'blink', 'ROLE': 'left'}),
        p.B('xrp_trig_light_rule', fields={'EVENT': 'right', 'COLOUR': 'orange', 'PATTERN': 'blink', 'ROLE': 'right'}),
        p.B('xrp_trig_light_rule', fields={'EVENT': 'forward', 'COLOUR': 'green', 'PATTERN': 'solid', 'ROLE': 'head'}),
        p.ph_start(), p.forever(body))
    p.save('38 Phone - driving with trigger lights', s)


@program
def p39():
    p = P('w39_')
    body = p.stack(
        p.if_(p.ph_pressed(5), p.stack(p.change('count', 1))),
        p.if_(p.ph_pressed(6), p.stack(p.change('count', -1))),
        p.if_(p.ph_pressed(1), p.stack(p.set('count', p.number(0)), p.ph_print('Reset'))),
        p.if_(p.logic(p.B('math_number_property', fields={'PROPERTY': 'EVEN'},
                          inputs={'NUMBER_TO_CHECK': p.num(0, p.get('count'))}), 'AND',
                      p.compare(p.get('count'), 'NEQ', p.get('last'))),
              p.stack(p.rgb('green', 30)),
              p.stack(p.if_(p.compare(p.get('count'), 'NEQ', p.get('last')), p.stack(p.rgb('blue', 30))))),
        p.if_(p.logic(p.compare(p.B('math_modulo', inputs={'DIVIDEND': p.num(0, p.get('count')), 'DIVISOR': p.num(10)}), 'EQ', p.number(0)), 'AND',
                      p.logic(p.compare(p.get('count'), 'NEQ', p.number(0)), 'AND', p.compare(p.get('count'), 'NEQ', p.get('last')))),
              p.stack(p.ph_print(p.join('Reached ', p.get('count'))))),
        p.set('last', p.get('count')),
        p.ph_value('Count', p.get('count')),
        p.wait(0.02))
    s, _ = p.start(
        'Tap counter: checks that "just pressed" catches every tap. Tap A to add 1, B to take 1 away, Up to reset. '
        'The RGB is green on even numbers and blue on odd. Every multiple of 10 is logged. Tap A 20 times quickly: the tile should read 20.',
        p.ph_title('XRP counter'), p.ph_label(5, '+1'), p.ph_label(6, '-1'),
        p.set('count', p.number(0)), p.set('last', p.number(0)), p.ph_start(), p.forever(body))
    p.save('39 Phone - tap counter', s)


@program
def p40():
    p = P('w40_')
    body = p.stack(
        p.if_(p.ph_connected(),
              p.stack(p.rgb('green', 20),
                      p.if_(p.B('logic_negate', inputs={'BOOL': p.val(p.get('was connected'))}),
                            p.stack(p.change('connections', 1),
                                    p.print(p.join('Phone connected (', p.get('connections'), ')')),
                                    p.ph_print(p.join('Hello, connection ', p.get('connections'))),
                                    p.set('was connected', p.B('logic_boolean', fields={'BOOL': 'TRUE'}))))),
              p.stack(p.rgb('red', 20), p.wait(0.2), p.rgb('off', 0),
                      p.if_(p.get('was connected'),
                            p.stack(p.print('Phone lost'), p.set('was connected', p.B('logic_boolean', fields={'BOOL': 'FALSE'})))))),
        p.ph_value('Connections', p.get('connections')),
        p.wait(0.2))
    s, _ = p.start(
        'Connection watchdog. RGB green while the phone is connected, flashing red when not. Run over USB and watch the Console: '
        '"Phone connected (n)" and "Phone lost" each time. Lock the phone, switch apps, walk away: each should show "Phone lost" '
        'within about a second, and reconnecting should count up.',
        p.ph_title('XRP watchdog'),
        p.set('connections', p.number(0)), p.set('was connected', p.B('logic_boolean', fields={'BOOL': 'FALSE'})),
        p.ph_start(), p.forever(body))
    p.save('40 Phone - connection watchdog', s)


@program
def manual_p55():
    p = P('m55_')
    arcade = drive_by_joystick(p)
    light = p.if_(p.ph_held(5), p.stack(p.B('xrp_led_on')), p.stack(p.B('xrp_led_off')))
    body = p.stack(p.if_(p.ph_connected(), p.stack(arcade, light), p.stack(p.stop(), p.B('xrp_led_off'))), p.wait(0.02))
    s, _ = p.start('Manual page 55 (section 11.5).', p.ph_title('XRP phone drive'), p.ph_label(5, 'Light'),
                   p.ph_start(), p.forever(body))
    p.save('p55 - Phone joystick driving', s)


@program
def manual_p57():
    p = P('m57_')
    body = p.stack(
        p.ph_value('Distance cm', p.distance()),
        p.ph_value('Heading', p.B('xrp_imu_angle', fields={'READING': 'get_heading'})),
        p.if_(p.ph_pressed(5), p.stack(p.ph_print('Button A pressed'))),
        p.wait(0.05))
    s, _ = p.start('Manual page 57 (section 11.6).', p.ph_label(5, 'Log'), p.ph_start(),
                   p.ph_print('Program started'), p.forever(body))
    p.save('p57 - Phone readings and messages', s)


for fn in PROGRAMS:
    fn()
print(len(PROGRAMS), 'programs written to', OUT)
