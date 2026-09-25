// The connection to ttyd, and ttyd's message format.
//
// What ttyd expects, in full, unchanged since ttyd 1.7.0:
//   connect  ws://host/<token>/ws  asking for the "tty" subprotocol
//   to ttyd    first message  {"AuthToken":"","columns":C,"rows":R}
//              "0" + keys typed          "1" + {"columns":C,"rows":R} on resize
//   from ttyd  "0" + terminal output     "1" a title    "2" its own settings  (last two ignored)
//
// Needs nothing from the other page files; page/main.js uses it.

'use strict';

const encoder = new TextEncoder();

/**
 * Builds one message for ttyd: a character saying what it is, then the contents.
 *
 * @param {string} command '0' for keys typed, '1' for a new size.
 * @param {string} payload
 * @returns {Uint8Array}
 */
const frame = (command, payload) => encoder.encode(command + payload);

/**
 * Splits a message from ttyd into that first character and the rest.
 *
 * @param {string|ArrayBuffer} data One websocket message. ttyd sends either kind.
 * @returns {{ command: string, bytes: Uint8Array }} '0' is terminal output. '1' and '2' are a title
 *   and ttyd's own settings, neither of which is wanted.
 */
function decodeFrame(data) {
  const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
  return { command: String.fromCharCode(bytes[0]), bytes: bytes.subarray(1) };
}

const RETRY_MS = 250;
const RETRY_LIMIT = 40; // a refused connection is usually the previous page's still closing
const RETRY_QUIET = 4; // tries to make before saying anything, so a normal reconnect stays silent

/**
 * Creates the connection to ttyd: the retry while the previous page's connection closes, the first
 * message reporting the size, output into the terminal, and what to do when it closes.
 *
 * @param {object} args
 * @param {string} args.url ttyd's address, from the extension.
 * @param {*} args.term
 * @param {(text: string) => void} args.say Shows a line below the terminal.
 * @param {() => void} args.onAttach Gets the terminal ready, just before the size is sent.
 * @param {() => void} args.onExit A working connection ended: Pi quit, or ttyd went away.
 * @returns {{ open: () => void, send: (bytes: Uint8Array) => void, hasEnded: () => boolean }}
 *   Nothing connects until `open` is called.
 */
function connectSocket({ url, term, say, onAttach, onExit }) {
  let socket = null;
  let attempts = 0;
  let ended = false;

  function open() {
    let opened = false;
    ended = false;
    socket = new WebSocket(url, ['tty']);
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      opened = true;
      attempts = 0;
      say('');
      onAttach();
      socket.send(JSON.stringify({ AuthToken: '', columns: term.cols, rows: term.rows }));
      term.focus();
    };
    socket.onmessage = (message) => {
      const { command, bytes } = decodeFrame(message.data);
      if (command === '0') term.write(bytes);
    };
    socket.onclose = () => (opened ? end() : retry());
  }

  /** Handles Pi quitting. Waits for Enter rather than restarting it in a loop. */
  function end() {
    ended = true;
    onExit();
    say('Pi exited. Press Enter to start it again.');
  }

  /**
   * Retries a connection that never opened, most likely the previous page's still closing. That
   * clears within a try or two, so nothing is said at first, or every sidebar move would flash a
   * message. Past that, say something rather than leaving an empty panel.
   */
  function retry() {
    if (++attempts >= RETRY_LIMIT) return say('Could not reach Pi. Run "Pi Dock: Restart Pi".');
    if (attempts === RETRY_QUIET) say('Connecting to Pi…');
    setTimeout(open, RETRY_MS);
  }

  return {
    open,
    send: (bytes) => socket && socket.readyState === WebSocket.OPEN && socket.send(bytes),
    hasEnded: () => ended,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { frame, decodeFrame };
}
