// The "Pi Dock" output channel, and the same lines in a file when asked.
//
// The Output channel is for a person reading it in the window. The file is for anyone working out
// why something did not happen from outside it: a script, a screenshot run, another window. It is
// written only when `PI_DOCK_LOG` names it, so nothing is left on disk otherwise.

'use strict';

const fs = require('fs');
const vscode = require('vscode');

/**
 * Creates the output channel, mirrored to `$PI_DOCK_LOG` when that is set.
 *
 * @returns {import('vscode').OutputChannel}
 */
function createOutput() {
  const channel = vscode.window.createOutputChannel('Pi Dock');
  const file = process.env.PI_DOCK_LOG || '';
  if (!file) return channel;
  const appendLine = (line) => {
    channel.appendLine(line);
    try {
      fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
    } catch (_) {
      // a log that cannot be written is not worth an error in the window
    }
  };
  return new Proxy(channel, { get: (target, name) => (name === 'appendLine' ? appendLine : Reflect.get(target, name)) });
}

module.exports = { createOutput };
