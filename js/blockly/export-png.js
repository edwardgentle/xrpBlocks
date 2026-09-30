/**
 * Right-click "Export to PNG" (change 43).
 *
 * Workspace menu: exports every block on the workspace as one PNG.
 * Block menu: exports the whole stack the clicked block belongs to.
 *
 * The image uses the current light/dark theme. Blockly's SVG is cloned,
 * every element gets its computed style copied inline (so no stylesheet is
 * needed), images and the Nunito font are embedded as data URLs, and the
 * result is drawn onto a canvas at 2x for sharp text.
 */

const PADDING = 16;
const SCALE = 2;
const MAX_CANVAS_SIDE = 16000;

// Presentation properties copied from the live DOM onto the clone. 'filter'
// is left out on purpose so the selection and watch glows do not export.
const STYLE_PROPS = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'display', 'visibility', 'font-family', 'font-size',
  'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'alignment-baseline', 'white-space', 'letter-spacing',
];

const SKIP_SELECTOR = [
  '.blocklySelected', '.blocklyPathSelected', '.blocklyCursor',
  '.blocklyMarker', '.blocklyInsertionMarker',
].join(',');

let fontCssPromise = null;

function copyComputedStyles(source, target) {
  if (source.nodeType !== 1) return;
  const cs = getComputedStyle(source);
  const style = STYLE_PROPS
    .map(p => { const v = cs.getPropertyValue(p); return v ? `${p}:${v}` : ''; })
    .filter(Boolean).join(';');
  target.setAttribute('style', style);
  target.removeAttribute('class');
  const s = source.children, t = target.children;
  for (let i = 0; i < s.length && i < t.length; i++) copyComputedStyles(s[i], t[i]);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function inlineImages(svg) {
  const images = [...svg.querySelectorAll('image')];
  await Promise.all(images.map(async img => {
    const href = img.getAttribute('href') || img.getAttribute('xlink:href');
    if (!href || href.startsWith('data:')) return;
    try {
      const res = await fetch(new URL(href, document.baseURI));
      const data = await blobToDataUrl(await res.blob());
      img.setAttribute('href', data);
      img.removeAttribute('xlink:href');
    } catch (err) {
      console.warn('Export PNG: could not embed image', href, err);
    }
  }));
}

/** Nunito (latin subset) as @font-face rules with the font files inlined. */
function getEmbeddedFontCss() {
  if (!fontCssPromise) {
    fontCssPromise = (async () => {
      try {
        const cssUrl = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap';
        const css = await (await fetch(cssUrl)).text();
        const faces = css.match(/@font-face\s*{[^}]*}/g) || [];
        const latin = faces.filter(f => /U\+0000-00FF/i.test(f));
        const out = await Promise.all(latin.map(async face => {
          const m = face.match(/url\(([^)]+)\)/);
          if (!m) return '';
          const url = m[1].replace(/["']/g, '');
          const data = await blobToDataUrl(await (await fetch(url)).blob());
          return face.replace(m[0], `url(${data})`);
        }));
        return out.join('\n');
      } catch (err) {
        // Offline: the export falls back to Segoe UI / system-ui.
        console.warn('Export PNG: Nunito not embedded', err);
        return '';
      }
    })();
  }
  return fontCssPromise;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build a PNG of the given top-level blocks (or all of them).
 * @returns {Promise<Blob|null>}
 */
export async function blocksToPng(workspace, rootBlocks) {
  const roots = rootBlocks || workspace.getTopBlocks(false);
  if (!roots.length) return null;

  // Bounding box in workspace units.
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const b of roots) {
    const r = b.getBoundingRectangle();
    left = Math.min(left, r.left); top = Math.min(top, r.top);
    right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
  }
  left -= PADDING; top -= PADDING; right += PADDING; bottom += PADDING;
  const width = right - left, height = bottom - top;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `${left} ${top} ${width} ${height}`);

  // Patterns/filters referenced by url(#...) (e.g. the disabled-block hatch).
  const parentSvg = workspace.getParentSvg();
  for (const defs of parentSvg.querySelectorAll('defs')) {
    svg.appendChild(defs.cloneNode(true));
  }

  const fontCss = await getEmbeddedFontCss();
  if (fontCss) {
    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = fontCss;
    svg.appendChild(style);
  }

  const bgColour = workspace.getTheme()?.getComponentStyle?.('workspaceBackgroundColour')
    || getComputedStyle(parentSvg.querySelector('.blocklyMainBackground') || parentSvg)
      .getPropertyValue('fill') || '#ffffff';
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', left); bg.setAttribute('y', top);
  bg.setAttribute('width', width); bg.setAttribute('height', height);
  bg.setAttribute('fill', bgColour);
  svg.appendChild(bg);

  for (const block of roots) {
    const live = block.getSvgRoot();
    const clone = live.cloneNode(true);
    copyComputedStyles(live, clone);
    // Top-level block groups carry translate(x, y) in workspace units, which
    // is exactly the coordinate system of our viewBox.
    clone.setAttribute('transform', `translate(${block.getRelativeToSurfaceXY().x}, ${block.getRelativeToSurfaceXY().y})`);
    svg.appendChild(clone);
  }
  svg.querySelectorAll(SKIP_SELECTOR).forEach(el => el.remove());
  await inlineImages(svg);

  const svgText = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  const loaded = new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('SVG could not be rendered'));
  });
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  await loaded;

  const scale = Math.min(SCALE, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function exportAndDownload(workspace, roots, filename, toast) {
  try {
    const blob = await blocksToPng(workspace, roots);
    if (!blob) return;
    downloadBlob(blob, filename);
    toast?.(Blockly.Msg['XRP_EXPORT_PNG_DONE'] || 'Image saved!');
  } catch (err) {
    console.error('Export PNG failed:', err);
    toast?.((Blockly.Msg['XRP_EXPORT_PNG_FAILED'] || 'Could not export image') + ': ' + err.message, 'error');
  }
}

export function registerExportPngMenu(workspace, toast) {
  const registry = Blockly.ContextMenuRegistry.registry;
  const { WORKSPACE, BLOCK } = Blockly.ContextMenuRegistry.ScopeType;

  const wsId = 'xrp_export_png_workspace';
  if (registry.getItem(wsId)) registry.unregister(wsId);
  registry.register({
    id: wsId,
    scopeType: WORKSPACE,
    weight: 96,
    displayText: () => Blockly.Msg['XRP_EXPORT_PNG_ALL'] || 'Export blocks to PNG',
    preconditionFn: scope => {
      const ws = scope.workspace;
      if (ws !== workspace || ws.isFlyout) return 'hidden';
      return ws.getTopBlocks(false).length ? 'enabled' : 'disabled';
    },
    callback: () => exportAndDownload(workspace, null, 'xrp-blocks-program.png', toast),
  });

  const blockId = 'xrp_export_png_block';
  if (registry.getItem(blockId)) registry.unregister(blockId);
  registry.register({
    id: blockId,
    scopeType: BLOCK,
    weight: 96,
    displayText: () => Blockly.Msg['XRP_EXPORT_PNG_STACK'] || 'Export this stack to PNG',
    preconditionFn: scope => {
      const b = scope.block;
      if (!b || b.workspace !== workspace || b.workspace.isFlyout) return 'hidden';
      return 'enabled';
    },
    callback: scope => {
      const root = scope.block.getRootBlock();
      exportAndDownload(workspace, [root], `xrp-blocks-${root.type}.png`, toast);
    },
  });
}
