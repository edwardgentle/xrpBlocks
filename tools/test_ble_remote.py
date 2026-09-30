"""Desktop tests for lib/BLERemote.py: python tools/test_ble_remote.py

Fakes sys.stdin, select.poll, time and os.dupterm, so the line protocol,
expiry and Bluetooth start-up logic can be checked without a robot.
"""
import importlib.util
import io
import sys
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / 'lib/BLERemote.py'


class FakeStdin:
    def __init__(self):
        self.data = ''

    def feed(self, text):
        self.data += text

    def read(self, n):
        out, self.data = self.data[:n], self.data[n:]
        return out


class FakePoll:
    def __init__(self, stdin):
        self.stdin = stdin

    def register(self, obj, flags):
        assert obj is self.stdin

    def poll(self, timeout):
        return [(self.stdin, 1)] if self.stdin.data else []


def load():
    spec = importlib.util.spec_from_file_location('BLERemote', PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BLERemoteTests(unittest.TestCase):
    def setUp(self):
        self.m = load()
        self.now = 0
        self.stdin = FakeStdin()
        self.m.sys = types.SimpleNamespace(stdin=self.stdin)
        self.m.select = types.SimpleNamespace(poll=lambda: FakePoll(self.stdin), POLLIN=1)
        self.m.time = types.SimpleNamespace(ticks_ms=lambda: self.now,
                                            ticks_diff=lambda a, b: a - b)
        self.m.BLERemote._ensure_bluetooth = staticmethod(lambda: 'running')
        self.m.BLERemote._name = staticmethod(lambda: 'XRP-test')
        self.out = io.StringIO()
        self.phone = self.m.BLERemote()
        self.phone._write = lambda text: self.out.write(text + '\n')
        with redirect_stdout(self.out):
            self.phone.start()

    def feed(self, text):
        self.stdin.feed(text)
        with redirect_stdout(self.out):
            self.phone.update()

    def lines(self):
        return [l for l in self.out.getvalue().splitlines() if l.startswith('#xrp')]

    def test_not_connected_at_start(self):
        with redirect_stdout(self.out):
            self.assertFalse(self.phone.connected())
            self.assertEqual(self.phone.joystick('x'), 0)
        self.assertEqual(self.lines(), [], 'robot must stay quiet until the phone talks')

    def test_hello_sends_config_and_ack(self):
        self.phone.set_title('My|robot\n')
        self.phone.label(5, 'Horn')
        self.feed('#xrp h\r\n')
        self.assertIn('#xrp cfg My robot |Up|Left|Right|Down|Horn|B', self.lines())
        self.assertIn('#xrp ok', self.lines())
        self.assertTrue(self.phone.connected())

    def test_state_buttons_joystick_edges(self):
        self.feed('#xrp s 63 40 -75\r\n')
        for i in range(1, 7):
            self.assertTrue(self.phone.pressed(i))
            self.assertTrue(self.phone.clicked(i))
            self.assertFalse(self.phone.clicked(i))
        self.assertEqual(self.phone.joystick('x'), 40)
        self.assertEqual(self.phone.joystick('y'), -75)
        self.feed('#xrp s 1 0 0\n')
        self.assertTrue(self.phone.pressed(1))
        self.assertFalse(self.phone.pressed(2))
        self.assertFalse(self.phone.clicked(1), 'still held is not a new press')

    def test_line_split_across_updates(self):
        self.feed('#xrp s 2 1')
        self.assertFalse(self.phone.pressed(2))
        self.feed('0 20\r\n')
        self.assertTrue(self.phone.pressed(2))
        self.assertEqual(self.phone.joystick('x'), 10)

    def test_clamp_and_rejects(self):
        self.feed('#xrp s 0 500 -900\n')
        self.assertEqual((self.phone.x, self.phone.y), (100, -100))
        for bad in ('#xrp s 64 0 0', '#xrp s -1 0 0', '#xrp s a b c', '#xrp s 1 2',
                    'xrp s 1 0 0', 'print(1)', '#xrpx s 1 0 0'):
            self.phone.release()
            self.feed(bad + '\n')
            self.assertFalse(any(self.phone.buttons), bad)

    def test_overlong_line_dropped(self):
        self.feed('#' * 500 + '\n#xrp s 4 0 0\n')
        self.assertTrue(self.phone.pressed(3))

    def test_expiry_releases_everything(self):
        self.feed('#xrp s 1 50 50\n')
        self.now = 900
        self.assertTrue(self.phone.connected())
        self.now = 1001
        self.assertFalse(self.phone.connected())
        self.assertFalse(self.phone.pressed(1))
        self.assertEqual(self.phone.joystick('y'), 0)

    def test_heartbeat_keeps_alive_and_acks_throttled(self):
        for t in range(0, 3000, 250):
            self.now = t
            self.feed('#xrp s 1 0 0\n')
        self.assertTrue(self.phone.connected())
        acks = self.lines().count('#xrp ok')
        self.assertTrue(5 <= acks <= 7, acks)

    def test_show_repeats_for_late_phone(self):
        self.phone.show('Distance 12 cm')
        self.assertEqual(self.lines(), [], 'nothing sent while no phone')
        self.feed('#xrp h\n')
        self.assertIn('#xrp m Distance 12 cm', self.lines())

    def test_button_bounds(self):
        for b in (0, 7):
            with self.assertRaises(ValueError):
                self.phone.pressed(b)

    def test_update_is_bounded(self):
        self.stdin.feed('#xrp s 1 0 0\n' * 200)
        with redirect_stdout(self.out):
            self.phone.update()
        self.assertTrue(self.stdin.data, 'one update must not drain an endless stream')

    def test_no_bluetooth_message(self):
        m = load()
        m.select = self.m.select
        m.sys = self.m.sys
        m.BLERemote._ensure_bluetooth = staticmethod(lambda: 'none')
        out = io.StringIO()
        with redirect_stdout(out):
            m.BLERemote().start()
        self.assertIn('XRPCode IDE', out.getvalue())


class FeedTests(BLERemoteTests.__base__):
    def setUp(self):
        BLERemoteTests.setUp(self)

    feed = BLERemoteTests.feed
    lines = BLERemoteTests.lines

    def test_nothing_sent_until_opt_in(self):
        self.phone.value('Distance', 12.5)
        self.phone.log('hi')
        self.feed('#xrp s 0 0 0\n')
        self.assertFalse([l for l in self.lines() if l.startswith(('#xrp v', '#xrp p'))])

    def test_opt_in_sends_values_and_backlog(self):
        for i in range(12):
            self.phone.log('line %d' % i)
        self.phone.value('Distance', 12.5)
        self.phone.value('Speed', -0.0001)
        self.phone.value('Bump', False)
        self.feed('#xrp o 1\n')
        out = self.lines()
        self.assertIn('#xrp v Distance|12.5', out)
        self.assertIn('#xrp v Speed|0', out)
        self.assertIn('#xrp v Bump|false', out)
        logs = [l for l in out if l.startswith('#xrp p')]
        self.assertEqual(logs, ['#xrp p line 4', '#xrp p line 5', '#xrp p line 6'], 'max 3 per update, last 8 kept')
        for t in range(1, 5):
            self.now = t * 50
            self.feed('#xrp s 0 0 0\n')
        logs = [l for l in self.lines() if l.startswith('#xrp p')]
        self.assertEqual(logs[-1], '#xrp p line 11')
        self.assertEqual(len(logs), 8)

    def test_changes_throttled_and_repeated(self):
        self.feed('#xrp o 1\n')
        self.phone.value('D', 1)
        n0 = self.lines().count('#xrp v D|1')
        self.now = 50
        self.phone.value('D', 2)
        self.assertNotIn('#xrp v D|2', self.lines(), 'within 200 ms: held back')
        self.now = 250
        self.feed('#xrp s 0 0 0\n')
        self.assertIn('#xrp v D|2', self.lines())
        before = self.lines().count('#xrp v D|2')
        self.now = 2300
        self.feed('#xrp s 0 0 0\n')
        self.assertEqual(self.lines().count('#xrp v D|2'), before + 1, 'repeated every 2 s')

    def test_limits_and_cleaning(self):
        self.feed('#xrp o 1\n')
        with redirect_stdout(self.out):
            for i in range(10):
                self.phone.value('n%d' % i, i)
        self.now = 250
        self.feed('#xrp s 0 0 0\n')
        names = {l.split()[2].split('|')[0] for l in self.lines() if l.startswith('#xrp v')}
        self.assertEqual(len(names), 8)
        self.assertIn('only 8 readings', self.out.getvalue())
        self.phone.value('a|b\nc', 'x|y')
        self.now = 2500
        self.feed('#xrp s 0 0 0\n')
        self.assertIn('#xrp v n0|0', self.lines())
        self.assertFalse(any('a|b' in l for l in self.lines()), 'a 9th name is left out')

    def test_opt_out_and_disconnect_stop_feed(self):
        self.feed('#xrp o 1\n')
        self.assertTrue(self.phone.feed_on)
        self.feed('#xrp o 0\n')
        self.assertFalse(self.phone.feed_on)
        self.feed('#xrp o 1\n')
        self.now = 1500
        self.phone.update()
        self.assertFalse(self.phone.feed_on, 'phone gone: opt-in forgotten')


class NotifyTests(unittest.TestCase):
    def test_replies_go_out_as_20_byte_notifications(self):
        m = load()
        sent = []
        ble = types.SimpleNamespace(gatts_notify=lambda c, h, d: sent.append((c, h, bytes(d))))
        uart = types.SimpleNamespace(_ble=ble, _tx_handle=7, _connections={3})
        phone = m.BLERemote()
        phone._uart = uart
        phone._write('#xrp cfg XRP phone control|Up|Left|Right|Down|A|B')
        self.assertTrue(all(len(d) <= 20 and c == 3 and h == 7 for c, h, d in sent))
        self.assertEqual(b''.join(d for _, _, d in sent),
                         b'#xrp cfg XRP phone control|Up|Left|Right|Down|A|B\r\n')

    def test_busy_link_does_not_crash(self):
        m = load()
        def busy(*a):
            raise OSError(12)
        uart = types.SimpleNamespace(_ble=types.SimpleNamespace(gatts_notify=busy),
                                     _tx_handle=7, _connections={1})
        phone = m.BLERemote()
        phone._uart = uart
        phone._write('#xrp ok')

    def test_no_connection_sends_nothing(self):
        m = load()
        sent = []
        uart = types.SimpleNamespace(_ble=types.SimpleNamespace(gatts_notify=lambda *a: sent.append(a)),
                                     _tx_handle=7, _connections=set())
        phone = m.BLERemote()
        phone._uart = uart
        phone._write('#xrp ok')
        self.assertEqual(sent, [])


class EnsureBluetoothTests(unittest.TestCase):
    def run_with(self, current, has_ble):
        m = load()
        calls = []

        def dupterm(stream, slot):
            calls.append((stream, slot))
            return current if stream is None else None

        sys.modules['os'] = types.SimpleNamespace(dupterm=dupterm)
        saved = {k: sys.modules.get(k) for k in ('ble', 'ble.blerepl')}
        try:
            if has_ble:
                pkg = types.ModuleType('ble')
                pkg.__path__ = []
                sys.modules['ble'] = pkg
                sys.modules['ble.blerepl'] = types.ModuleType('ble.blerepl')
            else:
                sys.modules['ble'] = None
            return m.BLERemote._ensure_bluetooth(), calls
        finally:
            import os as real_os
            sys.modules['os'] = real_os
            for k, v in saved.items():
                if v is None:
                    sys.modules.pop(k, None)
                else:
                    sys.modules[k] = v

    def test_already_running_is_restored(self):
        result, calls = self.run_with('stream', True)
        self.assertEqual(result, 'running')
        self.assertEqual(calls, [(None, 0), ('stream', 0)])

    def test_starts_repl_when_missing(self):
        self.assertEqual(self.run_with(None, True)[0], 'started')

    def test_no_ble_package(self):
        self.assertEqual(self.run_with(None, False)[0], 'none')


if __name__ == '__main__':
    unittest.main(verbosity=1)
