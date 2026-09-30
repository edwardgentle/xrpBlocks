/**
 * XRP Blocks — Base Transport
 * Shared MicroPython raw-REPL protocol logic.
 * Subclasses (XRPSerial, XRPBluetooth) implement connect / disconnect / send / _startReading.
 */

export class XRPTransportBase {
  constructor() {
    this.connected = false;
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();

    // Event callbacks (assigned by app.js)
    this.onConnect = null;
    this.onDisconnect = null;
    this.onData = null;
    this.onError = null;

    // Shared incoming-data buffer backing _waitForResponse()/checkPrompt().
    // XRPBluetooth overrides these with its own GATT-aware buffer.
    this._rxBuffer = '';
    this._rxWaiters = []; // [{ pattern, resolve, timer }]
  }

  // ── Abstract interface (must be implemented by subclass) ──────────────────

  /**
   * Open the physical connection and begin reading.
   * Subclass must set this.connected = true and call this.onConnect?.() when ready.
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Close the physical connection.
   * Subclass must set this.connected = false and call this.onDisconnect?.() when done.
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Send raw bytes to the device.
   * @param {string} data - UTF-8 string to encode and send
   */
  async send(data) {
    throw new Error('send() must be implemented by subclass');
  }

  // ── Shared MicroPython REPL protocol ──────────────────────────────────────

  /**
   * Interrupt any running program (Ctrl+C ×2)
   */
  async interrupt() {
    await this.send('\r\x03\x03');
    await this._delay(200);
  }

  /**
   * Enter raw REPL mode (Ctrl+A)
   */
  async enterRawRepl() {
    await this.interrupt();
    await this.send('\r\x01');
    await this._delay(200);
  }

  /**
   * Exit raw REPL mode back to normal (Ctrl+B)
   */
  async exitRawRepl() {
    await this.send('\x02');
    await this._delay(200);
  }

  /**
   * Execute Python code on the XRP via raw REPL
   * @param {string} pythonCode
   */
  async executeCode(pythonCode) {
    if (!this.connected) {
      throw new Error('Not connected to XRP');
    }

    try {
      await this.enterRawRepl();
      await this.send(pythonCode);
      await this._delay(50);
      await this.send('\x04'); // Ctrl+D — execute
      await this._delay(200);
    } catch (err) {
      if (this.onError) this.onError(err);
      throw err;
    } finally {
      // Always try to leave raw REPL, even if something above threw — otherwise
      // the board is left stuck in raw REPL and stops responding to the REPL.
      await this.exitRawRepl().catch(() => {});
    }
  }

  /**
   * Stop a running program and confirm the REPL is responsive again.
   *
   * A Ctrl+C interrupt only stops Python execution — it does not turn off a
   * motor that's already spinning, since interrupting mid-instruction (e.g.
   * inside an encoder poll) skips straight to the exception handler without
   * ever reaching a "stop motor" call. The official XRP web IDE hits this
   * same gap and works around it the same way: once the REPL is confirmed
   * back, explicitly force the robot's actuators to a safe stopped state.
   * @returns {Promise<boolean>} true once the board is confirmed idle at the REPL
   */
  async stopExecution() {
    if (!this.connected) return false;
    const atRepl = await this.getToREPL();
    if (atRepl) {
      await this._resetHardware();
    }
    return atRepl;
  }

  /**
   * Force motors/servos back to a safe, stopped state via XRPLib's hard
   * reset helper. Not every firmware build is guaranteed to have it, so a
   * failure here is reported but doesn't fail the overall stop.
   */
  async _resetHardware() {
    try {
      // The Triggers library runs on a background timer that Ctrl+C does not
      // end. Stop it first (it switches its lights off and undoes an
      // emergency stop), found through the XRPLib Board object so this works
      // even if the driver module has since been reloaded. Never creates a
      // Board: only looks if XRPLib.board is already loaded.
      await this.executeCode(
        "import sys\n" +
        "if 'XRPLib.board' in sys.modules:\n" +
        "    try:\n" +
        "        _t = getattr(sys.modules['XRPLib.board'].Board._DEFAULT_BOARD_INSTANCE, '_xrp_triggers', None)\n" +
        "        if _t is not None:\n" +
        "            _t.stop()\n" +
        "    except Exception:\n" +
        "        pass\n" +
        "if 'XRPLib.resetbot' in sys.modules:\n" +
        "    del sys.modules['XRPLib.resetbot']\n" +
        "from XRPLib.resetbot import reset_hard\n" +
        "reset_hard()\n"
      );
    } catch (err) {
      if (this.onError) this.onError(err);
    }
  }

  // ── Incoming-data buffering (used to detect REPL prompts) ───────────────────

  /**
   * Feed a chunk of incoming data through the shared response buffer, then
   * forward it to the app's onData callback. Subclasses' read loops should
   * call this instead of invoking onData directly, so checkPrompt()/
   * getToREPL() can see the board's output.
   */
  _feedIncomingData(text) {
    this._rxBuffer += text;
    if (this._rxBuffer.length > 256) {
      this._rxBuffer = this._rxBuffer.slice(-256);
    }
    this._checkWaiters();
    if (this.onData) this.onData(text);
  }

  _checkWaiters() {
    this._rxWaiters = this._rxWaiters.filter(waiter => {
      if (this._rxBuffer.includes(waiter.pattern)) {
        clearTimeout(waiter.timer);
        waiter.resolve();
        return false;
      }
      return true;
    });
  }

  /**
   * Resolve once `pattern` appears in the incoming-data buffer, or reject
   * after `timeoutMs`.
   */
  _waitForResponse(pattern, timeoutMs = 1000) {
    if (this._rxBuffer.includes(pattern)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = { pattern, resolve };
      waiter.timer = setTimeout(() => {
        const idx = this._rxWaiters.indexOf(waiter);
        if (idx !== -1) this._rxWaiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for: ${pattern}`));
      }, timeoutMs);
      this._rxWaiters.push(waiter);
    });
  }

  /**
   * Check whether the board is idle at the friendly REPL prompt right now,
   * without trying to interrupt anything.
   */
  async checkPrompt(timeoutMs = 400) {
    if (!this.connected) return false;
    // Clear stale buffer content first — otherwise a '>>>' left over from
    // before a silent, non-printing program started would look like a fresh
    // idle prompt and short-circuit the check below.
    this._rxBuffer = '';
    await this.send('\r');
    return this._waitForResponse('>>>', timeoutMs).then(() => true, () => false);
  }

  /**
   * Aggressively regain the REPL prompt, mirroring the official XRP web
   * IDE's recovery loop: a single Ctrl+C isn't always enough to interrupt a
   * program that's mid-instruction or driven by a timer/interrupt callback,
   * so retry a number of times before giving up.
   *
   * Each attempt clears the buffer once up front, then sends the interrupt
   * *and* an explicit exit-raw-REPL before checking for the prompt — as one
   * uninterrupted window. Interrupting a running program can itself cause
   * MicroPython to print the friendly-REPL banner (e.g. processing a Ctrl+B
   * that was queued earlier and only now gets read), so clearing the buffer
   * again in between those two sends — like checkPrompt() does for its own
   * one-shot check — would risk wiping that exact evidence out from under us
   * right as it arrives.
   * @param {number} attempts
   * @returns {Promise<boolean>} true once the board is confirmed idle at the REPL
   */
  async getToREPL(attempts = 10) {
    if (await this.checkPrompt()) return true;
    for (let i = 0; i < attempts; i++) {
      this._rxBuffer = ''; // fresh evidence window for this attempt only
      await this.send('\r\x03\x03'); // Ctrl+C ×2 — interrupts a running program
      await this._delay(200); // let any resulting traceback/prompt arrive
      await this.exitRawRepl(); // in case we're left at the raw '>' prompt
      if (this._rxBuffer.includes('>>>')) return true;
    }
    return false;
  }

  /**
   * Upload a Python file to the XRP filesystem via raw REPL.
   * Only writes the file — it does not run it. A saved main.py will run the
   * next time the board powers up or is reset, but saving alone leaves the
   * board idle at the REPL (and, over BLE, keeps advertising) so it's still
   * reachable right after a save.
   * @param {string} filename
   * @param {string} content
   */
  async uploadFile(filename, content) {
    if (!this.connected) throw new Error('Not connected to XRP');
    if (!/^[A-Za-z0-9_.-]+$/.test(filename)) throw new Error('Invalid upload filename');
    const data = this.encoder.encode(content);
    let sequence = 0;
    // Large HTML-containing drivers must not be sent as one huge Python
    // literal. Each small write is acknowledged after the flash operation.
    const command = async code => {
      const marker = `XRP_UPLOAD_${sequence++}_OK`;
      this._rxBuffer = '';
      await this.send(code + `\nprint('${marker}')\n`);
      await this.send('\x04');
      await this._waitForResponse('\x04>', 10000);
      if (!this._rxBuffer.includes(marker)) {
        throw new Error(`Upload of ${filename} failed: ${this._rxBuffer.replace(/[\x00-\x1f]/g, ' ').trim()}`);
      }
    };
    try {
      if (!await this.getToREPL()) throw new Error('Robot did not return to the REPL');
      this._rxBuffer = '';
      await this.send('\x01');
      await this._waitForResponse('raw REPL; CTRL-B to exit\r\n>', 3000);
      await command(`import ubinascii, os\n_xrp_upload = open('${filename}.upload', 'wb')`);
      for (let offset = 0; offset < data.length; offset += 256) {
        const bytes = data.slice(offset, offset + 256);
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        await command(`assert _xrp_upload.write(ubinascii.unhexlify('${hex}')) == ${bytes.length}`);
      }
      await command(`_xrp_upload.close()\nassert os.stat('${filename}.upload')[6] == ${data.length}\nos.rename('${filename}.upload', '${filename}')`);
      // Replacing a file does not replace MicroPython's cached module. Close
      // the remote listener before dropping its module so port 80 is released.
      if (/^[A-Za-z_][A-Za-z0-9_]*\.py$/.test(filename) && filename !== 'main.py') {
        const module = filename.slice(0, -3);
        const cleanup = module === 'RemoteControl'
          ? "    _xrp_active = getattr(_xrp_module, '_active_remote', None)\n" +
            "    if _xrp_active is not None:\n        _xrp_active.close()\n"
          : '';
        await command(`import sys\n_xrp_module = sys.modules.get('${module}')\n` +
          `if _xrp_module is not None:\n${cleanup}    del sys.modules['${module}']\n` +
          'del _xrp_module');
      }
      this.onData?.(`File saved: ${filename}\n`);
    } finally {
      await this.exitRawRepl().catch(() => {});
    }
  }

  /**
   * Run code directly via raw REPL
   * @param {string} pythonCode
   */
  async runProgram(pythonCode) {
    if (!this.connected) {
      throw new Error('Not connected to XRP');
    }
    await this.executeCode(pythonCode);
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
