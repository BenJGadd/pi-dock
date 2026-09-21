// Finding and reading VS Code's two keybindings files. What their contents mean is worked out in
// lib/keybindings.js, which needs no editor and so can be tested.

'use strict';

const vscode = require('vscode');
const { buildKeyConfig, fallbackKeys } = require('../lib/keybindings');

// VS Code generates this on demand, already narrowed to this platform and including shortcuts other
// extensions have added.
const DEFAULT_KEYBINDINGS = vscode.Uri.parse('vscode://defaultsettings/keybindings.json');

/**
 * Reads a file as text.
 *
 * @async
 * @param {import('vscode').Uri} uri
 * @returns {Promise<string>}
 */
const readText = async (uri) => Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');

/**
 * Checks whether a read failed only because the file does not exist.
 *
 * @param {*} err
 * @returns {boolean}
 */
const isMissingFile = (err) => err instanceof vscode.FileSystemError && err.code === 'FileNotFound';

/**
 * Creates the shortcut lookup for this window.
 *
 * @param {object} args
 * @param {import('vscode').ExtensionContext} args.context Used to find the user's keybindings.json.
 * @param {import('vscode').OutputChannel} args.output Where skipped shortcuts are logged.
 * @returns {{
 *   resolve: (settings: import('../types').Settings) => Promise<{ keys: import('../types').KeyConfig, error: string|null }>,
 *   watch: (onChange: () => void) => import('vscode').FileSystemWatcher,
 * }}
 */
function createKeys({ context, output }) {
  // VS Code gives extensions a storage folder inside the current profile; keybindings.json sits two
  // levels above it.
  const userFile = () => vscode.Uri.joinPath(context.globalStorageUri, '../../keybindings.json');

  /**
   * Looks up the shortcuts for the listed commands and for the four actions the page handles itself.
   *
   * @async
   * @param {import('../types').Settings} settings
   * @returns {Promise<{ keys: import('../types').KeyConfig, error: string|null }>} If VS Code's
   *   keybindings cannot be read, `keys` is F1 alone and `error` says why.
   */
  async function resolve(settings) {
    let defaultsText;
    try {
      defaultsText = await readText(DEFAULT_KEYBINDINGS);
    } catch (err) {
      return fallback(`could not read VS Code's default keybindings (${err.message})`);
    }
    try {
      const { keys, warnings } = buildKeyConfig({ defaultsText, userText: await readUserFile(), escapeActions: settings.escapeActions });
      warnings.forEach((warning) => output.appendLine(`[pi-dock] keybindings: ${warning}`));
      return { keys, error: null };
    } catch (err) {
      return fallback(`could not parse VS Code's default keybindings (${err.message})`);
    }
  }

  /**
   * Reads the user's own shortcuts. Not having the file is normal; any other failure is logged and
   * then treated the same way.
   *
   * @async
   * @returns {Promise<string>} '' if it could not be read.
   */
  async function readUserFile() {
    try {
      return await readText(userFile());
    } catch (err) {
      if (!isMissingFile(err)) output.appendLine(`[pi-dock] could not read your keybindings.json: ${err.message}`);
      return '';
    }
  }

  /**
   * Logs why the shortcuts could not be worked out and falls back to F1 alone.
   *
   * @param {string} why
   * @returns {{ keys: import('../types').KeyConfig, error: string }}
   */
  function fallback(why) {
    output.appendLine(`[pi-dock] WARNING: ${why}. Falling back to F1 only.`);
    return { keys: fallbackKeys(), error: why };
  }

  /**
   * Watches the user's keybindings.json. Only that file: VS Code keeps its own defaults up to date,
   * and those are read again whenever the sidebar opens.
   *
   * @param {() => void} onChange Called when the file is saved, created or deleted.
   * @returns {import('vscode').FileSystemWatcher}
   */
  function watch(onChange) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(userFile(), '..'), 'keybindings.json'));
    watcher.onDidChange(onChange);
    watcher.onDidCreate(onChange);
    watcher.onDidDelete(onChange);
    return watcher;
  }

  return { resolve, watch };
}

module.exports = { createKeys };
