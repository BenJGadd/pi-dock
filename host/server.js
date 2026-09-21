// Running ttyd: one per window, started when the sidebar first opens and stopped with the extension.
//
// This is the half that needs VS Code. The command line itself lives in lib/ttyd.js, which is kept
// free of it so the tests can check it.

'use strict';

const cp = require('child_process');
const crypto = require('crypto');
const vscode = require('vscode');
const { buildArgs, ttydEnv, freePort, waitForPort, tailLines } = require('../lib/ttyd');
const { sessionSocket, persistentCommand } = require('../lib/session');
const { isInstalled } = require('../lib/executable');
const { workspaceCwd } = require('./settings');

const START_TIMEOUT_MS = 10000;
const STDERR_LINES = 8; // how much of ttyd's output to keep for the error page
const STDERR_MAX_CHARS = 2000;

/**
 * Returns the error for ttyd not being installed.
 *
 * @param {string} ttydPath
 * @returns {Error}
 */
const missingTtyd = (ttydPath) =>
  new Error(`Could not find "${ttydPath}". Install ttyd (brew install ttyd / apt install ttyd / winget install tsl0922.ttyd) or set piDock.ttydPath.`);

/**
 * Returns the error for the command itself not existing.
 *
 * Without this check the failure lands far from its cause. ttyd starts and listens fine, because it
 * does not run the command until a page connects; the page then connects, the command fails, and the
 * closed connection can only be reported as "Pi exited".
 *
 * @param {string} program
 * @returns {Error}
 */
const missingProgram = (program) =>
  new Error(`Could not find "${program}", the command Pi Dock was asked to run. Install Pi so that \`pi\` works in a terminal, or set piDock.command to the full path.`);

/**
 * Creates a record for a ttyd that has not been started yet.
 *
 * @param {number} port
 * @param {string} token
 * @returns {import('../types').TtydServer}
 */
const newServer = (port, token) => ({ proc: null, port, token, alive: true, stopped: false, error: null, stderr: '', snapshot: null });

/**
 * Decides whether to give up waiting for ttyd to listen.
 *
 * @param {import('../types').TtydServer} server
 * @returns {Error|null} Null means keep waiting.
 */
const startupFailure = (server) =>
  server.error || (!server.alive ? new Error('ttyd exited before it started listening. See the Pi Dock log.') : null);

/**
 * Keeps the last few lines ttyd printed, for the error page.
 *
 * @param {import('../types').TtydServer} server
 * @param {string} text
 */
function rememberStderr(server, text) {
  server.stderr = tailLines(server.stderr + text, STDERR_LINES, STDERR_MAX_CHARS);
}

/**
 * Stops a ttyd and marks it as ours, so its exit is not reported as a crash.
 *
 * @param {import('../types').TtydServer} server
 */
function kill(server) {
  server.stopped = true;
  if (!server.alive) return;
  try {
    server.proc.kill();
  } catch (_) {
    // already gone
  }
}

/**
 * Attaches ttyd's own output to an error, so the error page can show it.
 *
 * @param {Error|*} err
 * @param {import('../types').TtydServer} server
 * @returns {Error|*} The same error.
 */
function withStderr(err, server) {
  if (!(err instanceof Error) || !server.stderr) return err;
  /** @type {import('../types').DetailedError} */
  const detailed = err;
  detailed.details = server.stderr;
  return detailed;
}

/**
 * Creates this window's ttyd and the three things the extension does with it.
 *
 * @param {object} args
 * @param {import('vscode').OutputChannel} args.output ttyd's own output goes into it word for word.
 * @param {(err: Error) => void} args.onCrash Called if ttyd dies on its own after starting.
 * @returns {{
 *   ensure: (settings: import('../types').Settings) => Promise<import('../types').TtydServer>,
 *   rememberSnapshot: (snapshot: import('../types').Snapshot|null) => void,
 *   stop: () => Promise<void>,
 * }}
 */
function createServer({ output, onCrash }) {
  /** @type {import('../types').TtydServer|null} */
  let running = null;
  /** @type {Promise<import('../types').TtydServer>|null} a start underway, so two pages share one ttyd */
  let starting = null;
  let warnedNoDtach = false;

  /**
   * Returns the running ttyd, starting one if there is none.
   *
   * @param {import('../types').Settings} settings
   * @returns {Promise<import('../types').TtydServer>}
   */
  function ensure(settings) {
    if (running && running.alive) return Promise.resolve(running);
    if (!starting) {
      starting = start(settings)
        .then((server) => (running = server))
        .finally(() => { starting = null; });
    }
    return starting;
  }

  /**
   * Holds on to the terminal as the page last drew it, for the page that replaces it. It belongs to
   * this ttyd; the next one starts a new Pi with a blank screen.
   *
   * @param {import('../types').Snapshot|null} snapshot
   */
  function rememberSnapshot(snapshot) {
    if (running) running.snapshot = snapshot;
  }

  /**
   * Stops ttyd.
   *
   * What is running stops at once, so a caller that cannot wait (deactivate, as the window closes)
   * still leaves nothing behind. Awaiting also covers a ttyd in the middle of starting.
   *
   * @async
   * @returns {Promise<void>}
   */
  async function stop() {
    killRunning();
    if (starting) {
      await starting.catch(() => {});
      killRunning();
    }
  }

  function killRunning() {
    if (running) kill(running);
    running = null;
  }

  /**
   * Starts ttyd and waits for it to be ready.
   *
   * @async
   * @param {import('../types').Settings} settings
   * @returns {Promise<import('../types').TtydServer>}
   * @throws {Error} If it could not start, exited first, or never became ready in time. It is stopped
   *   before the error is passed on.
   */
  async function start(settings) {
    // The program the user asked for, not the dtach wrapper; dtach is checked in commandFor.
    const program = (settings.command && settings.command[0]) || 'pi';
    if (!isInstalled(program)) throw missingProgram(program);

    const cwd = workspaceCwd();
    const server = newServer(await freePort(), crypto.randomBytes(16).toString('hex'));
    const args = buildArgs({ settings: { ...settings, command: commandFor(settings, cwd) }, port: server.port, token: server.token });

    output.appendLine(`[pi-dock] cwd: ${cwd}`);
    output.appendLine(`[pi-dock] ${settings.ttydPath} ${args.join(' ')}`);
    server.proc = cp.spawn(settings.ttydPath, args, {
      cwd,
      env: ttydEnv(process.env),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    watch(server, settings);

    try {
      await waitForPort(server.port, () => startupFailure(server), START_TIMEOUT_MS);
    } catch (err) {
      kill(server);
      throw withStderr(err, server);
    }
    return server;
  }

  /**
   * Follows a started ttyd: its output goes to the log, and its two ways of failing become messages
   * someone can act on.
   *
   * @param {import('../types').TtydServer} server
   * @param {import('../types').Settings} settings
   */
  function watch(server, settings) {
    server.proc.stdout.on('data', (chunk) => output.append(chunk.toString()));
    server.proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output.append(text);
      rememberStderr(server, text);
    });
    server.proc.on('error', (err) => {
      server.alive = false;
      server.error = err.code === 'ENOENT' ? missingTtyd(settings.ttydPath) : err;
    });
    server.proc.on('exit', (code, signal) => {
      server.alive = false;
      output.appendLine(`[pi-dock] ttyd exited (${code !== null ? `code ${code}` : signal})`);
      reportCrash(server);
    });
  }

  /**
   * Reports a ttyd that died on its own, since otherwise the sidebar would sit there showing a dead
   * terminal. An exit we asked for is not a crash, nor is one from a ttyd already replaced.
   *
   * @param {import('../types').TtydServer} server
   */
  function reportCrash(server) {
    if (server.stopped || running !== server) return;
    running = null;
    onCrash(withStderr(new Error('The terminal server stopped unexpectedly. See the Pi Dock log.'), server));
  }

  /**
   * Returns what ttyd should run: Pi inside dtach if dtach is installed, so the session outlives the
   * page.
   *
   * @param {import('../types').Settings} settings
   * @param {string} cwd Names the dtach session.
   * @returns {string[]}
   */
  function commandFor(settings, cwd) {
    if (!settings.persist) return settings.command;
    if (isInstalled(settings.dtachPath)) {
      return persistentCommand({
        dtachPath: settings.dtachPath,
        socket: sessionSocket(cwd),
        command: settings.command && settings.command.length ? settings.command : ['pi'],
      });
    }
    warnNoDtach();
    return settings.command;
  }

  /** Warns about a missing dtach once per window, not once per page. */
  function warnNoDtach() {
    if (warnedNoDtach) return;
    warnedNoDtach = true;
    vscode.window.showWarningMessage('Pi Dock: dtach was not found, so Pi will start over if you move the view or reload the window. Install dtach (or set piDock.dtachPath) to keep the session alive.');
  }

  return { ensure, rememberSnapshot, stop };
}

module.exports = { createServer };
