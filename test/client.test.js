'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { PAGE_ACTIONS, pageAction } = require('../page/keys');
const { kittyTracker } = require('../page/snapshot');
const { TERMINAL_ACTIONS } = require('../lib/keybindings');
const { terminalHtml } = require('../lib/webview');

const step = (over) => ({ ctrl: false, shift: false, alt: false, meta: false, code: 'KeyP', key: 'p', ...over });
const ev = (over) => ({ key: 'p', code: 'KeyP', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...over });

const page = (config) => terminalHtml({ cspSource: 'vscode-webview://x', asset: (p) => `https://x/${p}`, config });

test('terminal page: CSP allows only the vendored scripts and the ttyd websocket', () => {
  const html = page({ wsUrl: 'ws://127.0.0.1:4242/tok/ws', options: {}, theme: {}, keys: { escape: [], terminal: {} } });
  assert.match(html, /connect-src ws:\/\/127\.0\.0\.1:4242;/);
  assert.match(html, /script-src vscode-webview:\/\/x;/);
  assert.ok(!html.includes("'unsafe-eval'") && !/script-src[^;]*'unsafe-inline'/.test(html));
  for (const asset of ['xterm/xterm.js', 'xterm/addon-fit.js', 'xterm/addon-webgl.js', 'xterm/addon-serialize.js', 'main.js', 'xterm/xterm.css']) assert.ok(html.includes(`https://x/${asset}`), asset);
});

test('terminal page: config JSON cannot close its script tag', () => {
  const html = page({ wsUrl: 'ws://127.0.0.1:1/t/ws', options: { fontFamily: '</script><img src=x onerror=1>' }, theme: {}, keys: { escape: [], terminal: {} } });
  assert.ok(!html.includes('</script><img'));
  const json = html.match(/id="pi-config">([\s\S]*?)<\/script>/)[1];
  assert.strictEqual(JSON.parse(json).options.fontFamily, '</script><img src=x onerror=1>');
});

test('kitty tracker mirrors the per-screen flag stack: push, pop, and the three ways to edit the top', () => {
  const k = kittyTracker();
  k.push('normal', 7);
  k.push('normal', 1);
  assert.deepStrictEqual(k.state(), { normal: [7, 1], alternate: [] });
  k.pop('normal', 1);
  assert.deepStrictEqual(k.state().normal, [7]);
  k.set('normal', 8, 2); // add
  assert.deepStrictEqual(k.state().normal, [15]);
  k.set('normal', 1, 3); // remove
  assert.deepStrictEqual(k.state().normal, [14]);
  k.set('normal', 3, 1); // replace
  assert.deepStrictEqual(k.state().normal, [3]);
});

// --- which chord a key means (the page's half of lib/keybindings.js) ---

const chord = (steps, over) => ({ steps, selection: false, normalBuffer: false, ...over });
const keysWith = (over) => ({ escape: [], terminal: { copy: [], paste: [], scrollUp: [], scrollDown: [] }, ...over });
const shown = (over) => ({ hasSelection: false, buffer: 'normal', ...over });

test('the page and the extension name the same terminal actions', () => {
  assert.deepStrictEqual(PAGE_ACTIONS, Object.keys(TERMINAL_ACTIONS));
});

test('pageAction leaves the first key of a two-step chord to VS Code', () => {
  const twoStep = [chord([step({ ctrl: true, code: 'KeyK', key: 'k' }), step({ ctrl: true, code: 'KeyC', key: 'c' })])];
  const keys = keysWith({ terminal: { copy: twoStep, paste: [], scrollUp: [], scrollDown: [] } });
  assert.strictEqual(pageAction(ev({ ctrlKey: true, code: 'KeyK', key: 'k' }), keys, shown()), null);
});

test('copy bound only while text is selected (Windows Ctrl+C) stays with Pi when nothing is selected', () => {
  const keys = keysWith({ terminal: { copy: [chord([step({ ctrl: true, code: 'KeyC', key: 'c' })], { selection: true })], paste: [], scrollUp: [], scrollDown: [] } });
  const key = ev({ ctrlKey: true, code: 'KeyC', key: 'c' });
  assert.strictEqual(pageAction(key, keys, shown()), null);
  assert.strictEqual(pageAction(key, keys, shown({ hasSelection: true })), 'copy');
});

test('page scrolling applies to the scrollback, not to a full-screen program', () => {
  const keys = keysWith({ terminal: { copy: [], paste: [], scrollUp: [chord([step({ shift: true, code: 'PageUp', key: undefined })], { normalBuffer: true })], scrollDown: [] } });
  const key = ev({ shiftKey: true, code: 'PageUp', key: 'PageUp' });
  assert.strictEqual(pageAction(key, keys, shown()), 'scrollUp');
  assert.strictEqual(pageAction(key, keys, shown({ buffer: 'alternate' })), null);
});

