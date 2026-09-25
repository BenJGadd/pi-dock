// Runs inside the sidebar page: draws Pi with xterm.js and wires the page's features together.
//
// Messages between this page and the extension (extension.js PAGE_MESSAGES has the other half):
//   to the extension   {type:'snapshot', snapshot}   the screen, for the page that replaces this one
//                      {type:'resolve', id, paths}        which of these paths are files?
//                      {type:'open', path, line, column}  a path in the output was Ctrl+clicked
//                      {type:'image', mime, dataUrl}     an image was pasted into the terminal
//                      {type:'focus', focused}           the page gained or lost keyboard focus
//   from the extension {type:'keys', keys}   the shortcuts changed
//                      {type:'paste', text}  text to type into Pi, as one paste
//                      {type:'resolved', id, found}  the answer: path -> whether it is a file
//
// The page files are plain scripts, loaded in the order lib/webview.js lists them, and share their
// top-level declarations the way one script would: a `const` or `function` at the top of one is in
// scope for every file loaded after it. That is how the single file they came from shared them, so
// nothing is put on `window`, and no two files may declare the same name (test/page.test.js
// checks). This file loads last and uses all of them: theme.js, keys.js, paste.js,
// links.js, snapshot.js, socket.js.
//
// `Terminal`, `FitAddon`, `SerializeAddon`, `WebglAddon` and `Unicode11Addon` come from the xterm.js files loaded
// before the page files. `acquireVsCodeApi` is how a page talks back to the extension. `start` is
// last and lists everything a page does.

'use strict';

const RESIZE_MIN_GAP_MS = 45; // smallest gap between two resizes, so Pi can finish repainting between them

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
 * Creates the terminal and the add-ons the sidebar needs: fit to measure the panel, serialize for
 * snapshots, the Unicode 11 table so an emoji is two cells wide as it is for Pi, and WebGL to draw
 * quickly.
 *
 * @param {object} args
 * @param {Record<string, *>} args.options Font and cursor options from the extension (lib/options.js).
 * @param {'6'|'11'} args.unicodeVersion The width table VS Code's own terminal uses (lib/options.js).
 * @param {Record<string, string>} args.theme The colours to start with.
 * @param {HTMLElement} args.container Where to draw.
 * @returns {{ term: *, fit: *, serialize: * }} The terminal, already on screen, and two add-ons.
 */
function createTerminal({ options, unicodeVersion, theme, container }) {
  const term = new Terminal({ ...options, fontFamily: fontStack(options.fontFamily || '', installedFont), theme });
  const fit = new FitAddon.FitAddon();
  const serialize = new SerializeAddon.SerializeAddon();
  term.loadAddon(fit);
  term.loadAddon(serialize);
  term.loadAddon(new Unicode11Addon.Unicode11Addon());
  term.unicode.activeVersion = unicodeVersion;
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
    webgl.onContextLoss(() => webgl.dispose()); // if the graphics card drops the renderer, go back to the slower way
    term.loadAddon(webgl);
  } catch (_) {
    // no WebGL here
  }
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

/**
 * Builds the page from the settings the extension wrote into it.
 *
 * @param {import('../types').PageConfig} config
 */
function start(config) {
  const container = document.getElementById('term');
  const say = statusLine(document.getElementById('status'));
  const host = acquireVsCodeApi();

  const { term, fit, serialize } = createTerminal({ options: config.options, unicodeVersion: config.unicodeVersion, theme: currentTheme(config.theme), container });
  followTheme(term, config.theme);

  const kitty = mirrorKittyFlags(term);
  postSnapshots({ term, serialize, kitty, post: (message) => host.postMessage(message) });
  let restored = Boolean(config.restore);
  if (restored) restoreSnapshot(term, config.restore);

  let keys = config.keys;
  window.addEventListener('message', ({ data }) => {
    if (!data) return;
    if (data.type === 'keys') keys = data.keys;
    if (data.type === 'paste' && typeof data.text === 'string') {
      term.paste(data.text);
      term.focus();
    }
    if (data.type === 'resolved') resolvedPaths(data);
  });
  installKeyHandler(term, () => keys);
  installImagePaste(container, (message) => host.postMessage(message));
  installLinkProvider(term, (message) => host.postMessage(message));

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
  window.addEventListener('focus', () => {
    term.focus();
    host.postMessage({ type: 'focus', focused: true });
  });
  window.addEventListener('blur', () => host.postMessage({ type: 'focus', focused: false }));
  fit.fit();
  session.open();
}

// In the sidebar, start as soon as the page loads. Under `node --test` there is no page, so this is
// skipped and only the helpers above are used.
if (typeof document !== 'undefined' && document.getElementById('pi-config')) {
  start(JSON.parse(document.getElementById('pi-config').textContent));
}
