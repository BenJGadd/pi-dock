// Images pasted into the terminal.
//
// A screenshot on the clipboard arrives as a file item, not as text, and xterm.js would paste
// nothing. The page reads it as a data URL and posts it to the extension, which saves it and types
// its path into Pi (host/images.js). Text pastes are not touched.
//
// Needs nothing from the other page files; page/main.js uses it.

'use strict';

/**
 * Finds the image in a paste, if it holds one. A screenshot on the clipboard arrives as a file
 * item, not as text, and xterm.js would paste nothing.
 *
 * @param {{ items?: ArrayLike<{ kind: string, type: string, getAsFile: () => *}> }|null} data The
 *   event's clipboardData.
 * @returns {{ mime: string, file: * }|null}
 */
function imageInPaste(data) {
  for (const item of Array.from((data && data.items) || [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return { mime: item.type, file: item.getAsFile() };
  }
  return null;
}

/**
 * Sends a pasted image to the extension, which saves it and types its path into Pi. Text pastes
 * are not touched: they reach xterm.js as before. Capture phase, so this runs before xterm.js
 * sees the event on its own text area.
 *
 * @param {HTMLElement} container
 * @param {(message: { type: 'image', mime: string, dataUrl: string }) => void} post
 */
function installImagePaste(container, post) {
  container.addEventListener('paste', (event) => {
    const image = imageInPaste(event.clipboardData);
    if (!image || !image.file) return;
    event.preventDefault();
    event.stopPropagation();
    const reader = new FileReader();
    reader.onload = () => post({ type: 'image', mime: image.mime, dataUrl: String(reader.result) });
    reader.readAsDataURL(image.file);
  }, true);
}

if (typeof module !== 'undefined') {
  module.exports = { imageInPaste };
}
