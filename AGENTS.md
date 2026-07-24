# Project Rules

## Architecture notes

- **Two link editors.** The plugin exposes two editors that share the same occurrence-resolution and
  link-rebuild machinery, differing only in the `EditParsedLink` function they run (`src/edit-link.ts`):
  - `editParsedLinkAlias` — the original alias-only flow (dev-utils `prompt`), surfaced by
    `EditCommandHandler` (`src/edit-command-handler.ts`).
  - `editParsedLinkUrlAndAlias` — a two-field modal editing the URL **and** alias
    (`src/link-editor-modal.ts`, built on dev-utils `ModalBase`/`showModal`), surfaced by
    `EditUrlAndAliasCommandHandler` (`src/edit-url-and-alias-command-handler.ts`).

  Both command handlers delegate the cursor-resolution + `replaceRange` to the shared
  `editLinkAtEditorCursor` (`src/edit-in-editor.ts`), parameterized by which `EditParsedLink` to invoke.
  The link rebuild (`generateRawMarkdownLink`, preserving embed/wikilink/angle-bracket/title flags) lives
  once in `src/edit-link.ts`.
- **Link/url context menu integration (`src/link-menu-handler.ts`) — deliberate G51 deviation.** The
  editors are normal `EditorCommandHandler`s (command palette + `editor-menu`). But on mobile,
  long-pressing a link (and right-clicking a rendered link in Reading view) does **not** fire
  `editor-menu` — Obsidian routes it through `Workspace.handleLinkContextMenu` /
  `handleExternalLinkMenu`, which fire the `file-menu` (source `link-context-menu`) and `url-menu` events.
  `LinkMenuHandler` registers those two events directly via `plugin.registerEvent` (not through a
  command-handler component) because dev-utils' `FileCommandHandler` only yields the target `TFile` and
  has no `url-menu` support, so it cannot locate the source-link occurrence being edited. It adds **both**
  items (`MENU_ITEM_DESCRIPTORS` — "Edit link alias" and "Edit link (URL and alias)"), each bound to its
  `EditParsedLink`; the shared `resolveAndEdit` is parameterized by that function.
  - Occurrence resolution: editor cursor + `parseLinks` in an editing view; a source-note scan
    (`vault.read` + `parseLinks`, `selectItem` to disambiguate multiple matches) in Reading view; the
    edit is applied via `editor.replaceRange` or `vault.process`.
  - Desktop de-duplication: on desktop a link right-click in the editor fires **both** `editor-menu` and
    `file-menu`(`link-context-menu`), so `isHandledByEditorMenu()` suppresses both menu items when the
    editor menu already shows them (desktop + `source` mode + cursor on a link). Mobile never suppresses.
