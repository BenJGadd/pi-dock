// Which Pi extensions the docked Pi loads: the ones installed VS Code extensions carry.
//
// A VS Code extension that ships a Pi extension says so in its package.json with the key Pi
// packages already use:
//
//   "pi": { "extensions": ["pi/my-extension.js"] }
//
// Each path is relative to that extension's folder. The docked Pi, and the terminal profile, get
// `-e <full path>` for every one that exists, so a Pi started inside the editor has them and a Pi
// started anywhere else does not. No names are known here: any extension, present or future, that
// carries one is loaded. Pi Dock itself carries none.

'use strict';

const path = require('path');
const fs = require('fs');

/**
 * @typedef {object} InstalledExtension
 * @property {string} extensionPath Where the extension's files are.
 * @property {{ pi?: { extensions?: unknown } }} packageJSON Its manifest.
 */

/**
 * The full paths of every declared Pi extension that is really there, in the order the extensions
 * were listed, without repeats.
 *
 * A path that leaves its extension's folder is ignored: a manifest may only offer its own files.
 *
 * @param {InstalledExtension[]} extensions Usually `vscode.extensions.all`.
 * @param {(file: string) => boolean} [exists]
 * @returns {string[]}
 */
function declaredExtensions(extensions, exists = fs.existsSync) {
  const found = [];
  for (const extension of extensions) {
    const declared = extension && extension.packageJSON && extension.packageJSON.pi && extension.packageJSON.pi.extensions;
    if (!Array.isArray(declared)) continue;
    const root = path.resolve(extension.extensionPath);
    for (const entry of declared) {
      if (typeof entry !== 'string' || !entry) continue;
      const full = path.resolve(root, entry);
      if (full !== root && !full.startsWith(root + path.sep)) continue;
      if (!exists(full) || found.includes(full)) continue;
      found.push(full);
    }
  }
  return found;
}

/**
 * The `-e` flags for those paths, ready to append to Pi's command line.
 *
 * @param {string[]} paths
 * @returns {string[]}
 */
function extensionFlags(paths) {
  return paths.flatMap((file) => ['-e', file]);
}

module.exports = { declaredExtensions, extensionFlags };
