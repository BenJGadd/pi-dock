'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { TERMINAL_ACTIONS, stripJsonc, parseKeybindings, parseStep, parseChord, resolveChords, buildKeyConfig, fallbackKeys } = require('../lib/keybindings');

// Entries as VS Code's Linux defaults have them (copied from vscode://defaultsettings/keybindings.json, 1.116).
const DEFAULTS = `// Override key bindings by placing them into your key bindings file.
[
{ "key": "f1",                    "command": "workbench.action.showCommands" },
{ "key": "ctrl+shift+p",          "command": "workbench.action.showCommands" },
{ "key": "ctrl+p",                "command": "workbench.action.quickOpen" },
{ "key": "ctrl+e",                "command": "workbench.action.quickOpen" },
{ "key": "ctrl+k ctrl+s",         "command": "workbench.action.openGlobalKeybindings" },
{ "key": "ctrl+shift+c",          "command": "workbench.action.terminal.copySelection",
                                     "when": "terminalTextSelectedInFocused || terminalFocus && terminalTextSelected" },
{ "key": "ctrl+shift+v",          "command": "workbench.action.terminal.paste",
                                     "when": "terminalFocus && terminalHasBeenCreated" },
{ "key": "shift+pageup",          "command": "workbench.action.terminal.scrollUpPage",
                                     "when": "terminalFocusInAny && !terminalAltBufferActive" },
{ "key": "shift+pagedown",        "command": "workbench.action.terminal.scrollDownPage",
                                     "when": "terminalFocusInAny && !terminalAltBufferActive" },
{ "key": "ctrl+alt+9",            "command": "some.extension.command" }, // contributed by an extension
]`;
const defaults = parseKeybindings(DEFAULTS);
const label = (chords) => chords.map((c) => c.steps.map((s) => [s.ctrl && 'ctrl', s.shift && 'shift', s.alt && 'alt', s.meta && 'meta', s.code].filter(Boolean).join('+')).join(' '));
const resolve = (user, commands) => resolveChords({ defaults, user: parseKeybindings(JSON.stringify(user)), commands }).chords;
const SHOW = 'workbench.action.showCommands';

test('stripJsonc removes comments and trailing commas but leaves strings alone', () => {
  assert.deepStrictEqual(JSON.parse(stripJsonc('[ // one\n {"a": "x // not a comment /* nor this */", /* gone */ "b": 1,}, ]')), [{ a: 'x // not a comment /* nor this */', b: 1 }]);
  assert.deepStrictEqual(JSON.parse(stripJsonc('["a\\"//b"]')), ['a"//b']);
});

test('parseKeybindings reads the real file shape and rejects a non-list', () => {
  assert.strictEqual(defaults.length, 10);
  assert.throws(() => parseKeybindings('{"a":1}'), /not a list/);
});

test('key names map to physical key codes: letters, digits, f-keys, named, punctuation, numpad, [Code]', () => {
  const code = (text) => parseStep(text).code;
  assert.strictEqual(code('ctrl+shift+p'), 'KeyP');
  assert.strictEqual(code('ctrl+9'), 'Digit9');
  assert.strictEqual(code('f12'), 'F12');
  assert.strictEqual(code('shift+pageup'), 'PageUp');
  assert.strictEqual(code('ctrl+shift+='), 'Equal');
  assert.strictEqual(code('ctrl+-'), 'Minus');
  assert.strictEqual(code('ctrl+`'), 'Backquote');
  assert.strictEqual(code('ctrl+numpad_add'), 'NumpadAdd');
  assert.strictEqual(code('ctrl+numpad0'), 'Numpad0');
  assert.strictEqual(code('ctrl+[IntlBackslash]'), 'IntlBackslash');
  assert.strictEqual(code('alt+up'), 'ArrowUp');
});

test('modifiers: cmd, win and meta are one; letters also carry their character', () => {
  assert.strictEqual(parseStep('cmd+p').meta, true);
  assert.strictEqual(parseStep('win+p').meta, true);
  assert.strictEqual(parseStep('meta+p').meta, true);
  assert.strictEqual(parseStep('ctrl+p').key, 'p');
  assert.strictEqual(parseStep('ctrl+-').key, undefined);
  assert.strictEqual(parseStep('ctrl+nonsense'), null);
});

test('two-step chords parse to two steps; anything unmatchable is null', () => {
  assert.strictEqual(parseChord('ctrl+k ctrl+s').length, 2);
  assert.strictEqual(parseChord('ctrl+k nonsense'), null);
  assert.strictEqual(parseChord(undefined), null);
});

test('defaults resolve per command, and other commands are left out', () => {
  const r = resolve([], [SHOW]);
  assert.deepStrictEqual(label(r[SHOW]), ['F1', 'ctrl+shift+KeyP']);
  assert.deepStrictEqual(Object.keys(r), [SHOW]);
});

test('a user rebind of the action is followed, alongside what remains of the defaults', () => {
  const r = resolve([{ key: 'ctrl+alt+k', command: SHOW }], [SHOW]);
  assert.deepStrictEqual(label(r[SHOW]), ['F1', 'ctrl+shift+KeyP', 'ctrl+alt+KeyK']);
});

test('removal with a key drops that default; modifier order in the user file does not matter', () => {
  assert.deepStrictEqual(label(resolve([{ key: 'shift+ctrl+p', command: `-${SHOW}` }], [SHOW])[SHOW]), ['F1']);
});

test('removal with no key drops every default binding of the command', () => {
  assert.deepStrictEqual(resolve([{ command: `-${SHOW}` }], [SHOW])[SHOW], []);
});

test('removing a first step also removes the two-step chords that begin with it', () => {
  const cmd = 'workbench.action.openGlobalKeybindings';
  assert.strictEqual(resolve([], [cmd])[cmd].length, 1);
  assert.deepStrictEqual(resolve([{ key: 'ctrl+k', command: `-${cmd}` }], [cmd])[cmd], []);
  assert.strictEqual(resolve([{ key: 'ctrl+k ctrl+x', command: `-${cmd}` }], [cmd])[cmd].length, 1, 'a different second step removes nothing');
});

test('a removal that cannot be read removes nothing, not everything', () => {
  assert.strictEqual(resolve([{ key: 'ctrl+nonsense', command: `-${SHOW}` }], [SHOW])[SHOW].length, 2);
});

test('removals never touch the user\'s own entries, and the removal\'s `when` is ignored', () => {
  const r = resolve([{ key: 'ctrl+alt+k', command: SHOW }, { key: 'ctrl+alt+k', command: `-${SHOW}` }, { key: 'f1', command: `-${SHOW}`, when: 'terminalFocus' }], [SHOW]);
  assert.deepStrictEqual(label(r[SHOW]), ['ctrl+shift+KeyP', 'ctrl+alt+KeyK']);
});

test('the two contexts the page can answer are read from `when`, and nothing else is', () => {
  const r = resolve([], Object.values(TERMINAL_ACTIONS));
  assert.deepStrictEqual(r[TERMINAL_ACTIONS.copy].map((c) => [c.selection, c.normalBuffer]), [[true, false]]);
  assert.deepStrictEqual(r[TERMINAL_ACTIONS.paste].map((c) => [c.selection, c.normalBuffer]), [[false, false]]);
  assert.deepStrictEqual(r[TERMINAL_ACTIONS.scrollUp].map((c) => [c.selection, c.normalBuffer]), [[false, true]]);
  assert.deepStrictEqual(resolve([], [SHOW])[SHOW].map((c) => [c.selection, c.normalBuffer]), [[false, false], [false, false]]);
});

test('buildKeyConfig: default action escapes, terminal actions resolve, warnings are reported', () => {
  const { keys, warnings } = buildKeyConfig({ defaultsText: DEFAULTS, userText: '[]', escapeActions: [SHOW] });
  assert.deepStrictEqual(label(keys.escape), ['F1', 'ctrl+shift+KeyP']);
  assert.deepStrictEqual(label(keys.terminal.copy), ['ctrl+shift+KeyC']);
  assert.deepStrictEqual(label(keys.terminal.scrollDown), ['shift+PageDown']);
  assert.deepStrictEqual(warnings, []);
});

test('buildKeyConfig: listing more actions adds their chords; a broken user file degrades to defaults with a warning', () => {
  const both = buildKeyConfig({ defaultsText: DEFAULTS, userText: '[]', escapeActions: [SHOW, 'workbench.action.quickOpen'] });
  assert.deepStrictEqual(label(both.keys.escape), ['F1', 'ctrl+shift+KeyP', 'ctrl+KeyP', 'ctrl+KeyE']);
  const broken = buildKeyConfig({ defaultsText: DEFAULTS, userText: '[ {oops', escapeActions: [SHOW] });
  assert.deepStrictEqual(label(broken.keys.escape), ['F1', 'ctrl+shift+KeyP']);
  assert.match(broken.warnings[0], /keybindings\.json could not be read/);
});

test('buildKeyConfig throws on unreadable defaults, and the fallback is F1 alone with no terminal chords', () => {
  assert.throws(() => buildKeyConfig({ defaultsText: 'not json', userText: '', escapeActions: [SHOW] }));
  const fb = fallbackKeys();
  assert.deepStrictEqual(label(fb.escape), ['F1']);
  assert.deepStrictEqual(Object.values(fb.terminal), [[], [], [], []]);
});
