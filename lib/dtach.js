// Keeping Pi running when the sidebar view is moved: the dtach session, its socket, its end.
//
// VS Code throws the page away and builds a new one whenever the view is dragged elsewhere, and ttyd
// kills its command when the connection closes. Together, Pi would restart every time. So Pi runs
// inside dtach, which holds a terminal open and lets clients attach to it one after another: ttyd
// runs `dtach -A <socket> ... pi`, and each new page finds the same Pi still there.
//
// No VS Code here, so `node --test` can check it.

'use strict';

const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Returns the dtach socket for one workspace, which is the address clients attach to.
 *
 * One socket per folder, so two projects never share a Pi but two windows on the same project do.
 *
 * @param {string} workspace Full path of the workspace folder, which decides the name.
 * @param {string} [runtimeDir] Defaults to $XDG_RUNTIME_DIR, then the temp folder. Either way it is
 *   your own folder, and dtach creates the file readable only by you.
 * @returns {string} The same workspace always gets the same path.
 */
function sessionSocket(workspace, runtimeDir = process.env.XDG_RUNTIME_DIR || os.tmpdir()) {
  const id = crypto.createHash('sha256').update(workspace).digest('hex').slice(0, 16);
  return path.join(runtimeDir, `pi-dock-${id}.sock`);
}

/**
 * Wraps a command in dtach so it outlives the page.
 *
 *   -A         attach, or start the session if there is none
 *   -r winch   redraw whenever something attaches, since a new page starts blank
 *   -E -z      no detach or suspend key, so no key press is taken from Pi
 *
 * @param {object} args
 * @param {string} args.dtachPath
 * @param {string} args.socket From sessionSocket.
 * @param {string[]} args.command What to run inside the session. Never empty.
 * @returns {string[]} The command for ttyd to run instead.
 */
function persistentCommand({ dtachPath, socket, command }) {
  return [dtachPath, '-A', socket, '-r', 'winch', '-E', '-z', ...command];
}

/**
 * Ends a session by stopping the dtach holding it.
 *
 * Stopping dtach closes its side of the terminal, so the system hangs up on whatever ran inside and
 * it exits, the same as closing a terminal window. Pi's own processes need no separate handling.
 *
 * dtach has no "end this session" command, so the right one is found in the process list. The match
 * is anchored to the start of the command line because ttyd's command line also contains the socket
 * path, and stopping ttyd here would be wrong.
 *
 * @param {string} socket From sessionSocket.
 * @param {string} [dtachPath] Spelled as it appears in the command line.
 * @returns {boolean} False if pkill is missing, meaning nothing could be stopped.
 */
function killSession(socket, dtachPath = 'dtach') {
  const quote = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // match the path literally
  const result = cp.spawnSync('pkill', ['-TERM', '-f', '--', `^${quote(dtachPath)} .*${quote(socket)}`]);
  fs.rmSync(socket, { force: true });
  return !result.error;
}

module.exports = { sessionSocket, persistentCommand, killSession };
