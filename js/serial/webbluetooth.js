/**
 * XRP Blocks — Web Bluetooth Connection Manager
 *
 * Connects to the XRP robot over BLE using the Nordic UART Service (NUS).
 * UUIDs sourced from Open-STEM/XRPWeb bluetoothconnection.ts (the official XRP web IDE).
 *
 * Service:  6e400001-b5a3-f393-e0a9-e50e24dcca9e  (NUS)
 * TX char:  6e400002-b5a3-f393-e0a9-e50e24dcca9e  (PC → Board, Write)
 * RX char:  6e400003-b5a3-f393-e0a9-e50e24dcca9e  (Board → PC, Notify)
 *
 * REPL protocol sourced from Open-STEM/XRPWeb connection.ts + bluetoothconnection.ts.
 * Key differences vs USB:
 *  - All writes are serialised through a promise queue (GATT can't handle concurrent writes)
 *  - We must wait for '>>>' or 'raw REPL' echo before sending code
 *  - '##XRPSTOP##' is the BLE-specific stop signal the XRP firmware listens for
 */

import { XRPTransportBase } from './base-transport.js';

// Nordic UART Service UUIDs (confirmed from Open-STEM/XRPWeb source)
const UART_SERVICE_UUID  = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TX_CHAR_UUID       = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // PC → Board (Write)
const RX_CHAR_UUID       = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Board → PC (Notify)

// Max bytes per BLE write (BLE 5.0 is 250 bytes; matches XRPWeb's XRP_SEND_BLOCK_SIZE)
const BLE_CHUNK_SIZE = 250;

// Magic stop string the XRP firmware BLE handler listens for
const BLE_STOP_MSG = '##XRPSTOP##';

export class XRPBluetooth extends XRPTransportBase {
  constructor() {
    super();

    // BLE GATT handles
    this._device    = null;
    this._server    = null;
    this._txChar    = null; // Write characteristic (PC → Board)
    this._rxChar    = null; // Notify characteristic (Board → PC)

    // Serial write queue — BLE GATT cannot handle concurrent writeValue() calls
    this._writeQueue = Promise.resolve();

    // Incoming data buffer for waitForResponse()
    this._rxBuffer = '';
    this._rxWaiters = []; // [{pattern, resolve}]

    // Bound handlers
    this._onNotify         = this._handleNotify.bind(this);
    this._onGattDisconnect = this._handleGattDisconnect.bind(this);
  }

  // ── Static capability check ───────────────────────────────────────────────

  static isSupported() {
    return 'bluetooth' in navigator;
  }

  // ── Connect / Disconnect ──────────────────────────────────────────────────

  async connect(device = null) {
    if (!XRPBluetooth.isSupported()) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please use Chrome or Edge.'
      );
    }

    try {
      // Filter by device name prefix — XRP doesn't advertise NUS service UUID in adverts
      // This matches xrpcode.wpi.edu (Open-STEM/XRPWeb)
      this._device = device || await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'XRP' }],
        optionalServices: [UART_SERVICE_UUID],
      });

      this._device.addEventListener('gattserverdisconnected', this._onGattDisconnect);

      // If previously connected, disconnect cleanly first (matches XRPWeb)
      if (this._device.gatt.connected) {
        await this._device.gatt.disconnect();
      }

      this._server = await this._device.gatt.connect();

      const service = await this._server.getPrimaryService(UART_SERVICE_UUID);

      // TX: Write (PC → Board)
      this._txChar = await service.getCharacteristic(TX_CHAR_UUID);

      // RX: Notify (Board → PC)
      this._rxChar = await service.getCharacteristic(RX_CHAR_UUID);
      await this._rxChar.startNotifications();
      this._rxChar.addEventListener('characteristicvaluechanged', this._onNotify);

      this.connected = true;
      if (this.onConnect) this.onConnect();

    } catch (err) {
      if (err.name === 'NotFoundError') {
        return; // User cancelled the picker
      }
      this.connected = false;
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  async disconnect() {
    this.connected = false;

    if (this._rxChar) {
      try { await this._rxChar.stopNotifications(); } catch (_) {}
      this._rxChar.removeEventListener('characteristicvaluechanged', this._onNotify);
      this._rxChar = null;
    }

    this._txChar = null;

    if (this._device) {
      this._device.removeEventListener('gattserverdisconnected', this._onGattDisconnect);
    }

    if (this._server && this._server.connected) {
      try { this._server.disconnect(); } catch (_) {}
    }

    this._server = null;
    this._device = null;
    this._rxBuffer = '';
    this._rxWaiters = [];

    if (this.onDisconnect) this.onDisconnect();
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  /**
   * Enqueue a write to the TX characteristic.
   * BLE GATT cannot handle concurrent writeValue() calls — all writes go through a serial queue.
   * Data is chunked at BLE_CHUNK_SIZE bytes (250, matching XRPWeb).
   */
  async send(data) {
    if (!this.connected || !this._txChar) {
      throw new Error('Not connected to XRP');
    }

    const bytes = this.encoder.encode(data);

    for (let i = 0; i < bytes.length; i += BLE_CHUNK_SIZE) {
      const chunk = bytes.slice(i, i + BLE_CHUNK_SIZE);
      await this._enqueue(chunk);
    }
  }

  /**
   * Send a raw Uint8Array (already bytes, not a string) in BLE_CHUNK_SIZE blocks.
   * Used by the streaming file upload, which sends binary file content directly.
   */
  async _sendRawBytes(bytes) {
    if (!this.connected || !this._txChar) {
      throw new Error('Not connected to XRP');
    }
    for (let i = 0; i < bytes.length; i += BLE_CHUNK_SIZE) {
      await this._enqueue(bytes.slice(i, i + BLE_CHUNK_SIZE));
    }
  }

  /**
   * Enqueue a raw Uint8Array write through the serial BLE write queue.
   * Returns a Promise that resolves only after the write has completed.
   */
  _enqueue(bytes) {
    // Chain onto the existing queue — never run two writeValue() calls in parallel
    const result = this._writeQueue.then(() =>
      this._txChar?.writeValue(bytes)
    );
    // Update the queue tail; swallow errors so the queue never stops
    this._writeQueue = result.catch(err => {
      console.error('[XRPBluetooth] BLE write failed:', err);
    });
    return result;
  }

  // ── Override REPL protocol ────────────────────────────────────────────────
  //
  // Over BLE the raw-REPL handshake is the same Ctrl+C / Ctrl+A sequence as USB —
  // we just wait for the board's echo before streaming code, because GATT writes
  // can outrun the firmware if we don't.
  //
  // IMPORTANT: the magic string "##XRPSTOP##" is NOT used here. The XRP firmware
  // reacts to it by rebooting, which tears down the BLE/GATT link — every write
  // after that fails with "GATT operation failed for unknown reason". It is only
  // used by stopExecution() (the Stop button), where a reboot is the desired
  // outcome. This mirrors Open-STEM/XRPWeb, whose run path (goCommand) never
  // sends the stop message.

  /**
   * Interrupt + enter raw REPL, then wait for the board's confirmation echo.
   */
  async enterRawRepl() {
    // Standard MicroPython raw REPL entry sequence (no reboot — see note above)
    await this.send('\r\x03\x03'); // Ctrl+C × 2: interrupt any running program
    await this._delay(100);
    await this.send('\r\x01');     // Ctrl+A → raw REPL

    // Wait up to 3 s for the board to echo "raw REPL" (or ">")
    await this._waitForResponse('raw REPL', 3000).catch(() => {
      // Timed out waiting — board may already be at prompt, continue anyway
    });
    await this._delay(100);
  }

  /**
   * Execute code: enter raw REPL, send code in 250-byte chunks, Ctrl+D to run.
   */
  async executeCode(pythonCode) {
    if (!this.connected) throw new Error('Not connected to XRP');

    await this.enterRawRepl();

    try {
      // Send code in BLE_CHUNK_SIZE chunks (matching XRPWeb goCommand)
      const chunks = Math.ceil(pythonCode.length / BLE_CHUNK_SIZE) + 1;
      for (let i = 0; i < chunks; i++) {
        const slice = pythonCode.slice(i * BLE_CHUNK_SIZE, (i + 1) * BLE_CHUNK_SIZE);
        await this.send(slice);
      }

      await this.send('\x04'); // Ctrl+D — execute
      await this._delay(200);
    } finally {
      // Always try to leave raw REPL, even if something above threw — otherwise
      // the board is left stuck in raw REPL and stops responding to the REPL.
      await this.exitRawRepl().catch(() => {});
    }
  }

  /**
   * Exit raw REPL (Ctrl+B) and wait for normal prompt.
   */
  async exitRawRepl() {
    await this.send('\x02'); // Ctrl+B
    await this._delay(200);
  }

  /**
   * Upload a file to the board — overridden for BLE.
   *
   * The base implementation builds one big `f.write('<escaped>')` and runs it in a
   * single burst. On the RP2040 that flash write starves the BLE radio long enough
   * to drop the GATT link ("GATT operation failed for unknown reason"). It works
   * over USB only because the wired REPL survives the stall.
   *
   * Instead we mirror Open-STEM/XRPWeb: prime the board with a small writer script
   * that disables the Ctrl-C interrupt (so binary bytes pass through) and writes the
   * file ONE 250-byte block at a time, looping back to read the next block from the
   * BLE stream between writes. That interleaving keeps the radio serviced, so the
   * link survives. File content is streamed as raw bytes, not an escaped string.
   */
  async uploadFile(filename, content) {
    if (!this.connected) throw new Error('Not connected to XRP');

    const data = this.encoder.encode(content);
    const blocksize = BLE_CHUNK_SIZE;

    // Writer script — runs on the board, blocks on stdin reading `data.length` bytes.
    // Indentation must stay valid Python; keep it exactly as written.
    const script =
      'import micropython\n' +
      'import sys\n' +
      'import time\n' +
      'blocksize = ' + blocksize + '\n' +
      'micropython.kbd_intr(-1)\n' +          // disable Ctrl-C so binary bytes pass through
      'time.sleep(0.035)\n' +
      "print('started')\n" +                  // handshake: we wait for this before streaming
      "w = open('" + filename + "','wb')\n" +
      'byte_count_to_read = ' + data.length + '\n' +
      'read_byte_count = 0\n' +
      'read_buffer = bytearray(blocksize)\n' +
      'specialEndIndex = blocksize\n' +
      'if byte_count_to_read > 0:\n' +
      '  while True:\n' +
      '    read_byte_count = read_byte_count + sys.stdin.buffer.readinto(read_buffer, blocksize)\n' +
      '    if read_byte_count >= byte_count_to_read:\n' +
      '        specialEndIndex = blocksize - (read_byte_count - byte_count_to_read)\n' +
      '        read_byte_count = read_byte_count - blocksize + specialEndIndex\n' +
      '    w.write(bytearray(read_buffer[0:specialEndIndex]))\n' +
      '    if read_byte_count >= byte_count_to_read:\n' +
      '        break\n' +
      'w.close()\n' +
      'micropython.kbd_intr(0x03)\n';         // restore Ctrl-C

    // Enter raw REPL, run the writer, and wait until it signals it's ready for bytes.
    await this.enterRawRepl();
    await this.send(script);
    await this.send('\x04'); // Ctrl+D — execute the writer script
    await this._waitForResponse('started', 5000);

    // Stream the content as fixed-size blocks. The final short block is padded to a
    // full blocksize (0xFF) so the board's readinto() always gets a complete block;
    // the script trims the padding via specialEndIndex.
    const numberOfChunks = Math.ceil(data.length / blocksize);
    for (let b = 0; b < numberOfChunks; b++) {
      let block = data.slice(b * blocksize, (b + 1) * blocksize);
      if (block.length < blocksize) {
        const padded = new Uint8Array(blocksize).fill(0xFF);
        padded.set(block, 0);
        block = padded;
      }
      await this._sendRawBytes(block);
    }

    // Let the writer finish and the raw prompt return, then leave raw REPL.
    await this._waitForResponse('>', 5000).catch(() => {});
    await this._delay(100);
    await this.exitRawRepl();

    // Deploy only saves the file — it does not run it. main.py will run on the
    // next power-up/reset; running it immediately here would occupy the board
    // for as long as the program runs, leaving it unable to service further
    // REPL/BLE traffic.
  }

  /**
   * Stop a running program via the BLE-specific stop signal.
   *
   * "##XRPSTOP##" is the only reliable way to interrupt a running program over
   * BLE: the firmware watches for it and reboots into a fresh REPL. That reboot
   * drops the GATT link, so we send the stop message and nothing more — any
   * follow-up write would land on a disconnected server and throw. The board
   * (and our gattserverdisconnected handler) takes it from here.
   */
  async stopExecution() {
    if (!this.connected || !this._txChar) return false;
    try {
      await this.send(BLE_STOP_MSG);
    } catch (_) {
      // Link may already be dropping as the board reboots — ignore.
    }
    return false;
  }

  /**
   * Regain the REPL over BLE — overridden because USB's approach (hammer
   * Ctrl+C and recheck) isn't reliable here: a busy program can starve the
   * BLE radio the same way a big flash write does (see uploadFile() above),
   * so repeated writes are more likely to drop the GATT link than help.
   * Mirrors the official XRP web IDE: if the board isn't already idle, send
   * the stop signal to force a firmware reboot and let the resulting
   * gattserverdisconnected event (_handleGattDisconnect) drive reconnection.
   */
  async getToREPL() {
    if (await this.checkPrompt()) return true;
    await this.stopExecution();
    return false;
  }

  // ── Incoming data handling ────────────────────────────────────────────────

  _handleNotify(event) {
    const text = this.decoder.decode(event.target.value);

    // Append to buffer for waitForResponse() callers
    this._rxBuffer += text;
    this._checkWaiters();

    // Forward to the app's onData callback (terminal display)
    if (this.onData) this.onData(text);
  }

  /**
   * Wait until the RX stream contains `pattern` (or timeout ms pass).
   */
  _waitForResponse(pattern, timeout = 5000) {
    return new Promise((resolve, reject) => {
      // Check if already in buffer
      if (this._rxBuffer.includes(pattern)) {
        this._rxBuffer = '';
        resolve();
        return;
      }

      const waiter = { pattern, resolve, reject };
      this._rxWaiters.push(waiter);

      const timer = setTimeout(() => {
        const idx = this._rxWaiters.indexOf(waiter);
        if (idx !== -1) this._rxWaiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for: ${pattern}`));
      }, timeout);

      waiter.timer = timer;
    });
  }

  _checkWaiters() {
    this._rxWaiters = this._rxWaiters.filter(waiter => {
      if (this._rxBuffer.includes(waiter.pattern)) {
        clearTimeout(waiter.timer);
        this._rxBuffer = '';
        waiter.resolve();
        return false; // remove from list
      }
      return true; // keep waiting
    });
  }

  _handleGattDisconnect() {
    if (!this.connected) return;
    this.connected = false;
    this._txChar = null;
    this._rxChar = null;
    this._server = null;
    if (this.onDisconnect) this.onDisconnect();
  }
}
