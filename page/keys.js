// Which keys Pi gets, which the page handles itself, and which VS Code should have.
//
// The shortcuts come from VS Code's own keybindings, resolved by the extension (lib/keybindings.js)
// and handed to the page as data; nothing here names a key. The pure helpers decide what a press
// means; installKeyHandler is the state a key handler has to keep between presses.
//
// Needs nothing from the other page files; page/main.js uses it.

'use strict';

// The four actions the page handles itself, in the order a key press is checked against them. The
// names match the ones lib/keybindings.js uses in `keys.terminal`.
const PAGE_ACTIONS = ['copy', 'paste', 'scrollUp', 'scrollDown'];

/**
 * Checks a key press against one step of a shortcut.
 *
 * Matched by physical key, and for letters by character too, which covers layouts that move the
 * letters around. Modifiers must match exactly, so Ctrl+P is not Ctrl+Shift+P.
 *
 * @param {KeyboardEvent} event
 * @param {import('../types').Step} step
 * @returns {boolean}
 */
function stepMatches(event, step) {
  return (
    event.ctrlKey === step.ctrl &&
    event.shiftKey === step.shift &&
    event.altKey === step.alt &&
    event.metaKey === step.meta &&
    (event.code === step.code || (step.key !== undefined && event.key.toLowerCase() === step.key))
  );
}

/**
 * Checks a shortcut's two conditions. See lib/keybindings.js for what they mean.
 *
 * @param {import('../types').Chord} chord
 * @param {import('../types').TerminalState} state
 * @returns {boolean}
 */
const chordApplies = (chord, state) =>
  (!chord.selection || state.hasSelection) && (!chord.normalBuffer || state.buffer === 'normal');

/**
 * Returns the first shortcut whose conditions hold and whose first key is the one pressed.
 *
 * @param {import('../types').Chord[]|undefined} chords
 * @param {KeyboardEvent} event
 * @param {import('../types').TerminalState} state
 * @param {boolean} singleStepOnly Set for the actions this page performs. The first key of a
 *   two-key shortcut belongs to VS Code, which is waiting for the second.
 * @returns {import('../types').Chord|undefined}
 */
function matchChord(chords, event, state, singleStepOnly) {
  return (chords || []).find(
    (chord) => (!singleStepOnly || chord.steps.length === 1) && chordApplies(chord, state) && stepMatches(event, chord.steps[0]),
  );
}

/**
 * Returns which of this page's four actions a key press triggers.
 *
 * @param {KeyboardEvent} event
 * @param {import('../types').KeyConfig} keys
 * @param {import('../types').TerminalState} state
 * @returns {string|null} A name from PAGE_ACTIONS, or null.
 */
const pageAction = (event, keys, state) =>
  PAGE_ACTIONS.find((name) => matchChord(keys.terminal[name], event, state, true)) || null;

/**
 * Returns the shortcut a key press starts, out of those the user wants VS Code to have.
 *
 * @param {KeyboardEvent} event
 * @param {import('../types').KeyConfig} keys
 * @param {import('../types').TerminalState} state
 * @returns {import('../types').Chord|undefined}
 */
const escapeChord = (event, keys, state) => matchChord(keys.escape, event, state, false);

const CHORD_TIMEOUT_MS = 5000; // how long VS Code is assumed to wait for the second key of a shortcut
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph']);

/**
 * Returns what the page does for each of its four actions. The shortcuts come from VS Code like any
 * other; only the behaviour is here.
 *
 * @param {*} term
 * @returns {Record<string, (() => void)|null>} `paste` is null because the browser's own paste
 *   already does the work and xterm.js handles it. All that is needed is to stop VS Code interfering.
 */
const pageActionHandlers = (term) => ({
  copy: () => navigator.clipboard.writeText(term.getSelection()).catch((err) => console.warn('Pi Dock: copy failed', err)),
  paste: null,
  scrollUp: () => term.scrollPages(-1),
  scrollDown: () => term.scrollPages(1),
});

/**
 * Decides, for every key press, whether Pi gets it, the page handles it, or VS Code should have it.
 *
 * The helpers above work out what a press means; what is left here is the state a key handler has to
 * remember between presses.
 *
 * @param {*} term
 * @param {() => import('../types').KeyConfig} currentKeys Asked for on every press, because the
 *   extension replaces them whenever VS Code's keybindings change. Hence no shortcut is named here.
 */
function installKeyHandler(term, currentKeys) {
  const handlers = pageActionHandlers(term);
  // With the Kitty protocol on, xterm.js reports releases as well as presses, so a key held back on
  // the way down must be held back on the way up too, or Pi sees a release it never saw pressed.
  const swallowed = new Set();
  // While VS Code waits for the second key of a shortcut, that key has to reach it as well.
  let chordUntil = 0;

  // Returning false tells xterm.js to do nothing with the key. It then travels up to VS Code.
  const keep = (event) => {
    swallowed.add(event.code);
    return false;
  };

  // In Electron, VS Code grabs every Ctrl/Cmd+C, V and X, cancelling the browser's own paste. These
  // four are the page's, so the key stops here.
  const runPageAction = (event, handler) => {
    event.stopPropagation();
    if (handler) {
      event.preventDefault();
      handler();
    }
    return keep(event);
  };

  term.attachCustomKeyEventHandler((event) => {
    if (event.type === 'keyup') return !swallowed.delete(event.code);
    if (event.type !== 'keydown' || MODIFIER_KEYS.has(event.key)) return true; // Shift on its own is neither a shortcut nor the awaited key
    if (Date.now() < chordUntil) {
      chordUntil = 0;
      return keep(event);
    }
    const keys = currentKeys();
    const state = { hasSelection: term.hasSelection(), buffer: term.buffer.active.type };

    const action = pageAction(event, keys, state);
    if (action) return runPageAction(event, handlers[action]);

    const escaping = escapeChord(event, keys, state);
    if (!escaping) return true; // nothing claimed it, so it is Pi's
    chordUntil = escaping.steps.length > 1 ? Date.now() + CHORD_TIMEOUT_MS : 0;
    return keep(event);
  });
}

if (typeof module !== 'undefined') {
  module.exports = { PAGE_ACTIONS, stepMatches, matchChord, pageAction, escapeChord };
}
