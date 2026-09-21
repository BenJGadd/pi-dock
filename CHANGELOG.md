# Changelog

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
