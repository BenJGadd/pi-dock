// The page's colours and fonts: VS Code's theme read from its CSS variables, and a font list cut
// down to the fonts this machine has.
//
// Everything visual starts here because VS Code defines each theme colour as a CSS variable in the
// pages it shows, and this is that page. The extension never sends a colour.
//
// Loaded first. Needs nothing from the other page files; page/main.js uses it.

'use strict';

// Each xterm.js colour and the VS Code colour it comes from. A list means "first one that resolves".
//
// VS Code publishes a variable for every colour it has a value for, defaults included, so a missing
// one means the theme really left it unset. It is then left out here too and xterm.js uses its own
// default, as VS Code's terminal does.
const THEME_TOKENS = {
  // VS Code's terminal uses terminal.background only if the theme names it, and otherwise blends
  // into whatever is behind it. Here, that is the sidebar.
  background: ['terminal.background', 'sideBar.background'],
  foreground: 'terminal.foreground',
  cursor: 'terminalCursor.foreground',
  cursorAccent: 'terminalCursor.background',
  selectionBackground: 'terminal.selectionBackground',
  selectionForeground: 'terminal.selectionForeground',
  selectionInactiveBackground: 'terminal.inactiveSelectionBackground',
  // xterm.js draws its own scrollbar and takes these three colours from the theme, as VS Code does.
  scrollbarSliderBackground: 'scrollbarSlider.background',
  scrollbarSliderHoverBackground: 'scrollbarSlider.hoverBackground',
  scrollbarSliderActiveBackground: 'scrollbarSlider.activeBackground',
  // The 16 standard terminal colours, in their normal and bright versions.
  ...Object.fromEntries(
    ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'].flatMap((name) => [
      [name.toLowerCase(), `terminal.ansi${name}`],
      [`bright${name}`, `terminal.ansiBright${name}`],
    ]),
  ),
};

/**
 * The CSS variable a VS Code colour is published under.
 *
 * @param {string} token e.g. 'terminal.ansiRed'
 * @returns {string} e.g. '--vscode-terminal-ansiRed'
 */
const cssVar = (token) => `--vscode-${token.replace(/\./g, '-')}`;

/**
 * The colours to give xterm.js, read from whatever theme is on right now.
 *
 * @param {(cssVariableName: string) => string} read Returns a variable's value, or '' if there is none.
 * @returns {Record<string, string>} Only the colours that were found.
 */
function readTheme(read) {
  /** @type {Record<string, string>} */
  const theme = {};
  for (const [key, tokens] of Object.entries(THEME_TOKENS)) {
    for (const token of [].concat(tokens)) {
      const value = read(cssVar(token)).trim();
      if (value) {
        theme[key] = value;
        break;
      }
    }
  }
  return theme;
}

/**
 * Split a CSS font list on its commas, leaving commas inside quoted names alone.
 *
 * @param {string} list e.g. `'Droid Sans Mono', "Fira Code", monospace`
 * @returns {string[]} The names, still quoted the way they were written.
 */
function splitFamilies(list) {
  return (list.match(/(?:"[^"]*"|'[^']*'|[^,])+/g) || []).map((family) => family.trim()).filter(Boolean);
}

/**
 * Returns a font list with only the fonts this machine has.
 *
 * VS Code's default list starts with 'Droid Sans Mono', which most Linux machines lack. The browser
 * then substitutes a font whose letters are not all one width, and xterm.js measures its grid from
 * that, giving stretched, uneven columns.
 *
 * @param {string} list A CSS font list.
 * @param {(family: string) => boolean} installed
 * @returns {string} Always ends in monospace as a last resort.
 */
function fontStack(list, installed) {
  const generic = /^(monospace|ui-monospace|sans-serif|serif|system-ui)$/i;
  const families = splitFamilies(list).filter((family) => generic.test(family) || installed(family));
  if (!families.some((family) => /^(ui-)?monospace$/i.test(family))) families.push('monospace');
  return families.join(', ');
}

/**
 * Returns the colours to use now: VS Code's, with piDock.theme on top.
 *
 * @param {Record<string, string>} overrides piDock.theme.
 * @returns {Record<string, string>}
 */
const currentTheme = (overrides) => {
  const styles = getComputedStyle(document.documentElement); // live, so read it once for all 40-odd colours
  return { ...readTheme((name) => styles.getPropertyValue(name)), ...overrides };
};

/** @type {CanvasRenderingContext2D|null} reused, because measuring happens many times */
let measureContext = null;

/**
 * Measures how wide a fixed piece of text comes out in a font list.
 *
 * @param {string} families A CSS font list.
 * @returns {number} Width in pixels.
 */
function textWidth(families) {
  measureContext = measureContext || document.createElement('canvas').getContext('2d');
  measureContext.font = `16px ${families}`;
  return measureContext.measureText('mmmmmmmmmmlli').width;
}

/**
 * Checks whether a font is installed, by measuring it twice with a different fallback behind it.
 * Same width both times means the font itself was used; different means the fallback was.
 *
 * @param {string} family
 * @returns {boolean}
 */
const installedFont = (family) => textWidth(`${family}, monospace`) === textWidth(`${family}, sans-serif`);

/**
 * Follows the VS Code theme as it changes.
 *
 * VS Code updates its CSS variables in place, so there is no event to listen for; watching the two
 * attributes it touches is how the page notices. This is also the only place that sets the page
 * background, which is what lets terminal.background and piDock.theme reach it.
 *
 * @param {*} term
 * @param {Record<string, string>} overrides piDock.theme.
 */
function followTheme(term, overrides) {
  // Setting term.options.theme repaints everything and, under WebGL, rebuilds the glyph atlas. The
  // observer fires for any attribute VS Code touches, most of which are not colour changes.
  let applied = '';
  const apply = () => {
    const theme = currentTheme(overrides);
    const asText = JSON.stringify(theme);
    if (asText === applied) return;
    applied = asText;
    term.options.theme = theme;
    document.body.style.background = theme.background || '';
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

if (typeof module !== 'undefined') {
  module.exports = { THEME_TOKENS, cssVar, readTheme, splitFamilies, fontStack };
}
