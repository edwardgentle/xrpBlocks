"""Check working programs in the real IDE and re-save them through Blockly.

    python tools/wp_check.py IN_DIR OUT_DIR    (IDE served on http://localhost:8799)

For each .json: load it as the saved workspace, then check that every block
survived loading, none is disabled, no value input is empty, and the Python
compiles. The workspace is saved back with Blockly's own serialiser (what the
IDE's Save button does) into OUT_DIR, together with the generated Python.
"""
import json
import py_compile
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)
(dst / 'python').mkdir(exist_ok=True)


def count(node):
    # Real (non-shadow) blocks only.
    n = 0
    if isinstance(node, dict):
        if 'type' in node and 'id' in node:
            n += 1
        for k, v in node.items():
            if k != 'shadow':
                n += count(v)
    elif isinstance(node, list):
        for v in node:
            n += count(v)
    return n


problems = {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for f in sorted(src.glob('*.json')):
        state = json.loads(f.read_text(encoding='utf-8'))
        expected = count(state['blocks'])
        page = browser.new_page(viewport={'width': 1400, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.add_init_script("localStorage.setItem('xrp_blocks_workspace', %s);" % json.dumps(json.dumps(state)))
        page.goto('http://localhost:8799/index.html')
        page.wait_for_timeout(2500)
        r = page.evaluate("""() => {
          const ws = Blockly.getMainWorkspace();
          const all = ws.getAllBlocks(false).filter(b => !b.isShadow());
          const disabled = all.filter(b => !b.isEnabled()).map(b => b.type);
          const empty = [];
          all.forEach(b => b.inputList.forEach(i => {
            if (i.type === 1 && i.connection && !i.connection.targetBlock()) empty.push(b.type + '.' + i.name);
          }));
          return {n: all.length, disabled, empty,
                  saved: Blockly.serialization.workspaces.save(ws),
                  py: document.getElementById('python-code').textContent};
        }""")
        page.close()
        issues = []
        if r['n'] != expected:
            issues.append('blocks %d of %d' % (r['n'], expected))
        if r['disabled']:
            issues.append('disabled ' + ','.join(r['disabled']))
        if r['empty']:
            issues.append('empty ' + ','.join(r['empty']))
        if errors:
            issues.append('page errors ' + '; '.join(errors)[:300])
        pyf = dst / 'python' / (f.stem + '.py')
        pyf.write_text(r['py'], encoding='utf-8')
        try:
            py_compile.compile(str(pyf), doraise=True)
        except py_compile.PyCompileError as e:
            issues.append('python ' + str(e)[:200])
        if 'XRPLib' not in r['py'] and 'import' not in r['py']:
            issues.append('no python generated')
        (dst / f.name).write_text(json.dumps(r['saved'], indent=2, ensure_ascii=False), encoding='utf-8')
        print(('OK  ' if not issues else 'BAD ') + f.name + ('' if not issues else '  <- ' + ' | '.join(issues)))
        if issues:
            problems[f.name] = issues
    browser.close()
print(len(problems), 'with problems')
