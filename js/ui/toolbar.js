/**
 * XRP Blocks — Toolbar UI Component
 */

export class Toolbar {
  constructor({ onConnect, onRun, onStop, onDeploy, onSave, onLoad, onLoadLesson, onOpenLibrary }) {
    this.onConnect = onConnect;
    this.onRun = onRun;
    this.onStop = onStop;
    this.onDeploy = onDeploy;
    this.onSave = onSave;
    this.onLoad = onLoad;
    this.onLoadLesson = onLoadLesson;
    this.onOpenLibrary = onOpenLibrary;

    this._connected = false;
    this._running = false;
    this._connectionMode = 'usb'; // 'usb' | 'bluetooth'

    this._bindElements();
    this._bindEvents();
  }

  _bindElements() {
    this.connectBtn   = document.getElementById('btn-connect');
    this.runBtn       = document.getElementById('btn-run');
    this.stopBtn      = document.getElementById('btn-stop');
    this.deployBtn    = document.getElementById('btn-deploy');
    this.saveBtn      = document.getElementById('btn-save');
    this.loadBtn      = document.getElementById('btn-load');
    this.loadLessonBtn = document.getElementById('btn-load-lesson');
    this.libraryBtn   = document.getElementById('btn-library');
    this.statusDot    = document.getElementById('connection-dot');
    this.statusText   = document.getElementById('connection-text');
  }

  _bindEvents() {
    this.connectBtn?.addEventListener('click', () => this.onConnect?.());
    this.runBtn?.addEventListener('click', () => this.onRun?.());
    this.stopBtn?.addEventListener('click', () => this.onStop?.());
    this.deployBtn?.addEventListener('click', () => this.onDeploy?.());
    this.saveBtn?.addEventListener('click', () => this.onSave?.());
    this.loadBtn?.addEventListener('click', () => this.onLoad?.());
    this.loadLessonBtn?.addEventListener('click', () => this.onLoadLesson?.());
    this.libraryBtn?.addEventListener('click', () => this.onOpenLibrary?.());
  }

  /**
   * Update the connected state.
   * @param {boolean} connected
   * @param {'usb'|'bluetooth'} [mode='usb'] - The transport mode used
   */
  setConnected(connected, mode = 'usb') {
    this._connected = connected;
    this._connectionMode = mode;

    if (connected) {
      const isBt = mode === 'bluetooth';

      // Lucide: unplug — the button now triggers a disconnect
      const disconnectIcon =
        `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <path d="m19 5 3-3"/>
           <path d="m2 22 3-3"/>
           <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/>
           <path d="M7.5 13.5 10 11"/>
           <path d="M10.5 16.5 13 14"/>
           <path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"/>
         </svg>`;

      this.connectBtn.innerHTML = `
        ${disconnectIcon}
        <span class="btn-label">${Blockly.Msg['UI_DISCONNECT'] || 'Disconnect'}</span>
      `;
      this.connectBtn.classList.add('connected');

      // Status dot: blue for BT, default accent for USB
      this.statusDot?.classList.add('connected');
      if (isBt) {
        this.statusDot?.classList.add('connected-bt');
      } else {
        this.statusDot?.classList.remove('connected-bt');
      }

      // Status text: show transport type
      const modeLabel = isBt
        ? (Blockly.Msg['UI_CONNECTED_BT'] || 'Connected (BT)')
        : (Blockly.Msg['UI_CONNECTED'] || 'Connected');
      if (this.statusText) this.statusText.textContent = modeLabel;

      this.runBtn.disabled = false;
      if (this.deployBtn) this.deployBtn.disabled = false;

    } else {
      this.connectBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22v-5" />
          <path d="M9 8V2" />
          <path d="M15 8V2" />
          <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
        </svg>
        <span class="btn-label">${Blockly.Msg['UI_CONNECT'] || 'Connect XRP'}</span>
      `;
      this.connectBtn.classList.remove('connected');
      this.statusDot?.classList.remove('connected', 'connected-bt');
      if (this.statusText) this.statusText.textContent = Blockly.Msg['UI_DISCONNECTED'] || 'Disconnected';
      this.runBtn.disabled = true;
      if (this.deployBtn) this.deployBtn.disabled = true;
    }

    this._updateRunStopVisibility();
  }

  setRunning(running) {
    this._running = running;
    this._updateRunStopVisibility();
  }

  _updateRunStopVisibility() {
    if (this._running) {
      this.runBtn.style.display = 'none';
      this.stopBtn.classList.add('visible');
    } else {
      this.runBtn.style.display = '';
      // A program may have auto-started before the IDE connected. Keep Stop
      // available without claiming that we know whether the board is running.
      this.stopBtn.classList.toggle('visible', this._connected);
    }
  }
}
