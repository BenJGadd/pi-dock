// The sidebar: the page that draws Pi, built from a running ttyd and rebuilt whenever VS Code
// asks for it again.
//
// VS Code throws the page away and asks for a new one every time the view is dragged somewhere
// else, and Pi Dock rebuilds it on a settings change too. Pi itself keeps running through all of
// that (host/server.js, lib/dtach.js); what would be lost is the screen, which is why the page hands
// back a snapshot of itself before it goes, and the next page starts from it. A snapshot belongs to
// the Pi it was taken from: a new ttyd is a new Pi with a blank screen, and gets no snapshot.
//
// Everything here is about the one page. Messages *from* the page are routed by extension.js to
// the feature that owns them; this file only sends.

'use strict';

const vscode = require('vscode');
const { xtermOptions } = require('../lib/options');
const { terminalHtml, errorHtml } = require('../lib/webview');
const { readSettings } = require('./settings');

/**
 * @param {object} deps
 * @param {import('vscode').ExtensionContext} deps.context Where page/ is.
 * @param {import('vscode').OutputChannel} deps.output
 * @param {ReturnType<import('./server').createServer>} deps.server The ttyd the page connects to.
 * @param {ReturnType<import('./sessions').createSessions>} deps.sessions Which session Pi starts on.
 * @param {ReturnType<import('./keys').createKeys>} deps.keybindings The shortcuts the page must give VS Code.
 * @param {ReturnType<import('./badge').createBadge>} deps.badge The number on the Pi icon.
 * @param {(message: *) => void} deps.onMessage Every message the page sends.
 * @param {() => void} deps.onShown The sidebar has been drawn in this window.
 * @returns {{
 *   resolve: (view: import('vscode').WebviewView) => Promise<void>,
 *   render: () => Promise<void>,
 *   showError: (err: Error|*) => void,
 *   post: (message: import('../types').PasteMessage|{ type: 'keys', keys: import('../types').KeyConfig }|import('../types').ResolvedMessage) => void,
 *   refreshKeys: () => Promise<void>,
 *   rememberSnapshot: (snapshot: import('../types').Snapshot|null) => void,
 *   isOpen: () => boolean,
 * }}
 */
function createPage({ context, output, server, sessions, keybindings, badge, onMessage, onShown }) {
  /** @type {import('vscode').WebviewView|null} the sidebar, while it exists */
  let view = null;
  /** @type {import('../types').Snapshot|null} the screen as the last page drew it */
  let snapshot = null;
  /** @type {import('../types').TtydServer|null} the ttyd that snapshot was taken from */
  let snapshotOf = null;

  /**
   * Takes the sidebar VS Code just built. Called each time, including every time it is dragged
   * elsewhere, and VS Code waits for it, so the sidebar is never shown empty.
   *
   * @param {import('vscode').WebviewView} webviewView
   */
  async function resolve(webviewView) {
    view = webviewView;
    onShown();
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'page')],
    };
    view.webview.onDidReceiveMessage(onMessage);
    badge.apply(view);
    view.onDidDispose(() => {
      if (view === webviewView) view = null;
    });
    await render();
  }

  /** Puts a fresh terminal in the sidebar, or an explanation if it could not be built. */
  async function render() {
    if (!view) return;
    try {
      view.webview.html = await terminalPage(readSettings());
    } catch (err) {
      output.appendLine(`[pi-dock] ${err && err.message ? err.message : err}`);
      showError(err);
    }
  }

  /** @param {Error|*} err */
  function showError(err) {
    if (view) view.webview.html = errorHtml(err);
  }

  /** Sends a message to the page, if there is one. */
  function post(message) {
    if (view) view.webview.postMessage(message);
  }

  /** Looks the shortcuts up again and sends them to the page, which carries on running. */
  async function refreshKeys() {
    if (!view) return;
    const { keys } = await keybindings.resolve(readSettings());
    post({ type: 'keys', keys });
  }

  /**
   * Holds on to the terminal as the page last drew it, for the page that replaces it.
   *
   * @param {import('../types').Snapshot|null} taken
   */
  function rememberSnapshot(taken) {
    snapshot = taken;
    snapshotOf = server.current();
  }

  /**
   * Builds one page: starts ttyd, looks up the shortcuts, and puts both into the HTML.
   *
   * @param {import('../types').Settings} settings Read once, so ttyd and the page cannot disagree.
   * @returns {Promise<string>}
   */
  async function terminalPage(settings) {
    const running = await server.ensure({ ...settings, command: sessions.startCommand(settings) });
    sessions.started(); // used by this start, or not needed because Pi was already running
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
        restore: running === snapshotOf ? snapshot : null,
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
   * @param {import('../types').TtydServer} running
   * @returns {Promise<string>} A ws:// or wss:// address ending in /ws.
   */
  async function websocketUrl({ port, token }) {
    const local = vscode.Uri.parse(`http://127.0.0.1:${port}/${token}/`);
    const external = await vscode.env.asExternalUri(local);
    const scheme = external.scheme === 'https' ? 'wss' : 'ws';
    return `${scheme}://${external.authority}${external.path.replace(/\/?$/, '/')}ws`;
  }

  /**
   * Returns a file under page/ as an address this page may load.
   *
   * @param {string} file Path below page/.
   * @returns {string}
   */
  const assetUri = (file) =>
    view.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'page', ...file.split('/'))).toString();

  /**
   * Returns the page's font and cursor options, from VS Code's own terminal settings.
   *
   * @param {import('../types').Settings} settings
   * @returns {Record<string, *>}
   */
  const pageOptions = (settings) =>
    xtermOptions({
      terminal: (key) => vscode.workspace.getConfiguration('terminal.integrated').get(key),
      editor: (key) => vscode.workspace.getConfiguration('editor').get(key),
      settings,
    });

  /** @param {string} error Why the shortcuts could not be read, from host/keys.js. */
  function warnNoChords(error) {
    vscode.window.showWarningMessage(`Pi Dock: ${error} Only F1 will leave the terminal for VS Code; copy, paste and page scrolling are unavailable. See the Pi Dock log.`);
  }

  return { resolve, render, showError, post, refreshKeys, rememberSnapshot, isOpen: () => view !== null };
}

module.exports = { createPage };
