"""Generate XRPBlocks-replication-guide.md (changes 1 to 46) from the real tree.

    python tools/gen_replication_guide.py REPO UPSTREAM OUT.md

Example, from the repository root, with upstream cloned next to it:

    git clone https://github.com/Stichting-STEAMup/XRPBlocks.git ../upstream
    git -C ../upstream checkout cd39757
    python tools/gen_replication_guide.py . ../upstream XRPBlocks-replication-guide.md

REPO must be a git checkout (the file list comes from git, so ignored files
such as PackKey.inc are never included). Update CHANGES and DATE below for a
new change before running it.

REPO is the current working copy, UPSTREAM a checkout of the upstream commit
cd39757. Every text file that is new or changed against upstream is embedded
whole; manifests are embedded with driver.source emptied (embed_drivers.py
fills it); binaries, working programs and historical documents are listed with
their SHA-256.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

REPO, UP, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
GUIDE = 'XRPBlocks-replication-guide.md'
DATE = '30 September 2026'
_snap = (REPO / 'docs/history/XRPBlocks-replication-snapshot-changes-1-28.md').read_text(encoding='utf-8')
HWFACTS = _snap[_snap.index('### 1.2 Hardware facts the drivers depend on'):_snap.index('## 2. Method')]

tracked = subprocess.run(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
                         cwd=REPO, capture_output=True).stdout.decode().split('\0')
tracked = sorted(t for t in tracked if t and t != GUIDE)

# Binaries that are ignored by the text tree but tracked (from the laptop listing).
BINARY_EXT = {'.png', '.ico', '.res', '.exe', '.pdf', '.zip', '.jpg', '.gif', '.woff', '.woff2', '.ttf'}


def norm(b):
    return b.replace(b'\r\n', b'\n')


def sha(b):
    return hashlib.sha256(norm(b)).hexdigest()


up_files = {str(p.relative_to(UP)).replace('\\', '/'): p for p in UP.rglob('*')
            if p.is_file() and '.git' not in p.parts}


def status(rel):
    if rel not in up_files:
        return 'new'
    if norm(up_files[rel].read_bytes()) == norm((REPO / rel).read_bytes()):
        return 'upstream'
    return 'changed'


LISTED_ONLY_PREFIX = ('working programs/', 'docs/history/')
LISTED_ONLY = {'docs/XRPBlocks-local-modifications-addendum.html'}
UNUSED = {'js/blockly/blocks/expander.js', 'js/blockly/blocks/neopixel.js',
          'js/blockly/generators/expander.js', 'js/blockly/generators/neopixel.js',
          'js/lib/pcf8575-source.js', 'js/lib/neopixel-source.js',
          'delphiSource/XRPServeold.dpr'}

GROUPS = [
    ('A.1', 'Local serving, packaging and licences', lambda r: r.startswith('delphiSource/') or r in ('serve.py', '.gitignore', 'LICENCES.txt')),
    ('A.2', 'Page shell, styles and icons', lambda r: r in ('index.html', 'css/index.css') or r.startswith('images/')),
    ('A.3', 'Application, user interface and robot connection', lambda r: r == 'js/app.js' or r.startswith(('js/ui/', 'js/serial/', 'js/devices/'))),
    ('A.4', 'Blocks, generators and toolbox', lambda r: r.startswith('js/blockly/') or r.startswith('js/lib/')),
    ('A.5', 'MicroPython drivers', lambda r: r.startswith('lib/')),
    ('A.6', 'Device library manifests (driver source left empty)', lambda r: r.startswith('devices/') and r.endswith('.json')),
    ('A.7', 'Phone page, designer and embedded Wi-Fi page', lambda r: r.startswith(('phone/', 'oled-designer/')) or r in ('tools/oled-designer.html', 'tools/remote-control.html')),
    ('A.8', 'Developer tools and checks', lambda r: r.startswith('tools/')),
    ('A.9', 'Documentation', lambda r: r.endswith('.md') or r.startswith('docs/')),
]

LANG = {'.js': 'javascript', '.py': 'python', '.json': 'json', '.html': 'html', '.css': 'css',
        '.md': 'markdown', '.dpr': 'pascal', '.inc': 'pascal', '.dproj': 'xml', '.svg': 'xml',
        '.txt': 'text', '.bat': 'bat'}

rows = []            # manifest rows: (path, status, bytes, sha, how)
embedded = {g[0]: [] for g in GROUPS}
other = []

for rel in tracked:
    p = REPO / rel
    if not p.is_file():
        continue
    data = p.read_bytes()
    st = status(rel)
    ext = p.suffix.lower()
    if ext in BINARY_EXT:
        rows.append((rel, st, len(data), sha(data), 'binary: copy from the repository'))
        continue
    if st == 'upstream':
        rows.append((rel, st, len(data), sha(data), 'unchanged from upstream'))
        continue
    if rel.startswith(LISTED_ONLY_PREFIX) or rel in LISTED_ONLY:
        rows.append((rel, st, len(data), sha(data), 'listed only: copy from the repository'))
        continue
    for gid, _title, test in GROUPS:
        if test(rel):
            embedded[gid].append(rel)
            how = f'Part {gid}' + (' (unused, kept)' if rel in UNUSED else '')
            if rel.startswith('devices/') and rel.endswith('.json'):
                how += ', then embed_drivers.py'
            rows.append((rel, st, len(data), sha(data), how))
            break
    else:
        other.append(rel)
        rows.append((rel, st, len(data), sha(data), 'Part A.10'))

# Files the laptop holds that git does not track but the guide should mention.
EXTRA_BINARIES = [
    ('XRP Robotics.exe', 'built XRPServe for the project root (change 30); build from delphiSource/'),
    ('delphiSource/XRPServe.exe', 'build output of XRPServe.dpr'),
    ('XRP-Robotics-Learner-Manual-v3.pdf', 'learner manual'),
    ('XRPBlocks-local-modifications.pdf', 'historical record, changes 1 to 18'),
]


def fence_for(text):
    longest = max((len(m) for m in re.findall(r'`+', text)), default=0)
    return '`' * max(3, longest + 1)


def body_of(rel):
    text = (REPO / rel).read_bytes().decode('utf-8').replace('\r\n', '\n')
    if rel.startswith('devices/') and rel.endswith('.json'):
        m = json.loads(text)
        if 'driver' in m and 'source' in m['driver']:
            m['driver']['source'] = ''
            text = json.dumps(m, indent=2, ensure_ascii=False) + '\n'
    return text


out = []
w = out.append

CHANGES = [
    ('1', 'Local server on port 8765 with no-cache headers (`serve.py`)', 'superseded by 30 for schools; kept for development'),
    ('2', '**repeat forever** block', 'in use'),
    ('3', 'Shadow 0 on **set variable to**', 'in use'),
    ('4', 'MicroPython fix: **change variable by** no longer imports `numbers`', 'in use; to report upstream'),
    ('5', 'PCF8575 I/O expander driver and blocks (now a device library)', 'not yet on the robot'),
    ('6', 'NeoPixel strip driver and blocks (now a device library)', 'not yet on the robot'),
    ('7', 'Confirmation before Deploy overwrites `main.py`', 'on the robot'),
    ('8', 'Servo category rebuilt (replaced by 18)', 'superseded'),
    ('9', 'Motors category rebuilt', 'in use'),
    ('10', 'Gyro: set yaw/pitch/roll to zero, heading 0 to 360', 'on the robot'),
    ('11', 'Dropdowns replace repeated blocks; old block types stay registered', 'in use'),
    ('12', 'Toolbox hides blocks the browser has not loaded', 'in use'),
    ('13', 'Dark mode; block colours at WCAG AA 4.5:1', 'in use'),
    ('14', 'Device library system (one JSON file per device)', 'on the robot (OLED)'),
    ('15', 'OLED screen library', 'on the robot, 19 Sept'),
    ('16', 'OLED drawing, compass arrow, sketches, designer page', 'partly'),
    ('17', 'Functions generated in MicroPython (the critical fix)', 'in use'),
    ('18', 'Block audit: servo in degrees, effort in percent, clamping, units', 'servo blocks on the robot'),
    ('19', 'Onboard RGB colour and brightness', 'not recorded'),
    ('20', 'Delete unused blocks', 'IDE only'),
    ('21', 'Bottom panel and variable cleanup', 'IDE only'),
    ('22', 'Remembered connection; Connect no longer interrupts the robot', 'not recorded'),
    ('23', 'Mecanum wheels library', 'not yet on the robot'),
    ('24', 'Wi-Fi remote control library', 'join network confirmed, 20 Sept'),
    ('25', 'Remote page layout choice (D-pad)', 'not recorded'),
    ('26', 'Remote networking fixes, driver 1.1.1', 'join network confirmed'),
    ('27', 'Confirmed USB uploads and module refresh', 'not recorded'),
    ('28', 'OLED scrolling text', 'on the robot, 20 Sept'),
    ('29', 'TCS34725 colour sensor library', 'not yet on the robot'),
    ('30', 'Delphi XRPServe replaces Python for serving the IDE', 'exe built; smoke test not recorded'),
    ('31', 'Scratch-style lists in Variables', 'first run found bugs (fixed in 33)'),
    ('32', 'Live variable and list watching (Run only)', 'first run found bugs (fixed in 33)'),
    ('33', 'Lists start as `[]`; watch glow only on "get" blocks', 'not yet retested'),
    ('34', '**wait** accepts numbers stored as text', 'not yet retested'),
    ('35', 'XRPServe without a window (see note under 4.2)', 'source differs; see 4.2'),
    ('36', 'Character LCD 16x2 library', 'not yet on the robot'),
    ('37 (LCD 20x4)', 'Character LCD 20x4 library (shares `lib/LCD1602.py`)', 'not yet on the robot'),
    ('37 (pack)', 'Encrypted pack and licence banner (`XRPServePack`)', 'exe built; smoke test not recorded'),
    ('38', 'Smoother, more accurate **turn** and turn calibration', 'on the robot, 24 Sept'),
    ('39', 'Gentle, accurate **drive straight**', 'on the robot (carry-over not yet)'),
    ('40', 'Mecanum turn checked with the gyro', 'not yet on the robot'),
    ('41', 'One **acceleration** block for every movement', 'on the robot, 24 Sept'),
    ('42', 'Triggers library (lights, servos, emergency stop)', 'not yet on the robot'),
    ('43', 'Export blocks to PNG', 'headless browser only'),
    ('44', 'Phone control over Bluetooth', 'phone connected; driving not confirmed'),
    ('45', 'Robot readings and messages on the phone', 'not yet confirmed'),
    ('46', 'Maths on a list, sort, part of a list, accelerometer, motor reversed', 'simulated only'),
]

w('# XRPBlocks local edition: replication guide, changes 1 to 46\n')
w('[Documentation](docs/README.md) · [Development guide](docs/development.md) · '
  '[Change history](docs/CHANGELOG.md) · [Testing status](docs/testing-status.md)\n')
w(f'Generated on {DATE} from the working copy on the development laptop, which is the '
  'synced copy of [edwardgentle/xrpBlocks](https://github.com/edwardgentle/xrpBlocks) '
  '(`main` at `d7cb6df`) plus change 46 and working programs 41 and 42. '
  'The upstream base is commit `cd39757` of '
  '[Stichting STEAMup/XRPBlocks](https://github.com/Stichting-STEAMup/XRPBlocks).\n')
w('This guide replaces the 20 September snapshot, which covered changes 1 to 28 and is kept at '
  '[docs/history/XRPBlocks-replication-snapshot-changes-1-28.md]'
  '(docs/history/XRPBlocks-replication-snapshot-changes-1-28.md) for its explanations of '
  'the early defects and design decisions. Where the two differ, this guide is correct for '
  'the current source.\n')
w('**What this guide is for.** It lets someone rebuild the current local edition from '
  'upstream without access to the laptop or the fork, and check the result file by file. '
  'It is generated from the source itself, so the embedded files are the real files, not '
  'descriptions of them. Claims about hardware come from the testing records, not from this '
  'guide.\n')
w('**What it never contains.** `delphiSource/PackKey.inc` (the private pack key), pack files, '
  'and anything else excluded by `.gitignore`. Keep the key backed up privately.\n')

w('## Contents\n')
w('1. [The changes](#1-the-changes)')
w('2. [Two ways to replicate](#2-two-ways-to-replicate)')
w('3. [File manifest](#3-file-manifest)')
w('4. [Notes before you build](#4-notes-before-you-build)')
parts = [f'5. [Part A: the files](#5-part-a-the-files)']
w(parts[0])
for gid, title, _ in GROUPS:
    if embedded[gid]:
        anchor = (gid + ' ' + title).lower()
        anchor = re.sub(r'[^a-z0-9 -]', '', anchor).replace(' ', '-')
        w(f'    - [{gid} {title}](#{anchor})')
w('6. [Part B: embed the drivers](#6-part-b-embed-the-drivers)')
w('7. [Part C: verify](#7-part-c-verify)')
w('8. [Hardware facts the drivers depend on](#8-hardware-facts-the-drivers-depend-on)')
w('9. [Known issues and hardware status](#9-known-issues-and-hardware-status)')
w('10. [Sources](#10-sources)\n')

w('## 1. The changes\n')
w('Numbers follow the project records. Two different changes were both numbered 37; both labels '
  'are kept. "On the robot" means a result was recorded on hardware; "IDE only" means the change '
  'has no robot side; "not recorded" means no hardware result was written down. Full detail for '
  'each change is in [docs/CHANGELOG.md](docs/CHANGELOG.md) and, for 1 to 28, the historical '
  'snapshot.\n')
w('| # | Change | Hardware status |')
w('|---|---|---|')
for n, what, st in CHANGES:
    w(f'| {n} | {what} | {st} |')
w('')
w('Unnumbered additions also included: keyboard shortcuts (`js/ui/keyboard-shortcuts.js`), '
  'OLED icons (library 2.2.0), pinned blocks (`js/blockly/pinned-blocks.js`), dark mode as the '
  'default theme, the two-row servo sweep block, lessons, and the documentation reorganisation of '
  '30 September.\n')

w('## 2. Two ways to replicate\n')
w('**Route 1, the quick way.** Clone the fork and check it against this guide:\n')
w('```bash\ngit clone https://github.com/edwardgentle/xrpBlocks.git\ncd xrpBlocks\n```\n')
w('Change 46 and working programs 41 and 42 were made on the laptop on 30 September and may not '
  'be on GitHub yet. If Part C reports them missing or different, take those files from Part A.\n')
w('**Route 2, from upstream.** This is the full replication:\n')
w('```bash\ngit clone https://github.com/Stichting-STEAMup/XRPBlocks.git xrpBlocks\ncd xrpBlocks\n'
  'git checkout cd39757\n```\n')
w('1. Create or overwrite every file in Part A exactly as printed. Each is complete; none is a '
  'patch. Paths are relative to the repository root.')
w('2. Copy the binary files and the listed-only files in the manifest (section 3) from the fork, '
  'or leave out the ones you do not need (for example the historical PDFs).')
w('3. Run Part B to put each driver into its device manifest.')
w('4. Run Part C. Every file should report OK.')
w('5. Build the Windows server from `delphiSource/` if you want it (Delphi; see '
  '`delphiSource/README.md`). Python is only needed for the developer tools.\n')
w('Upstream files that are not in the manifest do not exist in the local edition. At the time '
  'of writing that is only `.claude/launch.json`, an editor setting file; delete it or leave it, '
  'it has no effect.\n')

# manifest
counts = {}
for r in rows:
    counts[r[1]] = counts.get(r[1], 0) + 1
w('## 3. File manifest\n')
w(f'{len(rows)} files: {counts.get("new", 0)} new, {counts.get("changed", 0)} changed from '
  f'upstream, {counts.get("upstream", 0)} unchanged from upstream. SHA-256 is taken after '
  'converting Windows line endings (CRLF) to LF, so a file checked out on Windows or Linux gives '
  'the same value. The guide itself is not listed.\n')
w('| File | Status | Bytes on the laptop | SHA-256 (first 16) | How to get it |')
w('|---|---|---:|---|---|')
for rel, st, size, h, how in rows:
    w(f'| `{rel}` | {st} | {size} | `{h[:16]}` | {how} |')
w('')
w('Not tracked by git, so not in the manifest, but present in the working copy:\n')
for rel, what in EXTRA_BINARIES:
    w(f'- `{rel}`: {what}.')
w('- `delphiSource/PackKey.inc`, `delphiSource/XRPServePack.exe`, `*.pak`: contain or depend on '
  'the private key. Never publish them.\n')
w('The full 64-character hashes are in the verification script in Part C.\n')

w('## 4. Notes before you build\n')
w('### 4.1 Line endings and encoding\n')
w('All text files are UTF-8. Files on the laptop use a mix of CRLF and LF; both work. Part C '
  'ignores the difference.\n')
w('### 4.2 The Windows server (changes 30, 35 and 37)\n')
w('`delphiSource/XRPServe.dpr` as printed here is the source on `main`. It declares '
  '`APPTYPE CONSOLE`, prints start-up text and waits for Enter, so it is **not** the windowless '
  'build that change 35 described, and its `stop` command signals an event the serving path does '
  'not wait on. This is recorded in `docs/testing-status.md`. Decide whether to restore the '
  'change 35 version or keep this one before shipping to schools. `XRPServePack.dpr` also needs '
  '`PackKey.inc`, which you must generate yourself with `python tools/build_pack.py --genkey`.\n')
w('### 4.3 Files kept but unused\n')
w('These are printed so that a rebuild matches the fork exactly, but nothing imports them. They '
  'were replaced by the device library system (change 14) or by a newer server source:\n')
for u in sorted(UNUSED):
    w(f'- `{u}`')
w('')
w('### 4.4 Working programs\n')
w('The `working programs` folder holds saved test and example projects. They are data, not part '
  'of the application, so they are listed in the manifest rather than printed. '
  '`tools/wp_build.py` rebuilds programs 25 to 40, p55 and p57 exactly; take the others from the '
  'fork.\n')

w('## 5. Part A: the files\n')
w('Each file is complete. Copy the contents between the fences exactly.\n')
total_chars = 0
for gid, title, _ in GROUPS:
    files = embedded[gid]
    if not files:
        continue
    w(f'### {gid} {title}\n')
    if gid == 'A.6':
        w('Each manifest is printed with `driver.source` set to an empty string. Part B fills it '
          'from the matching file in `lib/` (and, for the Wi-Fi remote, from '
          '`tools/remote-control.html`). The result is byte-identical to the fork; this was '
          'checked when the guide was generated.\n')
    for rel in files:
        text = body_of(rel)
        total_chars += len(text)
        st = status(rel)
        note = ' Unused, kept for a matching rebuild.' if rel in UNUSED else ''
        w(f'#### `{rel}`\n')
        w(f'{"New file" if st == "new" else "Replaces the upstream file"}.{note}\n')
        f = fence_for(text)
        lang = LANG.get(Path(rel).suffix.lower(), '')
        w(f'{f}{lang}\n{text.rstrip(chr(10))}\n{f}\n')
if other:
    w('### A.10 Other files\n')
    for rel in other:
        text = body_of(rel)
        f = fence_for(text)
        w(f'#### `{rel}`\n')
        w(f'{f}\n{text.rstrip(chr(10))}\n{f}\n')

w('## 6. Part B: embed the drivers\n')
w('From the repository root:\n')
w('```text\npython tools/embed_drivers.py\npython tools/embed_drivers.py --check\n```\n')
w('The second command should end with `all 10 manifests match their drivers`. Both LCD manifests '
  'take the same driver, `lib/LCD1602.py`; always embed them together.\n')

w('## 7. Part C: verify\n')
w('Save this as `verify_replication.py` in the repository root and run '
  '`python verify_replication.py`. It checks every file in the manifest that exists, ignoring '
  'line-ending differences, and reports missing files separately (binaries and listed-only files '
  'you chose to leave out will show as missing, which is fine).\n')
hashes = {rel: h for rel, st, size, h, how in rows}
script = ['import hashlib, sys', 'from pathlib import Path', '', 'EXPECTED = {']
for rel, h in hashes.items():
    script.append(f'    {rel!r}: {h!r},')
script += ['}', '',
           'ok = bad = missing = 0',
           'for rel, want in EXPECTED.items():',
           '    p = Path(rel)',
           '    if not p.is_file():',
           "        print('MISSING', rel)",
           '        missing += 1',
           '        continue',
           "    got = hashlib.sha256(p.read_bytes().replace(b'\\r\\n', b'\\n')).hexdigest()",
           '    if got == want:',
           '        ok += 1',
           '    else:',
           "        print('DIFFERENT', rel)",
           '        bad += 1',
           "print(f'{ok} OK, {bad} different, {missing} missing')",
           'sys.exit(1 if bad else 0)']
w('```python\n' + '\n'.join(script) + '\n```\n')
w('Then run the automated checks listed in [docs/development.md](docs/development.md), and load '
  'the IDE: serve the folder (XRPServe, or `python serve.py`), open `http://localhost:8765/`, and '
  'check that every category opens. Never open `index.html` through `file://`.\n')
w('What was checked when this guide was generated: `node --check` on every JavaScript file that '
  'change 46 touched; the IDE loaded in a headless browser in English and Dutch; all 74 working '
  'programs loaded, generated Python and compiled (program 41 reports its deliberately switched-off '
  'blocks); program 42 compiled with `mpy-cross` and ran against a stand-in robot; manifests '
  'rebuilt from empty driver sources by `embed_drivers.py` matched the originals byte for byte; '
  'Part C run against the generated tree. None of that replaces a test on the robot.\n')

w('## 8. Hardware facts the drivers depend on\n')
w('Carried over from the 20 September snapshot, where they were checked against datasheets and '
  'the XRPLib source, with later additions below.\n')
w(HWFACTS.replace('### 1.2 Hardware facts the drivers depend on\n', '').strip() + '\n')
w('**Added after 20 September** (checked against the sources named in section 10 on the date of '
  'each change):\n')
w('- **Accelerometer (46).** `imu.get_acc_x()`, `get_acc_y()` and `get_acc_z()` return mg '
  '(XRPLib API reference). 1 g = 1000 mg = 9.80665 m/s².')
w('- **Motor direction (46).** XRPLib builds the left motor and motor 3 with `flip_dir=True` and '
  'the right motor and motor 4 without it. `EncodedMotor.get_position()` and '
  '`get_position_counts()` multiply the encoder reading by -1 when `_motor.flip_dir` is set, so '
  'flipping `flip_dir` reverses power and encoder together.')
w('- **TCS34725 (29).** I2C address 0x29; register map and colour-temperature formula ported from '
  "Adafruit's Adafruit_TCS34725 (BSD).")
w('- **Character LCD (36, 37).** HD44780 in 4-bit mode behind a PCF8574 backpack: P0 RS, P1 RW, '
  'P2 E, P3 backlight, P4 to P7 D4 to D7; addresses 0x27 or 0x3F. Usually 5 V parts: check '
  'GPIO tolerance or use a level shifter.')
w('- **Bluetooth (44, 45).** The XRP Bluetooth link is a Nordic UART Service REPL attached with '
  '`os.dupterm`, advertised as `XRP-<id>`; Chrome on Android needs notifications, not '
  'indications, which is why the driver notifies directly in 20-byte pieces.')
w('- **Wi-Fi hotspot (26).** The CYW43 access point needs the WPA2 AES security value `0x400004`.\n')

w('## 9. Known issues and hardware status\n')
w('Current evidence and the full list of outstanding checks are in '
  '[docs/testing-status.md](docs/testing-status.md); the working-program catalogue '
  '(`working programs/README.md`) says which program checks what. The main open items:\n')
w('- Not yet on the robot: LCD 16x2 and 20x4, TCS34725, Triggers, the mecanum changes, the '
  'retest of fixes 33 and 34, drive-straight carry-over and line keeping, change 46.')
w('- Which way a positive arcade turn steers (working program 08).')
w('- The movement diagnostics from changes 38 to 41 (a Console line per move and `turnlog.txt`) '
  'are still in the generated code; keeping, removing or making them optional is undecided.')
w('- Which Windows server ships to schools (4.2).')
w('- A watch line split across two serial chunks shows as odd Console text (32).')
w('- Number inputs other than **wait** still receive text when fed from a list item added '
  'through a text slot (34). The change 46 list blocks convert numeric text themselves.')
w('- XRPLib: `straight()` and `turn()` report whether they reached the goal, but no block shows '
  'it; `drivetrain.set_speed` is cm/s while a single motor is rpm; with no IMU, the encoder '
  'fallback in `turn()` uses an unset `track_width` (to report upstream).\n')

w('## 10. Sources\n')
w('- XRPBlocks upstream: <https://github.com/Stichting-STEAMup/XRPBlocks>')
w('- XRPBlocks local edition (fork): <https://github.com/edwardgentle/xrpBlocks>')
w('- XRPLib API reference: <https://open-stem.github.io/XRP_MicroPython/api.html>')
w('- XRPLib source (imu.py, motor.py, encoded_motor.py, defaults.py, ble/): '
  '<https://github.com/Open-STEM/XRP_MicroPython>')
w('- XRPCode toolbox and generators, version 1.2.2 (compared for change 46): '
  '<https://github.com/Open-STEM/XRPCode>')
w('- SparkFun XRP Controller hardware overview: '
  '<https://docs.sparkfun.com/SparkFun_XRP_Controller/hardware_overview/>')
w('- NXP PCF8575 datasheet: <https://www.nxp.com/docs/en/data-sheet/PCF8575.pdf>')
w('- Adafruit_TCS34725: <https://github.com/adafruit/Adafruit_TCS34725>')
w('- MicroPython `neopixel` module: <https://docs.micropython.org/en/latest/library/neopixel.html>')

OUT.write_text('\n'.join(out) + '\n', encoding='utf-8')
print('rows', len(rows), counts, 'embedded chars', total_chars, 'other', other)
print('bytes', OUT.stat().st_size)
