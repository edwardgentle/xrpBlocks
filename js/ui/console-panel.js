/**
 * XRP Blocks — Console Panel
 * Shows serial output from the XRP robot.
 */

export class ConsolePanel {
  /**
   * @param {HTMLElement} containerEl - the element that holds the output lines
   * @param {object} [opts]
   * @param {(enabled:boolean)=>void} [opts.onAutoScrollChange] - notified when
   *        auto-scroll turns on/off (e.g. user scrolls up), so the UI can reflect it
   */
  constructor(containerEl, { onAutoScrollChange } = {}) {
    this.container = containerEl;

    // The actual scroll container is the scrollable ancestor (.panel-view),
    // not the output element itself (which just grows to fit its content).
    this.scrollEl = containerEl.closest('.panel-view') || containerEl;

    this._autoScroll = true;
    this._onAutoScrollChange = onAutoScrollChange || null;

    this._bindScroll();
  }

  /**
   * Track the user's scroll position: auto-scroll "sticks" while they're at the
   * bottom and switches off as soon as they scroll up to read earlier output.
   */
  _bindScroll() {
    this.scrollEl.addEventListener('scroll', () => {
      const atBottom = this._isNearBottom();
      if (atBottom !== this._autoScroll) {
        this._autoScroll = atBottom;
        this._onAutoScrollChange?.(this._autoScroll);
      }
    });
  }

  _isNearBottom() {
    const el = this.scrollEl;
    // A small threshold so being a pixel off the bottom still counts as "at bottom".
    return el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }

  scrollToBottom() {
    this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
  }

  /**
   * Append received data to the console
   */
  appendData(text, type = 'received') {
    // Split on newlines so serial output renders line-by-line
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (line.length > 0) {
        const span = document.createElement('span');
        span.className = `console-${type}`;
        span.textContent = line;
        this.container.appendChild(span);
      }
      // Insert a <br> after every segment except the last
      // (if the chunk ends with \n the last segment is empty, so we get a trailing newline)
      if (i < lines.length - 1) {
        this.container.appendChild(document.createElement('br'));
      }
    });

    if (this._autoScroll) {
      this.scrollToBottom();
    }
  }

  /**
   * Append a system message (italicized, muted)
   */
  appendSystem(message) {
    this.appendData(message + '\n', 'system');
  }

  /**
   * Append an error message
   */
  appendError(message) {
    this.appendData(message + '\n', 'error');
  }

  /**
   * Clear all console output
   */
  clear() {
    this.container.innerHTML = '';
  }

  /**
   * Get the full console output as plain text (BRs become newlines).
   * Built from the DOM directly so it works even when the panel is hidden,
   * where innerText would return an empty string.
   */
  getText() {
    let out = '';
    this.container.childNodes.forEach(node => {
      out += node.nodeName === 'BR' ? '\n' : node.textContent;
    });
    return out;
  }

  /**
   * Copy the console output to the clipboard. Resolves to true on success.
   */
  async copyToClipboard() {
    const text = this.getText();
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for older browsers / insecure contexts
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    }
  }

  /** Whether auto-scroll is currently on. */
  get autoScroll() {
    return this._autoScroll;
  }

  /** Enable/disable auto-scroll. Enabling jumps to the bottom. */
  setAutoScroll(enabled) {
    this._autoScroll = enabled;
    if (enabled) this.scrollToBottom();
    this._onAutoScrollChange?.(this._autoScroll);
  }

  /** Toggle auto-scroll on/off. */
  toggleAutoScroll() {
    this.setAutoScroll(!this._autoScroll);
  }
}
