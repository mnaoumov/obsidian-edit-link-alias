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
    is the single call site: two fields, `alias` then `url`, whose keys type the resolved record.
  - **The field ORDER is load-bearing, not cosmetic (`T296-P27` / GH #7).** `showPopover` focuses **and
    selects the FIRST input**, so whichever field is declared first is the one ready to be typed over.
    The alias leads because changing an alias is the more frequent edit. Do NOT reorder these — the
    request was for a *setting* choosing the focused field, and the answer taken was to change the
    default outright, so the order IS the feature. The rejected alternative was a `shouldFocus` knob on
    dev-utils' `PopoverField` — correct per G61, but a cross-repo change plus a release for a one-line
    outcome.
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
    and EVERY field the same `text-box` class — there is no per-field class, so a test tells the alias
    field from the URL field by their order, not by a selector. **Four suites destructure that order**
    (`const [aliasInputEl, urlInputEl] = getPopoverInputEls()` in the three `*-shared.integration.test.ts`
    popover suites plus `undecorated-link-click-shared`), and `src/edit-link.test.ts` asserts it — so a
    reorder is a five-file change, and getting it half-right silently swaps the url and the alias in every
    assertion.
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
- **A link in the FRONTMATTER has its own resolver and its own write path
  (`src/frontmatter-link-occurrence.ts`).** Frontmatter is YAML, not markdown, so the raw-text splice every
  body path performs corrupts it: `url: https://x` is a plain scalar, but `url: [Alias](https://x)` starts a
  flow sequence and the note stops parsing — that is GH #5. The edit is therefore expressed as a change
  against the *parsed property value* and handed to dev-utils `applyFileChanges`, which applies it to the
  frontmatter object and re-emits the block through `stringifyYaml` (`lineWidth: 0`, so nothing folds),
  quoting whatever needs quoting.
  - **`resolve-link-occurrence.ts` must keep frontmatter out of its own paths, in all three places**:
    `findMatches` skips frontmatter lines, `tryEditLinkAtPosition` hands off when the position is in the
    frontmatter, and `editLinkAtEditorCursor` does the same for the caret. Removing any one of them
    re-opens #5 through that entry point.
  - **The accepted trade-off is that the whole frontmatter block is re-serialized**, so YAML comments and
    hand formatting inside it are normalized, and the edit goes through `vault.process` rather than the
    editor, so it does not join the undo history. Both are stated in the demo note and were the user's
    explicit call (`T258-P27`) over hand-rolling YAML quoting for a surgical splice.
  - **Occurrence resolution is by key and link identity, never by offset into the block.** The panel knows
    the `data-property-key` it rendered, the raw YAML knows the link text under the pointer, and the context
    menu knows only the url — so the resolver takes an optional `propertyKey` and an optional `rawLink`, and
    falls back to `selectItem` when several links still match.
    - **Obsidian renders `data-property-key` as `key.toLowerCase()`, while the metadata cache keeps the
      key exactly as the YAML spells it** (verified in Obsidian's own source, `app.js` — it lowercases at
      every one of the three places it sets the attribute). `doesKeyMatch` therefore compares
      case-INSENSITIVELY; comparing as written is what made `Alt` + clicking a link under a `Homepage:`
      property report "could not locate the link" while the context menu — which carries no property key,
      so it never reaches the filter — edited the very same link (GH #8 / `T297-P27`). Do not "simplify"
      the lowercasing away.
  - **`applyFileChanges` validates before writing, and what it compares against differs by reference**: one
    carrying offsets is matched against that slice of the property value, one without against the WHOLE
    value. Get it wrong and the write is a silent no-op — which is why the write is confirmed by comparing
    the content before and after, and reports the "could not locate" notice when nothing changed.
  - **The two sources of frontmatter links are disjoint and both are needed.** Obsidian natively caches only
    INTERNAL links whose whole property value is the link (`cache.frontmatterLinks`); dev-utils
    `parseFrontmatterLinks` supplies the external ones and any value holding several links, and deliberately
    skips what Obsidian already covers. `getCacheSafe` + `getLinks` would union them for you but reads
    unofficial cache internals (`metadataCache.fileCache` / `computeFileMetadataAsync`) that the test mocks
    do not implement, so the public `getFileCache` is used and the union is done here, de-duplicated by
    key + start offset.
- **Click interception (`src/link-click-component.ts`) — a second deliberate G51 deviation.** Obsidian
  raises no event for "a link was clicked", and `openLinkText` is shared with the backlinks pane, search
  and the graph, so patching it would intercept far more than a click in a note. The component therefore
  registers a raw **capture-phase** `click` listener (via the dev-utils `AllWindowsEventComponent`, so
  pop-out windows are covered) — the capture phase is the only point where Obsidian's own navigation can
  still be stopped. It is gated on the `shouldOpenLinkEditorOnAltClick` setting and fires either for events
  whose target `closest()`-matches a rendered link, in Reading view (`a.internal-link` /
  `a.external-link`) or Live Preview (`.cm-hmd-internal-link` / `.cm-link` / `.cm-underline`), **or** —
  when that misses — for a position inside a parsed link (see the position-fallback note below).
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
  - **The Properties panel renders a link as a `div`, not an anchor** — `.metadata-link-inner` for a text
    property, `.multi-select-pill-content` for a list one, each carrying `data-href` and the
    `internal-link`/`external-link` class, and NO `href` (verified against Obsidian 1.13.4 over CDP). So
    `LINK_SELECTOR` must not require a tag name for those two, and `getLinkTarget` reads `href ?? data-href`.
    An `a.external-link`-only selector is why GH #6 saw nothing happen.
  - **A panel click must NOT consult a position.** The panel is visible in Live Preview, where
    `view.getMode()` is `'source'`, so the caret and `posAtMouse` both "work" and both resolve something
    else entirely — whatever body link the caret was last left on. The `data-property-key` the click carries
    replaces the position outright.
  - **`LINK_SELECTOR` is NOT the only entry gate — the position fallback is the other half
    (`handleEditorPositionClick`).** When the selector misses, an editing view is asked what sits at the
    click's position: `posAtMouse` → is a parsed link under it → intercept with an *unknown* `LinkTarget`
    and that position. It covers the three places a link is shown as plain text: the raw YAML of the
    frontmatter (GH #6), a bare url with the caret inside/beside it, and the `(url)` half of a markdown
    link (both GH #9 / `T298-P27`). The popover is anchored with `createAnchorFromPoint`, there being no
    element to anchor to.
    - **It is deliberately NOT scoped to the frontmatter, and the `isOffsetInFrontmatter` gate it used to
      carry must NOT come back.** That gate was what made GH #9 possible — everything downstream is
      already generic, and `tryEditLinkAtPosition` re-checks `isOffsetInFrontmatter` itself to route a
      frontmatter position to the frontmatter resolver. Where the position lands matters to the WRITE,
      not to whether the click is worth intercepting.
    - **What keeps it from swallowing every `Alt` click is the `parseLinks(line)` check** that the
      position actually falls inside a parsed link on that line. Do not weaken it.
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
  - **The mirror-image suite, `undecorated-link-click-shared.integration.test.ts`, must FOCUS the editor and
    not merely place the caret.** Live Preview un-decorates the caret's own line only while the editor
    actually holds the focus, and on Android neither `openFile` nor `revealLeaf` gives it any — the active
    element stays the `body` (measured on the emulator: `editor.hasFocus()` `false` and the line still reads
    `old alias`; after `editor.focus()`, `true` and it reads `[old alias](https://…)`). Without the explicit
    focus the `(url)` half is never in the DOM at all and the suite fails on Android only. The bare-url half
    hides this, because a bare url's rendered text IS its url whether or not it is decorated — so it is the
    markdown-link case that pins the behavior down.
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
- **The Android suite has a KNOWN intermittent failure that is not ours — do not re-investigate it
  (`T304-P2`).** `vault.create` on the Android emulator loses ~0.9% of its writes: the file lands on disk
  as **0 bytes** while Obsidian's `TFile.stat.size` reports the full content (verified — `adapter.stat`,
  `adapter.read`, `vault.read` and `cachedRead` all say 0 at the same moment `file.stat.size` says 38, and
  it never heals; a `vault.modify` with the same content repairs it). The test then opens a genuinely empty
  note and times out waiting for a link that was never written. At ~34 creates per run that is a ~26%
  chance per full run, landing on whichever test loses the lottery — which is why it masquerades as a
  different single-test flake each time. The fix belongs in the harness's injected `lib`, not here; until it
  ships, a lone `waitUntil` timeout of the form "the rendered … did not appear" on Android is presumed to be
  this. Confirm it by dumping the view's `editor.getValue()` — an EMPTY document is the signature.
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
