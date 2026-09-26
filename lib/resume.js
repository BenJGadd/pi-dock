// Coming back to the same Pi conversation after the window closes.
//
// Closing or reloading the window ends Pi (see endSession in ../extension.js), so the next start
// is a new process. What makes it feel like the same session is Pi's own `-c`: Pi keeps every
// conversation as a file in a folder named after the working directory, and `-c` continues the
// one written most recently there (measured on 0.87.0: session-manager's findMostRecentSession
// sorts the folder's files by modification time). Nothing of Pi Dock's is inside Pi for this: no
// extension, no state file, no environment variable. With no session in the folder yet, `-c`
// starts fresh.
//
// No VS Code here, so `node --test` can check it.

'use strict';

/**
 * The arguments that put Pi back in the conversation last written in this folder: `-c` when the
 * `piDock.resume` setting is on; nothing otherwise.
 *
 * @param {object} args
 * @param {boolean} args.resume The `piDock.resume` setting.
 * @returns {string[]}
 */
function resumeArgs({ resume }) {
  return resume ? ['-c'] : [];
}

module.exports = { resumeArgs };
