'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { THEME_TOKENS, cssVar, readTheme, splitFamilies, fontStack, PAGE_ACTIONS, stepMatches, matchChord, pageAction, escapeChord, kittyTracker, frame, decodeFrame } = require('../media/terminal');
const { TERMINAL_ACTIONS } = require('../lib/keybindings');
const { terminalHtml, errorHtml } = require('../lib/webview');

test('theme covers the 16 ANSI colours with VS Code token names', () => {
  for (const c of ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']) {
    assert.ok(THEME_TOKENS[c] && THEME_TOKENS[`bright${c[0].toUpperCase()}${c.slice(1)}`], c);
  }
  assert.strictEqual(THEME_TOKENS.brightRed, 'terminal.ansiBrightRed');
  assert.strictEqual(cssVar('terminal.ansiBrightRed'), '--vscode-terminal-ansiBrightRed');
});

test('background is terminal.background when the theme sets it, else the sidebar colour', () => {
  assert.strictEqual(readTheme((v) => ({ '--vscode-sideBar-background': '#111' }[v] || '')).background, '#111');
  const both = { '--vscode-terminal-background': '#222', '--vscode-sideBar-background': '#111' };
  assert.strictEqual(readTheme((v) => both[v] || '').background, '#222');
});

test('colours a theme leaves unset are dropped, not sent as empty strings', () => {
  assert.deepStrictEqual(readTheme((v) => (v === '--vscode-terminal-foreground' ? ' #eee ' : '')), { foreground: '#eee' });
});

test('selectionForeground is read too', () => {
  assert.strictEqual(readTheme((v) => (v === '--vscode-terminal-selectionForeground' ? '#fff' : '')).selectionForeground, '#fff');
});

test('splitFamilies keeps quoted names and commas inside them', () => {
  assert.deepStrictEqual(splitFamilies(`'Droid Sans Mono', "Fira, Code", monospace`), [`'Droid Sans Mono'`, `"Fira, Code"`, 'monospace']);
  assert.deepStrictEqual(splitFamilies(''), []);
});

test('fontStack drops uninstalled families and always ends in monospace', () => {
  const only = (name) => (f) => f === name;
  assert.strictEqual(fontStack(`'Droid Sans Mono', "Fira Code", monospace`, only('"Fira Code"')), `"Fira Code", monospace`);
  assert.strictEqual(fontStack(`'Missing'`, () => false), 'monospace');
  assert.strictEqual(fontStack('', () => false), 'monospace');
});

const step = (over) => ({ ctrl: false, shift: false, alt: false, meta: false, code: 'KeyP', key: 'p', ...over });
const ev = (over) => ({ key: 'p', code: 'KeyP', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...over });

test('stepMatches needs exactly the named modifiers: Ctrl+P is not Ctrl+Shift+P', () => {
  assert.ok(stepMatches(ev({ ctrlKey: true, shiftKey: true, key: 'P' }), step({ ctrl: true, shift: true })));
  assert.ok(!stepMatches(ev({ ctrlKey: true }), step({ ctrl: true, shift: true })));
  assert.ok(!stepMatches(ev({ ctrlKey: true, shiftKey: true }), step({ ctrl: true })));
  assert.ok(!stepMatches(ev({ ctrlKey: true, altKey: true }), step({ ctrl: true })));
});

test('stepMatches uses the physical key, and for letters also the character (other layouts)', () => {
  assert.ok(stepMatches(ev({ ctrlKey: true, key: 'ц', code: 'KeyW' }), step({ ctrl: true, code: 'KeyP', key: 'p' })) === false);
  assert.ok(stepMatches(ev({ ctrlKey: true, key: 'p', code: 'KeyR' }), step({ ctrl: true }))); // AZERTY-style: the p character on another key
  assert.ok(stepMatches(ev({ key: 'F1', code: 'F1' }), step({ code: 'F1', key: undefined })));
  assert.ok(!stepMatches(ev({ ctrlKey: true, key: '-', code: 'Minus' }), step({ ctrl: true, code: 'Equal', key: undefined })));
});

test('ttyd frames: input and resize encode, output decodes from text or binary', () => {
  assert.strictEqual(new TextDecoder().decode(frame('0', 'ls\r')), '0ls\r');
  assert.strictEqual(new TextDecoder().decode(frame('1', '{"columns":80,"rows":24}')), '1{"columns":80,"rows":24}');
  const bin = decodeFrame(new TextEncoder().encode('0HELLO').buffer);
  assert.strictEqual(bin.command, '0');
  assert.strictEqual(new TextDecoder().decode(bin.bytes), 'HELLO');
  assert.strictEqual(decodeFrame('1title').command, '1');
});

const page = (config) => terminalHtml({ cspSource: 'vscode-webview://x', asset: (p) => `https://x/${p}`, config });

test('terminal page: CSP allows only the vendored scripts and the ttyd websocket', () => {
  const html = page({ wsUrl: 'ws://127.0.0.1:4242/tok/ws', options: {}, theme: {}, keys: { escape: [], terminal: {} } });
  assert.match(html, /connect-src ws:\/\/127\.0\.0\.1:4242;/);
  assert.match(html, /script-src vscode-webview:\/\/x;/);
  assert.ok(!html.includes("'unsafe-eval'") && !/script-src[^;]*'unsafe-inline'/.test(html));
  for (const asset of ['xterm/xterm.js', 'xterm/addon-fit.js', 'xterm/addon-webgl.js', 'xterm/addon-serialize.js', 'terminal.js', 'xterm/xterm.css']) assert.ok(html.includes(`https://x/${asset}`), asset);
});

test('terminal page: config JSON cannot close its script tag', () => {
  const html = page({ wsUrl: 'ws://127.0.0.1:1/t/ws', options: { fontFamily: '</script><img src=x onerror=1>' }, theme: {}, keys: { escape: [], terminal: {} } });
  assert.ok(!html.includes('</script><img'));
  const json = html.match(/id="pi-config">([\s\S]*?)<\/script>/)[1];
  assert.strictEqual(JSON.parse(json).options.fontFamily, '</script><img src=x onerror=1>');
});

test('error page escapes the message', () => {
  assert.ok(!errorHtml(new Error('<img src=x onerror=1>')).includes('<img'));
});

test('the three scrollbar slider colours are read from VS Code and reach xterm, which draws its own scrollbar', () => {
  const vars = { '--vscode-scrollbarSlider-background': '#111', '--vscode-scrollbarSlider-hoverBackground': '#222', '--vscode-scrollbarSlider-activeBackground': '#333' };
  const theme = readTheme((v) => vars[v] || '');
  assert.deepStrictEqual([theme.scrollbarSliderBackground, theme.scrollbarSliderHoverBackground, theme.scrollbarSliderActiveBackground], ['#111', '#222', '#333']);
});

test('terminal page styles no scrollbar of its own: xterm draws it from the theme, and the only rule hides the native one', () => {
  const html = page({ wsUrl: 'ws://127.0.0.1:1/t/ws', options: {}, theme: {}, keys: { escape: [], terminal: {} } });
  assert.ok(!/webkit-scrollbar|scrollbar-color/.test(html));
  assert.deepStrictEqual(html.match(/scrollbar-width: [a-z]+/g), ['scrollbar-width: none']);
});

test('terminal page makes xterm\'s viewport transparent (padding shows the terminal background, not black) and hides its native scrollbar', () => {
  const html = page({ wsUrl: 'ws://127.0.0.1:1/t/ws', options: {}, theme: {}, keys: { escape: [], terminal: {} } });
  assert.match(html, /\.xterm:not\(\.allow-transparency\) \.xterm-viewport \{ background-color: transparent; scrollbar-width: none; \}/);
});

test('terminal page anchors the terminal to the bottom and has no bottom padding, so the scrollbar reaches the panel bottom', () => {
  const html = page({ wsUrl: 'ws://127.0.0.1:1/t/ws', options: {}, theme: {}, keys: { escape: [], terminal: {} } });
  assert.match(html, /#term \{[^}]*justify-content: flex-end;/);
  assert.match(html, /\.xterm \{ padding: 5px 0 0 5px; \}/);
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

test('kitty tracker keeps the screens apart, clears on an over-pop, caps depth, and resets', () => {
  const k = kittyTracker();
  k.push('normal', 7);
  k.push('alternate', 5);
  assert.deepStrictEqual(k.state(), { normal: [7], alternate: [5] });
  k.pop('alternate', 9);
  assert.deepStrictEqual(k.state(), { normal: [7], alternate: [] });
  k.set('alternate', 4, 1); // editing an empty stack starts one
  assert.deepStrictEqual(k.state().alternate, [4]);
  for (let i = 0; i < 40; i++) k.push('normal', i);
  assert.ok(k.state().normal.length <= 16, 'a program cannot grow the stack without bound');
  k.reset();
  assert.deepStrictEqual(k.state(), { normal: [], alternate: [] });
});

test('kitty state() is a copy: changing it does not change the tracker', () => {
  const k = kittyTracker();
  k.push('normal', 7);
  k.state().normal.push(99);
  assert.deepStrictEqual(k.state().normal, [7]);
});

// --- which chord a key means (the page's half of lib/keybindings.js) ---

const chord = (steps, over) => ({ steps, selection: false, normalBuffer: false, ...over });
const keysWith = (over) => ({ escape: [], terminal: { copy: [], paste: [], scrollUp: [], scrollDown: [] }, ...over });
const shown = (over) => ({ hasSelection: false, buffer: 'normal', ...over });

test('the page and the extension name the same terminal actions', () => {
  assert.deepStrictEqual(PAGE_ACTIONS, Object.keys(TERMINAL_ACTIONS));
});

test('pageAction returns the action whose chord matches, and null for an unbound key', () => {
  const keys = keysWith({ terminal: { copy: [chord([step({ ctrl: true, shift: true, code: 'KeyC', key: 'c' })])], paste: [], scrollUp: [], scrollDown: [] } });
  assert.strictEqual(pageAction(ev({ ctrlKey: true, shiftKey: true, code: 'KeyC', key: 'C' }), keys, shown()), 'copy');
  assert.strictEqual(pageAction(ev({ ctrlKey: true, code: 'KeyC', key: 'c' }), keys, shown()), null);
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

test('escapeChord matches a chord of any length and reports its steps, so the second key can be awaited', () => {
  const keys = keysWith({ escape: [chord([step({ ctrl: true, code: 'KeyK', key: 'k' }), step({ ctrl: true, code: 'KeyS', key: 's' })])] });
  const match = escapeChord(ev({ ctrlKey: true, code: 'KeyK', key: 'k' }), keys, shown());
  assert.strictEqual(match.steps.length, 2);
  assert.strictEqual(escapeChord(ev({ ctrlKey: true, code: 'KeyJ', key: 'j' }), keys, shown()), undefined);
});

test('matchChord takes the first matching chord and tolerates an action with no chords at all', () => {
  const first = chord([step({ ctrl: true })]);
  const second = chord([step({ ctrl: true })]);
  assert.strictEqual(matchChord([first, second], ev({ ctrlKey: true }), shown(), false), first);
  assert.strictEqual(matchChord(undefined, ev({ ctrlKey: true }), shown(), false), undefined);
});

test('the error page shows what ttyd said, escaped, and leaves the block out when it said nothing', () => {
  const withDetails = Object.assign(new Error('ttyd exited before it started listening.'), { details: 'ttyd: invalid option -- \'Q\'\n<img src=x>' });
  const html = errorHtml(withDetails);
  assert.match(html, /<pre>ttyd: invalid option -- &#39;Q&#39;\n&lt;img src=x&gt;<\/pre>/);
  assert.ok(!html.includes('<img src=x>'), 'details must not be able to inject markup');
  assert.ok(!errorHtml(new Error('plain')).includes('<pre>'), 'no details, no empty block');
  assert.ok(!errorHtml(Object.assign(new Error('plain'), { details: '   \n ' })).includes('<pre>'), 'whitespace is not details');
});
