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

  A third presentation of the URL+alias editor is the **anchored popover**
  (`src/link-editor-popover.ts`), built on plain DOM rather than `Modal` — a modal dims the screen and is
  positioned by Obsidian, neither of which suits an editor that must appear *at* a clicked link. It
  resolves with the same `LinkUrlAndAlias | null` as the modal, and reaches the `EditParsedLink`
  signature through the factory `createEditParsedLinkUrlAndAliasInPopover(anchorEl)` — a factory because
  the anchor is known only at click time and no other caller has one to pass. Whether it should be
  promoted into `obsidian-dev-utils` is tracked centrally as a G61 candidate (`T204-P1`); it stays here
  while it has a single consumer.
- **Occurrence resolution is shared, not duplicated (`src/resolve-link-occurrence.ts`).** Neither a
  context menu nor a click tells you *where* in the note the link was written — only what it points at.
  `resolveAndEditLink` therefore tries the editor caret first (in an editing view the click has already
  put the caret inside the clicked link, which pins the exact occurrence and edits through the editor so
  the change joins the undo history), verifies the match against the target so a stale caret cannot edit
  the wrong link, and otherwise falls back to `editLinkOccurrenceViaSourceScan` — a `vault.read` +
  `parseLinks` scan with a `selectItem` picker when a note links to the same destination more than once.
  Both `LinkMenuHandler` and `LinkClickComponent` go through it.

  Note there is no coordinate-based resolution: Obsidian exposes no public "position at these
  coordinates" API on `Editor`, and the caret-plus-verified-fallback path makes one unnecessary.
- **Click interception (`src/link-click-component.ts`) — a second deliberate G51 deviation.** Obsidian
  raises no event for "a link was clicked", and `openLinkText` is shared with the backlinks pane, search
  and the graph, so patching it would intercept far more than a click in a note. The component therefore
  registers a raw **capture-phase** `click` listener (via the dev-utils `AllWindowsEventComponent`, so
  pop-out windows are covered) — the capture phase is the only point where Obsidian's own navigation can
  still be stopped. It is gated on the `linkClickAction` setting and only fires for events whose target
  `closest()`-matches a rendered link, in Reading view (`a.internal-link` / `a.external-link`) or Live
  Preview (`.cm-hmd-internal-link` / `.cm-link` / `.cm-underline`).
  - The gesture that is NOT assigned to the editor is passed through untouched, so `Mod`+click keeps
    Obsidian's native meaning (open in a **new tab**). Forcing a same-tab open would fight core behavior;
    this is documented in the README and the demo vault instead.
  - `evt.defaultPrevented` is NOT usable as evidence that interception happened — Obsidian calls
    `preventDefault()` on link clicks itself. The integration suite asserts on whether navigation
    actually occurred (which file ends up active) instead. This cost one red integration run; do not
    reintroduce that assertion.
- **Settings.** `PluginSettings` holds a single `linkClickAction` enum (`src/link-click-action.ts`),
  defaulting to `Disabled` so the plugin changes nothing about link behavior until the user opts in. The
  plugin uses the dev-utils `PluginSettingsComponentBase` directly rather than subclassing it — there is
  nothing to validate, and an empty subclass would be untested code against the 100% coverage gate.
- **Styles** live in `src/styles/main.scss` and reach `dist/build/styles.css` only because `src/main.ts`
  imports the stylesheet; a `styles.css` at the repo root is silently ignored by the build.
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
