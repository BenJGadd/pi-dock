// Images pasted into the terminal, saved to a file and typed into Pi as a mention.
//
// The page cannot write files, so it posts the image as a data URL (page/paste.js); this side
// saves it under the temp folder (lib/images.js) and sends the path back as an absolute `@path`,
// which Pi's read tool sends on to the model as an image.

'use strict';

const vscode = require('vscode');
const { workspaceCwd } = require('./settings');
const { mentionText } = require('../lib/mentions');
const { saveImage, pruneOld } = require('../lib/images');

/**
 * @param {object} deps
 * @param {import('vscode').OutputChannel} deps.output
 * @param {(message: import('../types').PasteMessage) => void} deps.post Sends a message to the page.
 * @returns {{ pasted: (message: import('../types').ImageMessage) => void, prune: () => void }}
 */
function createImages({ output, post }) {
  /**
   * Saves a pasted image and types its path into Pi, which reads the file as an attachment.
   *
   * The file goes under the temp folder rather than the workspace, so a screenshot never turns up
   * in `git status`; the mention is therefore absolute. A refused image is logged, nothing more.
   *
   * @param {import('../types').ImageMessage} message
   */
  function pasted({ dataUrl }) {
    let file;
    try {
      file = saveImage(dataUrl);
    } catch (err) {
      return output.appendLine(`[pi-dock] image paste refused: ${err && err.message ? err.message : err}`);
    }
    output.appendLine(`[pi-dock] image pasted: ${file}`);
    post({ type: 'paste', text: mentionText([vscode.Uri.file(file).toString()], workspaceCwd()) });
  }

  /** Removes images older than a day, at start-up. Each removal is logged. */
  function prune() {
    for (const file of pruneOld()) output.appendLine(`[pi-dock] removed old image ${file}`);
  }

  return { pasted, prune };
}

module.exports = { createImages };
