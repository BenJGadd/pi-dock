// Pi Dock — the real Pi terminal app, inside a VS Code sidebar.
//
// VS Code can show a web page in a sidebar. That page draws a terminal with xterm.js, the same
// library VS Code uses for its own. ttyd runs `pi` and puts its terminal behind a websocket, which
// the page connects to. dtach sits in between and keeps `pi` running when VS Code throws the page
// away. This file is the glue: it starts ttyd and tells the page where to connect.
//
// Terms:
//   webview   a web page VS Code shows inside itself; here, the sidebar's contents
//   ttyd      runs a command and offers its terminal over a websocket
//   dtach     holds a terminal open so the program inside survives losing its connection
//   chord     a shortcut, possibly two key presses long, like Ctrl+K Ctrl+S
//
// Layout:
//   lib/      no VS Code, so `node --test` can check it
//   host/     the VS Code side: settings, the ttyd process, reading shortcuts
//   media/    the page itself: xterm.js, colours, keys, the websocket
//   types.js  the shapes those pass around
//
// No dependencies, no copy of Pi, nothing compiled. Pi comes from your own install and your own
// configuration; Pi Dock draws it and passes keys along.

'use strict';

const vscode = require('vscode');
const { readSettings, workspaceCwd } = require('./host/settings');
const { createServer } = require('./host/server');
const { createKeys } = require('./host/keys');
const { sessionSocket, killSession } = require('./lib/session');
const { xtermOptions } = require('./lib/options');
const { terminalHtml, errorHtml } = require('./lib/webview');

const VIEW_ID = 'piDock.terminal';

// Settings only the page cares about. Changing one rebuilds the page, which keeps Pi running and
// restores its screen, exactly as moving the sidebar does.
const PAGE_SETTINGS = ['fontSize', 'fontFamily', 'theme', 'clientOptions'];
// Settings that decide how ttyd starts. Applying one means a new ttyd, which ends Pi, so we ask.
const SERVER_SETTINGS = ['command', 'persist', 'dtachPath', 'ttydPath', 'extraArgs'];

/** @type {import('vscode').OutputChannel} the "Pi Dock" output channel */
let output;
/** @type {import('vscode').ExtensionContext} */
let context;
/** @type {ReturnType<typeof createServer>} the ttyd process (host/server.js) */
let server;
/** @type {ReturnType<typeof createKeys>} the shortcut lookup (host/keys.js) */
let keybindings;
/** @type {import('vscode').WebviewView|null} the sidebar, while it exists */
let view = null;

/**
 * Starts the extension. VS Code calls this the first time the sidebar opens or a command runs.
 *
 * @param {import('vscode').ExtensionContext} activationContext
 */
function activate(activationContext) {
  context = activationContext;
  output = vscode.window.createOutputChannel('Pi Dock');
  output.appendLine(`[pi-dock] version ${context.extension.packageJSON.version}`);
  server = createServer({ output, onCrash: showError });
  keybindings = createKeys({ context, output });
  endSession(); // anything still running belongs to a window that closed without tidying up
  context.subscriptions.push(output, ...contributions());
}

/** Shuts the extension down. VS Code calls this as the window closes or reloads. */
function deactivate() {
  server.stop();
  endSession(); // closing or reloading ends Pi; only moving the sidebar keeps it
}

/**
 * Registers everything with VS Code. It is all disposed in deactivate.
 *
 * @returns {import('vscode').Disposable[]}
 */
function contributions() {
  return [
    vscode.window.registerWebviewViewProvider(
      VIEW_ID,
      { resolveWebviewView },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.commands.registerCommand('piDock.restart', restart),
    vscode.commands.registerCommand('piDock.focus', () => vscode.commands.executeCommand(`${VIEW_ID}.focus`)),
    vscode.commands.registerCommand('piDock.showLog', showLog),
    keybindings.watch(refreshKeys),
    vscode.workspace.onDidChangeConfiguration(applySettingChange),
  ];
}

/**
 * Applies a changed setting, using the cheapest thing that works.
 *
 * @async
 * @param {import('vscode').ConfigurationChangeEvent} change
 * @returns {Promise<void>}
 */
async function applySettingChange(change) {
  const changed = (names) => names.some((name) => change.affectsConfiguration(`piDock.${name}`));
  if (change.affectsConfiguration('piDock.escapeActions')) await refreshKeys();
  if (changed(PAGE_SETTINGS)) await render();
  if (changed(SERVER_SETTINGS)) await offerRestart();
}

/**
 * Asks before ending Pi to pick up a new setting. Saying no changes nothing, and the setting applies
 * at the next restart anyway.
 *
 * @async
 * @returns {Promise<void>}
 */
async function offerRestart() {
  if (!view) return; // nothing running yet, so the setting is used from the start
  const answer = await vscode.window.showInformationMessage(
    'Pi Dock: that setting applies when Pi starts. Restart Pi now?',
    'Restart Pi',
    'Later',
  );
  if (answer === 'Restart Pi') await restart();
}

/**
 * Ends this workspace's Pi, if one is running.
 *
 * A session never outlives the extension that started it. Pi switches on two terminal features when
 * it starts (Shift+Enter, and pasting more than one line), and those belong to the page connected at
 * the time. A Pi kept across a window reload would be joined to a page that never saw them switched
 * on, and both would quietly stop working. Moving the sidebar keeps the extension running, so that
 * is the one case where Pi is kept.
 */
function endSession() {
  const settings = readSettings();
  if (settings.persist) killSession(sessionSocket(workspaceCwd()), settings.dtachPath);
}

// ---------------------------------------------------------------------------
// The sidebar
// ---------------------------------------------------------------------------

/**
 * Builds the sidebar. VS Code calls this each time, including every time it is dragged elsewhere.
 *
 * @async
 * @param {import('vscode').WebviewView} webviewView
 * @returns {Promise<void>} VS Code waits for this, so the sidebar is never shown empty.
 */
async function resolveWebviewView(webviewView) {
  view = webviewView;
  view.webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
  };
  view.webview.onDidReceiveMessage(handlePageMessage);
  view.onDidDispose(() => {
    if (view === webviewView) view = null;
  });
  await render();
}

/**
 * What the pages can ask for. The terminal page sends snapshots; the error page sends its buttons.
 *
 * @type {Record<string, (message: *) => void>}
 */
const PAGE_MESSAGES = {
  snapshot: (message) => server.rememberSnapshot(message.snapshot),
  restart: () => restart(),
  showLog: () => showLog(),
};

/**
 * Handles one message from a page, ignoring anything unrecognised.
 *
 * @param {*} message
 */
function handlePageMessage(message) {
  const handle = message && PAGE_MESSAGES[message.type];
  if (handle) handle(message);
}

/**
 * Puts a fresh terminal in the sidebar, or an explanation if it could not be built.
 *
 * @async
 * @returns {Promise<void>}
 */
async function render() {
  if (!view) return;
  try {
    view.webview.html = await terminalPage(readSettings());
  } catch (err) {
    output.appendLine(`[pi-dock] ${err && err.message ? err.message : err}`);
    showError(err);
  }
}

/**
 * Stops Pi and starts again. The "Pi Dock: Restart Pi" command, and the error page's "Try again".
 *
 * @async
 * @returns {Promise<void>}
 */
async function restart() {
  await server.stop();
  endSession(); // otherwise "restart" would rejoin the old Pi
  await render();
}

/** @param {Error|*} err */
function showError(err) {
  if (view) view.webview.html = errorHtml(err);
}

function showLog() {
  output.show(true);
}

// ---------------------------------------------------------------------------
// Building the terminal page
// ---------------------------------------------------------------------------

/**
 * Builds one page: starts ttyd, looks up the shortcuts, and puts both into the HTML.
 *
 * @async
 * @param {import('./types').Settings} settings Read once by the caller, so ttyd and the page cannot
 *   end up disagreeing.
 * @returns {Promise<string>}
 */
async function terminalPage(settings) {
  const running = await server.ensure(settings);
  const { keys, error } = await keybindings.resolve(settings);
  if (error) warnNoChords(error);
  return terminalHtml({
    cspSource: view.webview.cspSource,
    asset: assetUri,
    config: {
      wsUrl: await websocketUrl(running),
      options: pageOptions(settings),
      theme: settings.theme || {},
      keys,
      restore: running.snapshot || null,
    },
  });
}

/**
 * Returns ttyd's websocket address in a form the page can reach.
 *
 * asExternalUri is what makes Remote SSH, WSL and containers work: there the page runs on your
 * machine while ttyd runs on the far one, so VS Code forwards the port and hands back another
 * address.
 *
 * @async
 * @param {import('./types').TtydServer} server
 * @returns {Promise<string>} A ws:// or wss:// address ending in /ws.
 */
async function websocketUrl({ port, token }) {
  const local = vscode.Uri.parse(`http://127.0.0.1:${port}/${token}/`);
  const external = await vscode.env.asExternalUri(local);
  const scheme = external.scheme === 'https' ? 'wss' : 'ws';
  return `${scheme}://${external.authority}${external.path.replace(/\/?$/, '/')}ws`;
}

/**
 * Returns a file under media/ as an address this page may load.
 *
 * @param {string} path Path below media/.
 * @returns {string}
 */
const assetUri = (path) =>
  view.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', ...path.split('/'))).toString();

/**
 * Returns the page's font and cursor options, from VS Code's own terminal settings.
 *
 * @param {import('./types').Settings} settings
 * @returns {Record<string, *>}
 */
const pageOptions = (settings) =>
  xtermOptions({
    terminal: (key) => vscode.workspace.getConfiguration('terminal.integrated').get(key),
    editor: (key) => vscode.workspace.getConfiguration('editor').get(key),
    settings,
  });

/**
 * Looks the shortcuts up again and sends them to the page, which carries on running.
 *
 * @async
 * @returns {Promise<void>}
 */
async function refreshKeys() {
  if (!view) return;
  const { keys } = await keybindings.resolve(readSettings());
  view.webview.postMessage({ type: 'keys', keys });
}

/** @param {string} error Why the shortcuts could not be read, from host/keys.js. */
function warnNoChords(error) {
  vscode.window.showWarningMessage(`Pi Dock: ${error} Only F1 will leave the terminal for VS Code; copy, paste and page scrolling are unavailable. See the Pi Dock log.`);
}

module.exports = { activate, deactivate };
