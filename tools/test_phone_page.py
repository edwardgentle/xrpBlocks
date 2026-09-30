"""End-to-end check: phone/index.html in headless Chromium talking to the real
lib/BLERemote.py through a fake Web Bluetooth link.

    python tools/test_phone_page.py [--shots DIR]

Needs Playwright with Chromium. The fake navigator.bluetooth hands every write
to the Python driver's stdin, and everything the driver prints comes back as
a notification, so the page and the driver meet exactly as on a robot, minus
the radio.
"""
import argparse
import importlib.util
import io
import sys
import time
import types
from contextlib import redirect_stdout
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

FAKE_BT = r"""
(() => {
  const listeners = [];
  const rx = {
    startNotifications: async () => {},
    addEventListener: (t, f) => listeners.push(f),
  };
  const tx = {
    writeValueWithResponse: async (data) => {
      const text = new TextDecoder().decode(data);
      window.__sent.push(text);
      await window.robotWrite(text);
    },
  };
  window.__sent = [];
  window.__notify = (text) => {
    const bytes = new TextEncoder().encode(text);
    const ev = {target: {value: new DataView(bytes.buffer)}};
    listeners.forEach(f => f(ev));
  };
  let dcb = null;
  const device = {
    name: 'XRP-test',
    addEventListener: (t, f) => { dcb = f; },
    gatt: {
      connected: false,
      connect: async function () { this.connected = true; return {
        getPrimaryService: async () => ({ getCharacteristic: async (u) => u.startsWith('6e400002') ? tx : rx }) }; },
      disconnect: function () { this.connected = false; dcb && dcb(); },
    },
  };
  Object.defineProperty(navigator, 'bluetooth', {value: {requestDevice: async (opts) => { window.__opts = opts; return device; }}});
})();
"""


def load_driver():
    spec = importlib.util.spec_from_file_location('BLERemote', ROOT / 'lib/BLERemote.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots')
    args = ap.parse_args()

    m = load_driver()
    buf = {'in': '', 'out': []}

    class Stdin:
        def read(self, n):
            s, buf['in'] = buf['in'][:n], buf['in'][n:]
            return s

    class Poll:
        def register(self, *a):
            pass

        def poll(self, t):
            return [1] if buf['in'] else []

    stdin = Stdin()
    m.sys = types.SimpleNamespace(stdin=stdin)
    m.select = types.SimpleNamespace(poll=Poll, POLLIN=1)
    m.time = types.SimpleNamespace(ticks_ms=lambda: int(time.monotonic() * 1000),
                                   ticks_diff=lambda a, b: a - b)
    m.BLERemote._ensure_bluetooth = staticmethod(lambda: 'running')
    phone = m.BLERemote()
    phone._write = lambda text: buf['out'].append(text + '\r\n')
    with redirect_stdout(io.StringIO()):
        phone.start()
    phone.set_title('Test robot')
    phone.label(5, 'Horn')

    failures = []

    def check(cond, what):
        print(('PASS ' if cond else 'FAIL ') + what)
        if not cond:
            failures.append(what)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page.add_init_script(FAKE_BT)
        page.expose_function('robotWrite', lambda text: buf.__setitem__('in', buf['in'] + text))
        page.goto((ROOT / 'phone/index.html').as_uri())

        def pump(seconds):
            end = time.monotonic() + seconds
            while time.monotonic() < end:
                phone.update()
                if buf['out']:
                    out, buf['out'] = ''.join(buf['out']), []
                    page.evaluate('t => window.__notify(t)', out)
                page.wait_for_timeout(20)

        if args.shots:
            page.screenshot(path=f'{args.shots}/phone-before.png')
        page.click('#connect')
        pump(1.5)
        check(page.evaluate('window.__opts.filters[0].namePrefix') == 'XRP', 'picker filters on XRP-')
        check('program listening' in page.inner_text('#status'), 'page sees the program listening')
        check(page.inner_text('#title') == 'Test robot', 'title arrives from the robot')
        check('Horn' in page.inner_text('.p5'), 'button label arrives from the robot')
        check(phone.connected(), 'robot sees the phone connected')

        # joystick: drag to top-right
        box = page.locator('.stick').bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx + box['width'] * 0.18, cy - box['height'] * 0.18, steps=4)
        pump(0.4)
        x, y = phone.joystick('x'), phone.joystick('y')
        check(30 < x <= 100 and 30 < y <= 100, f'joystick up-right reaches robot (x={x}, y={y})')
        if args.shots:
            page.screenshot(path=f'{args.shots}/phone-joystick.png')
        page.mouse.up()
        pump(0.4)
        check((phone.joystick('x'), phone.joystick('y')) == (0, 0), 'joystick springs back to 0')

        # hold button A (5)
        b = page.locator('.p5').bounding_box()
        page.mouse.move(b['x'] + 20, b['y'] + 20)
        page.mouse.down()
        pump(0.4)
        check(phone.pressed(5), 'button A held reaches robot')
        check(phone.clicked(5) and not phone.clicked(5), 'button A gives one press event')
        pump(1.5)
        check(phone.pressed(5), 'heartbeat keeps a held button held past 1 s')
        page.mouse.up()
        pump(0.4)
        check(not phone.pressed(5), 'release reaches robot')

        # robot message
        phone.show('Distance 12 cm')
        pump(0.6)
        check(page.inner_text('#message') == 'Distance 12 cm', 'robot text shows on the phone')

        # robot messages: off by default, then opted in
        phone.value('Distance', 12.5)
        phone.log('Hello from the robot')
        pump(0.8)
        check(not phone.feed_on, 'robot messages are off until the phone opts in')
        check(page.locator('#feedlog').is_hidden(), 'message panel hidden by default')
        page.check('#feed')
        pump(1.0)
        check(phone.feed_on, 'ticking the box tells the robot')
        check(page.inner_text('#readings .tile .v') == '12.5', 'reading appears as a tile')
        check('Hello from the robot' in page.inner_text('#log'), 'backlog line appears in the log')
        phone.value('Distance', 7)
        phone.value('Line', True)
        phone.log('Obstacle!')
        pump(0.8)
        vals = page.eval_on_selector_all('#readings .tile', 'ts => ts.map(t => t.innerText.replace(/\\s+/g, " "))')
        check(vals == ['Distance 7', 'Line true'], f'tiles update in place ({vals})')
        check(page.inner_text('#log').count('Obstacle!') == 1, 'new log line appears once')
        if args.shots:
            page.screenshot(path=f'{args.shots}/phone-messages.png', full_page=True)
        page.uncheck('#feed')
        pump(0.8)
        check(not phone.feed_on and page.locator('#feedlog').is_hidden(), 'unticking stops and hides messages')

        # Messages view: no controls, readings shown even with the box unticked
        page.select_option('#layout', 'msg')
        pump(1.0)
        check(phone.feed_on, 'Messages view turns robot messages on by itself')
        check(page.locator('.pad').count() == 0 and page.locator('.stick').count() == 0, 'Messages view has no controls')
        check(page.locator('#release').is_hidden(), 'no Release button in Messages view')
        rows = page.eval_on_selector_all('#readings .tile', 'ts => ts.map(t => t.innerText.replace(/\\s+/g, " "))')
        check(rows == ['Distance 7', 'Line true'], f'readings block lists every reading ({rows})')
        check(not page.is_checked('#feed'), 'tick box left as the user set it')
        if args.shots:
            page.screenshot(path=f'{args.shots}/phone-msgview.png', full_page=True)
        page.select_option('#layout', 'joy')
        pump(0.8)
        check(not phone.feed_on and page.locator('#readings').is_hidden(), 'back to Joystick with box unticked: messages off')

        # D-pad layout
        page.select_option('#layout', 'dpad')
        b = page.locator('.p1').bounding_box()
        page.mouse.move(b['x'] + 20, b['y'] + 20)
        page.mouse.down()
        pump(0.4)
        check(phone.pressed(1) and not phone.pressed(2), 'D-pad up = button 1')
        if args.shots:
            page.screenshot(path=f'{args.shots}/phone-dpad.png')
        page.evaluate("window.dispatchEvent(new Event('blur'))")
        pump(0.4)
        check(not phone.pressed(1), 'leaving the page releases everything')
        page.mouse.up()

        # program stops: robot goes silent, page notices, and slows to hello
        phone_alive = False
        t0 = time.monotonic()
        while time.monotonic() - t0 < 2.2:
            page.wait_for_timeout(50)
        check('no program' in page.inner_text('#status').lower() or 'waiting' in page.inner_text('#status').lower(),
              'page notices the program has stopped')
        sent = ''.join(page.evaluate('window.__sent'))
        check('\x03' not in sent and '##XRPSTOP' not in sent, 'never sends Ctrl+C or the IDE stop string')
        check(all(ch.isascii() for ch in sent), 'only ASCII is sent')
        bad = [l for l in sent.split('\r\n') if l and not l.startswith('#xrp ')]
        check(not bad, 'every line starts with "#xrp " (a comment if the REPL sees it)')
        if args.shots:
            page.set_viewport_size({'width': 844, 'height': 390})
            page.select_option('#layout', 'joy')
            page.screenshot(path=f'{args.shots}/phone-landscape.png')
        browser.close()

    print(f'{len(failures)} failed')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
