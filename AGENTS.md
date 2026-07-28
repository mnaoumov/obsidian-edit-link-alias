# Project Rules

## Architecture notes

- **Two link editors.** The plugin exposes two editors that share the same occurrence-resolution and
  link-rebuild machinery, differing only in the `EditParsedLink` function they run (`src/edit-link.ts`):
  - `editParsedLinkAlias` — the original alias-only flow (dev-utils `prompt`), surfaced by
    `EditCommandHandler` (`src/edit-command-handler.ts`).
  - the URL **and** alias editor, an **anchored popover** (`src/link-editor-popover.ts`) reached through
    the factory `createEditParsedLinkUrlAndAliasInPopover(anchor)`.

  Command handlers delegate the cursor-resolution + `replaceRange` to the shared
  `editLinkAtEditorCursor` (`src/edit-in-editor.ts`), parameterized by which `EditParsedLink` to invoke.
  The link rebuild (`generateRawMarkdownLink`, preserving embed/wikilink/angle-bracket/title flags) lives
  once in `src/edit-link.ts`.
- **The popover is the ONLY presentation of the URL+alias editor** — the `Alt` click, the link context
  menu and the editor command all open it, so the feature looks the same however it is reached. There
  was briefly a centered `Modal` version too; it was deleted when the menu switched over. It is plain
  DOM rather than `Modal` because a modal dims the screen and is positioned by Obsidian, neither of
  which suits an editor that must appear *at* the link.
  - It takes a resolved `PopoverAnchor` (`{ bottom, doc, left }`) rather than an element, because the
    three entry points know the position in three different ways: `createAnchorFromElement` (the clicked
    link), `createAnchorFromPoint` (the pointer that opened the context menu — see
    `PointerPositionComponent` below), and `createAnchorFromSelection` (the caret, for the keyboard-
    invoked command). Carrying `doc` explicitly is what makes pop-out windows work.
  - It dismisses on the next `pointerdown` OUTSIDE it — **not** `click`. It is opened from a `click`
    handler, so a `click`-based outside listener would see that very same event and close it instantly.
  - Whether it should be promoted into `obsidian-dev-utils` is tracked centrally as a G61 candidate
    (`T204-P1`); it stays here while it has a single consumer.
- **`PointerPositionComponent` (`src/pointer-position-component.ts`) exists only because the context
  menu has no anchor.** The `file-menu` / `url-menu` events carry the target file or url but no event
  and no element, and by the time a menu item's callback runs the menu is closing — so nothing is left
  to measure. The right-click / long-press that raised the menu IS where the link is, so the component
  records the last `pointerdown` per window and the menu handler anchors there. It registers per window
  via `registerAllWindowsHandler` (not `registerAllDocumentsDomEvent`) so the document comes from the
  listener's own window; deriving it from the event target would add a branch a document-level listener
  can never take. Like the popover, it is plugin-agnostic and is tracked as a G61 extraction candidate
  under the same `T204-P1`.
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
  still be stopped. It is gated on the `shouldOpenLinkEditorOnAltClick` setting and only fires for events
  whose target `closest()`-matches a rendered link, in Reading view (`a.internal-link` /
  `a.external-link`) or Live Preview (`.cm-hmd-internal-link` / `.cm-link` / `.cm-underline`).
  - **`Alt`, not `Mod`** — `Ctrl`/`Cmd`+click is already Obsidian's "open the link in a new tab", so
    binding the editor there would take over a gesture users rely on; Obsidian gives `Alt`+click no
    meaning on a link. The handler additionally requires that NO other modifier is held, so every
    gesture Obsidian does assign a meaning to reaches it untouched. This is why the setting is a plain
    toggle defaulting to ON rather than the three-way enum it briefly was: with `Alt` there is no
    conflict left to configure, and enabling it takes nothing away.
  - `evt.defaultPrevented` is NOT usable as evidence that interception happened — Obsidian calls
    `preventDefault()` on link clicks itself. The integration suite asserts on whether navigation
    actually occurred (which file ends up active) instead. This cost one red integration run; do not
    reintroduce that assertion.
- **Settings.** `PluginSettings` holds a single `shouldOpenLinkEditorOnAltClick` toggle, defaulting to
  `true` (see the `Alt`-vs-`Mod` note above for why on-by-default is safe here). The plugin uses the
  dev-utils `PluginSettingsComponentBase` directly rather than subclassing it — there is nothing to
  validate, and an empty subclass would be untested code against the 100% coverage gate.
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
  items (`MENU_ITEM_DESCRIPTORS` — "Edit link alias" and "Edit link (URL and alias)"); each descriptor
  carries a `createEditParsedLink(anchor)` FACTORY rather than a fixed `EditParsedLink`, because the
  anchored editor needs the position of the gesture that opened the menu, which is only known once the
  item is actually clicked. The shared `resolveAndEdit` is parameterized by the resulting function.
  - Occurrence resolution: editor cursor + `parseLinks` in an editing view; a source-note scan
    (`vault.read` + `parseLinks`, `selectItem` to disambiguate multiple matches) in Reading view; the
    edit is applied via `editor.replaceRange` or `vault.process`.
  - Desktop de-duplication: on desktop a link right-click in the editor fires **both** `editor-menu` and
    `file-menu`(`link-context-menu`), so `isHandledByEditorMenu()` suppresses both menu items when the
    editor menu already shows them (desktop + `source` mode + cursor on a link). Mobile never suppresses.
