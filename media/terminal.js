// Runs inside the sidebar page: draws Pi with xterm.js and talks to ttyd.
//
// Everything visual lives here because VS Code defines each theme colour as a CSS variable in the
// pages it shows, and this is that page. The extension never sends a colour.
//
// What ttyd expects, in full, unchanged since ttyd 1.7.0:
//   connect  ws://host/<token>/ws  asking for the "tty" subprotocol
//   to ttyd    first message  {"AuthToken":"","columns":C,"rows":R}
//              "0" + keys typed          "1" + {"columns":C,"rows":R} on resize
//   from ttyd  "0" + terminal output     "1" a title    "2" its own settings  (last two ignored)
//
// Plain helpers come first so the tests can run them under Node, then the browser parts. `start` is
// last and lists everything a page does.
//
// `Terminal`, `FitAddon`, `SerializeAddon` and `WebglAddon` come from the xterm.js files loaded
// before this one. `acquireVsCodeApi` is how a page talks back to the extension.

'use strict';

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

// Each xterm.js colour and the VS Code colour it comes from. A list means "first one that resolves".
//
// VS Code publishes a variable for every colour it has a value for, defaults included, so a missing
// one means the theme really left it unset. It is then left out here too and xterm.js uses its own
// default, as VS Code's terminal does.
const THEME_TOKENS = {
  // VS Code's terminal uses terminal.background only if the theme names it, and otherwise blends
  // into whatever is behind it. Here, that is the sidebar.
  background: ['terminal.background', 'sideBar.background'],
  foreground: 'terminal.foreground',
  cursor: 'terminalCursor.foreground',
  cursorAccent: 'terminalCursor.background',
  selectionBackground: 'terminal.selectionBackground',
  selectionForeground: 'terminal.selectionForeground',
  selectionInactiveBackground: 'terminal.inactiveSelectionBackground',
  // xterm.js draws its own scrollbar and takes these three colours from the theme, as VS Code does.
  scrollbarSliderBackground: 'scrollbarSlider.background',
  scrollbarSliderHoverBackground: 'scrollbarSlider.hoverBackground',
  scrollbarSliderActiveBackground: 'scrollbarSlider.activeBackground',
  // The 16 standard terminal colours, in their normal and bright versions.
  ...Object.fromEntries(
    ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'].flatMap((name) => [
      [name.toLowerCase(), `terminal.ansi${name}`],
      [`bright${name}`, `terminal.ansiBright${name}`],
    ]),
  ),
};

/**
 * The CSS variable a VS Code colour is published under.
 *
 * @param {string} token e.g. 'terminal.ansiRed'
 * @returns {string} e.g. '--vscode-terminal-ansiRed'
 */
const cssVar = (token) => `--vscode-${token.replace(/\./g, '-')}`;

/**
 * The colours to give xterm.js, read from whatever theme is on right now.
 *
 * @param {(cssVariableName: string) => string} read Returns a variable's value, or '' if there is none.
 * @returns {Record<string, string>} Only the colours that were found.
 */
function readTheme(read) {
  /** @type {Record<string, string>} */
  const theme = {};
  for (const [key, tokens] of Object.entries(THEME_TOKENS)) {
    for (const token of [].concat(tokens)) {
      const value = read(cssVar(token)).trim();
      if (value) {
        theme[key] = value;
        break;
      }
    }
  }
  return theme;
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

/**
 * Split a CSS font list on its commas, leaving commas inside quoted names alone.
 *
 * @param {string} list e.g. `'Droid Sans Mono', "Fira Code", monospace`
 * @returns {string[]} The names, still quoted the way they were written.
 */
function splitFamilies(list) {
  return (list.match(/(?:"[^"]*"|'[^']*'|[^,])+/g) || []).map((family) => family.trim()).filter(Boolean);
}

/**
 * Returns a font list with only the fonts this machine has.
 *
 * VS Code's default list starts with 'Droid Sans Mono', which most Linux machines lack. The browser
 * then substitutes a font whose letters are not all one width, and xterm.js measures its grid from
 * that, giving stretched, uneven columns.
 *
 * @param {string} list A CSS font list.
 * @param {(family: string) => boolean} installed
 * @returns {string} Always ends in monospace as a last resort.
 */
function fontStack(list, installed) {
  const generic = /^(monospace|ui-monospace|sans-serif|serif|system-ui)$/i;
  const families = splitFamilies(list).filter((family) => generic.test(family) || installed(family));
  if (!families.some((family) => /^(ui-)?monospace$/i.test(family))) families.push('monospace');
  return families.join(', ');
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

// The four actions the page handles itself, in the order a key press is checked against them. The
// names match the ones lib/keybindings.js uses in `keys.terminal`.
const PAGE_ACTIONS = ['copy', 'paste', 'scrollUp', 'scrollDown'];

/**
 * Checks a key press against one step of a shortcut.
 *
 * Matched by physical key, and for letters by character too, which covers layouts that move the
 * letters around. Modifiers must match exactly, so Ctrl+P is not Ctrl+Shift+P.
 *
 * @param {KeyboardEvent} event
 * @param {import('../types').Step} step
 * @returns {boolean}
 */
function stepMatches(event, step) {
  return (
    event.ctrlKey === step.ctrl &&
    event.shiftKey === step.shift &&
    event.altKey === step.alt &&
    event.metaKey === step.meta &&
    (event.code === step.code || (step.key !== undefined && event.key.toLowerCase() === step.key))
  );
}

/**
 * Checks a shortcut's two conditions. See lib/keybindings.js for what they mean.
 *
 * @param {import('../types').Chord} chord
 * @param {import('../types').TerminalState} state
 * @returns {boolean}
 */
const chordApplies = (chord, state) =>
  (!chord.selection || state.hasSelection) && (!chord.normalBuffer || state.buffer === 'normal');

/**
 * Returns the first shortcut whose conditions hold and whose first key is the one pressed.
 *
 * @param {import('../types').Chord[]|undefined} chords
 * @param {KeyboardEvent} event
 * @param {import('../types').TerminalState} state
 * @param {boolean} singleStepOnly Set for the actions this page performs. The first key of a
 *   two-key shortcut belongs to VS Code, which is waiting for the second.
 * @returns {import('../types').Chord|undefined}
 */
function matchChord(chords, event, state, singleStepOnly) {
  return (chords || []).find(
    (chord) => (!singleStepOnly || chord.steps.length === 1) && chordApplies(chord, state) && stepMatches(event, chord.steps[0]),
  );
}

/**
 * Returns which of this page's four actions a key press triggers.
 *
 * @param {KeyboardEvent} event
 * @param {import('../types').KeyConfig} keys
 * @param {import('../types').TerminalState} state
 * @returns {string|null} A name from PAGE_ACTIONS, or null.
 */
const pageAction = (event, keys, state) =>
  PAGE_ACTIONS.find((name) => matchChord(keys.terminal[name], event, state, true)) || null;

/**
 * Returns the shortcut a key press starts, out of those the user wants VS Code to have.
 *
 * @param {KeyboardEvent} event
 * @param {import('../types').KeyConfig} keys
 * @param {import('../types').TerminalState} state
 * @returns {import('../types').Chord|undefined}
 */
const escapeChord = (event, keys, state) => matchChord(keys.escape, event, state, false);

// ---------------------------------------------------------------------------
// The terminal state the next page will need
// ---------------------------------------------------------------------------

/**
 * Keeps a copy of the Kitty keyboard protocol's flags, which programs use to ask for more detail
 * about key presses.
 *
 * The protocol keeps a stack per screen: add a set (CSI > flags u), take one off (CSI < n u), or
 * change the top one (CSI = flags ; mode u). xterm.js tracks this but offers no way to read it back,
 * so a page replacing this one could not inherit it. See restoreSnapshot.
 *
 * @returns {{
 *   push: (screen: string, flags: number) => void,
 *   pop: (screen: string, count: number) => void,
 *   set: (screen: string, flags: number, mode: number) => void,
 *   reset: () => void,
 *   state: () => import('../types').KittyState,
 * }}
 */
function kittyTracker() {
  const stacks = { normal: [], alternate: [] };
  return {
    push(screen, flags) {
      if (stacks[screen].length < 16) stacks[screen].push(flags); // a program must not grow it forever
    },
    pop(screen, count) {
      stacks[screen].splice(Math.max(0, stacks[screen].length - count));
    },
    set(screen, flags, mode) {
      const stack = stacks[screen];
      if (!stack.length) stack.push(0);
      const top = stack.length - 1;
      stack[top] = mode === 3 ? stack[top] & ~flags : mode === 2 ? stack[top] | flags : flags; // 1 replace, 2 add, 3 remove
    },
    reset() {
      stacks.normal.length = 0;
      stacks.alternate.length = 0;
    },
    state: () => ({ normal: [...stacks.normal], alternate: [...stacks.alternate] }),
  };
}

// ---------------------------------------------------------------------------
// ttyd's messages
// ---------------------------------------------------------------------------

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
 *   and ttyd's own settings, neither of which we want.
 */
function decodeFrame(data) {
  const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
  return { command: String.fromCharCode(bytes[0]), bytes: bytes.subarray(1) };
}

// ---------------------------------------------------------------------------
// The browser parts
// ---------------------------------------------------------------------------

const RETRY_MS = 250;
const RETRY_LIMIT = 40; // a refused connection is usually the previous page's still closing
const RETRY_QUIET = 4; // tries to make before saying anything, so a normal reconnect stays silent
const SNAPSHOT_MS = 800; // no more than one snapshot this often, while output keeps coming
const SNAPSHOT_MAX_CHARS = 2000000; // bigger than this and only recent history is kept
const SNAPSHOT_FALLBACK_LINES = 500; // how much history to keep when the whole lot is too big
const CHORD_TIMEOUT_MS = 5000; // how long we assume VS Code waits for the second key of a shortcut
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph']);
const RESIZE_MIN_GAP_MS = 45; // smallest gap between two resizes, so Pi can finish repainting between them

// --- the page ---

/**
 * Returns a setter for the line below the terminal, used for connection news.
 *
 * @param {HTMLElement} element
 * @returns {(text: string) => void} Pass '' to hide the line again.
 */
function statusLine(element) {
  return (text) => {
    element.textContent = text;
    element.hidden = !text;
  };
}

/**
 * Returns the colours to use now: VS Code's, with piDock.theme on top.
 *
 * @param {Record<string, string>} overrides piDock.theme.
 * @returns {Record<string, string>}
 */
const currentTheme = (overrides) => {
  const styles = getComputedStyle(document.documentElement); // live, so read it once for all 40-odd colours
  return { ...readTheme((name) => styles.getPropertyValue(name)), ...overrides };
};

/** @type {CanvasRenderingContext2D|null} reused, because measuring happens many times */
let measureContext = null;

/**
 * Measures how wide a fixed piece of text comes out in a font list.
 *
 * @param {string} families A CSS font list.
 * @returns {number} Width in pixels.
 */
function textWidth(families) {
  measureContext = measureContext || document.createElement('canvas').getContext('2d');
  measureContext.font = `16px ${families}`;
  return measureContext.measureText('mmmmmmmmmmlli').width;
}

/**
 * Checks whether a font is installed, by measuring it twice with a different fallback behind it.
 * Same width both times means the font itself was used; different means the fallback was.
 *
 * @param {string} family
 * @returns {boolean}
 */
const installedFont = (family) => textWidth(`${family}, monospace`) === textWidth(`${family}, sans-serif`);

// --- the terminal ---

/**
 * Creates the terminal and the three add-ons the sidebar needs: fit to measure the panel, serialize
 * for snapshots, and WebGL to draw quickly.
 *
 * @param {object} args
 * @param {Record<string, *>} args.options Font and cursor options from the extension (lib/options.js).
 * @param {Record<string, string>} args.theme The colours to start with.
 * @param {HTMLElement} args.container Where to draw.
 * @returns {{ term: *, fit: *, serialize: * }} The terminal, already on screen, and two add-ons.
 */
function createTerminal({ options, theme, container }) {
  const term = new Terminal({ ...options, fontFamily: fontStack(options.fontFamily || '', installedFont), theme });
  const fit = new FitAddon.FitAddon();
  const serialize = new SerializeAddon.SerializeAddon();
  term.loadAddon(fit);
  term.loadAddon(serialize);
  term.open(container);
  addWebglRenderer(term);
  return { term, fit, serialize };
}

/**
 * Draws with the graphics card where available. Where it is not, xterm.js is already drawing the
 * slower way, so there is nothing to do.
 *
 * @param {*} term
 */
function addWebglRenderer(term) {
  try {
    const webgl = new WebglAddon.WebglAddon();
    webgl.onContextLoss(() => webgl.dispose()); // if the graphics card drops us, go back to the slower way
    term.loadAddon(webgl);
  } catch (_) {
    // no WebGL here
  }
}

/**
 * Follows the VS Code theme as it changes.
 *
 * VS Code updates its CSS variables in place, so there is no event to listen for; watching the two
 * attributes it touches is how the page notices. This is also the only place that sets the page
 * background, which is what lets terminal.background and piDock.theme reach it.
 *
 * @param {*} term
 * @param {Record<string, string>} overrides piDock.theme.
 */
function followTheme(term, overrides) {
  // Setting term.options.theme repaints everything and, under WebGL, rebuilds the glyph atlas. The
  // observer fires for any attribute VS Code touches, most of which are not colour changes.
  let applied = '';
  const apply = () => {
    const theme = currentTheme(overrides);
    const asText = JSON.stringify(theme);
    if (asText === applied) return;
    applied = asText;
    term.options.theme = theme;
    document.body.style.background = theme.background || '';
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

/**
 * Keeps the terminal filling the panel, resizing no more often than RESIZE_MIN_GAP_MS.
 *
 * Every width change costs Pi a full repaint. At one per animation frame Pi never finishes one
 * before the next begins, so a half-drawn screen is what you see for most of a drag. A floor of tens
 * of milliseconds still reads as following the mouse.
 *
 * The last size always wins: the observer keeps firing while the panel moves, so whatever it is when
 * the movement stops gets its own measurement.
 *
 * @param {*} fit The fit add-on.
 * @param {HTMLElement} container
 */
function fitOnResize(fit, container) {
  let lastRun = 0;
  let scheduled = 0;
  const run = () => {
    scheduled = 0;
    lastRun = Date.now();
    fit.fit();
  };
  new ResizeObserver(() => {
    if (scheduled) return; // one is already waiting, and it will use the size as it is by then
    scheduled = setTimeout(run, Math.max(0, RESIZE_MIN_GAP_MS - (Date.now() - lastRun)));
  }).observe(container);
}

// --- handing the terminal to the next page ---

/**
 * Watches the Kitty flags go by and keeps a copy.
 *
 * @param {*} term
 * @returns {ReturnType<typeof kittyTracker>}
 */
function mirrorKittyFlags(term) {
  const kitty = kittyTracker();
  const screen = () => term.buffer.active.type;
  // Returning false means "we only looked" — xterm.js still handles the sequence itself.
  term.parser.registerCsiHandler({ prefix: '>', final: 'u' }, (params) => (kitty.push(screen(), params[0] || 0), false));
  term.parser.registerCsiHandler({ prefix: '<', final: 'u' }, (params) => (kitty.pop(screen(), params[0] || 1), false));
  term.parser.registerCsiHandler({ prefix: '=', final: 'u' }, (params) => (kitty.set(screen(), params[0] || 0, params[1] || 1), false));
  return kitty;
}

/**
 * Returns the terminal as text, small enough to hand over.
 *
 * Almost always the whole thing. A session past the limit gets recent history instead, because
 * sending nothing leaves the extension holding the last copy that fitted, which every later page
 * then restores, growing staler for as long as the session lives.
 *
 * @param {*} serialize The serialize add-on.
 * @returns {string|null} Null only if even the shortened version is too big to send.
 */
function snapshotText(serialize) {
  const whole = serialize.serialize();
  if (whole.length < SNAPSHOT_MAX_CHARS) return whole;
  const recent = serialize.serialize({ scrollback: SNAPSHOT_FALLBACK_LINES });
  return recent.length < SNAPSHOT_MAX_CHARS ? recent : null;
}

/**
 * Keeps a copy of the terminal with the extension, so the next page carries on where this one left
 * off.
 *
 * Dragging the sidebar destroys this page and builds another joined to the same Pi. Pi switched on
 * the terminal features it needs once, at startup, and they belong to the page that was there then.
 * Starting the new page from this copy gives them back.
 *
 * @param {object} args
 * @param {*} args.term
 * @param {*} args.serialize The serialize add-on.
 * @param {ReturnType<typeof kittyTracker>} args.kitty
 * @param {(message: { type: string, snapshot: import('../types').Snapshot|null }) => void} args.post
 *   Sends a message to the extension.
 */
function postSnapshots({ term, serialize, kitty, post }) {
  let timer = 0;
  term.onWriteParsed(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      const serialized = snapshotText(serialize);
      if (serialized) post({ type: 'snapshot', snapshot: { serialized, kitty: kitty.state(), buffer: term.buffer.active.type } });
    }, SNAPSHOT_MS);
  });
}

/**
 * Starts from the copy the last page left behind.
 *
 * The serialize add-on covers the screen, its history and most terminal settings, but not the Kitty
 * flags, so those are replayed here. Per screen, because each has its own stack and the serialized
 * part may switch screens on the way through.
 *
 * @param {*} term
 * @param {import('../types').Snapshot} restore
 */
function restoreSnapshot(term, restore) {
  const push = (flags) => term.write(`\x1b[>${flags}u`);
  restore.kitty.normal.forEach(push);
  term.write(restore.serialized);
  if (restore.buffer === 'alternate') restore.kitty.alternate.forEach(push);
}

// --- keys ---

/**
 * Returns what the page does for each of its four actions. The shortcuts come from VS Code like any
 * other; only the behaviour is here.
 *
 * @param {*} term
 * @returns {Record<string, (() => void)|null>} `paste` is null because the browser's own paste
 *   already does the work and xterm.js handles it. All that is needed is to stop VS Code interfering.
 */
const pageActionHandlers = (term) => ({
  copy: () => navigator.clipboard.writeText(term.getSelection()).catch((err) => console.warn('Pi Dock: copy failed', err)),
  paste: null,
  scrollUp: () => term.scrollPages(-1),
  scrollDown: () => term.scrollPages(1),
});

/**
 * Decides, for every key press, whether Pi gets it, the page handles it, or VS Code should have it.
 *
 * The helpers above work out what a press means; what is left here is the state a key handler has to
 * remember between presses.
 *
 * @param {*} term
 * @param {() => import('../types').KeyConfig} currentKeys Asked for on every press, because the
 *   extension replaces them whenever VS Code's keybindings change. Hence no shortcut is named here.
 */
function installKeyHandler(term, currentKeys) {
  const handlers = pageActionHandlers(term);
  // With the Kitty protocol on, xterm.js reports releases as well as presses, so a key held back on
  // the way down must be held back on the way up too, or Pi sees a release it never saw pressed.
  const swallowed = new Set();
  // While VS Code waits for the second key of a shortcut, that key has to reach it as well.
  let chordUntil = 0;

  // Returning false tells xterm.js to do nothing with the key. It then travels up to VS Code.
  const keep = (event) => {
    swallowed.add(event.code);
    return false;
  };

  // In Electron, VS Code grabs every Ctrl/Cmd+C, V and X, cancelling the browser's own paste. These
  // four are ours, so the key stops here.
  const runPageAction = (event, handler) => {
    event.stopPropagation();
    if (handler) {
      event.preventDefault();
      handler();
    }
    return keep(event);
  };

  term.attachCustomKeyEventHandler((event) => {
    if (event.type === 'keyup') return !swallowed.delete(event.code);
    if (event.type !== 'keydown' || MODIFIER_KEYS.has(event.key)) return true; // Shift on its own is neither a shortcut nor the awaited key
    if (Date.now() < chordUntil) {
      chordUntil = 0;
      return keep(event);
    }
    const keys = currentKeys();
    const state = { hasSelection: term.hasSelection(), buffer: term.buffer.active.type };

    const action = pageAction(event, keys, state);
    if (action) return runPageAction(event, handlers[action]);

    const escaping = escapeChord(event, keys, state);
    if (!escaping) return true; // nothing claimed it, so it is Pi's
    chordUntil = escaping.steps.length > 1 ? Date.now() + CHORD_TIMEOUT_MS : 0;
    return keep(event);
  });
}

// --- the websocket ---

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

// --- everything a page does, in order ---

/**
 * Builds the page from the settings the extension wrote into it.
 *
 * @param {import('../types').PageConfig} config
 */
function start(config) {
  const container = document.getElementById('term');
  const say = statusLine(document.getElementById('status'));
  const host = acquireVsCodeApi();

  const { term, fit, serialize } = createTerminal({ options: config.options, theme: currentTheme(config.theme), container });
  followTheme(term, config.theme);

  const kitty = mirrorKittyFlags(term);
  postSnapshots({ term, serialize, kitty, post: (message) => host.postMessage(message) });
  let restored = Boolean(config.restore);
  if (restored) restoreSnapshot(term, config.restore);

  let keys = config.keys;
  window.addEventListener('message', (message) => {
    if (message.data && message.data.type === 'keys') keys = message.data.keys;
  });
  installKeyHandler(term, () => keys);

  const session = connectSocket({
    url: config.wsUrl,
    term,
    say,
    onAttach: () => {
      // The first connection carries on from the restored screen, which Pi then redraws over. Any
      // later one means a new process, so start from a blank screen.
      if (restored) restored = false;
      else {
        term.reset();
        kitty.reset();
      }
      fit.fit();
    },
    // Throw the snapshot away, so a dead session is never restored over a new one.
    onExit: () => host.postMessage({ type: 'snapshot', snapshot: null }),
  });

  term.onData((data) => session.send(frame('0', data)));
  term.onResize(({ cols, rows }) => session.send(frame('1', JSON.stringify({ columns: cols, rows }))));
  term.onKey(({ domEvent }) => {
    if (domEvent.key === 'Enter' && session.hasEnded()) session.open();
  });

  fitOnResize(fit, container);
  window.addEventListener('focus', () => term.focus());
  fit.fit();
  session.open();
}

// In the sidebar, start as soon as the page loads. Under `node --test` there is no page, so this is
// skipped and only the helpers above are used.
if (typeof document !== 'undefined' && document.getElementById('pi-config')) {
  start(JSON.parse(document.getElementById('pi-config').textContent));
}

if (typeof module !== 'undefined') {
  module.exports = {
    THEME_TOKENS, cssVar, readTheme,
    splitFamilies, fontStack,
    PAGE_ACTIONS, stepMatches, matchChord, pageAction, escapeChord,
    kittyTracker, frame, decodeFrame,
  };
}
