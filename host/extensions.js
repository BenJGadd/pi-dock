// The Pi extensions the docked Pi loads, read from the installed VS Code extensions each time Pi
// starts, so one installed after this window opened is picked up at the next start. Pi Dock itself
// puts nothing into Pi.

'use strict';

const vscode = require('vscode');
const { declaredExtensions } = require('../lib/extensions');

/**
 * Returns a function that lists the Pi extensions to load: every one an installed extension
 * declares (lib/extensions.js).
 *
 * @returns {() => string[]} Full paths.
 */
function createExtensions() {
  return () => declaredExtensions(vscode.extensions.all);
}

module.exports = { createExtensions };
