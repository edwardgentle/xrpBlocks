"""Desktop protocol tests: python tools/test_remote_control.py."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest

sys.modules['network'] = types.ModuleType('network')
spec = importlib.util.spec_from_file_location('remote', Path(__file__).resolve().parents[1] / 'lib/RemoteControl.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RemoteTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        module.select = types.SimpleNamespace(poll=lambda: object())
        module.time = types.SimpleNamespace(ticks_ms=lambda: self.now, ticks_diff=lambda a,b:a-b)
        self.remote = module.RemoteControl()

    def state(self, mask, seq=1, session='a'):
        return self.remote._state({'session':session,'seq':seq,'mask':mask})

    def test_all_buttons_edges_and_release(self):
        self.assertEqual(self.state(63),200)
        for i in range(1,7):
            self.assertTrue(self.remote.pressed(i))
            self.assertTrue(self.remote.clicked(i))
            self.assertFalse(self.remote.clicked(i))
        self.state(0,2)
        self.assertFalse(any(self.remote.buttons))

    def test_heartbeat_expiry(self):
        self.state(1)
        self.now=900
        self.state(1,2)
        self.now=1500
        self.assertTrue(self.remote.connected())
        self.now=1901
        self.assertFalse(self.remote.pressed(1))
        self.assertFalse(self.remote.connected())
        self.assertFalse(self.remote.clicked(1))

    def test_owner_and_out_of_order(self):
        self.state(1,2)
        self.assertEqual(self.state(0,1),409)
        self.assertEqual(self.state(2,3,'b'),409)
        self.assertTrue(self.remote.pressed(1))
        self.now=1001
        self.assertEqual(self.state(2,1,'b'),200)

    def test_invalid_requests_do_not_press(self):
        for mask in (-1,64,'1',None):
            with self.assertRaises(ValueError): self.state(mask)
        self.assertFalse(any(self.remote.buttons))

    def test_labels_and_button_bounds(self):
        self.remote.label(1,'Lights')
        self.assertEqual(self.remote.labels[0],'Lights')
        for i in (0,7):
            with self.assertRaises(ValueError): self.remote.pressed(i)

    def test_partial_http_and_header(self):
        responses=[]
        self.remote._response=lambda client,status,*args:responses.append(status)
        client={'input':b'POST /state HTTP/1.1\r\nContent-Length: 10\r\n\r\n{}'}
        self.remote._request(client)
        self.assertEqual(responses,[])
        client['input']=b'POST /state HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}'
        self.remote._request(client)
        self.assertEqual(responses,[404])

    def test_join_resets_old_network_and_accepts_open_network(self):
        calls=[]
        wlan=types.SimpleNamespace(active=lambda value:calls.append(('active',value)),
            connect=lambda *args:calls.append(('connect',args)),isconnected=lambda:True,
            ifconfig=lambda:('192.168.1.25','','',''))
        self.remote.wlan=wlan
        self.remote._join_network('Home','secret')
        self.assertEqual(calls,[('active',False),('active',True),('connect',('Home','secret'))])
        calls.clear()
        self.remote._join_network('Open','')
        self.assertEqual(calls[-1],('connect',('Open',)))

    def test_join_failure_reasons_and_timeout(self):
        def sleep(ms): self.now += ms
        module.time.sleep_ms=sleep
        for status, message in [(-3,'password rejected'),(-2,'network not found'),(-1,'connection failed'),(1,'timed out')]:
            self.now=0
            self.remote.wlan=types.SimpleNamespace(active=lambda value:None,
                connect=lambda *args:None,isconnected=lambda:False,status=lambda:status)
            with self.assertRaisesRegex(OSError,message):
                self.remote._join_network('Home','secret')
        self.assertEqual(self.now,30000)


if __name__ == '__main__': unittest.main()
