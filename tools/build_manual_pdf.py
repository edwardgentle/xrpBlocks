"""Build the learner manual PDF from the Docs markdown export plus images.

    python tools/build_manual_pdf.py MANUAL.md OLD_IMAGES_DIR NEW_IMAGES_DIR OUT.pdf DATE_TEXT

The markdown export replaces each picture with "[image: alt]". Pictures are
filled in document order: placeholders whose alt text matches a key in NEW
(the pictures added in this version) take that file; every other placeholder
takes the next image extracted, in page order, from the previous PDF.
"""
import html
import re
import sys
from pathlib import Path

import markdown
from playwright.sync_api import sync_playwright

md_path, old_dir, new_dir, out_pdf, date_text = sys.argv[1:6]
old_imgs = sorted(Path(old_dir).glob('*.png'))
NEW = {
    'phone control over Bluetooth: start': 'ble_start.png',
    'phone page title': 'ble_title.png',
    'phone button 5 A label Horn': 'ble_label.png',
    'phone connected': 'ble_connected.png',
    'phone button 1 up held': 'ble_pressed.png',
    'phone button 5 A just pressed': 'ble_clicked.png',
    'phone joystick forward/back': 'ble_joystick.png',
    'phone update': 'ble_update.png',
    'phone show text': 'ble_show.png',
    'phone release all buttons': 'ble_release.png',
    'Joystick driving: arcade drive from the joystick while connected, stop when not': 'ble_prog_drive.png',
    'The phone page in the Joystick layout, connected and driving forward and right': 'phone-joystick.png',
    'phone show value Distance cm = distance sensor': 'ble_value.png',
    'phone print Obstacle!': 'ble_print.png',
    'The Messages view: every reading in one large block, with the message log below': 'phone-msgview.png',
    'Readings and messages program: distance and heading on the phone, and a log line each time A is tapped': 'ble_prog_readings.png',
}
PHONE_SHOTS = {'phone-joystick.png', 'phone-msgview.png'}

text = Path(md_path).read_text(encoding='utf-8')
lines = text.split('\n')
# Title and byline become the title page.
assert lines[0].startswith('# ')
title = lines[0][2:].strip()
body = '\n'.join(lines[3:])  # skip title, blank, byline

old_i = 0
used_new = set()
missing = []


def img_tag(m):
    global old_i
    alt = html.unescape(m.group(1))
    if alt in NEW:
        f = Path(new_dir) / NEW[alt]
        used_new.add(alt)
        cls = 'shot' if NEW[alt] in PHONE_SHOTS else 'blk'
    else:
        f = old_imgs[old_i]
        old_i += 1
        cls = 'blk'
    return '<p class="fig"><img class="%s" src="%s" alt="%s"></p>' % (cls, f.resolve().as_uri(), html.escape(alt, quote=True))


body = re.sub(r'^&#91;image: (.*?)\\\]$', img_tag, body, flags=re.M)
missing = set(NEW) - used_new
assert old_i == len(old_imgs), (old_i, len(old_imgs))
assert not missing, missing

content = markdown.markdown(body, extensions=['tables', 'fenced_code', 'sane_lists'])
# Chapters, About and Glossary start on a new page.
content = re.sub(r'<h2>', '<h2 class="chap">', content)

CSS = """
@page { size: A4; margin: 18mm 18mm 20mm 18mm; }
body { font-family: 'DejaVu Sans', sans-serif; font-size: 10.5pt; color: #1b1f24; line-height: 1.5; }
.titlepage { page-break-after: always; padding-top: 70mm; }
.titlepage h1 { font-size: 30pt; color: #0b4f8a; margin: 0 0 6mm 0; }
.titlepage .by { color: #555; font-size: 11pt; }
h2 { font-size: 17pt; color: #0b4f8a; border-bottom: 2px solid #0b4f8a; padding-bottom: 2mm; margin-top: 0; }
h2.chap { page-break-before: always; }
h3 { font-size: 12.5pt; color: #113333; margin-top: 7mm; page-break-after: avoid; }
h4 { font-size: 11pt; color: #113333; margin-top: 5mm; page-break-after: avoid; }
p, li { orphans: 3; widows: 3; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 3mm 0; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #c9d3df; padding: 2mm 2.5mm; text-align: left; vertical-align: top; }
th { background: #e8eef7; }
code { font-family: 'DejaVu Sans Mono', monospace; font-size: 9pt; background: #f1f3f5; padding: 0 1mm; border-radius: 2px; }
pre { background: #f1f3f5; padding: 3mm; border-radius: 3px; font-size: 9pt; page-break-inside: avoid; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
.fig { margin: 2mm 0; page-break-inside: avoid; }
img.blk { max-width: 100%; }
img.shot { border: 1px solid #c9d3df; border-radius: 6px; }
"""
page = f"""<!doctype html><html><head><meta charset="utf-8"><title>{html.escape(title)}</title><style>{CSS}</style></head>
<body><div class="titlepage"><h1>{html.escape(title)}</h1><div class="by">{html.escape(date_text)}</div></div>
{content}
<script>
// Block images at 0.72 of their natural size in v2 terms (rendered at 1.4x).
document.querySelectorAll('img').forEach(im => {{
  const set = () => {{
    const k = im.classList.contains('shot') ? 0.62 : 0.514;
    im.style.width = Math.round(im.naturalWidth * k) + 'px';
  }};
  im.complete ? set() : im.addEventListener('load', set);
}});
</script></body></html>"""
html_path = Path(out_pdf).with_suffix('.html')
html_path.write_text(page, encoding='utf-8')
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(html_path.resolve().as_uri())
    pg.wait_for_load_state('networkidle')
    pg.wait_for_timeout(500)
    pg.pdf(path=out_pdf, format='A4', display_header_footer=True,
           header_template='<div></div>',
           footer_template=f'<div style="font-size:7pt;color:#666;width:100%;text-align:center;font-family:DejaVu Sans,sans-serif">{html.escape(title)} · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
           margin={'top': '18mm', 'bottom': '20mm', 'left': '18mm', 'right': '18mm'})
    b.close()
print('old images used', old_i, '; new', len(used_new))
