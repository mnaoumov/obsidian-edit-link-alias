# Project Rules

## Architecture notes

- **Two link editors.** The plugin exposes two editors that share the same occurrence-resolution and
  link-rebuild machinery, differing only in the `EditParsedLink` function they run (`src/edit-link.ts`):
  - `editParsedLinkAlias` — the original alias-only flow (dev-utils `prompt`), surfaced by
    `EditCommandHandler` (`src/edit-command-handler.ts`).
  - the URL **and** alias editor, the dev-utils **anchored popover** (`editFieldsInPopover`) reached
    through the factory `createEditParsedLinkUrlAndAliasInPopover(anchor)`.

  Command handlers delegate the cursor-resolution + `replaceRange` to the shared
  `editLinkAtEditorCursor` (`src/edit-in-editor.ts`), parameterized by which `EditParsedLink` to invoke.
  The link rebuild (`generateRawMarkdownLink`, preserving embed/wikilink/angle-bracket/title flags) lives
  once in `src/edit-link.ts`.
- **The popover is the ONLY presentation of the URL+alias editor** — the `Alt` click, the link context
  menu and the editor command all open it, so the feature looks the same however it is reached. There
  was briefly a centered `Modal` version too; it was deleted when the menu switched over. It is plain
  DOM rather than `Modal` because a modal dims the screen and is positioned by Obsidian, neither of
  which suits an editor that must appear *at* the link.
  - **It lives in `obsidian-dev-utils`, not here** — `editFieldsInPopover`
    (`obsidian/popovers/field-popover`) over the `showPopover` shell (`obsidian/popovers/popover`). It
    started as a plugin-local `src/link-editor-popover.ts`, was extracted under `T204-P1` because it is
    entirely plugin-agnostic (G61), and the local copy was deleted under `T214-P27`. `src/edit-link.ts`
    is the single call site: two fields, `url` then `alias`, whose keys type the resolved record.
  - It takes a resolved `PopoverAnchor` (`{ bottom, doc, left }`) rather than an element, because the
    three entry points know the position in three different ways: `createAnchorFromElement` (the clicked
    link), `createAnchorFromPoint` (the pointer that opened the context menu — see
    `PointerPositionComponent` below), and `createAnchorFromSelection` (the caret, for the keyboard-
    invoked command). All three come from `obsidian-dev-utils/obsidian/popovers/popover-anchor`.
    Carrying `doc` explicitly is what makes pop-out windows work.
  - It dismisses on the next `pointerdown` OUTSIDE it — **not** `click`. It is opened from a `click`
    handler, so a `click`-based outside listener would see that very same event and close it instantly.
  - **What its DOM looks like matters to the integration suites**: the root carries
    `menu obsidian-dev-utils edit-link-alias popover`, the OK/Cancel buttons `ok-button` / `cancel-button`,
    and EVERY field the same `text-box` class — there is no per-field class, so a test tells the URL
    field from the alias field by their order, not by a selector.
- **`PointerPositionComponent` exists only because the context menu has no anchor.** The `file-menu` /
  `url-menu` events carry the target file or url but no event and no element, and by the time a menu
  item's callback runs the menu is closing — so nothing is left to measure. The right-click / long-press
  that raised the menu IS where the link is, so the component records the last `pointerdown` per window
  and the menu handler anchors there. It registers per window via `registerAllWindowsHandler` (not
  `registerAllDocumentsDomEvent`) so the document comes from the listener's own window; deriving it from
  the event target would add a branch a document-level listener can never take. Like the popover it is
  plugin-agnostic, so it too was extracted (`T204-P1`) and is now consumed from
  `obsidian-dev-utils/obsidian/components/pointer-position-component`.
- **Occurrence resolution is shared, not duplicated (`src/resolve-link-occurrence.ts`).** A context menu
  tells you only what the link points at, never *where* in the note it was written. A click tells you more:
  its own coordinates. `resolveAndEditLink` therefore tries the link at a source position first (editing
  through the editor, so the change joins the undo history), and otherwise falls back to
  `editLinkOccurrenceViaSourceScan` — a `vault.read` + `parseLinks` scan with a `selectItem` picker when a
  note links to the same destination more than once. Both `LinkMenuHandler` and `LinkClickComponent` go
  through it.
  - **The position comes from the click's coordinates (`Editor.posAtMouse`), NOT from the caret.** This is
    load-bearing, and reverses an earlier note here claiming coordinate resolution was unnecessary — that
    claim is what shipped GH #4. Two independent reasons: (1) in Live Preview / Source mode the link is
    editor text with **no `href`**, so there is no target to match and the position is the only identity
    available; (2) the caret is simply **not** inside the clicked link — verified against a real Obsidian,
    an `Alt` click on a Live Preview link leaves it at the **end of the line**. Any comment claiming "the
    click has already put the caret inside the clicked link" is false; the caret survives only as the
    fallback for the menu path, which has no coordinates at all.
  - `posAtMouse` is `@unofficial` in obsidian-typings. That is consistent with existing practice here —
    `link-menu-handler.ts` already calls the equally-`@unofficial` `Editor.getClickableTokenAt` in
    production code — and both type-check without an import via the globally registered
    `@obsidian-typings/obsidian-public-latest` (`tsconfig.json`).
  - **Invariant: a known target is always verified; the position only chooses which occurrence.** Do not
    "simplify" this into letting the position always win. The case it protects is a link inside an
    `![[embed]]`-rendered block in Live Preview: the clicked anchor names the *embedded* note's link, while
    the source position holds the *embed* link. Verification fails there and it falls through to the scan,
    which is the pre-existing behavior. Conversely an **unknown** target has nothing to verify against, so
    the position is trusted outright — that is the whole Live Preview path.
- **`LinkTarget` has three fields, and the third one is not redundant (`src/resolve-link-occurrence.ts`).**
  `externalUrl` for an external link, `target` for an internal one that resolves, and `linkPath` — the link
  text as written — for an internal one that does **not**. `getFirstLinkpathDest` returns `null` for a link
  to a note that does not exist yet, and the old code collapsed that to an empty `LinkTarget`, which
  `doesLinkMatchTarget` could never match: `Alt` + clicking `[[not-created-yet]]` reported "Could not locate
  the link in the source note" even in Reading view. Reading view has no editor position to fall back on, so
  path-text matching is the only route there. `linkPath` is compared in both its decoded and encoded form,
  the same way the `externalUrl` branch already checks `url` and `encodedUrl`.
  - A `LinkTarget` with **none** of the three set still exists, and means "unknown — resolve me by
    position". It is produced only by a click on an href-less Live Preview link.
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
  - Reading view resolves the clicked link through `data-href`; Live Preview / Source mode through the
    editor position. Capture-phase `click` alone is enough in **every** mode — navigation is already
    suppressed in Live Preview, so there is no need to also intercept `mousedown` (checked against a real
    Obsidian while fixing GH #4).
  - **`link-click-popover-shared.integration.test.ts` must keep covering every mode, and the dispatched
    `MouseEvent` must carry real `clientX`/`clientY`.** The suite was Reading-view-only, which is precisely
    why GH #4 shipped — Reading view is the one mode that works through `data-href` and so exercises none of
    the position path. A click dispatched without coordinates makes `posAtMouse` resolve to the start of the
    document, so the test would pass or fail for the wrong reason; take them from the link element's
    bounding-rect centre. Live Preview also needs the caret parked off the link's line, or Live Preview
    renders that line as raw markdown instead of the decorated link — hence the two-line fixture.
- **Settings.** `PluginSettings` holds a single `shouldOpenLinkEditorOnAltClick` toggle, defaulting to
  `true` (see the `Alt`-vs-`Mod` note above for why on-by-default is safe here). The plugin uses the
  dev-utils `PluginSettingsComponentBase` directly rather than subclassing it — there is nothing to
  validate, and an empty subclass would be untested code against the 100% coverage gate.
- **`patches/brace-expansion-callable/` — a G51 deviation in the toolchain, not the plugin.** Every
  `minimatch` in the dependency tree (via `eslint-plugin-import` / `-react` / `-n` /
  `-json-schema-validator`, `glob` and `readdir-glob`) pulls a `brace-expansion` that is vulnerable to
  GHSA-mh99-v99m-4gvg; the fix ships only on the 5.x line, and `npm audit fix --force` "solves" it by
  downgrading `obsidian-dev-utils` to 43.10.1. So the `brace-expansion` `overrides` entry points at a
  local `file:` package that re-exports the patched 5.x implementation (installed under the
  `brace-expansion-upstream` alias) in the legacy callable `module.exports = expand` shape that
  `minimatch@3` requires. Same shape as the one `obsidian-dev-utils` uses. **Drop the override, the
  patch directory and the alias devDependency** once the transitive `minimatch`es resolve a patched
  `brace-expansion` on their own — `npm audit` staying at 0 after removal is the check.
- **The desktop integration project pins the Obsidian version, and it is a knob (G99).** Support is the
  range `[latest public, latest catalyst]` and both ends must work, so
  `scripts/vitest-config.ts` sets `environmentOptions.obsidianTransport.obsidianVersion` to
  `process.env['OBSIDIAN_VERSION'] ?? 'public-latest'`. `npm run test:integration:desktop` therefore covers
  the public floor; the other end is `OBSIDIAN_VERSION=catalyst-latest npx vitest run
  --project=integration-tests:desktop` — spawn `vitest` directly, because dev-utils' `test()` helper does
  not propagate the variable to its child and the run silently falls back to the public build.
- **The plugin ships NO stylesheet of its own.** There was a `src/styles/main.scss` holding the popover's
  layout; it was deleted with the popover (`T214-P27`) because `obsidian-dev-utils` now ships the identical
  block under `.obsidian-dev-utils.popover` in its own styles, injected by `initPluginContext`. If a
  plugin-specific rule is ever needed again, re-create `src/styles/main.scss` **and** import it from
  `src/main.ts` — that import is the only thing that makes it reach `dist/build/styles.css`; a
  `styles.css` at the repo root is silently ignored by the build. Popover-only overrides should instead go
  through `editFieldsInPopover`'s `cssClasses` parameter.
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
  - Occurrence resolution: the editor **caret** + `parseLinks` in an editing view — the menu events carry
    no coordinates, so this is the one path that still relies on the caret (see the shared-resolution note
    above); a source-note scan (`vault.read` + `parseLinks`, `selectItem` to disambiguate multiple matches)
    in Reading view; the edit is applied via `editor.replaceRange` or `vault.process`.
  - Desktop de-duplication: on desktop a link right-click in the editor fires **both** `editor-menu` and
    `file-menu`(`link-context-menu`), so `isHandledByEditorMenu()` suppresses both menu items when the
    editor menu already shows them (desktop + `source` mode + cursor on a link). Mobile never suppresses.
