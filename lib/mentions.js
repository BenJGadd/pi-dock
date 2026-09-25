// Turning file addresses into the `@path` mentions Pi understands.
//
// A pasted image is saved to a file, and that file's address (a file:// URI) comes here
// (host/images.js). Pi's prompt refers to files as
// `@src/foo.js`, relative to the folder it runs in, which is the same folder ttyd starts it in
// (host/settings.js workspaceCwd). So each address becomes one such token, and the tokens are typed
// into Pi as one paste.
//
// The spelling copies what Pi's own path completion produces, so the file reads exactly as
// if it had been typed with Tab. Pi 0.87.0, package @earendil-works/pi-tui, dist/autocomplete.js:
//   - a path is wrapped as `@"…"` when it contains whitespace or CJK punctuation
//     (buildCompletionValue, line 94, testing autocompleteSeparatorRegex from dist/utils.js:48);
//   - a directory is completed as `@dir/`, with the slash (lines 533 and 643);
//   - backslashes are shown as forward slashes (toDisplayPath, line 9).
//
// No VS Code here, so `node --test` can check it.

'use strict';

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

// Pi's rule for when a path needs quotes: any whitespace, or the punctuation that separates prose
// from a path in Chinese, Japanese and Korean text. Copied from pi-tui dist/utils.js:47-48.
const CJK_PUNCTUATION = /(?:(?=\p{Punctuation})[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]|[，．：；！？（）［］｛｝“”‘’…—])/u;
const NEEDS_QUOTES = new RegExp(`(?:\\s|${CJK_PUNCTUATION.source})`, 'u');

/**
 * Turns one file:// address into a local path.
 *
 * @param {string} uri
 * @returns {string|null} Null for anything that is not a file on this machine.
 */
function localPath(uri) {
  try {
    return fileURLToPath(uri);
  } catch (_) {
    return null; // not file://, or malformed
  }
}

/**
 * Checks whether a path is a directory. Missing files count as files.
 *
 * @param {string} file
 * @returns {boolean}
 */
function isDirectory(file) {
  try {
    return fs.statSync(file).isDirectory();
  } catch (_) {
    return false;
  }
}

/**
 * Spells one file as Pi's own completion would: relative to `cwd` when it is inside it, a slash
 * after a directory, forward slashes throughout, and quotes when the path has a space in it.
 *
 * @param {string} file A full path.
 * @param {string} cwd The folder Pi runs in.
 * @param {(file: string) => boolean} [isDir] Replaceable for tests.
 * @returns {string} e.g. `@src/foo.js`, `@"my docs/"`, `@/etc/hosts`.
 */
function mentionToken(file, cwd, isDir = isDirectory) {
  const relative = path.relative(cwd, file);
  const outside = !relative || relative.startsWith('..') || path.isAbsolute(relative);
  let spelled = (outside ? file : relative).split(path.sep).join('/');
  if (isDir(file) && !spelled.endsWith('/')) spelled += '/';
  return NEEDS_QUOTES.test(spelled) ? `@"${spelled}"` : `@${spelled}`;
}

/**
 * Turns file addresses into the text to type into Pi.
 *
 * @param {string[]} uris In the order they should be typed.
 * @param {string} cwd The folder Pi runs in.
 * @param {(file: string) => boolean} [isDir] Replaceable for tests.
 * @returns {string} One token per file, space-separated and ending in a space so the next word
 *   typed does not join the last path. Empty when none of them was a local file.
 */
function mentionText(uris, cwd, isDir = isDirectory) {
  const tokens = [];
  for (const uri of uris) {
    const file = localPath(uri);
    if (file) tokens.push(mentionToken(file, cwd, isDir));
  }
  return tokens.length ? `${tokens.join(' ')} ` : '';
}

module.exports = { localPath, mentionToken, mentionText };
