"""Cooperative Wi-Fi button panel. Call update() frequently in your main loop.

No motor or device dependencies. Expired button states become false; the user's
program must act on those states and explicitly stop any ongoing actuator.
"""
import network
import socket
import select
import time
import json

PAGE = ''  # Filled from tools/remote-control.html by embed_drivers.py.
_active_remote = None


class RemoteControl:
    def __init__(self):
        self.labels = ['Button %d' % i for i in range(1, 7)]
        self.title = 'Remote control'
        self.buttons = [False] * 6
        self.edges = [False] * 6
        self.owner = None
        self.sequence = -1
        self.last_seen = 0
        self.server = None
        self.clients = []
        self.wlan = None
        self.poller = select.poll()
        self.ip = ''

    def label(self, button, text):
        self.labels[self._index(button)] = str(text)[:32]

    def set_title(self, text):
        self.title = str(text)[:60]

    @staticmethod
    def _index(button):
        index = int(button) - 1
        if index < 0 or index >= 6:
            raise ValueError('Button must be 1 to 6')
        return index

    def _expire(self):
        if self.owner is not None and time.ticks_diff(time.ticks_ms(), self.last_seen) > 1000:
            self.release()
            self.owner = None
            self.sequence = -1

    def release(self):
        self.buttons = [False] * 6
        self.edges = [False] * 6

    def connected(self):
        self.update()
        return self.owner is not None

    def pressed(self, button):
        self.update()
        return self.buttons[self._index(button)]

    def clicked(self, button):
        self.update()
        index = self._index(button)
        result = self.edges[index]
        self.edges[index] = False
        return result

    def _state(self, data):
        self._expire()
        session, sequence, mask = data.get('session'), data.get('seq'), data.get('mask')
        if not isinstance(session, str) or not 1 <= len(session) <= 48:
            raise ValueError('Invalid session')
        if type(sequence) is not int or sequence < 0 or type(mask) is not int or not 0 <= mask < 64:
            raise ValueError('Invalid button state')
        if self.owner is not None and self.owner != session:
            return 409
        if self.owner == session and sequence <= self.sequence:
            return 409
        self.owner, self.sequence = session, sequence
        self.last_seen = time.ticks_ms()
        for i in range(6):
            down = bool(mask & (1 << i))
            if down and not self.buttons[i]:
                self.edges[i] = True
            self.buttons[i] = down
        return 200

    def start(self, mode, ssid, password):
        global _active_remote
        print('Remote control driver 1.1.1')
        # The REPL retains imported modules between runs. Close the previous
        # program's listener before a new RemoteControl instance binds port 80.
        if _active_remote is not None and _active_remote is not self:
            _active_remote.close()
        self.close()
        ap = mode == 'ap'
        if mode not in ('ap', 'station'):
            raise ValueError('Choose ap or station')
        if ap and not 8 <= len(password) <= 63:
            raise ValueError('Hotspot password must have 8 to 63 characters')
        if not ssid or len(ssid.encode()) > 32:
            raise ValueError('Wi-Fi name must be 1 to 32 bytes')
        interface = getattr(network, 'AP_IF' if ap else 'STA_IF', None)
        if interface is None:
            interface = getattr(network.WLAN, 'IF_AP' if ap else 'IF_STA')
        self.wlan = network.WLAN(interface)
        try:
            if ap:
                self.wlan.active(False)
                try:
                    # CYW43 uses authentication bit flags, not ESP32's enum 3.
                    # WPA2 AES PSK = WPA2 (0x400000) | AES (0x4).
                    self.wlan.config(ssid=ssid, key=password, security=0x400004, channel=6)
                except (ValueError, TypeError):
                    self.wlan.config(essid=ssid, password=password, authmode=3)
                self.wlan.active(True)
                print('Remote control: hotspot "' + ssid + '" started')
            else:
                self._join_network(ssid, password)
            self.ip = self.wlan.ifconfig()[0]
            self.server = socket.socket()
            self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server.bind(('0.0.0.0', 80))
            self.server.listen(3)
            self.server.setblocking(False)
            self.poller.register(self.server, select.POLLIN)
            _active_remote = self
            print('Remote control: http://' + self.ip)
            if not ap:
                print('Open this address on a phone/laptop connected to "' + ssid + '"')
        except BaseException:
            self.close()
            raise

    def _join_network(self, ssid, password):
        # Clear a previous association before connecting to the requested SSID.
        # Otherwise isconnected() can report success for the previous router.
        self.wlan.active(False)
        self.wlan.active(True)
        print('Remote control: joining "' + ssid + '" (2.4 GHz Wi-Fi)...')
        if password:
            self.wlan.connect(ssid, password)
        else:
            self.wlan.connect(ssid)
        started = time.ticks_ms()
        last_progress = started
        while not self.wlan.isconnected():
            status = self.wlan.status()
            failures = (
                ('STAT_WRONG_PASSWORD', -3, 'Wi-Fi password rejected; check the password'),
                ('STAT_NO_AP_FOUND', -2, 'Wi-Fi network not found; check its name and 2.4 GHz availability'),
                ('STAT_CONNECT_FAIL', -1, 'Wi-Fi connection failed; check signal and router settings'),
            )
            for constant, fallback, message in failures:
                if status == getattr(network, constant, fallback):
                    raise OSError(message)
            now = time.ticks_ms()
            if time.ticks_diff(now, started) >= 30000:
                raise OSError('Wi-Fi join timed out (status %s); check 2.4 GHz, credentials and DHCP' % status)
            if time.ticks_diff(now, last_progress) >= 5000:
                print('Remote control: waiting for Wi-Fi/IP address (status %s)...' % status)
                last_progress = now
            time.sleep_ms(100)
        if self.wlan.ifconfig()[0] == '0.0.0.0':
            raise OSError('Wi-Fi connected but no IPv4 address was assigned')

    def _drop(self, client):
        try:
            self.poller.unregister(client['socket'])
        except Exception:
            pass
        client['socket'].close()
        self.clients.remove(client)

    def _response(self, client, status, body='', content_type='text/plain'):
        body = body.encode() if isinstance(body, str) else body
        header = ('HTTP/1.1 %d OK\r\nContent-Type: %s; charset=utf-8\r\n'
                  'Content-Length: %d\r\nCache-Control: no-store\r\n'
                  'Connection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n') % (status, content_type, len(body))
        client['output'] = header.encode() + body
        client['sent'] = 0
        self.poller.modify(client['socket'], select.POLLOUT)

    def _request(self, client):
        raw = client['input']
        if b'\r\n\r\n' not in raw:
            return
        head, body = raw.split(b'\r\n\r\n', 1)
        lines = head.decode().split('\r\n')
        method, path, _ = lines[0].split(' ')
        headers = {}
        for line in lines[1:]:
            key, value = line.split(':', 1)
            headers[key.lower()] = value.strip()
        length = int(headers.get('content-length', '0'))
        if length < 0 or length > 512:
            raise ValueError('Request too large')
        if len(body) < length:
            return
        if method == 'GET' and path == '/':
            self._response(client, 200, PAGE, 'text/html')
        elif method == 'GET' and path == '/config':
            self._response(client, 200, json.dumps({'title': self.title, 'labels': self.labels}), 'application/json')
        elif method == 'POST' and path == '/state' and headers.get('x-remote-control') == '1':
            self._response(client, self._state(json.loads(body[:length].decode())))
        else:
            self._response(client, 404)

    def update(self):
        """Serve a bounded amount of network work, then return to user blocks."""
        self._expire()
        if self.server is None:
            return
        for obj, flags in self.poller.poll(0):
            if obj == self.server:
                if flags & select.POLLIN:
                    conn, _ = self.server.accept()
                    conn.setblocking(False)
                    if len(self.clients) >= 4:
                        conn.close()
                    else:
                        client = {'socket': conn, 'input': b'', 'output': None, 'started': time.ticks_ms()}
                        self.clients.append(client)
                        self.poller.register(conn, select.POLLIN)
                continue
            client = None
            for candidate in self.clients:
                if candidate['socket'] == obj:
                    client = candidate
                    break
            if client is None:
                continue
            try:
                if flags & (select.POLLERR | select.POLLHUP):
                    self._drop(client)
                elif client['output'] is not None and flags & select.POLLOUT:
                    sent = obj.send(memoryview(client['output'])[client['sent']:client['sent'] + 1024])
                    client['sent'] += sent
                    if client['sent'] == len(client['output']):
                        self._drop(client)
                elif flags & select.POLLIN:
                    chunk = obj.recv(512)
                    if not chunk:
                        self._drop(client)
                        continue
                    client['input'] += chunk
                    if len(client['input']) > 2048:
                        self._drop(client)
                        continue
                    self._request(client)
            except OSError as exc:
                if exc.args[0] not in (11, 35):
                    self._drop(client)
            except (ValueError, TypeError, KeyError):
                self._drop(client)
        for client in self.clients[:]:
            if time.ticks_diff(time.ticks_ms(), client['started']) > 2000:
                self._drop(client)
        self._expire()

    def close(self):
        global _active_remote
        if _active_remote is self:
            _active_remote = None
        self.release()
        self.owner, self.sequence = None, -1
        for client in self.clients[:]:
            self._drop(client)
        if self.server:
            self.poller.unregister(self.server)
            self.server.close()
            self.server = None
        if self.wlan:
            self.wlan.active(False)
            self.wlan = None
        self.ip = ''
