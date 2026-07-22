# Project Rules

## Architecture notes

- **Link/url context menu integration (`src/link-menu-handler.ts`) — deliberate G51 deviation.** The
  "Edit link alias" command is a normal `EditorCommandHandler` (`src/edit-command-handler.ts`, command
  palette + `editor-menu`). But on mobile, long-pressing a link (and right-clicking a rendered link in
  Reading view) does **not** fire `editor-menu` — Obsidian routes it through
  `Workspace.handleLinkContextMenu` / `handleExternalLinkMenu`, which fire the `file-menu` (source
  `link-context-menu`) and `url-menu` events. `LinkMenuHandler` registers those two events directly via
  `plugin.registerEvent` (not through a command-handler component) because dev-utils' `FileCommandHandler`
  only yields the target `TFile` and has no `url-menu` support, so it cannot locate the source-link
  occurrence being edited. The shared prompt/rebuild core is factored into `editParsedLinkAlias`
  (`src/edit-link.ts`) and reused by both the editor command and the menu handler.
  - Occurrence resolution: editor cursor + `parseLinks` in an editing view; a source-note scan
    (`vault.read` + `parseLinks`, `selectItem` to disambiguate multiple matches) in Reading view; the
    edit is applied via `editor.replaceRange` or `vault.process`.
  - Desktop de-duplication: on desktop a link right-click in the editor fires **both** `editor-menu` and
    `file-menu`(`link-context-menu`), so `isHandledByEditorMenu()` suppresses the menu item when the
    editor menu already shows it (desktop + `source` mode + cursor on a link). Mobile never suppresses.
