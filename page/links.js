// Paths in the output, Ctrl+clickable as in VS Code's own terminal.
//
// The page finds what looks like a path — `src/foo.js`, `./a.py:3:7`, `README.md`, a line
// `@path#L…` marker — and asks the extension which of them are files that exist, because only
// those are links (host/links.js). That is what VS Code's terminal does too, and it is what keeps
// "e.g." and "example.com" from being underlined. The one clicked is posted to the extension, which
// opens it.
//
// Needs nothing from the other page files; page/main.js uses it.

'use strict';

// Something shaped like a path: segments of path characters, a directory prefix or a drive letter
// allowed, then maybe :line and :column. The look-behind keeps the tail of a URL (https://x/y) and
// the middle of a word from counting. The look-ahead refuses to stop just before more of the same
// word, and refuses a dot unless the dot ends the sentence, so `src/foo.js#L3` (a marker, below)
// does not also yield `src/foo`. A leading `@` is Pi's own way of naming a file, and comes off.
const PATH = /(?<![\w/:.@~-])@?((?:[A-Za-z]:)?(?:\.{1,2}\/|~\/|\/)?(?:[\w@~+-]+(?:\.[\w@~+-]+)*\/)*[\w@~+-]+(?:\.[\w@~+-]+)*)(?::(\d+))?(?::(\d+))?(?![\w/#]|\.(?!\s|$))/g;
// A line marker some tools print: @src/foo.js#L10 or @src/foo.js#L10-L20.
const MARKER = /@([^\s@#"]+)#L(\d+)(?:-L?\d+)?/g;

/**
 * Whether a match is worth asking about: it has a directory in it, or a file ending with a letter
 * in it. A bare word or a number is neither.
 *
 * @param {string} candidate
 * @returns {boolean}
 */
const pathLike = (candidate) => candidate.includes('/') || /\.[A-Za-z][\w+-]*$/.test(candidate);

/**
 * Finds what could be a file reference in one line of terminal output. Whether each one is a file
 * is the extension's to say; this is shape only.
 *
 * @param {string} text The line as shown.
 * @returns {{ start: number, end: number, path: string, line: number, column: number }[]}
 *   `start` and `end` are character positions, end exclusive. Lines and columns are 1-based, and 1
 *   when the text gave none.
 */
function parseLinks(text) {
  const links = [];
  for (const match of text.matchAll(MARKER)) {
    links.push({ start: match.index, end: match.index + match[0].length, path: match[1], line: Number(match[2]), column: 1 });
  }
  for (const match of text.matchAll(PATH)) {
    if (!pathLike(match[1])) continue;
    const end = match.index + match[0].length;
    if (links.some((link) => match.index < link.end && end > link.start)) continue; // inside a marker
    links.push({ start: match.index, end, path: match[1], line: match[2] ? Number(match[2]) : 1, column: match[3] ? Number(match[3]) : 1 });
  }
  return links.sort((a, b) => a.start - b.start);
}

/** What the extension has said about each path so far: a file, or not. */
const known = new Map();
/** Questions in flight, by id, each with what to do with the answer. */
const asked = new Map();
let nextQuestion = 1;

/**
 * Takes the extension's answer to a question this page asked (main.js routes it here).
 *
 * @param {{ id: number, found: Record<string, boolean> }} message
 */
function resolvedPaths({ id, found }) {
  for (const [path, isFile] of Object.entries(found || {})) known.set(path, Boolean(isFile));
  const waiting = asked.get(id);
  asked.delete(id);
  if (waiting) waiting();
}

/**
 * Makes file references in the output Ctrl+clickable (Cmd on a Mac), as in VS Code's own terminal.
 *
 * A plain click stays with Pi, and nothing is underlined until the modifier is held, so the
 * terminal does not fill with underlines.
 *
 * Two things here answer to how xterm.js treats a full-screen program. Whenever Pi redraws the
 * rows a link is on — and Pi's TUI redraws for a spinner, for streaming text, and for every mouse
 * movement it is told about — xterm.js drops the link and asks for the line again, then hovers the
 * new link with the *last mouse event*. So the links for a line are kept and handed back as the
 * same objects while the line's text is unchanged: a click whose press and release straddle a
 * redraw still finds the object it pressed on, which is what xterm.js compares. And the modifier
 * is tracked from the keyboard as well as from mouse events, so a Ctrl pressed after the pointer
 * arrived survives the redraw instead of being read from a mouse event that predates it. Measured
 * before this: the underline showed for a moment and went, and the click did nothing.
 *
 * @param {*} term
 * @param {(message: { type: 'open', path: string, line: number, column: number }|{ type: 'resolve', id: number, paths: string[] }) => void} post
 */
function installLinkProvider(term, post) {
  let modifier = false; // Ctrl or Cmd down right now, from whichever event last said
  let hovered = null; // the link under the pointer, so a modifier pressed later still shows it
  const show = (link, on) => {
    link.decorations.underline = on;
    link.decorations.pointerCursor = on;
  };
  /** The links of each row, kept while the row's text is unchanged. */
  const rows = new Map();
  /**
   * Finds out which of some paths are files, asking the extension about the ones not asked before,
   * then calls back with the answer for each.
   *
   * @param {string[]} paths
   * @param {(isFile: (path: string) => boolean) => void} then
   */
  const whichAreFiles = (paths, then) => {
    const unknown = [...new Set(paths.filter((path) => !known.has(path)))];
    const answer = () => then((path) => known.get(path) === true);
    if (!unknown.length) return answer();
    const id = nextQuestion++;
    asked.set(id, answer);
    post({ type: 'resolve', id, paths: unknown });
  };
  const linkFor = (found, text, y) => {
    const link = {
      text: text.slice(found.start, found.end),
      range: { start: { x: found.start + 1, y }, end: { x: found.end, y } },
      decorations: { underline: false, pointerCursor: false },
      activate: (event) => {
        if (modifier || event.ctrlKey || event.metaKey) post({ type: 'open', path: found.path, line: found.line, column: found.column });
      },
      hover: (event) => {
        if (event && (event.ctrlKey || event.metaKey)) modifier = true;
        hovered = link;
        show(link, modifier);
      },
      leave: () => {
        if (hovered === link) hovered = null;
      },
    };
    return link;
  };
  term.registerLinkProvider({
    provideLinks(y, callback) {
      const row = term.buffer.active.getLine(y - 1);
      if (!row) return callback(undefined);
      const text = row.translateToString(true);
      const kept = rows.get(y);
      if (kept && kept.text === text) return callback(kept.links.length ? kept.links : undefined);
      const candidates = parseLinks(text);
      if (!candidates.length) {
        rows.set(y, { text, links: [] });
        return callback(undefined);
      }
      whichAreFiles(candidates.map((found) => found.path), (isFile) => {
        const links = candidates.filter((found) => isFile(found.path)).map((found) => linkFor(found, text, y));
        rows.set(y, { text, links });
        callback(links.length ? links : undefined);
      });
    },
  });
  const setModifier = (event) => {
    const now = event.ctrlKey || event.metaKey;
    if (now === modifier) return;
    modifier = now;
    if (hovered) show(hovered, now);
  };
  for (const type of ['keydown', 'keyup']) window.addEventListener(type, setModifier, true);
  if (term.element) term.element.addEventListener('mousemove', setModifier, true);
}

if (typeof module !== 'undefined') {
  module.exports = { parseLinks, resolvedPaths };
}
