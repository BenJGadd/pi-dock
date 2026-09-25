// Starting ttyd, which runs a command and puts its terminal behind a websocket. Pi Dock uses only
// that part: the page draws the terminal itself, so ttyd's own web page is never loaded.
//
// No VS Code here, so `node --test` can check it.

'use strict';

const net = require('net');

// What each platform calls its loopback interface, meaning "this machine only".
const LOOPBACK_IFACE = { linux: 'lo', win32: '127.0.0.1' };

/**
 * Returns the loopback interface name for ttyd's `-i` option.
 *
 * @param {string} [platform] A process.platform value.
 * @returns {string}
 */
function loopbackIface(platform = process.platform) {
  return LOOPBACK_IFACE[platform] || 'lo0';
}

/**
 * Builds ttyd's command line, after the program name.
 *
 * Two things keep other programs out: ttyd listens on loopback only, and its URL contains a random
 * token that only the page is given. There is no `-O`, ttyd's check that the page came from ttyd
 * itself, because a VS Code page reports an address starting `vscode-webview://` and would fail it
 * every time.
 *
 * @param {object} args
 * @param {import('../types').Settings} args.settings Its `command` is already wrapped in dtach if
 *   the session is meant to survive.
 * @param {number} args.port
 * @param {string} args.token
 * @param {string} [args.platform] A process.platform value.
 * @returns {string[]} Arguments for spawn, ending with the command ttyd runs.
 */
function buildArgs({ settings, port, token, platform = process.platform }) {
  return [
    ...(settings.extraArgs || []),
    '-W',              // let the user type (ttyd is read-only unless asked)
    '-m', '1',         // one connection at a time
    '-p', String(port),
    '-i', loopbackIface(platform),
    '-b', `/${token}`, // the token goes in the URL
    ...(settings.command && settings.command.length ? settings.command : ['pi']),
  ];
}

/**
 * Returns the environment ttyd starts with, which Pi inherits.
 *
 * COLORTERM is always set, even if it was set already, because it describes the terminal Pi Dock
 * provides and that terminal does draw 24-bit colour. Without it Pi falls back to 256 colours, since
 * ttyd advertises only TERM=xterm-256color. TERM_PROGRAM is left alone: claiming to be another
 * terminal would eventually break something. PI_DOCK says who started Pi, so tools that should
 * behave differently inside the editor can tell.
 * PI_DOCK_SESSION_STATE names the file the shipped Pi extension records the session in, so the
 * next start can come back to it (lib/resume.js).
 *
 * @param {NodeJS.ProcessEnv} env Normally process.env.
 * @param {string} version Pi Dock's own version, the value of PI_DOCK.
 * @param {string} [sessionState] The state file for this workspace; left out means unset.
 * @returns {NodeJS.ProcessEnv} A copy with COLORTERM, PI_DOCK and, when given, PI_DOCK_SESSION_STATE set.
 */
function ttydEnv(env, version, sessionState) {
  return { ...env, COLORTERM: 'truecolor', PI_DOCK: version, ...(sessionState ? { PI_DOCK_SESSION_STATE: sessionState } : {}) };
}

/**
 * Finds a free port by asking the operating system for one and letting it go again.
 *
 * @returns {Promise<number>}
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Waits until something is listening on `port`, retrying every 100ms.
 *
 * @param {number} port
 * @param {() => Error|null|undefined} failed Checked between tries. Return an Error to stop early,
 *   for instance because the process being waited for has died.
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function waitForPort(port, failed, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const err = failed();
      if (err) return reject(err);
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`ttyd did not start listening on port ${port} within ${timeoutMs / 1000}s.`));
        else setTimeout(attempt, 100);
      });
    };
    attempt();
  });
}

/**
 * Returns the end of some text, for showing on the error page.
 *
 * @param {string} text
 * @param {number} maxLines
 * @param {number} maxChars A ceiling in case the lines themselves are enormous.
 * @returns {string}
 */
function tailLines(text, maxLines, maxChars) {
  return text.slice(-maxChars).split('\n').slice(-maxLines).join('\n');
}

/**
 * The command line as the log shows it: the same arguments, with the token replaced by a placeholder.
 *
 * The token is the one secret in the arrangement, and the log is what people paste into bug
 * reports and, with `PI_DOCK_LOG`, write to a file. Nobody needs it to read the line.
 *
 * @param {string} program The ttyd path.
 * @param {string[]} args From buildArgs.
 * @param {string} token The one buildArgs was given.
 * @returns {string}
 */
function logLine(program, args, token) {
  return [program, ...args.map((arg) => (arg === `/${token}` ? '/<token>' : arg))].join(' ');
}

module.exports = { ttydEnv, buildArgs, freePort, waitForPort, tailLines, logLine };
