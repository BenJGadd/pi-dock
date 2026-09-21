// Working out which key presses go to VS Code instead of Pi.
//
// Pi Dock never names a shortcut. It names VS Code commands, which have stable ids like
// `workbench.action.showCommands`, and VS Code's own configuration says which keys those sit on for
// this platform, with the user's edits applied. Rebind the command palette and its escape from Pi
// moves with it.
//
// Two files are read, both JSON with comments, both lists of { key, command, when }:
//   defaults  VS Code's own, which it generates and keeps up to date
//   user      the user's keybindings.json, where "-someCommand" removes a default shortcut
//
// No VS Code here, so `node --test` can check it.

'use strict';

/**
 * One line of a keybindings.json.
 *
 * @typedef {object} Entry
 * @property {string} [key] e.g. 'ctrl+shift+p' or 'ctrl+k ctrl+s'.
 * @property {string} [command] A command id, or '-id' to remove a default shortcut.
 * @property {string} [when] Only two parts of this are read; see conditions.
 */

// The four actions the page handles itself, and the VS Code commands they match. Their shortcuts are
// looked up like any other; only the behaviour lives in the page.
const TERMINAL_ACTIONS = {
  copy: 'workbench.action.terminal.copySelection',
  paste: 'workbench.action.terminal.paste',
  scrollUp: 'workbench.action.terminal.scrollUpPage',
  scrollDown: 'workbench.action.terminal.scrollDownPage',
};

// Used only when VS Code's defaults cannot be read, so there is always a way out of the terminal.
// F1 is the one key neither VS Code nor Pi uses for anything else.
const FALLBACK_ESCAPE = [{ steps: [{ ctrl: false, shift: false, alt: false, meta: false, code: 'F1' }], selection: false, normalBuffer: false }];

/**
 * Strips comments and trailing commas, leaving quoted text alone. VS Code allows both in its settings
 * files and the extension API offers no parser for that.
 *
 * @param {string} text
 * @returns {string} Ordinary JSON, with line breaks kept so a parse error still points somewhere.
 */
function stripJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      i = i < 0 ? text.length : i + 1;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[\]}])/g, '$1');
}

/**
 * Reads a keybindings file, ignoring anything in it that is not an object.
 *
 * @param {string} text
 * @returns {Entry[]}
 * @throws {Error} If the file is not valid JSON, or is not a list.
 */
function parseKeybindings(text) {
  const entries = JSON.parse(stripJsonc(text));
  if (!Array.isArray(entries)) throw new Error('keybindings are not a list');
  return entries.filter((entry) => entry && typeof entry === 'object');
}

// VS Code's key names, and the browser's name for the same physical key. Keys are matched by
// position, so a punctuation shortcut on a non-US keyboard may sit elsewhere than it does in VS Code.
// Letters are also matched by character (see the page), which covers the common case.
const NAMED_KEYS = {
  escape: 'Escape', enter: 'Enter', tab: 'Tab', space: 'Space', backspace: 'Backspace', delete: 'Delete', insert: 'Insert',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  capslock: 'CapsLock', pausebreak: 'Pause', contextmenu: 'ContextMenu', browserback: 'BrowserBack', browserforward: 'BrowserForward',
  ',': 'Comma', '-': 'Minus', '.': 'Period', '/': 'Slash', ';': 'Semicolon', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight',
  '\\': 'Backslash', '`': 'Backquote', "'": 'Quote',
  numpad_add: 'NumpadAdd', numpad_subtract: 'NumpadSubtract', numpad_multiply: 'NumpadMultiply', numpad_divide: 'NumpadDivide', numpad_decimal: 'NumpadDecimal', numpad_separator: 'NumpadComma',
};
const MODIFIERS = { ctrl: 'ctrl', control: 'ctrl', shift: 'shift', alt: 'alt', option: 'alt', meta: 'meta', cmd: 'meta', command: 'meta', win: 'meta', super: 'meta' };

/**
 * Returns the physical key one of VS Code's key names means.
 *
 * @param {string} token e.g. 'p', '7', 'f12', 'pageup', '[IntlBackslash]'.
 * @returns {{ code: string, key?: string }|null} `key` is filled in for letters. Null for a key we
 *   cannot place.
 */
function codeFor(token) {
  if (NAMED_KEYS[token]) return { code: NAMED_KEYS[token] };
  if (/^[a-z]$/.test(token)) return { code: `Key${token.toUpperCase()}`, key: token };
  if (/^[0-9]$/.test(token)) return { code: `Digit${token}` };
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(token)) return { code: token.toUpperCase() };
  if (/^numpad[0-9]$/.test(token)) return { code: `Numpad${token.slice(6)}` };
  const literal = /^\[(\w+)\]$/.exec(token); // keys with no character are written as their own name
  return literal ? { code: literal[1] } : null;
}

/**
 * Parses one key press: "ctrl+shift+p" becomes { ctrl, shift, alt, meta, code, key? }.
 *
 * @param {string} text
 * @returns {import('../types').Step|null} Null for a key we cannot place.
 */
function parseStep(text) {
  const mods = { ctrl: false, shift: false, alt: false, meta: false };
  let key = null;
  for (const raw of text.split('+')) {
    const name = raw.toLowerCase();
    if (MODIFIERS[name]) mods[MODIFIERS[name]] = true;
    else key = codeFor(raw.startsWith('[') && raw.length > 1 ? raw : name); // "[IntlBackslash]" keeps its capitals
  }
  return key ? { ...mods, ...key } : null;
}

/**
 * Parses a whole shortcut: "ctrl+k ctrl+s" becomes two steps.
 *
 * @param {*} text An entry's `key`, which might not be a string.
 * @returns {import('../types').Step[]|null} Null if any step cannot be placed.
 */
function parseChord(text) {
  if (typeof text !== 'string') return null;
  const steps = text.trim().split(/\s+/).map(parseStep);
  return steps.length && steps.every(Boolean) ? steps : null;
}

const ALL = Symbol('a removal with no key: every default shortcut for the command');

/**
 * Compares two key presses.
 *
 * @param {import('../types').Step} a
 * @param {import('../types').Step} b
 * @returns {boolean}
 */
const sameStep = (a, b) => a.code === b.code && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta;

/**
 * Reads the two parts of a shortcut's `when` that the page can answer.
 *
 * The rest is ignored: a listed action escapes wherever VS Code would take it. These two are
 * exceptions because ignoring them would take keys from Pi that VS Code's terminal leaves alone.
 * `terminalTextSelected` makes copy Ctrl+C on Windows only while text is selected, and
 * `!terminalAltBufferActive` keeps paging to the scrollback a full-screen program does not have.
 *
 * @param {*} when An entry's `when`, which might not be a string.
 * @returns {{ selection: boolean, normalBuffer: boolean }}
 */
function conditions(when) {
  const text = typeof when === 'string' ? when : '';
  return { selection: /(?<![!\w])terminalTextSelected/.test(text), normalBuffer: /!terminalAltBufferActive/.test(text) };
}

/**
 * Collects the shortcuts for each of `commands`, following VS Code's removal rule.
 *
 * A "-someCommand" user entry drops default shortcuts for that command: with no key it drops all of
 * them, with a key it drops the ones starting with that key, so removing "ctrl+k" also removes
 * "ctrl+k ctrl+s". Removals never touch the user's own entries, and their `when` is ignored, so one
 * written for a single situation removes the shortcut everywhere.
 *
 * @param {object} args
 * @param {Entry[]} args.defaults
 * @param {Entry[]} args.user Or [] if there are none.
 * @param {string[]} args.commands The command ids to look up.
 * @returns {{ chords: Record<string, import('../types').Chord[]>, unparsed: number }} One entry per
 *   command asked for, plus a count of shortcuts whose keys could not be placed.
 */
function resolveChords({ defaults, user, commands }) {
  const wanted = new Set(commands);
  const removals = new Map();
  for (const entry of user) {
    if (typeof entry.command === 'string' && entry.command.startsWith('-')) {
      const chord = entry.key === undefined ? ALL : parseChord(entry.key);
      if (!chord) continue; // a removal we cannot read must remove nothing, not everything
      const command = entry.command.slice(1);
      removals.set(command, [...(removals.get(command) || []), chord]);
    }
  }
  const isRemoved = (entry, steps) =>
    (removals.get(entry.command) || []).some((removal) => removal === ALL || removal.every((step, i) => steps[i] && sameStep(step, steps[i])));

  const result = Object.fromEntries(commands.map((command) => [command, []]));
  let unparsed = 0;
  const add = (entry, isDefault) => {
    if (typeof entry.command !== 'string' || !wanted.has(entry.command)) return;
    const steps = parseChord(entry.key);
    if (!steps) return void unparsed++;
    if (isDefault && isRemoved(entry, steps)) return;
    result[entry.command].push({ steps, ...conditions(entry.when) });
  };
  defaults.forEach((entry) => add(entry, true));
  user.forEach((entry) => add(entry, false));
  return { chords: result, unparsed };
}

/**
 * Builds the key setup for one page: the shortcuts of the listed commands, and of the four actions
 * the page handles itself.
 *
 * @param {object} args
 * @param {string} args.defaultsText VS Code's own keybindings file.
 * @param {string} args.userText Or '' if there is none.
 * @param {string[]} args.escapeActions Command ids from piDock.escapeActions.
 * @returns {{ keys: import('../types').KeyConfig, warnings: string[] }} Each warning names something
 *   skipped; none is a reason to stop.
 * @throws {Error} If `defaultsText` cannot be read. The caller falls back to F1 and says why.
 */
function buildKeyConfig({ defaultsText, userText, escapeActions }) {
  const warnings = [];
  const defaults = parseKeybindings(defaultsText);
  let user = [];
  if (userText) {
    try {
      user = parseKeybindings(userText);
    } catch (err) {
      warnings.push(`your keybindings.json could not be read (${err.message}); using VS Code's defaults only`);
    }
  }
  const commands = [...new Set([...escapeActions, ...Object.values(TERMINAL_ACTIONS)])];
  const { chords, unparsed } = resolveChords({ defaults, user, commands });
  if (unparsed) warnings.push(`${unparsed} keybinding(s) for these actions use keys Pi Dock cannot match and were skipped`);
  return {
    keys: {
      escape: escapeActions.flatMap((action) => chords[action]),
      terminal: Object.fromEntries(Object.entries(TERMINAL_ACTIONS).map(([name, command]) => [name, chords[command]])),
    },
    warnings,
  };
}

/**
 * Returns F1 and nothing else, for when VS Code's keybindings cannot be read.
 *
 * @returns {import('../types').KeyConfig}
 */
const fallbackKeys = () => ({ escape: FALLBACK_ESCAPE, terminal: Object.fromEntries(Object.keys(TERMINAL_ACTIONS).map((name) => [name, []])) });

module.exports = { TERMINAL_ACTIONS, stripJsonc, parseKeybindings, parseStep, parseChord, resolveChords, buildKeyConfig, fallbackKeys };
