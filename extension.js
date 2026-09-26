// Pi Dock — the real Pi terminal app, inside a VS Code sidebar.
//
// VS Code can show a web page in a sidebar. That page draws a terminal with xterm.js, the same
// library VS Code uses for its own. ttyd runs `pi` and puts its terminal behind a websocket, which
// the page connects to. dtach sits in between and keeps `pi` running when VS Code throws the page
// away.
//
// Terms:
//   webview   a web page VS Code shows inside itself; here, the sidebar's contents
//   ttyd      runs a command and offers its terminal over a websocket
//   dtach     holds a terminal open so the program inside survives losing its connection
//   chord     a shortcut, possibly two key presses long, like Ctrl+K Ctrl+S
//
// Layout:
//   lib/         no VS Code, so `node --test` can check it
//   host/        the VS Code side, one file per feature: the page, the ttyd process, settings and
//                their changes, reading shortcuts, pasted images, clicked paths, the badge,
//                sessions, the toggle, the setup checks, the terminal profile, the log
//   page/        the page itself, one file per feature, loaded in order by lib/webview.js, and
//                the vendored xterm.js it draws with
//   pi/          the small extension that runs inside Pi and records its session
//   media/       what VS Code shows about the extension: the icons and the walkthrough pages
//   types.js     the shapes those pass around
//
// This file is the wiring and nothing else: it builds each feature once, hands each the others it
// needs, registers what VS Code should know about, and routes the page's messages to the feature
// that owns them.
//
// No dependencies, no copy of Pi, nothing compiled. Pi comes from your own install and your own
// configuration; Pi Dock draws it and passes keys along.

'use strict';

const vscode = require('vscode');
const { readSettings, watchChanges } = require('./host/settings');
const { checkSetup, reportSetup, watchWalkthrough } = require('./host/setup');
const { registerProfile } = require('./host/profile');
const { createOutput } = require('./host/log');
const { createServer } = require('./host/server');
const { createPage } = require('./host/page');
const { createKeys } = require('./host/keys');
const { createImages } = require('./host/images');
const { createLinks } = require('./host/links');
const { createBadge } = require('./host/badge');
const { createToggle } = require('./host/toggle');
const { createSessions } = require('./host/sessions');
const { createExtensions } = require('./host/extensions');

const VIEW_ID = 'piDock.terminal';

/** @type {import('vscode').OutputChannel} */
let output;
/** @type {ReturnType<typeof createServer>} */
let server;
/** @type {ReturnType<typeof createPage>} */
let page;
/** Whether the sidebar has been drawn in this window, which is the walkthrough's last step. */
let sidebarSeen = false;

/**
 * Starts the extension. VS Code calls this the first time the sidebar opens or a command runs.
 *
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
  const version = context.extension.packageJSON.version;
  output = createOutput();
  output.appendLine(`[pi-dock] version ${version}`);

  server = createServer({ output, onCrash: (err) => page.showError(err), version });
  const keybindings = createKeys({ context, output });
  const post = (message) => page.post(message);
  const images = createImages({ output, post });
  const links = createLinks({ output, post });
  const badge = createBadge();
  const toggle = createToggle({ viewId: VIEW_ID });
  const piExtensions = createExtensions();
  const sessions = createSessions({ restart, piExtensions });
  const check = () => checkSetup(readSettings(), () => sidebarSeen);

  /**
   * What the pages can ask for, each routed to the feature that owns it. The terminal page sends
   * snapshots, its focus, pasted images, which paths are files, and Ctrl+clicked paths; the error
   * page sends its buttons. The shapes are in types.js (PageMessage).
   *
   * @type {Record<string, (message: *) => void>}
   */
  const PAGE_MESSAGES = {
    snapshot: (message) => page.rememberSnapshot(message.snapshot),
    focus: (message) => toggle.pageFocused(message),
    image: (message) => images.pasted(message),
    resolve: (message) => links.resolve(message),
    open: (message) => links.open(message),
    restart: () => restart(),
    showLog: () => output.show(true),
  };
  page = createPage({
    context,
    output,
    server,
    sessions,
    keybindings,
    badge,
    onMessage: (message) => {
      const handle = message && PAGE_MESSAGES[message.type];
      if (handle) handle(message);
    },
    onShown: () => {
      // The walkthrough's last step is "open the sidebar", and this is that. Said again in case a
      // page is already open waiting to hear it.
      sidebarSeen = true;
      check();
    },
  });

  server.endSession(readSettings()); // anything still running belongs to a window that closed without tidying up
  images.prune();
  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider(VIEW_ID, { resolveWebviewView: page.resolve }, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('piDock.restart', restart),
    vscode.commands.registerCommand('piDock.focus', toggle.focus),
    vscode.commands.registerCommand('piDock.toggle', toggle.toggle),
    vscode.commands.registerCommand('piDock.showLog', () => output.show(true)),
    vscode.commands.registerCommand('piDock.setBadge', badge.set),
    vscode.commands.registerCommand('piDock.checkSetup', () => reportSetup(readSettings, () => sidebarSeen)),
    vscode.commands.registerCommand('piDock.newSession', sessions.newSession),
    vscode.commands.registerCommand('piDock.resumeSession', sessions.resumeSession),
    vscode.commands.registerCommand('piDock.forkSession', sessions.forkSession),
    registerProfile(version, piExtensions),
    watchWalkthrough({ readSettings, sidebarOpened: () => sidebarSeen }),
    keybindings.watch(() => page.refreshKeys()),
    watchChanges({ page, restart, checkSetup: check }),
  );
  check();
}

/** Shuts the extension down. VS Code calls this as the window closes or reloads. */
function deactivate() {
  server.stop();
  server.endSession(readSettings()); // closing or reloading ends Pi; only moving the sidebar keeps it
}

/**
 * Stops Pi and starts again. The "Pi Dock: Restart Pi" command, the error page's "Try again", and
 * the session commands, which set what the one start that follows joins (host/sessions.js).
 *
 * @returns {Promise<void>}
 */
async function restart() {
  await server.stop();
  server.endSession(readSettings()); // otherwise "restart" would rejoin the old Pi
  await page.render();
}

module.exports = { activate, deactivate };
