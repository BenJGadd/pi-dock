// Font and cursor options for the sidebar terminal, copied from the settings VS Code's own terminal
// uses. Colours are not here: the page reads those from the theme directly (page/theme.js).

'use strict';

/**
 * Reads one setting out of a group, like `getConfiguration('editor').get` does.
 *
 * @callback ReadSetting
 * @param {string} key
 * @returns {*} The value, or undefined if unset.
 */

/**
 * Builds the xterm.js options for one page.
 *
 * Later sources win: VS Code's terminal settings, then piDock.fontSize and piDock.fontFamily, then
 * piDock.clientOptions. Unset values are left out so xterm.js keeps its own defaults.
 *
 * @param {object} sources
 * @param {ReadSetting} sources.terminal Reads a terminal.integrated.* setting.
 * @param {ReadSetting} sources.editor Reads an editor.* setting.
 * @param {import('../types').Settings} sources.settings
 * @returns {Record<string, *>}
 */
function xtermOptions({ terminal, editor, settings }) {
  const options = {};
  const set = (key, value) => {
    if (value !== undefined && value !== null && value !== '') options[key] = value;
  };

  set('fontFamily', terminal('fontFamily') || editor('fontFamily')); // the page drops fonts that are not installed
  for (const key of ['fontSize', 'lineHeight', 'letterSpacing', 'fontWeight', 'fontWeightBold', 'scrollback', 'minimumContrastRatio', 'drawBoldTextInBrightColors']) {
    set(key, terminal(key));
  }
  const style = terminal('cursorStyle');
  if (style) options.cursorStyle = style === 'line' ? 'bar' : style; // VS Code says "line", xterm.js says "bar"
  options.cursorBlink = terminal('cursorBlinking') === true; // a boolean here, unlike editor.cursorBlinking

  // Pi uses the Kitty keyboard protocol to tell Shift+Enter from Enter. VS Code has it on by
  // default, so unset means on.
  options.vtExtensions = { kittyKeyboard: terminal('enableKittyKeyboardProtocol') !== false };

  // Stops xterm rewrapping its scrollback on every width change. Pi repaints on resize anyway, and
  // the rewrap's only visible effect was a wrong frame in between: wrapped lines pulled onto one row
  // leaving the row below blank, which looked like the text flashing to double spacing mid-drag.
  //
  // xterm has no plain "don't reflow" switch. It skips the rewrap when told the far end is a Windows
  // pty that rewraps for itself, which is the same arrangement as here. See `_isReflowEnabled` in
  // page/xterm/xterm.js; a test pins that code so an upgrade cannot silently change the meaning.
  options.windowsPty = { backend: 'winpty', buildNumber: 1 };

  // The page sets the width table through `term.unicode`, which xterm.js calls a proposed API and
  // refuses without this. VS Code's terminal sets it too. Without it the page threw on its first
  // line and the sidebar stayed blank.
  options.allowProposedApi = true;

  set('fontSize', settings.fontSize);
  set('fontFamily', settings.fontFamily);
  return { ...options, ...settings.clientOptions };
}

/**
 * Which table decides how many cells a character takes, as VS Code's own terminal decides it.
 *
 * xterm.js ships only its Unicode 6 table, where an emoji is one cell wide. Pi measures an emoji as
 * two, so under that table every row with an emoji came out a cell short and its last cell, the
 * scrollbar, landed a column early: the bar looked broken at exactly those rows. VS Code's terminal
 * loads the Unicode 11 table unless `terminal.integrated.unicodeVersion` says "6", and so does the
 * page (page/main.js).
 *
 * @param {ReadSetting} terminal Reads a terminal.integrated.* setting.
 * @returns {'6'|'11'}
 */
function unicodeVersion(terminal) {
  return terminal('unicodeVersion') === '6' ? '6' : '11';
}

module.exports = { xtermOptions, unicodeVersion };
