// The two pages Pi Dock can show: the terminal, and an apology if it could not start.
//
// Plain strings with no VS Code involved, so the tests can check them as text.

'use strict';

const crypto = require('crypto');

/**
 * Returns a one-time value for a page's Content-Security-Policy, which then allows the one script
 * tagged with it and nothing else.
 *
 * @returns {string}
 */
const nonce = () => crypto.randomBytes(16).toString('hex');

/**
 * The page's own scripts, under page/, in the order they load. They are plain scripts sharing
 * their top-level declarations, so a file must come after every file it uses; main.js uses all
 * the others and runs the page, so it is last (page/main.js explains).
 */
const PAGE_SCRIPTS = ['theme.js', 'keys.js', 'paste.js', 'links.js', 'snapshot.js', 'socket.js', 'main.js'];

/** The vendored xterm.js and its add-ons, loaded before the page's own scripts. */
const XTERM_SCRIPTS = ['xterm/xterm.js', 'xterm/addon-fit.js', 'xterm/addon-webgl.js', 'xterm/addon-serialize.js', 'xterm/addon-unicode11.js'];

/**
 * Makes text safe to put into HTML.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

/**
 * Turns a file name under page/ into an address the page may load.
 *
 * @callback AssetUri
 * @param {string} path Path below page/, e.g. 'xterm/xterm.js'.
 * @returns {string}
 */

/**
 * Builds the terminal page.
 *
 * It loads xterm.js from page/xterm/ and connects straight to ttyd's websocket. The settings are written
 * into the HTML as JSON rather than sent afterwards, so the terminal is correct on its first frame.
 *
 * @param {object} args
 * @param {string} args.cspSource The webview's `cspSource`, the only origin scripts may come from.
 * @param {AssetUri} args.asset
 * @param {import('../types').PageConfig} args.config Passed straight to page/main.js.
 * @returns {string} A whole HTML document.
 */
function terminalHtml({ cspSource, asset, config }) {
  const wsOrigin = new URL(config.wsUrl).origin;
  const json = JSON.stringify(config).replace(/</g, '\\u003c'); // so it cannot end the <script> it sits in
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; connect-src ${wsOrigin}; font-src ${cspSource};">
<link rel="stylesheet" href="${asset('xterm/xterm.css')}">
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
  /* A terminal fits whole rows only, so a few spare pixels are always left over. Pushing it to the
     bottom puts them at the top as background, and lets the scrollbar reach the bottom of the panel. */
  #term { height: 100%; display: flex; flex-direction: column; justify-content: flex-end; position: relative; }
  .xterm { padding: 5px 0 0 5px; }
  /* xterm.js paints its scrolling area black, covering that padding. Making it see-through shows the
     terminal's own background instead, which then reveals the browser's plain scrollbar next to
     xterm.js's own, so hide the plain one. */
  .xterm:not(.allow-transparency) .xterm-viewport { background-color: transparent; scrollbar-width: none; }
</style>
</head>
<body>
<div id="term"></div>
<div id="status" hidden></div>
<script type="application/json" id="pi-config">${json}</script>
${[...XTERM_SCRIPTS, ...PAGE_SCRIPTS].map((file) => `<script src="${asset(file)}"></script>`).join('\n')}
</body>
</html>`;
}

/**
 * Builds the page shown when Pi could not start. Its buttons post back to extension.js.
 *
 * An error carrying a `details` string shows it below the message. That is where whatever ttyd
 * printed on its way out ends up, which is often the only thing that explains the failure.
 *
 * @param {Error|*} err Everything shown is escaped.
 * @returns {string} A whole HTML document.
 */
function errorHtml(err) {
  const message = escapeHtml(err && err.message ? err.message : String(err));
  const details = err && typeof err.details === 'string' ? err.details.trim() : '';
  const scriptNonce = nonce();
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}';">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 12px 16px; line-height: 1.5; }
  p { margin: 0 0 12px; }
  button { font: inherit; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 2px; padding: 4px 12px; cursor: pointer; margin-right: 8px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  pre { margin: 0 0 12px; padding: 8px 10px; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--vscode-editor-font-family); font-size: 0.9em; color: var(--vscode-descriptionForeground); background: var(--vscode-textCodeBlock-background); border-radius: 2px; }
</style>
</head>
<body>
<p>Pi could not start.</p>
<p>${message}</p>
${details ? `<pre>${escapeHtml(details)}</pre>` : ''}
<button id="restart">Try again</button>
<button id="log" class="secondary">Show log</button>
<script nonce="${scriptNonce}">
  const api = acquireVsCodeApi();
  document.getElementById('restart').addEventListener('click', () => api.postMessage({ type: 'restart' }));
  document.getElementById('log').addEventListener('click', () => api.postMessage({ type: 'showLog' }));
</script>
</body>
</html>`;
}

module.exports = { PAGE_SCRIPTS, XTERM_SCRIPTS, terminalHtml, errorHtml };
