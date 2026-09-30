"""Render dark-mode block pictures of the phone-control blocks for the learner manual.

    python tools/render_manual_images.py OUTDIR

Serves the working copy on port 8799 (must already be running), loads each
program into the real IDE in headless Chromium, and clips a screenshot to the
blocks at deviceScaleFactor 1.4 (same as manual v2).
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
n = [0]


def bid():
    n[0] += 1
    return 'mi%04d' % n[0]


def B(t, fields=None, inputs=None, **kw):
    b = {'type': t, 'id': bid()}
    b.update(kw)
    if fields:
        b['fields'] = fields
    if inputs:
        b['inputs'] = inputs
    return b


def num(v, block=None):
    d = {'shadow': {'type': 'math_number', 'id': bid(), 'fields': {'NUM': v}}}
    if block:
        d['block'] = block
    return d


def txt(v, block=None):
    d = {'shadow': {'type': 'text', 'id': bid(), 'fields': {'TEXT': v}}}
    if block:
        d['block'] = block
    return d


def chain(*bs):
    for a, b in zip(bs, bs[1:]):
        a['next'] = {'block': b}
    return bs[0]


def single(block):
    block['x'], block['y'] = 20, 20
    return [block]


ITEMS = {}
ITEMS['ble_start'] = single(B('xrp_ble_start'))
ITEMS['ble_title'] = single(B('xrp_ble_title', inputs={'TITLE': txt('XRP phone control')}))
ITEMS['ble_label'] = single(B('xrp_ble_label', fields={'BUTTON': '5'}, inputs={'LABEL': txt('Horn')}))
ITEMS['ble_update'] = single(B('xrp_ble_update'))
ITEMS['ble_connected'] = single(B('xrp_ble_connected'))
ITEMS['ble_pressed'] = single(B('xrp_ble_pressed', fields={'BUTTON': '1'}))
ITEMS['ble_clicked'] = single(B('xrp_ble_clicked', fields={'BUTTON': '5'}))
ITEMS['ble_joystick'] = single(B('xrp_ble_joystick', fields={'AXIS': 'Y'}))
ITEMS['ble_show'] = single(B('xrp_ble_show', inputs={'TEXT': txt('Ready to drive')}))
ITEMS['ble_value'] = single(B('xrp_ble_value', inputs={'NAME': txt('Distance cm'), 'VALUE': num(0, B('xrp_distance_sensor'))}))
ITEMS['ble_print'] = single(B('xrp_ble_print', inputs={'TEXT': txt('', B('text', fields={'TEXT': 'Obstacle!'}))}))
ITEMS['ble_release'] = single(B('xrp_ble_release'))

# Program 23: joystick driving
arcade = B('xrp_drive_arcade', inputs={
    'SPEED': num(0, B('xrp_ble_joystick', fields={'AXIS': 'Y'})),
    'TURN': num(0, B('math_arithmetic', fields={'OP': 'MINUS'}, inputs={
        'A': num(0), 'B': num(0, B('xrp_ble_joystick', fields={'AXIS': 'X'}))}))})
light = B('controls_if', extraState={'hasElse': True}, inputs={
    'IF0': {'block': B('xrp_ble_pressed', fields={'BUTTON': '5'})},
    'DO0': {'block': B('xrp_led_on')}, 'ELSE': {'block': B('xrp_led_off')}})
chain(arcade, light)
stop = chain(B('xrp_drive_stop'), B('xrp_led_off'))
main_if = B('controls_if', extraState={'hasElse': True}, inputs={
    'IF0': {'block': B('xrp_ble_connected')}, 'DO0': {'block': arcade}, 'ELSE': {'block': stop}})
chain(main_if, B('xrp_wait_seconds', inputs={'SECONDS': num(0.02)}))
start = B('xrp_start', x=20, y=20)
chain(start, B('xrp_ble_title', inputs={'TITLE': txt('XRP phone drive')}),
      B('xrp_ble_label', fields={'BUTTON': '5'}, inputs={'LABEL': txt('Light')}),
      B('xrp_ble_start'), B('xrp_forever', inputs={'DO': {'block': main_if}}))
ITEMS['ble_prog_drive'] = [start]

# Program 24: readings and messages
v1 = B('xrp_ble_value', inputs={'NAME': txt('Distance cm'), 'VALUE': num(0, B('xrp_distance_sensor'))})
v2 = B('xrp_ble_value', inputs={'NAME': txt('Heading'), 'VALUE': num(0, B('xrp_imu_get_heading'))})
pr = B('controls_if', inputs={'IF0': {'block': B('xrp_ble_clicked', fields={'BUTTON': '5'})},
                              'DO0': {'block': B('xrp_ble_print', inputs={'TEXT': txt('', B('text', fields={'TEXT': 'Button A pressed'}))})}})
chain(v1, v2, pr, B('xrp_wait_seconds', inputs={'SECONDS': num(0.05)}))
start2 = B('xrp_start', x=20, y=20)
chain(start2, B('xrp_ble_label', fields={'BUTTON': '5'}, inputs={'LABEL': txt('Log')}), B('xrp_ble_start'),
      B('xrp_ble_print', inputs={'TEXT': txt('', B('text', fields={'TEXT': 'Program started'}))}),
      B('xrp_forever', inputs={'DO': {'block': v1}}))
ITEMS['ble_prog_readings'] = [start2]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, blocks in ITEMS.items():
        page = browser.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=1.4)
        state = json.dumps({'blocks': {'languageVersion': 0, 'blocks': blocks}})
        page.add_init_script(
            "localStorage.setItem('xrp_blocks_workspace', %s);"
            "localStorage.setItem('xrp_blocks_theme','dark');"
            "localStorage.setItem('xrp_blocks_language','en');" % json.dumps(state))
        page.goto('http://localhost:8799/index.html')
        page.wait_for_timeout(3500)
        ids = [b['id'] for b in blocks]
        box = page.evaluate("""(ids) => {
          const ws = Blockly.getMainWorkspace();
          Blockly.Events.disable();
          ws.getAllBlocks(false).forEach(b => { if (!b.isEnabled()) b.setDisabledReason(false, 'orphan'); });
          Blockly.Events.enable();
          ws.getTopBlocks(false).forEach(b => b.unselect && b.unselect());
          if (Blockly.getSelected && Blockly.getSelected()) Blockly.common.setSelected(null);
          ws.getTopBlocks(false).forEach(b => { if (!ids.includes(b.id)) b.getSvgRoot().style.display = 'none'; });
          const tops = ids.map(id => ws.getBlockById(id));
          let r = null;
          tops.forEach(b => { const q = b.getSvgRoot().getBoundingClientRect();
            r = r ? {l: Math.min(r.l, q.left), t: Math.min(r.t, q.top), rr: Math.max(r.rr, q.right), b: Math.max(r.b, q.bottom)}
                  : {l: q.left, t: q.top, rr: q.right, b: q.bottom}; });
          return r;
        }""", ids)
        page.wait_for_timeout(300)
        pad = 8
        clip = {'x': box['l'] - pad, 'y': box['t'] - pad, 'width': box['rr'] - box['l'] + 2 * pad,
                'height': box['b'] - box['t'] + 2 * pad}
        page.screenshot(path=str(OUT / f'{name}.png'), clip=clip)
        print(name, round(clip['width']), round(clip['height']))
        page.close()
    browser.close()
