// The shapes of the objects passed between files.
//
// No code, and nothing requires it. It is one place to look up any object the extension passes
// around. Other files point at these names as `import('./types').Settings`, which editors understand
// and which disappears when the code runs.

'use strict';

/**
 * Every piDock.* setting, read in one go by host/settings.js.
 *
 * @typedef {object} Settings
 * @property {string[]} command What to run. Empty means `pi`.
 * @property {boolean} persist Run Pi under dtach so it survives the page.
 * @property {string} dtachPath Path to dtach, or just `dtach` to find it on PATH.
 * @property {string} ttydPath Path to ttyd, or just `ttyd` to find it on PATH.
 * @property {number|undefined} fontSize Pixels. Undefined follows VS Code.
 * @property {string} fontFamily Empty follows VS Code.
 * @property {Record<string, string>} theme Colours overriding the live VS Code theme.
 * @property {Record<string, unknown>} clientOptions Extra xterm.js options, applied last.
 * @property {string[]} escapeActions VS Code commands whose keys should not reach Pi.
 * @property {string[]} extraArgs Extra arguments for ttyd.
 */

/**
 * One key press in a shortcut, ready to compare against a real key event. Every modifier is listed,
 * so Ctrl+P does not match Ctrl+Shift+P.
 *
 * @typedef {object} Step
 * @property {boolean} ctrl
 * @property {boolean} shift
 * @property {boolean} alt
 * @property {boolean} meta
 * @property {string} code Which physical key, e.g. 'KeyP', 'F1', 'BracketLeft'.
 * @property {string} [key] For letters, the character too, so other layouts still work.
 */

/**
 * One shortcut of one VS Code command. Both conditions are usually false, meaning it always counts.
 *
 * @typedef {object} Chord
 * @property {Step[]} steps One for Ctrl+C, two for Ctrl+K Ctrl+S.
 * @property {boolean} selection Only while text is selected.
 * @property {boolean} normalBuffer Only outside a full-screen program.
 */

/**
 * The shortcuts the page must not pass on to Pi.
 *
 * @typedef {object} KeyConfig
 * @property {Chord[]} escape Shortcuts for VS Code, from piDock.escapeActions.
 * @property {Record<string, Chord[]>} terminal Shortcuts the page handles itself, keyed by the names
 *   in PAGE_ACTIONS: copy, paste, scrollUp, scrollDown.
 */

/**
 * What the terminal is showing, which decides whether a Chord's conditions hold.
 *
 * @typedef {object} TerminalState
 * @property {boolean} hasSelection
 * @property {'normal'|'alternate'} buffer
 */

/**
 * The Kitty keyboard protocol's flags, one stack per screen. The page keeps its own copy because
 * xterm.js does not let anyone read its own.
 *
 * @typedef {object} KittyState
 * @property {number[]} normal
 * @property {number[]} alternate
 */

/**
 * A terminal as one page left it, kept by the extension for the page that follows.
 *
 * @typedef {object} Snapshot
 * @property {string} serialized The screen and its history, from xterm.js's serialize addon.
 * @property {KittyState} kitty The Kitty flags, which that addon does not include.
 * @property {'normal'|'alternate'} buffer Which screen was showing.
 */

/**
 * Everything the extension tells the page, written into its HTML as JSON.
 *
 * @typedef {object} PageConfig
 * @property {string} wsUrl ttyd's websocket address.
 * @property {Record<string, unknown>} options xterm.js options (lib/options.js).
 * @property {Record<string, string>} theme piDock.theme, over VS Code's live colours.
 * @property {KeyConfig} keys
 * @property {Snapshot|null} restore The last page's snapshot, or null to start blank.
 */

/**
 * An error carrying the failing program's own output. host/server.js fills `details` with whatever
 * ttyd printed, and the error page shows it below the message.
 *
 * @typedef {Error & { details?: string }} DetailedError
 */

/**
 * A running ttyd, as host/server.js tracks it.
 *
 * @typedef {object} TtydServer
 * @property {import('child_process').ChildProcess|null} proc
 * @property {number} port Listened on for this machine only.
 * @property {string} token A random string in the URL; only a page that knows it can connect.
 * @property {boolean} alive False once it has exited or failed to start.
 * @property {boolean} stopped True when we stopped it, so its exit is not a crash.
 * @property {Error|null} error Why it could not start, if it could not.
 * @property {string} stderr The last few lines it printed, for the error page.
 * @property {Snapshot|null} snapshot The last snapshot the page sent for this ttyd.
 */

module.exports = {};
