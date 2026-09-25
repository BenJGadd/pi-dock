'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseKeybindings, resolveChords, buildKeyConfig, fallbackKeys } = require('../lib/keybindings');

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
