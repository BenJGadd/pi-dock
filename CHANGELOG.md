# Changelog

## 0.2.3

A folder can no longer decide what Pi Dock runs.

- `piDock.command`, `piDock.ttydPath`, `piDock.dtachPath` and `piDock.extraArgs` are machine
  scope: your user settings set them, a repository's `.vscode/settings.json` cannot.
- The log shows ttyd's command line with the URL token replaced.

## 0.2.2

Pi's scrollbar no longer breaks on a row with an emoji in it.

- The terminal now measures an emoji as two cells wide, as Pi and VS Code's own terminal do.

## 0.2.0

Sessions, clickable paths, image paste, a setup walkthrough and a new icon.

- Closing or reloading the window no longer loses the conversation: the next start
  continues the same session (`piDock.resume`, on by default). Resume Session, Fork
  Session and New Session restart Pi on one of the conversations saved for this
  folder. Restart Pi starts over on the same one.
- Ctrl+click (Cmd+click on a Mac) on a path in the output, `src/app.ts`,
  `src/app.ts:12` or an `@src/app.ts#L10` marker, opens the file in the editor at
  that line. Only a path that names a file is a link, as in VS Code's own terminal.
- An image pasted into the terminal is saved under the temp folder and typed into Pi
  as an `@/tmp/pi-dock/....png` attachment.
- `Ctrl+Alt+P` toggles between the editor and Pi, both ways.
- Terminal ▸ New Terminal ▸ Pi runs Pi in VS Code's own terminal panel.
- Help ▸ Welcome ▸ Set up Pi Dock checks for ttyd, dtach and Pi and ticks each step
  when it is found. Pi Dock: Check Setup does the same from the palette.
- Pi started by Pi Dock gets `PI_DOCK=<version>` in its environment, and
  `piDock.setBadge` puts a number on the Pi icon for an extension that knows when Pi
  is waiting.
- A new icon: Pi's own mark, sitting on a dock, drawn as one shape so it has no seams
  at any size. The activity bar and the terminal profile use the same mark.

## 0.1.0

First release.

- Pi runs in a VS Code sidebar, drawn by xterm.js — the same terminal engine, at the
  same version, that VS Code uses for its own terminal.
- Colours, fonts, cursor and scrollback are read from your VS Code theme and your
  `terminal.integrated.*` settings. Theme changes apply instantly.
- Moving the sidebar keeps Pi running, with its screen and history intact. Closing or
  reloading the window ends it.
- Keys go to Pi, including chords VS Code normally takes. The exceptions are listed as
  commands in `piDock.escapeActions`, and their shortcuts are looked up in your own
  VS Code keybindings, so rebinding one moves its escape with it.
- Copy, paste and page scrolling work on whatever shortcuts VS Code has them on.
- ttyd listens on loopback only, on a random port, behind a random URL path, and
  accepts a single client.
- No dependencies, no native modules and nothing compiled. Pi Dock never reads or
  interprets Pi's output.
