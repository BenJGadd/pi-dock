// Checking whether a program is installed, by looking its name up the way a shell does.
//
// Nothing is run. The programs checked here come from piDock.command, and one of them is Pi, a
// full-screen terminal app: a program that does not recognise `--help` might start up and wait for
// input, hanging the extension.

'use strict';

const fs = require('fs');
const path = require('path');

// Windows has no execute bit. A name is runnable once it gains one of these endings.
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/**
 * Returns the file names to look for. On Windows a bare name is tried with each PATHEXT ending.
 *
 * @param {string} program
 * @param {NodeJS.ProcessEnv} env
 * @param {string} platform
 * @returns {string[]}
 */
function runnableNames(program, env, platform) {
  if (platform !== 'win32' || path.extname(program)) return [program];
  return (env.PATHEXT || DEFAULT_PATHEXT).split(';').filter(Boolean).map((ending) => program + ending);
}

/**
 * Checks whether one exact file could be run.
 *
 * @param {string} candidate A full path.
 * @param {string} platform
 * @returns {boolean}
 */
function canRun(candidate, platform) {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
    if (platform === 'win32') return true;
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch (_) {
    return false; // missing, unreadable, or a directory
  }
}

/**
 * Checks whether `program` is installed.
 *
 * A name containing a slash is treated as a path. A bare name is looked for in each PATH folder, in
 * order, as a shell would.
 *
 * @param {string} program A program name, or a path to one.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [platform] A process.platform value.
 * @returns {boolean} False also when it exists but is not runnable.
 */
function isInstalled(program, env = process.env, platform = process.platform) {
  if (!program) return false;
  const names = runnableNames(program, env, platform);
  const isPath = program.includes('/') || (platform === 'win32' && program.includes('\\'));
  if (isPath) return names.some((name) => canRun(name, platform));

  const folders = (env.PATH || '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
  return folders.some((folder) => names.some((name) => canRun(path.join(folder, name), platform)));
}

module.exports = { isInstalled };
