/**
 * XRP Blocks — Main Application
 * Orchestrates Blockly workspace, WebSerial, and UI components.
 */

import { createXRPTheme } from './blockly/theme.js';
import { getToolboxDefinition, getFilteredToolbox } from './blockly/toolbox.js';
import { registerDrivetrainBlocks } from './blockly/blocks/drivetrain.js';
import { registerMotorBlocks } from './blockly/blocks/motors.js';
import { registerServoBlocks } from './blockly/blocks/servo.js';
import { registerSensorBlocks } from './blockly/blocks/sensors.js';
import { registerBoardBlocks } from './blockly/blocks/board.js';
import { registerLoopBlocks } from './blockly/blocks/loops.js';
import { registerListBlocks, getListFlyoutItems } from './blockly/blocks/lists.js';
import {
  registerWatchContextMenu,
  refreshWatchVisuals,
  attachWatchTooltip,
  setWatchEnabled,
  stripWatchLines,
} from './blockly/watch-vars.js';
import { registerDrivetrainGenerators } from './blockly/generators/drivetrain.js';
import { registerMotorGenerators } from './blockly/generators/motors.js';
import { registerServoGenerators } from './blockly/generators/servo.js';
import { registerSensorGenerators } from './blockly/generators/sensors.js';
import { registerBoardGenerators } from './blockly/generators/board.js';
import { registerLoopGenerators } from './blockly/generators/loops.js';
import { registerListGenerators, fixListVariableDefaults } from './blockly/generators/lists.js';
import { registerMicroPythonCompat, patchMicroPythonImports } from './blockly/generators/micropython-compat.js';
import { registerCustomCategory } from './blockly/custom-category.js';
import { registerUnusedBlocksMenu } from './blockly/unused-blocks.js';
import { registerExportPngMenu } from './blockly/export-png.js';
import { registerPinnedBlocksMenu, registerPinnedCategoryCallback, getPinnedCategory } from './blockly/pinned-blocks.js';
import { LibraryManager } from './devices/library-manager.js';
import { XRPSerial } from './serial/webserial.js';
import { XRPBluetooth } from './serial/webbluetooth.js';
import { getLastConnection, rememberConnection } from './serial/last-connection.js';
import { Toolbar } from './ui/toolbar.js';
import { PythonPanel } from './ui/python-panel.js';
import { ConsolePanel } from './ui/console-panel.js';
import { XRP_TRANSLATIONS } from './ui/translations.js';
import { LessonManager } from './ui/lesson-manager.js';
import { LessonPickerModal } from './ui/lesson-picker-modal.js';
import { ConnectionModal } from './ui/connection-modal.js';
import { ConfirmModal } from './ui/confirm-modal.js';
import { UnsupportedModal } from './ui/unsupported-modal.js';
import { LibraryModal } from './ui/library-modal.js';
import { initKeyboardShortcuts } from './ui/keyboard-shortcuts.js';

class XRPBlocksApp {
  constructor() {
    this.workspace = null;
    this.serial = null;          // Assigned after user picks USB or BT
    this.connectionMode = null;  // 'usb' | 'bluetooth'
    this.pythonPanel = null;
    this.consolePanel = null;
    this.toolbar = null;
    this.lessonManager = null;
    this._pythonGenerator = null;
    this.lang = 'en';
    this.libraries = null;       // set up in loadLibraries(), before init()
  }

  // ── Device Libraries ──

  /**
   * Bring back the device libraries (devices/*.json) the user had last time,
   * and add any a saved project needs. This must finish before init(), because
   * the workspace is injected with a toolbox that names their blocks.
   */
  async loadLibraries() {
    this.libraries = new LibraryManager({
      lang: this.lang,
      onWarn: (message) => console.warn('[XRP Blocks]', message),
    });

    try {
      await this.libraries.loadCatalogue();
      await this.libraries.restore();
      await this._addLibrariesForSavedProject();
    } catch (err) {
      console.error('[XRP Blocks] Device libraries could not be loaded:', err);
    }
  }

  /**
   * A project saved before a library was removed — or opened on a different
   * computer — names blocks that nothing defines yet. Rather than dropping
   * those blocks silently, put the library that provides them back.
   *
   * @param {Object} [state] - a workspace state; the auto-saved one by default
   * @returns {Promise<string[]>} ids of the libraries that were added
   */
  async _addLibrariesForSavedProject(state = null) {
    let text;
    if (state) {
      text = JSON.stringify(state);
    } else {
      try {
        text = localStorage.getItem('xrp_blocks_workspace') || '';
      } catch (err) {
        return [];
      }
    }
    if (!text) return [];

    const types = new Set();
    for (const match of text.matchAll(/"type"\s*:\s*"([A-Za-z_][A-Za-z0-9_]*)"/g)) {
      types.add(match[1]);
    }

    const wanted = new Set();
    for (const type of types) {
      if (Blockly.Blocks[type]) continue;
      const entry = this.libraries.catalogueEntryProviding(type);
      if (entry && !this.libraries.has(entry.id)) wanted.add(entry.id);
    }

    const added = [];
    for (const id of wanted) {
      try {
        await this.libraries.addFromCatalogue(id);
        added.push(id);
      } catch (err) {
        console.warn(`[XRP Blocks] Could not add the "${id}" library this project needs:`, err);
      }
    }
    return added;
  }

  /**
   * Rebuild everything a library touches: the palette, the toolbox and the
   * generated code. Called after a library is added or removed.
   */
  _refreshLibraries() {
    if (!this.workspace) return;
    this.libraries.registerBlocks();
    if (this._pythonGenerator) {
      const pythonModule = window.python || window.blocklyPython;
      if (pythonModule) this.libraries.registerGenerators(pythonModule);
    }
    this.workspace.setTheme(
      createXRPTheme(this._themeMode(), this.libraries.themeStyles(this._themeMode()))
    );
    this._applyFilteredToolbox(this._toolboxFilter || null);
    this._generateCode();
  }

  /**
   * Initialize the entire application
   */
  init() {
    // Register custom category renderer
    registerCustomCategory();

    // Register all custom blocks
    this._registerBlocks();

    // Create and inject Blockly workspace
    this._initWorkspace();

    // Set up Python generator
    this._initGenerator();

    // Initialize UI components
    this._initUI();

    // Keyboard shortcuts, help panel and toolbar button (change 35)
    initKeyboardShortcuts({
      workspace: this.workspace,
      showToast: (msg, type) => this._showToast(msg, type),
    });

    // Set up WebSerial callbacks (called after transport is chosen)
    // this._initSerial() is now called lazily in _handleConnect()

    // Set up workspace change listener for live code gen
    this._initLiveCodeGen();

    // Handle window resize
    this._initResize();

    // Load saved workspace from localStorage
    this._loadWorkspace();
    this._removeUnusedVariables();

    // Initial code generation
    this._generateCode();

    console.log('🤖 XRP Blocks IDE initialized');
  }

  // ── Language Support ──

  async loadLanguage() {
    // Detect default browser language (Dutch or English)
    let defaultLang = 'en';
    const browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (browserLang.startsWith('nl')) {
      defaultLang = 'nl';
    }

    this.lang = localStorage.getItem('xrp_blocks_language') || defaultLang;

    // Set the HTML lang attribute dynamically
    document.documentElement.setAttribute('lang', this.lang);

    try {
      await this._loadScript(`js/vendor/blockly/msg/${this.lang}.js`);
    } catch (err) {
      console.warn(`Failed to load language script for ${this.lang}, falling back to English.`, err);
      this.lang = 'en';
      await this._loadScript('js/vendor/blockly/msg/en.js');
      document.documentElement.setAttribute('lang', 'en');
    }
    const trans = XRP_TRANSLATIONS[this.lang] || XRP_TRANSLATIONS['en'];
    for (const key in trans) {
      Blockly.Msg[key] = trans[key];
    }
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  _applyLanguageToDOM() {
    const i18nElements = document.querySelectorAll('[data-i18n]');
    i18nElements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = Blockly.Msg[key];
      if (translation) {
        el.textContent = translation;
      }
    });

    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const translation = Blockly.Msg[key];
      if (translation) {
        el.setAttribute('placeholder', translation);
      }
    });

    const tooltipElements = document.querySelectorAll('[data-i18n-tooltip]');
    tooltipElements.forEach(el => {
      const key = el.getAttribute('data-i18n-tooltip');
      const translation = Blockly.Msg[key];
      if (translation) {
        el.setAttribute('data-tooltip', translation);
      }
    });
  }

  _switchLanguage(lang) {
    if (lang === this.lang) return;
    this._autoSave();
    localStorage.setItem('xrp_blocks_language', lang);
    window.location.reload();
  }

  // ── Block Registration ──

  _registerBlocks() {
    registerDrivetrainBlocks();
    registerMotorBlocks();
    registerServoBlocks();
    registerSensorBlocks();
    registerBoardBlocks();
    registerLoopBlocks();
    registerListBlocks();
    this.libraries.registerBlocks();
  }

  // ── Workspace ──

  _initWorkspace() {
    const mode = this._themeMode();
    const theme = createXRPTheme(mode, this.libraries.themeStyles(mode));
    const toolbox = this._pruneUnknownBlocks(
      getToolboxDefinition(this.libraries.toolboxCategories(), getPinnedCategory())
    );

    this.workspace = Blockly.inject('blocklyDiv', {
      toolbox,
      theme,
      renderer: 'zelos',
      grid: {
        spacing: 25,
        length: 3,
        colour: '#E2E6EF',
        snap: true,
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.9,
        maxScale: 2,
        minScale: 0.3,
        scaleSpeed: 1.1,
        pinch: true,
      },
      trashcan: true,
      move: {
        scrollbars: {
          horizontal: true,
          vertical: true,
        },
        drag: true,
        wheel: true,
      },
      sounds: true,
      media: 'js/vendor/blockly/media/',
    });

    this._customiseVariablesFlyout();
    registerUnusedBlocksMenu(this.workspace);
    registerExportPngMenu(this.workspace, (msg, type) => this._showToast(msg, type));
    registerPinnedCategoryCallback(this.workspace);
    registerPinnedBlocksMenu(this.workspace);
    this._initWatch();
  }

  /**
   * Wires up the right-click "Watch this value" feature (see
   * blockly/watch-vars.js): the context-menu item itself, a dynamic hover
   * tooltip on the stock "get [variable]" reporter (list "get" already gets
   * one from blocks/lists.js), and a glow badge on every block referencing a
   * watched variable — kept in sync as blocks are created, loaded, or
   * variables are renamed/deleted.
   */
  _initWatch() {
    registerWatchContextMenu();

    // Blockly's own variables_get has no hook for us to add this in its
    // definition, so wrap its init() once, globally, the first time any
    // workspace calls this — safe to call again on a language switch reload
    // since the wrapper checks a flag before re-wrapping.
    const stockGet = Blockly.Blocks['variables_get'];
    if (stockGet && !stockGet._xrpWatchWrapped) {
      const originalInit = stockGet.init;
      stockGet.init = function () {
        originalInit.call(this);
        // Blockly's own built-in tooltip message for this block — reused as
        // the static portion so we're not duplicating/maintaining a copy.
        attachWatchTooltip(this, 'VARIABLES_GET_TOOLTIP');
      };
      stockGet._xrpWatchWrapped = true;
    }

    this.workspace.addChangeListener((event) => {
      const REFRESH_ON = new Set([
        Blockly.Events.VAR_CREATE,
        Blockly.Events.VAR_DELETE,
        Blockly.Events.VAR_RENAME,
        Blockly.Events.BLOCK_CREATE,
        Blockly.Events.FINISHED_LOADING,
      ]);
      if (REFRESH_ON.has(event.type)) refreshWatchVisuals(this.workspace);
    });
    refreshWatchVisuals(this.workspace);
  }

  /**
   * Blockly throws, and leaves the flyout in a broken state, if the toolbox
   * names a block the browser has not loaded. That happens when a cached copy
   * of a block file is served next to a newer toolbox.js: one stale file then
   * breaks every category, not just its own. Drop the unknown entries and say
   * so loudly instead.
   *
   * @param {!Object} toolbox - Toolbox definition, modified in place
   * @returns {!Object} the same toolbox, with unloadable blocks removed
   */
  _pruneUnknownBlocks(toolbox) {
    const missing = [];
    const known = (type) => Boolean(type && Blockly.Blocks[type]);

    const pruneShadows = (item) => {
      if (!item || !item.inputs) return;
      for (const [name, input] of Object.entries(item.inputs)) {
        const shadowType = input?.shadow?.type;
        const blockType = input?.block?.type;
        if (shadowType && !known(shadowType)) {
          missing.push(shadowType);
          delete item.inputs[name];
        } else if (blockType && !known(blockType)) {
          missing.push(blockType);
          delete item.inputs[name];
        }
      }
    };

    const walk = (node) => {
      if (!node || !Array.isArray(node.contents)) return;
      node.contents = node.contents.filter((item) => {
        if (!item) return false;
        if (item.kind === 'block') {
          if (!known(item.type)) {
            missing.push(item.type);
            return false;
          }
          pruneShadows(item);
          return true;
        }
        walk(item);
        return true;
      });
    };

    walk(toolbox);

    if (missing.length) {
      const list = [...new Set(missing)].join(', ');
      console.warn(
        `[XRP Blocks] These blocks are not loaded, so they were hidden from the toolbox: ${list}. ` +
        'The browser is almost certainly serving a cached copy of the block files. ' +
        'Reload with Ctrl+Shift+R.'
      );
      setTimeout(() => {
        this._showToast?.(
          Blockly.Msg['MSG_STALE_CACHE'] ||
          'Some blocks are missing: the browser is using cached files. Reload with Ctrl+Shift+R.',
          'error'
        );
      }, 1200);
    }

    return toolbox;
  }

  /**
   * Blockly builds the Variables flyout with an EMPTY value socket on the
   * "set <var> to" block, while "change <var> by" ships with a shadow number.
   * For beginners the empty socket reads as a broken or missing block. Here we
   * wrap the built-in category callback and drop a shadow "0" into that socket,
   * so the block arrives ready to type into, like every other XRP block.
   *
   * The same callback also appends the Lists half of the submenu (see
   * blockly/blocks/lists.js): a "Make a List" button, one full set of list
   * operation/reporter blocks bound to the most recently created list, and
   * one bound "get" reporter per existing list — mirroring how Blockly's own
   * plain-variable blocks are laid out just above them.
   */
  _customiseVariablesFlyout() {
    try {
      this.workspace.registerToolboxCategoryCallback('VARIABLE', (ws) => {
        const items = Blockly.Variables.flyoutCategory(ws, false);
        for (const item of items) {
          if (item && item.kind === 'block' && item.type === 'variables_set' && !item.inputs) {
            item.inputs = {
              VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            };
          }
        }
        items.push({ kind: 'sep', gap: '32' });
        items.push(...getListFlyoutItems(ws));
        return items;
      });
    } catch (err) {
      console.warn('Could not customise the Variables flyout; using the Blockly default.', err);
    }
  }

  // ── Python Generator ──

  _initGenerator() {
    const pythonModule = window.python || window.blocklyPython;
    if (!pythonModule || !pythonModule.pythonGenerator) {
      console.error('Failed to find Blockly Python generator module.');
      this._showToast('Failed to load Python generator module', 'error');
      return;
    }
    
    this._pythonGenerator = pythonModule.pythonGenerator;

    // Register XRP-specific generators
    registerDrivetrainGenerators(pythonModule);
    registerMotorGenerators(pythonModule);
    registerServoGenerators(pythonModule);
    registerSensorGenerators(pythonModule);
    registerBoardGenerators(pythonModule);
    registerLoopGenerators(pythonModule);
    registerListGenerators(pythonModule);
    this.libraries.registerGenerators(pythonModule);
    registerMicroPythonCompat(pythonModule);
  }

  /**
   * @param {boolean} [watch=false] - when true, blocks referencing a
   *   watched variable/list (see blockly/watch-vars.js) also emit an extra
   *   debug print line after each change. Only Run passes true — Deploy
   *   always generates plain code, so main.py on the robot never carries
   *   this instrumentation.
   */
  _generateCode(watch = false) {
    if (!this.workspace || !this._pythonGenerator) return '';

    setWatchEnabled(watch);
    try {
      // Find the start block
      const startBlocks = this.workspace.getBlocksByType('xrp_start', false);
      let code = '';

      if (startBlocks.length > 0) {
        // Generate code starting from the xrp_start block
        const startBlock = startBlocks[0];
        this._pythonGenerator.init(this.workspace);
        // Every List-typed variable would otherwise start as Blockly's own
        // auto-declared `None` and crash on the first add/insert/replace —
        // see fixListVariableDefaults() for why.
        fixListVariableDefaults(this.workspace, this._pythonGenerator);

        // A function definition is its own stack on the canvas: nothing
        // reaches it from the start block, so walking out from the start
        // block alone never generates its body. The call would then be the
        // only mention of it in the program and the robot would stop with
        // "NameError: name 'UP' isn't defined". Generate the definitions
        // first; their code lands in definitions_, which finish() puts at
        // the top of the program.
        this._generateFunctionDefinitions();

        code = this._pythonGenerator.blockToCode(startBlock);
        code = this._pythonGenerator.finish(code);
      }

      // Prepend selective imports if we generated any actual code
      if (code.trim()) {
        const cleaned = code.replace(/^\n+/, '').replace(/\n+$/, '');
        const importLine = this._buildImportLine(cleaned);
        code = importLine + '\n\n' + cleaned;
      }

      // Strip CPython-only imports that MicroPython cannot satisfy.
      code = patchMicroPythonImports(code);

      this.pythonPanel?.update(code);
      return code;
    } catch (err) {
      console.error('Code generation error:', err);
      return '';
    } finally {
      // Always reset, so a later Deploy (or a Run that throws) never
      // inherits watch instrumentation left on from a previous call.
      setWatchEnabled(false);
    }
  }

  /**
   * Generate every function the user has defined on the canvas.
   *
   * Blockly's own `workspaceToCode` does this by walking all the top blocks,
   * but this IDE generates from the start block so that loose blocks are
   * ignored. Function definitions are loose by nature, so they have to be
   * picked up deliberately.
   *
   * The generators put their output into `definitions_` and return null, so
   * there is nothing to collect here; `finish()` emits them.
   */
  _generateFunctionDefinitions() {
    const DEFINITION_TYPES = ['procedures_defnoreturn', 'procedures_defreturn'];

    for (const block of this.workspace.getTopBlocks(false)) {
      if (!DEFINITION_TYPES.includes(block.type)) continue;
      try {
        this._pythonGenerator.blockToCode(block);
      } catch (err) {
        console.error(`[XRP Blocks] Could not generate the function "${block.getFieldValue('NAME')}":`, err);
      }
    }
  }

  /**
   * Scan the generated Python code and produce a selective import line that
   * only pulls in the XRPLib objects that are actually referenced. This
   * prevents background threads (e.g. in imu.py and encoded_motor.py) from
   * starting when those objects are not needed by the program.
   *
   * @param {string} code - Generated Python code (without the import line)
   * @returns {string} - e.g. "from XRPLib.defaults import board, drivetrain"
   */
  _buildImportLine(code) {
    // Ordered list of [identifier, regex] pairs.
    // The regex checks that the identifier appears as a standalone word in the code.
    const XRPLIB_OBJECTS = [
      'board',
      'drivetrain',
      'left_motor',
      'right_motor',
      'motor_three',
      'motor_four',
      'imu',
      'rangefinder',
      'reflectance',
      'servo_one',
      'servo_two',
      'servo_three',
      'servo_four',
    ];

    const needed = XRPLIB_OBJECTS.filter(name => {
      // Match the identifier as a whole word (not inside another identifier)
      return new RegExp(`\\b${name}\\b`).test(code);
    });

    if (needed.length === 0) {
      // Fallback: no recognised objects — use the safe minimal import
      return 'from XRPLib.defaults import board';
    }

    return `from XRPLib.defaults import ${needed.join(', ')}`;
  }

  // ── UI Components ──

  /**
   * Which colour scheme to use. Dark is the default on first run, and any
   * saved preference overrides it. Light stays available as an explicit choice.
   * @returns {'light'|'dark'}
   */
  _themeMode() {
    try {
      const saved = localStorage.getItem('xrp_blocks_theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return 'dark';
    } catch (err) {
      return 'dark';
    }
  }

  /**
   * Apply a colour scheme to the page and to the Blockly workspace.
   * @param {'light'|'dark'} mode
   */
  _applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    try {
      localStorage.setItem('xrp_blocks_theme', mode);
    } catch (err) {
      // Private browsing: the choice simply will not be remembered.
    }
    if (this.workspace) {
      this.workspace.setTheme(createXRPTheme(mode, this.libraries.themeStyles(mode)));
    }
  }

  _initUI() {
    // Apply translations to DOM elements
    this._applyLanguageToDOM();

    // Colour scheme: restore the saved choice and wire the toggle.
    this._applyTheme(this._themeMode());
    document.getElementById('btn-theme')?.addEventListener('click', () => {
      this._applyTheme(this._themeMode() === 'dark' ? 'light' : 'dark');
    });

    // Language dropdown selection
    const selectLang = document.getElementById('select-lang');
    if (selectLang) {
      selectLang.value = this.lang;
      selectLang.addEventListener('change', (e) => {
        this._switchLanguage(e.target.value);
      });
    }

    // Python preview panel
    const pythonEl = document.getElementById('python-code');
    this.pythonPanel = new PythonPanel(pythonEl);

    // Console panel
    const consoleEl = document.getElementById('console-output');
    this.consolePanel = new ConsolePanel(consoleEl, {
      onAutoScrollChange: (enabled) => this._updateAutoScrollButton(enabled),
    });

    // Toolbar
    this.toolbar = new Toolbar({
      onConnect: () => this._handleConnect(),
      onRun: () => this._handleRun(),
      onStop: () => this._handleStop(),
      onDeploy: () => this._handleDeploy(),
      onSave: () => this._saveWorkspace(),
      onLoad: () => this._loadFromFile(),
      onLoadLesson: () => this._openLessonPicker(),
      onOpenLibrary: () => this._openLibraryPicker(),
    });

    // Lesson manager
    this.lessonManager = new LessonManager({
      onToolboxChange: (filter) => this._applyFilteredToolbox(filter),
      onLoadTemplate: (state) => this._loadTemplateWorkspace(state),
      onResize: () => Blockly.svgResize(this.workspace),
    });

    // Bottom panel tabs
    this._initPanelTabs();

    // Copy button
    document.getElementById('btn-copy-code')?.addEventListener('click', async () => {
      const success = await this.pythonPanel.copyToClipboard();
      if (success) this._showToast(Blockly.Msg['MSG_COPIED'] || 'Code copied!');
    });

    // Console clear
    document.getElementById('btn-clear-console')?.addEventListener('click', () => {
      this.consolePanel.clear();
    });

    // Console copy
    document.getElementById('btn-copy-console')?.addEventListener('click', async () => {
      const success = await this.consolePanel.copyToClipboard();
      if (success) this._showToast(Blockly.Msg['MSG_CONSOLE_COPIED'] || 'Console copied!');
    });

    // Console auto-scroll toggle
    document.getElementById('btn-autoscroll')?.addEventListener('click', () => {
      this.consolePanel.toggleAutoScroll();
    });

    // Panel collapse toggle
    document.getElementById('btn-collapse-panel')?.addEventListener('click', () => {
      this._toggleBottomPanel();
    });
    document.getElementById('btn-collapse-panel-2')?.addEventListener('click', () => {
      this._toggleBottomPanel();
    });

    // Check transport support — disable connect button if neither is available
    const usbOk = XRPSerial.isSupported();
    const btOk  = XRPBluetooth.isSupported();
    if (!usbOk && !btOk) {
      const connectBtn = document.getElementById('btn-connect');
      if (connectBtn) connectBtn.disabled = true;
      document.getElementById('btn-connect').title =
        Blockly.Msg['MSG_NOT_SUPPORTED'] || 'WebSerial/Bluetooth not supported — use Chrome or Edge';

      // Inform the user up front that this browser can't connect to the XRP.
      UnsupportedModal.show();
    }
  }

  _initPanelTabs() {
    const tabs = document.querySelectorAll('.bottom-panel__tab');
    this._consolePinned = false;
    try {
      this._consolePinned = localStorage.getItem('xrp_blocks_console_pinned') === 'true';
    } catch { /* Auto-hide remains the default when storage is unavailable. */ }
    this._updateConsolePinButton();
    document.querySelectorAll('#btn-pin-console, #btn-pin-python').forEach(button => button.addEventListener('click', () => {
      this._consolePinned = !this._consolePinned;
      try {
        localStorage.setItem('xrp_blocks_console_pinned', String(this._consolePinned));
      } catch { /* The current session still honours the pin. */ }
      this._updateConsolePinButton();
      if (!this._consolePinned) this._setPanelState(false);
      else if (document.querySelector('.bottom-panel').classList.contains('collapsed')) {
        this._setPanelState(true, 'python');
      }
    }));

    // Unpinned output is opened explicitly through its tab. Do not dismiss it
    // while the user reads it, or open it automatically when running a program.
    if (this._consolePinned) this._setPanelState(true, 'console');
    else this._setPanelState(false);

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        const panel = document.querySelector('.bottom-panel');
        const isCollapsed = panel.classList.contains('collapsed');
        const isAlreadyActive = tab.classList.contains('active');

        if (isCollapsed) {
          // If panel is closed, clicking either tab opens it to that specific tab
          this._setPanelState(true, target);
        } else {
          // Panel is open
          if (isAlreadyActive) {
            // Clicking an active tab closes the panel (neither tab is active)
            this._setPanelState(false);
          } else {
            // Clicking a different tab switches to that tab (keeps panel open)
            this._setPanelState(true, target);
          }
        }
      });
    });
  }

  _updateConsolePinButton() {
    for (const button of document.querySelectorAll('#btn-pin-console, #btn-pin-python')) {
    const key = this._consolePinned ? 'TIP_UNPIN_CONSOLE' : 'TIP_PIN_CONSOLE';
    const label = Blockly.Msg[key] || (this._consolePinned ? 'Unpin console (auto-hide)' : 'Pin console');
    button.classList.toggle('is-active', this._consolePinned);
    button.setAttribute('aria-pressed', String(this._consolePinned));
    button.setAttribute('aria-label', label);
    button.setAttribute('data-tooltip', label);
    button.setAttribute('data-i18n-tooltip', key);
    }
  }

  /** Reflect the console auto-scroll state on its toggle button. */
  _updateAutoScrollButton(enabled) {
    const btn = document.getElementById('btn-autoscroll');
    if (!btn) return;
    btn.classList.toggle('is-active', enabled);
    btn.setAttribute('aria-pressed', String(enabled));
  }

  _toggleBottomPanel() {
    const panel = document.querySelector('.bottom-panel');
    const isCollapsed = panel.classList.contains('collapsed');
    
    if (isCollapsed) {
      // If closed, default to opening the python tab
      this._setPanelState(true, 'python');
    } else {
      // If open, close it
      this._setPanelState(false);
    }
  }

  _setPanelState(isOpen, targetTab = 'python') {
    const panel = document.querySelector('.bottom-panel');
    const tabs = document.querySelectorAll('.bottom-panel__tab');
    const views = document.querySelectorAll('.panel-view');

    if (isOpen) {
      panel.classList.remove('collapsed');

      tabs.forEach(t => {
        if (t.dataset.tab === targetTab) {
          t.classList.add('active');
        } else {
          t.classList.remove('active');
        }
      });

      views.forEach(v => {
        if (v.id === `panel-${targetTab}`) {
          v.classList.add('active');
        } else {
          v.classList.remove('active');
        }
      });

      // Update actions visibility
      const pythonActions = document.getElementById('python-actions');
      const consoleActions = document.getElementById('console-actions');
      if (pythonActions) pythonActions.style.display = targetTab === 'python' ? 'flex' : 'none';
      if (consoleActions) consoleActions.style.display = targetTab === 'console' ? 'flex' : 'none';

      // Update collapse button tooltip to indicate close behavior
      const collapseBtn1 = document.getElementById('btn-collapse-panel');
      const collapseBtn2 = document.getElementById('btn-collapse-panel-2');
      if (collapseBtn1) collapseBtn1.setAttribute('data-tooltip', 'Collapse panel');
      if (collapseBtn2) collapseBtn2.setAttribute('data-tooltip', 'Collapse panel');
    } else {
      panel.classList.add('collapsed');

      // Deactivate all tabs and views so neither is active when closed
      tabs.forEach(t => t.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));

      // Update collapse button tooltip to indicate open behavior
      const collapseBtn1 = document.getElementById('btn-collapse-panel');
      const collapseBtn2 = document.getElementById('btn-collapse-panel-2');
      if (collapseBtn1) collapseBtn1.setAttribute('data-tooltip', 'Expand panel');
      if (collapseBtn2) collapseBtn2.setAttribute('data-tooltip', 'Expand panel');
    }

    // Resize Blockly workspace after animation finishes
    setTimeout(() => {
      Blockly.svgResize(this.workspace);
    }, 320);
  }

  // ── WebSerial ──

  _initSerial() {
    this.serial.onConnect = () => {
      this.toolbar.setConnected(true, this.connectionMode || 'usb');
      this.consolePanel.appendSystem(Blockly.Msg['MSG_CONNECTED'] || '✓ Connected to XRP');
    };

    this.serial.onDisconnect = () => {
      this.toolbar.setConnected(false);
      this.toolbar.setRunning(false);
      this.consolePanel.appendSystem(Blockly.Msg['MSG_DISCONNECTED'] || '✗ Disconnected from XRP');
    };

    this.serial.onData = (text) => {
      // Debug watch lines (see blockly/watch-vars.js) are recorded here and
      // never shown — only the program's own output reaches the Console.
      const visible = stripWatchLines(text);
      if (visible) this.consolePanel.appendData(visible, 'received');
    };

    this.serial.onError = (err) => {
      this.consolePanel.appendError(`Error: ${err.message}`);
    };
  }

  async _handleConnect() {
    if (this._connecting) return;
    this._connecting = true;
    try {
    // If already connected, disconnect
    if (this.serial && this.serial.connected) {
      await this.serial.disconnect();
      return;
    }

    const prepare = mode => {
      this.connectionMode = mode;
      this._installedLibraries = {};
      this.serial = mode === 'bluetooth' ? new XRPBluetooth() : new XRPSerial();
      this._initSerial();
    };

    // Try a previously authorised device before asking the user to choose.
    try {
      const previous = await getLastConnection();
      if (previous) {
        prepare(previous.mode);
        await this.serial.connect(previous.device);
      }
    } catch {
      // Release partially opened transports before offering another connection.
      await this.serial?.disconnect().catch(() => {});
    }

    if (!this.serial?.connected) {
      const mode = await ConnectionModal.pick();
      if (!mode) return;
      prepare(mode);

    try {
      await this.serial.connect();
    } catch (err) {
      this._showToast(
        (Blockly.Msg['MSG_CONNECT_FAILED'] || 'Failed to connect: ') + err.message,
        'error'
      );
      return;
    }
    }

    if (this.serial.connected) {
      rememberConnection(this.connectionMode,
        this.connectionMode === 'usb' ? this.serial.port : this.serial._device);
    }

    // Connecting only attaches to serial output. Run, Stop and Deploy handle
    // interruption explicitly; preserve an auto-started web server here.
    } finally {
      this._connecting = false;
    }
  }

  async _handleRun() {
    this._removeUnusedVariables();
    // watch=true: any variable/list marked "Watch this value" gets the
    // debug print instrumentation for this run (see _generateCode above).
    const code = this._generateCode(true);
    if (!code.trim()) {
      this._showToast(Blockly.Msg['MSG_NO_CODE'] || 'No code to run — add some blocks first!', 'error');
      return;
    }

    // Only pinned output opens automatically; otherwise keep the user's view.
    if (this._consolePinned) this._setPanelState(true, 'console');

    this.toolbar.setRunning(true);
    try {
      await this._ensureLibraries(code);
      this.consolePanel.appendSystem(Blockly.Msg['MSG_RUNNING'] || '▶ Running program...');
      await this.serial.runProgram(code);
    } catch (err) {
      this.consolePanel.appendError(`${Blockly.Msg['MSG_RUN_FAILED'] || 'Run error: '}${err.message}`);
      this._showToast((Blockly.Msg['MSG_RUN_FAILED'] || 'Run error: ') + err.message, 'error');
      this.toolbar.setRunning(false);
      return;
    }

    // runProgram() has returned — the REPL handshake (Ctrl+C / Ctrl+A / Ctrl+B) is
    // complete and all setup prompts have passed. Only now start watching for the
    // '>>> ' prompt that signals the user's program actually finished on its own.
    this._watchForProgramEnd();
  }

  async _handleStop() {
    try {
      this._stopWatchingForProgramEnd();
      const stopped = await this.serial.stopExecution();
      if (stopped) {
        this.consolePanel.appendSystem(Blockly.Msg['MSG_STOPPED'] || '⏹ Program stopped');
      } else {
        const message = this.connectionMode === 'bluetooth'
          ? (Blockly.Msg['MSG_STOP_REBOOTING'] || '⏹ Stop signal sent — board is rebooting, reconnect once it comes back.')
          : (Blockly.Msg['MSG_STOP_FAILED'] || '⚠ Board did not confirm it stopped — try again, or press the reset button on the board.');
        this.consolePanel.appendSystem(message);
      }
      this.toolbar.setRunning(false);
    } catch (err) {
      this.consolePanel.appendError(`Stop error: ${err.message}`);
    }
  }

  /**
   * A device library's blocks generate code that imports a driver which is not
   * part of XRPLib. Copy each needed driver onto the robot's filesystem the
   * first time a program uses it. It then stays in flash, so this happens
   * once per board. A failure here is reported but never blocks the run: the
   * program itself will report the missing import clearly enough.
   *
   * The list comes from the installed manifests, so a device someone adds
   * tomorrow installs its driver the same way, with nothing to change here.
   */
  async _ensureLibraries(code) {
    if (!code) return;
    const LIBRARIES = this.libraries.drivers();
    this._installedLibraries = this._installedLibraries || {};

    for (const lib of LIBRARIES) {
      if (!code.includes(lib.marker)) continue;
      if (this._installedLibraries[lib.filename]) continue;
      try {
        this.consolePanel?.appendSystem(`⬇ Installing ${lib.filename} on the robot...`);
        await this.serial.uploadFile(lib.filename, lib.source);
        this._installedLibraries[lib.filename] = true;
      } catch (err) {
        this.consolePanel?.appendError(`Could not install ${lib.filename}: ${err.message}`);
        throw err;
      }
    }
  }

  async _handleDeploy() {
    // watch defaults to false here: main.py saved to the robot must never
    // carry the debug watch prints, even if variables are marked watched.
    const code = this._generateCode();
    if (!code.trim()) {
      this._showToast(Blockly.Msg['MSG_NO_CODE'] || 'No code to run — add some blocks first!', 'error');
      return;
    }

    // Saving overwrites main.py on the robot, so ask first.
    const confirmed = await ConfirmModal.ask({
      title: Blockly.Msg['UI_DEPLOY_CONFIRM_TITLE'] || 'Save this program to the robot?',
      body: Blockly.Msg['UI_DEPLOY_CONFIRM_BODY']
        || 'The program will be saved on the XRP as main.py and will run by itself every time the robot is switched on.',
      confirmLabel: Blockly.Msg['UI_DEPLOY_CONFIRM_OK'] || 'Save to XRP',
      cancelLabel: Blockly.Msg['UI_CANCEL'] || 'Cancel',
    });
    if (!confirmed) {
      this._showToast(Blockly.Msg['MSG_DEPLOY_CANCELLED'] || 'Save cancelled — nothing was changed on the robot.');
      return;
    }

    // Deployment output is recorded even when the console remains hidden.
    if (this._consolePinned) this._setPanelState(true, 'console');

    const deployBtn = document.getElementById('btn-deploy');
    if (deployBtn) {
      deployBtn.disabled = true;
      deployBtn.classList.add('deploying');
    }

    this.consolePanel.appendSystem(Blockly.Msg['MSG_DEPLOYING'] || '⬇ Saving main.py to board...');

    try {
      await this._ensureLibraries(code);
      await this.serial.uploadFile('main.py', code);
      this.consolePanel.appendSystem(Blockly.Msg['MSG_DEPLOYED'] || '✓ Deployed! Program will run automatically on power-up.');
      this._showToast(Blockly.Msg['MSG_DEPLOYED'] || '✓ Deployed to board!');

      // Deploy only saves main.py — it does not run it, so the board stays
      // idle at the REPL (and reachable over Bluetooth) right after a save.
    } catch (err) {
      this.consolePanel.appendError(`${Blockly.Msg['MSG_DEPLOY_FAILED'] || 'Deploy error: '}${err.message}`);
      this._showToast((Blockly.Msg['MSG_DEPLOY_FAILED'] || 'Deploy error: ') + err.message, 'error');
      this.toolbar.setRunning(false);
    } finally {
      if (deployBtn) {
        deployBtn.classList.remove('deploying');
        deployBtn.disabled = false;
      }
    }
  }

  /**
   * Install a one-shot listener on the serial data stream that resets the
   * running state when MicroPython prints its REPL prompt, which means the
   * program has finished executing on its own.
   */
  _watchForProgramEnd() {
    this._stopWatchingForProgramEnd(); // clear any previous watcher

    // Buffer incoming data; look for the '>>> ' REPL prompt
    this._replBuffer = '';
    this._seenExecutionStart = false;

    // Defensive fallback: enable prompt checking after 1.5 seconds regardless
    this._fallbackTimeout = setTimeout(() => {
      this._seenExecutionStart = true;
    }, 1500);

    this._replEndHandler = (text) => {
      // Check for execution start signatures to clear pre-execution prompts
      if (!this._seenExecutionStart) {
        const lower = text.toLowerCase();
        if (lower.includes('raw repl') || lower.includes('soft reboot') || lower.includes('micropython')) {
          this._seenExecutionStart = true;
          this._replBuffer = ''; // Clear any backlog containing pre-execution prompts
        }
      }

      if (this._seenExecutionStart) {
        this._replBuffer += text;
        // Keep only the last 16 chars to avoid unbounded growth
        if (this._replBuffer.length > 16) {
          this._replBuffer = this._replBuffer.slice(-16);
        }
        if (this._replBuffer.includes('>>> ')) {
          this._stopWatchingForProgramEnd();
          this.toolbar.setRunning(false);
          this.consolePanel.appendSystem(Blockly.Msg['MSG_DONE'] || '✓ Program finished');
        }
      }
    };

    // Chain on top of the existing onData handler
    const existingOnData = this.serial.onData;
    this.serial.onData = (text) => {
      if (existingOnData) existingOnData(text);
      if (this._replEndHandler) this._replEndHandler(text);
    };
  }

  _stopWatchingForProgramEnd() {
    if (this._fallbackTimeout) {
      clearTimeout(this._fallbackTimeout);
      this._fallbackTimeout = null;
    }
    if (!this._replEndHandler) return;
    // Restore the plain data handler (still stripping watch debug lines —
    // see the matching handler in _initSerial()).
    this.serial.onData = (text) => {
      const visible = stripWatchLines(text);
      if (visible) this.consolePanel.appendData(visible, 'received');
    };
    this._replEndHandler = null;
    this._replBuffer = '';
  }

  // Remove only variables with no references anywhere, including loose blocks
  // and function parameters, so unfinished work is preserved. One undo group.
  _removeUnusedVariables() {
    const used = new Set(Blockly.Variables.allUsedVarModels(this.workspace).map(variable => variable.getId()));
    const map = this.workspace.getVariableMap();
    const unused = map.getAllVariables().filter(variable => !used.has(variable.getId()));
    if (!unused.length) return;
    const group = Blockly.Events.getGroup();
    Blockly.Events.setGroup(true);
    try {
      for (const variable of unused) map.deleteVariable(variable);
    } finally {
      Blockly.Events.setGroup(group);
    }
    this._autoSave();
  }

  // ── Live Code Generation ──

  _initLiveCodeGen() {
    this.workspace.addChangeListener((event) => {
      // Only regenerate on meaningful changes
      if (event.isUiEvent) return;
      if (event.type === Blockly.Events.FINISHED_LOADING) return;

      this._disableOrphans();
      this._generateCode();

      // Auto-save to localStorage on change (debounced)
      clearTimeout(this._saveTimeout);
      this._saveTimeout = setTimeout(() => this._autoSave(), 1000);
    });
  }

  _disableOrphans() {
    const validRoots = ['xrp_start', 'procedures_defnoreturn', 'procedures_defreturn'];
    const topBlocks = this.workspace.getTopBlocks();
    
    for (const block of topBlocks) {
      if (validRoots.includes(block.type)) {
        if (!block.isEnabled()) block.setDisabledReason(false, 'orphan');
        
        // Ensure all children are enabled
        const descendants = block.getDescendants(false);
        for (const desc of descendants) {
          if (!desc.isEnabled()) desc.setDisabledReason(false, 'orphan');
        }
      } else {
        // If it's not a valid root, disable it and all children
        const descendants = block.getDescendants(false);
        for (const desc of descendants) {
          if (desc.isEnabled()) desc.setDisabledReason(true, 'orphan');
        }
      }
    }
  }

  // ── Save / Load ──

  _autoSave() {
    try {
      const state = Blockly.serialization.workspaces.save(this.workspace);
      localStorage.setItem('xrp_blocks_workspace', JSON.stringify(state));
    } catch (err) {
      console.warn('Auto-save failed:', err);
    }
  }

  _saveWorkspace() {
    const state = Blockly.serialization.workspaces.save(this.workspace);
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xrp-blocks-project.json';
    a.click();
    URL.revokeObjectURL(url);
    this._showToast('Project saved!');
  }

  _loadWorkspace() {
    try {
      const saved = localStorage.getItem('xrp_blocks_workspace');
      if (saved) {
        const state = JSON.parse(saved);
        Blockly.serialization.workspaces.load(state, this.workspace);
      }
    } catch (err) {
      console.warn('Failed to load saved workspace:', err);
    }

    // Ensure there is at least one start block
    const topBlocks = this.workspace.getTopBlocks();
    const hasStart = topBlocks.some(b => b.type === 'xrp_start');
    if (!hasStart) {
      const startBlock = this.workspace.newBlock('xrp_start');
      startBlock.initSvg();
      startBlock.render();
      startBlock.moveBy(50, 50);
    }
  }

  _loadFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const state = JSON.parse(text);

        // The project may use blocks from a device library this browser does
        // not have yet. Put those libraries back before loading, or every one
        // of their blocks would be dropped on the floor.
        const added = await this._addLibrariesForSavedProject(state);
        if (added.length) {
          this._refreshLibraries();
          this._showToast(
            (Blockly.Msg['MSG_LIBRARY_AUTO_ADDED'] || 'Added the device libraries this project needs: %1')
              .replace('%1', added.join(', '))
          );
        }

        Blockly.serialization.workspaces.load(state, this.workspace);
        this._showToast('Project loaded!');
      } catch (err) {
        this._showToast('Failed to load file', 'error');
      }
    };
    input.click();
  }

  // ── Device Library Picker ──

  async _openLibraryPicker() {
    await LibraryModal.open({
      manager: this.libraries,
      workspace: this.workspace,
      onChange: () => this._refreshLibraries(),
      onToast: (message, type) => this._showToast(message, type || 'success'),
    });
  }

  // ── Lesson Support ──

  async _openLessonPicker() {
    const lesson = await LessonPickerModal.pick();
    if (!lesson) return;

    const ok = this.lessonManager.load(lesson);
    if (ok) {
      this._showToast(
        (Blockly.Msg['MSG_LESSON_LOADED'] || '📖 Lesson loaded: ') + (lesson.title || 'Untitled')
      );
    } else {
      this._showToast(
        Blockly.Msg['MSG_LESSON_INVALID'] || 'Invalid lesson file — must have a steps array.',
        'error'
      );
    }
  }

  /**
   * Re-inject the Blockly toolbox with a filtered or full definition.
   * @param {Object|null} toolboxFilter - Lesson toolbox filter, or null to restore full.
   */
  _applyFilteredToolbox(toolboxFilter) {
    if (!this.workspace) return;
    this._toolboxFilter = toolboxFilter || null;
    const toolbox = this._pruneUnknownBlocks(
      getFilteredToolbox(toolboxFilter, this.libraries.toolboxCategories(), getPinnedCategory())
    );
    this.workspace.updateToolbox(toolbox);
  }

  /**
   * Load a lesson template state into the Blockly workspace.
   * Clears the current workspace first, then loads the template.
   * Always ensures an xrp_start block is present afterwards.
   * @param {Object} state - Blockly serialization workspace state
   */
  _loadTemplateWorkspace(state) {
    if (!this.workspace) return;
    try {
      Blockly.serialization.workspaces.load(state, this.workspace);
    } catch (err) {
      console.error('[XRPBlocks] Failed to load lesson template:', err);
    }

    // Guarantee there is always a start block
    const topBlocks = this.workspace.getTopBlocks();
    const hasStart = topBlocks.some(b => b.type === 'xrp_start');
    if (!hasStart) {
      const startBlock = this.workspace.newBlock('xrp_start');
      startBlock.initSvg();
      startBlock.render();
      startBlock.moveBy(50, 50);
    }
  }

  // ── Resize ──

  _initResize() {
    const resizeObserver = new ResizeObserver(() => {
      Blockly.svgResize(this.workspace);
    });
    resizeObserver.observe(document.getElementById('blocklyDiv'));

    // Also handle panel resize drag
    this._initPanelResize();
  }

  _initPanelResize() {
    const panel = document.querySelector('.bottom-panel');
    const handle = document.querySelector('.bottom-panel__resize');
    if (!handle || !panel) return;

    let startY, startHeight;

    handle.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startHeight = panel.offsetHeight;
      panel.classList.remove('collapsed');

      const onMouseMove = (e) => {
        const delta = startY - e.clientY;
        const newHeight = Math.max(100, Math.min(window.innerHeight * 0.6, startHeight + delta));
        // Store the expanded size without overriding the collapsed CSS height.
        panel.style.setProperty('--panel-height', newHeight + 'px');
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        Blockly.svgResize(this.workspace);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // ── Toast Notifications ──

  _showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast toast--${type}`;

    // Trigger show
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2500);
  }
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', async () => {
  const app = new XRPBlocksApp();
  await app.loadLanguage();
  await app.loadLibraries();
  app.init();
});
