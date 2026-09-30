#!/usr/bin/env python3
"""Put the MicroPython drivers into the device manifests.

Each manifest in `devices/` carries its driver inline, so that one JSON file is
a complete, shareable library: email it to a colleague and they have the blocks
and the driver together. The driver is also kept as an ordinary `.py` file in
`lib/`, which is the readable copy and the one to edit.

Keeping the same code in two places is how things drift, so the `.py` file is
the source of truth and this script copies it into the manifest. Run it after
editing any driver.

    python tools/embed_drivers.py            # copy lib/*.py into devices/*.json
    python tools/embed_drivers.py --check    # report drift, change nothing

--check exits non-zero if any manifest is out of step, which is what a build
would call.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# manifest -> the driver file whose contents belong in its driver.source
DRIVERS = {
    'devices/remote-control.json': 'lib/RemoteControl.py',
    'devices/mecanum.json': 'lib/MecanumDrive.py',
    'devices/pcf8575.json': 'lib/PCF8575.py',
    'devices/neopixel.json': 'lib/NeoPixelStrip.py',
    'devices/ssd1315-oled.json': 'lib/SSD1315.py',
    'devices/tcs34725.json': 'lib/TCS34725.py',
    'devices/lcd1602.json': 'lib/LCD1602.py',
    'devices/lcd2004.json': 'lib/LCD1602.py',   # same driver, LCD2004 class
    'devices/triggers.json': 'lib/XRPTriggers.py',
    'devices/ble-remote.json': 'lib/BLERemote.py',
}


def render(manifest):
    """Serialise a manifest the way every manifest in devices/ is written."""
    return json.dumps(manifest, indent=2, ensure_ascii=False) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='report drift without writing anything')
    args = parser.parse_args()

    problems = []
    changed = []

    for manifest_path, driver_path in DRIVERS.items():
        manifest_file = ROOT / manifest_path
        driver_file = ROOT / driver_path

        if not manifest_file.exists():
            problems.append(f'{manifest_path} is missing')
            continue
        if not driver_file.exists():
            problems.append(f'{driver_path} is missing')
            continue

        manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
        driver = manifest.setdefault('driver', {})
        source = driver_file.read_text(encoding='utf-8')
        if driver_file.name == 'RemoteControl.py':
            page = (ROOT / 'tools/remote-control.html').read_text(encoding='utf-8')
            source = source.replace("PAGE = ''  # Filled from tools/remote-control.html by embed_drivers.py.",
                                    'PAGE = ' + repr(page))

        expected_name = Path(driver_path).name
        if driver.get('filename') != expected_name:
            problems.append(
                f'{manifest_path}: driver.filename is '
                f'{driver.get("filename")!r}, expected {expected_name!r}')

        before = manifest_file.read_text(encoding='utf-8')
        driver['source'] = source
        after = render(manifest)

        if before == after:
            continue

        if args.check:
            problems.append(f'{manifest_path} is out of step with {driver_path}')
        else:
            manifest_file.write_text(after, encoding='utf-8')
            changed.append(f'{manifest_path}  <-  {driver_path} '
                           f'({len(source)} characters)')

    for line in changed:
        print('updated', line)
    for line in problems:
        print('PROBLEM', line, file=sys.stderr)

    if problems:
        return 1
    if args.check:
        print(f'all {len(DRIVERS)} manifests match their drivers')
    elif not changed:
        print(f'all {len(DRIVERS)} manifests were already up to date')
    return 0


if __name__ == '__main__':
    sys.exit(main())
