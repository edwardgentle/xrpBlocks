/**
 * XRP Blocks — Device library manager
 *
 * Holds the device libraries the user has added, in whatever way they added
 * them: from the catalogue that ships in devices/, from a URL, or from a file
 * on their own computer. A library is a single JSON manifest; see
 * devices/README.md for the format.
 *
 * What the manager owns:
 *   - fetching and validating manifests
 *   - registering their blocks and Python generators
 *   - the theme colours and toolbox categories they contribute
 *   - the MicroPython driver each one installs on the robot
 *   - remembering the lot in localStorage, so a library added today is still
 *     there tomorrow and saved projects keep working
 */

import {
  validateManifest,
  registerManifestBlocks,
  registerManifestGenerators,
  buildToolboxCategory,
  blockStyleName,
  categoryStyleName,
  cssSafe,
  text,
} from './manifest-compiler.js';

const CATALOGUE_URL = 'devices/index.json';
const STORAGE_KEY = 'xrp_blocks_libraries';
const STYLE_ELEMENT_ID = 'xrp-library-icons';

/** Fallback icon: a plain chip outline, used when a manifest names none. */
const DEFAULT_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
  'stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="6" y="6" width="12" height="12" rx="2"/>' +
  '<path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>';

export class LibraryManager {
  /**
   * @param {{lang: string, onWarn?: function(string): void}} options
   */
  constructor({ lang = 'en', onWarn = null } = {}) {
    this.lang = lang;
    this.onWarn = onWarn;
    /** @type {Array<{manifest: Object, origin: Object}>} */
    this.installed = [];
    /** @type {Array<Object>|null} catalogue entries from devices/index.json */
    this.catalogue = null;
    this._registeredTypes = new Map(); // library id → block types
    this._generatorsFor = new Set();   // library ids whose generators are live
    this._pythonModule = null;
  }

  // ── Catalogue ──────────────────────────────────────────────────────────

  /**
   * Read devices/index.json, the list of libraries that ship with the IDE.
   * A missing or broken catalogue is not fatal: URL and file sources still work.
   *
   * @returns {Promise<Array<Object>>}
   */
  async loadCatalogue() {
    if (this.catalogue) return this.catalogue;
    try {
      const res = await fetch(CATALOGUE_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`index.json ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.libraries;
      if (!Array.isArray(list)) throw new Error('index.json has no libraries array');
      this.catalogue = list;
    } catch (err) {
      console.warn('[XRP Blocks] Could not read the device catalogue:', err);
      this.catalogue = [];
    }
    return this.catalogue;
  }

  /**
   * Which catalogue entry provides a given block type. Used to put a library
   * back automatically when a saved project needs it.
   *
   * @param {string} blockType
   * @returns {Object|null}
   */
  catalogueEntryProviding(blockType) {
    if (!this.catalogue) return null;
    return this.catalogue.find(
      (entry) => Array.isArray(entry.provides) && entry.provides.includes(blockType)
    ) || null;
  }

  // ── Adding and removing ────────────────────────────────────────────────

  has(id) {
    return this.installed.some((lib) => lib.manifest.id === id);
  }

  get(id) {
    return this.installed.find((lib) => lib.manifest.id === id) || null;
  }

  /**
   * Add a library from the built-in catalogue.
   * @param {string} id
   * @returns {Promise<Object>} the manifest
   */
  async addFromCatalogue(id) {
    await this.loadCatalogue();
    const entry = this.catalogue.find((e) => e.id === id);
    if (!entry) throw new Error(`"${id}" is not in the device catalogue.`);
    const url = entry.file.includes('/') ? entry.file : `devices/${entry.file}`;
    const manifest = await this._fetchManifest(url);
    return this._install(manifest, { type: 'builtin', ref: id });
  }

  /**
   * Add a library from a URL. Anything readable over HTTPS with permissive
   * CORS works — a raw file on a code host, or a school's own web server.
   * @param {string} url
   * @returns {Promise<Object>} the manifest
   */
  async addFromUrl(url) {
    const manifest = await this._fetchManifest(url);
    return this._install(manifest, { type: 'url', ref: url });
  }

  /**
   * Add a library from an already-parsed manifest, e.g. an uploaded file.
   * @param {Object} manifest
   * @param {string} [filename]
   * @returns {Object} the manifest
   */
  addFromManifest(manifest, filename = '') {
    return this._install(manifest, { type: 'file', ref: filename });
  }

  /**
   * Remove a library. Refuses while any of its blocks are still on the canvas,
   * because pulling the definitions out from under a live block breaks it.
   *
   * @param {string} id
   * @param {Blockly.Workspace} [workspace]
   * @returns {{ok: boolean, inUse?: string[]}}
   */
  remove(id, workspace = null) {
    const lib = this.get(id);
    if (!lib) return { ok: true };

    const types = this._registeredTypes.get(id) || [];

    if (workspace) {
      const inUse = types.filter((type) => workspace.getBlocksByType(type, false).length > 0);
      if (inUse.length) return { ok: false, inUse };
    }

    for (const type of types) {
      delete Blockly.Blocks[type];
      if (this._pythonModule?.pythonGenerator?.forBlock) {
        delete this._pythonModule.pythonGenerator.forBlock[type];
      }
    }

    this._registeredTypes.delete(id);
    this._generatorsFor.delete(id);
    this.installed = this.installed.filter((entry) => entry.manifest.id !== id);
    this._save();
    this._refreshIconStyles();
    return { ok: true };
  }

  // ── Restoring a previous session ───────────────────────────────────────

  /**
   * Put back everything the user had last time. Built-in and URL libraries are
   * re-fetched so a corrected manifest is picked up; the copy kept in
   * localStorage is the fallback when the fetch fails, which keeps a saved
   * project working offline.
   *
   * @returns {Promise<void>}
   */
  async restore() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (err) {
      saved = [];
    }
    if (!Array.isArray(saved) || saved.length === 0) return;

    for (const record of saved) {
      if (!record || !record.manifest) continue;
      const origin = record.origin || { type: 'file', ref: '' };
      let manifest = record.manifest;

      if (origin.type === 'builtin' || origin.type === 'url') {
        try {
          const url = origin.type === 'builtin'
            ? await this._catalogueUrl(origin.ref)
            : origin.ref;
          if (url) manifest = await this._fetchManifest(url);
        } catch (err) {
          console.warn(
            `[XRP Blocks] Could not refresh the "${record.manifest.id}" library; using the stored copy.`,
            err
          );
        }
      }

      try {
        this._install(manifest, origin, { save: false });
      } catch (err) {
        console.error(`[XRP Blocks] Dropping the "${record.manifest?.id}" library:`, err);
        this._warn(`The "${record.manifest?.id}" device library could not be loaded and was skipped.`);
      }
    }

    this._save();
  }

  async _catalogueUrl(id) {
    await this.loadCatalogue();
    const entry = this.catalogue.find((e) => e.id === id);
    if (!entry) return null;
    return entry.file.includes('/') ? entry.file : `devices/${entry.file}`;
  }

  // ── Registration ───────────────────────────────────────────────────────

  /**
   * Define every installed library's blocks. Called once before the workspace
   * is injected; adding a library later registers its own blocks immediately.
   */
  registerBlocks() {
    for (const { manifest } of this.installed) {
      if (this._registeredTypes.has(manifest.id)) continue;
      this._registeredTypes.set(manifest.id, registerManifestBlocks(manifest, this.lang));
    }
  }

  /**
   * Define every installed library's Python generators. Called once the Blockly
   * Python module exists; the module is kept so later additions can register
   * themselves straight away.
   *
   * @param {!Object} pythonModule
   */
  registerGenerators(pythonModule) {
    this._pythonModule = pythonModule;
    for (const { manifest } of this.installed) {
      if (this._generatorsFor.has(manifest.id)) continue;
      registerManifestGenerators(manifest, pythonModule, this.lang);
      this._generatorsFor.add(manifest.id);
    }
  }

  // ── What the app asks for ──────────────────────────────────────────────

  /**
   * Toolbox categories for every installed library, in the order added.
   * @returns {Array<Object>}
   */
  toolboxCategories() {
    return this.installed.map(({ manifest }) => buildToolboxCategory(manifest, this.lang));
  }

  /**
   * Theme block and category styles for every installed library.
   *
   * A manifest gives one colour. The dark variant is the manifest's own
   * `colourDark` if it has one, otherwise the colour deepened until white text
   * on it passes WCAG AA (4.5:1) — the same bar the built-in dark palette meets.
   *
   * @param {'light'|'dark'} mode
   * @returns {{blockStyles: Object, categoryStyles: Object}}
   */
  themeStyles(mode) {
    const blockStyles = {};
    const categoryStyles = {};

    for (const { manifest } of this.installed) {
      const cat = manifest.category || {};
      const base = normaliseHex(cat.colour) || '#8899AA';
      const primary = mode === 'dark'
        ? (normaliseHex(cat.colourDark) || deepenForWhiteText(base))
        : base;

      blockStyles[blockStyleName(manifest.id)] = {
        colourPrimary: primary,
        colourSecondary: mix(primary, '#FFFFFF', mode === 'dark' ? 0.35 : 0.4),
        colourTertiary: mix(primary, '#000000', 0.22),
        hat: '',
      };
      categoryStyles[categoryStyleName(manifest.id)] = { colour: primary };
    }

    return { blockStyles, categoryStyles };
  }

  /**
   * The MicroPython drivers installed libraries need on the robot.
   * @returns {Array<{marker: string, filename: string, source: string}>}
   */
  drivers() {
    const out = [];
    for (const { manifest } of this.installed) {
      const driver = manifest.driver;
      if (!driver || !driver.source) continue;
      out.push({
        marker: driver.marker || driver.filename.replace(/\.py$/, ''),
        filename: driver.filename,
        source: driver.source,
      });
    }
    return out;
  }

  /**
   * Block types provided by installed libraries, for spotting what a saved
   * project is missing.
   * @returns {Set<string>}
   */
  knownBlockTypes() {
    const types = new Set();
    for (const list of this._registeredTypes.values()) {
      for (const type of list) types.add(type);
    }
    return types;
  }

  /** A short human label for a library, in the current language. */
  label(manifest) {
    return text(manifest.name, this.lang, manifest.id);
  }

  // ── Internals ──────────────────────────────────────────────────────────

  async _fetchManifest(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.json();
  }

  /**
   * Validate, register and record one manifest.
   * @returns {Object} the manifest
   */
  _install(manifest, origin, { save = true } = {}) {
    const { ok, errors } = validateManifest(manifest);
    if (!ok) {
      throw new Error(`This is not a valid device library:\n• ${errors.join('\n• ')}`);
    }

    // Re-adding the same library replaces it rather than doubling it up. Its
    // own block types are already registered, so they are not a clash.
    const ownTypes = new Set(this._registeredTypes.get(manifest.id) || []);
    if (this.get(manifest.id)) {
      this.installed = this.installed.filter((e) => e.manifest.id !== manifest.id);
      this._registeredTypes.delete(manifest.id);
      this._generatorsFor.delete(manifest.id);
    }

    const clash = this._blockTypeClash(manifest, ownTypes);
    if (clash) {
      throw new Error(
        `The block "${clash}" already exists in this IDE. ` +
        'Two libraries cannot define the same block type.'
      );
    }

    this.installed.push({ manifest, origin });
    this._registeredTypes.set(manifest.id, registerManifestBlocks(manifest, this.lang));

    if (this._pythonModule) {
      registerManifestGenerators(manifest, this._pythonModule, this.lang);
      this._generatorsFor.add(manifest.id);
    }

    this._refreshIconStyles();
    if (save) this._save();
    return manifest;
  }

  /** A block type already defined by the core IDE or another library. */
  _blockTypeClash(manifest, ownTypes = new Set()) {
    for (const block of manifest.blocks) {
      if (ownTypes.has(block.type)) continue;
      if (Blockly.Blocks[block.type]) return block.type;
    }
    return null;
  }

  _save() {
    try {
      const records = this.installed.map(({ manifest, origin }) => ({ origin, manifest }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.warn('[XRP Blocks] Could not remember the installed libraries:', err);
      this._warn('Your device libraries could not be saved in this browser, so they will be gone after a reload.');
    }
  }

  /**
   * Category icons are CSS masks, so each library needs a rule of its own.
   * Rewriting the whole style element keeps adds and removes in step.
   */
  _refreshIconStyles() {
    let style = document.getElementById(STYLE_ELEMENT_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ELEMENT_ID;
      document.head.appendChild(style);
    }

    const rules = this.installed.map(({ manifest }) => {
      const url = iconUrl(manifest);
      const cls = `cat-icon-lib-${cssSafe(manifest.id)}`;
      return `.${cls}::before{mask-image:url("${url}");-webkit-mask-image:url("${url}");}`;
    });

    style.textContent = rules.join('\n');
  }

  _warn(message) {
    if (typeof this.onWarn === 'function') this.onWarn(message);
  }
}

// ── Icons ──────────────────────────────────────────────────────────────

/**
 * Where a category icon comes from, in order: an inline SVG in the manifest
 * (so one file really is the whole library), a path or data URI, or the
 * built-in fallback.
 */
function iconUrl(manifest) {
  const cat = manifest.category || {};
  if (typeof cat.iconSvg === 'string' && cat.iconSvg.trim().startsWith('<svg')) {
    return svgDataUri(cat.iconSvg);
  }
  if (typeof cat.icon === 'string' && cat.icon.trim()) {
    return cat.icon.replace(/"/g, '%22');
  }
  return svgDataUri(DEFAULT_ICON_SVG);
}

function svgDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ── Colour ─────────────────────────────────────────────────────────────

function normaliseHex(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null;
}

function toRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex([r, g, b]) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Blend two colours. amount 0 gives the first colour, 1 gives the second. */
function mix(hexA, hexB, amount) {
  const a = toRgb(hexA);
  const b = toRgb(hexB);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
}

/** WCAG relative luminance. */
function luminance(hex) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = toRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of white text on this colour. */
function contrastWithWhite(hex) {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * Deepen a colour until white text on it reaches WCAG AA for normal text
 * (4.5:1), keeping the hue so the category stays recognisable.
 */
function deepenForWhiteText(hex) {
  let current = hex;
  for (let i = 0; i < 24 && contrastWithWhite(current) < 4.5; i++) {
    current = mix(current, '#000000', 0.07);
  }
  return current;
}
