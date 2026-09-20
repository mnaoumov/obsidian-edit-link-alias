/**
 * @file
 *
 * Shared integration suite for editing a link that lives in a note's YAML frontmatter.
 *
 * Two GitHub issues meet here, and both are about the frontmatter being YAML rather than markdown:
 * - **GH #5** — editing a bare url's alias used to splice `[alias](url)` into the raw YAML, which starts a
 *   flow sequence and broke the note. Every assertion below therefore parses the resulting frontmatter with
 *   Obsidian's own `parseYaml`: a corrupted block cannot pass, and the parsed value proves the quoting.
 * - **GH #6** — `Alt` + clicking a frontmatter link did nothing at all. Obsidian renders a property link as a
 *   `div` (`.metadata-link-inner` for a text property, `.multi-select-pill-content` for a list one) carrying
 *   `data-href` and never an `href`, and raw YAML in Source mode renders no link element whatsoever.
 *
 * The three surfaces are covered separately because each resolves the clicked link by a different route: the
 * Properties panel by the `data-property-key` it rendered, the raw YAML by the pointer position, and the
 * context menu by the url alone (the `url-menu` event carries nothing else).
 *
 * Named `*.cross-platform.integration.test.ts`, so the desktop AND android projects both
 * collect it and the same flow is verified on each.
 *
 * **The waiting happens in NODE.** One `evalInObsidian` closure is one transport call, capped at ~30s, and
 * the click flow used to declare seven waits inside a single one — 125s the cap could only ever kill as a
 * bare `script timeout` naming the harness rather than the wait that overran; the menu flow declared 60s the
 * same way. Each wait is now a `pollInObsidian`: a short DOM-reading `poll` per transport call, the
 * acceptance decided in Node, and the budget in `timeoutInMilliseconds`, so
 * `WAIT_TIMEOUT_IN_MILLISECONDS` is a real ceiling for every wait rather than a share of one it never had.
 * The `it`s carry their own `TEST_TIMEOUT_IN_MILLISECONDS` for the same reason: the shared config gives this
 * project 30s (desktop) and 60s (android), which is a second ceiling underneath the waits.
 *
 * State that cannot be re-derived rides a {@link ContextId} — the settings component a tree walk finds, and
 * the note this run created. The active view is re-looked-up in each closure instead, because it is one call
 * and a carried reference could go stale.
 */

import type {
  MenuItem,
  TFile
} from 'obsidian';

import {
  ContextId,
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'edit-link-alias';
const SOURCE_PATH = 'frontmatter-link-source.md';

const TEXT_PROPERTY_URL = 'https://example.com';
const FIRST_LIST_URL = 'https://one.example.com';
const SECOND_LIST_URL = 'https://two.example.com';
const UPPERCASE_KEY_PROPERTY_URL = 'https://uppercase.example.com';

/**
 * A property whose key the note spells with capitals. Obsidian renders `data-property-key` lowercased while
 * the metadata cache keeps this spelling, and the two used to be compared as written — which is GH #8.
 */
const UPPERCASE_PROPERTY_KEY = 'Homepage';

/**
 * The same key as the Properties panel puts it in the attribute the click reads. Written out rather than
 * derived with `toLowerCase()` so the test states what Obsidian actually renders.
 */
const UPPERCASE_PROPERTY_KEY_AS_RENDERED = 'homepage';

const NEW_ALIAS = 'new alias';
const NEW_URL = 'https://renamed.example.com';

/**
 * Every url in the fixture is distinct on purpose: the raw-YAML path identifies the link by its text, so a
 * repeated url would legitimately raise the "which link did you mean?" picker and stall the run.
 */
const INITIAL_SOURCE_CONTENT = [
  '---',
  `url: ${TEXT_PROPERTY_URL}`,
  `${UPPERCASE_PROPERTY_KEY}: ${UPPERCASE_KEY_PROPERTY_URL}`,
  'links:',
  `  - ${FIRST_LIST_URL}`,
  `  - ${SECOND_LIST_URL}`,
  '---',
  '',
  '# Body',
  ''
].join('\n');

/**
 * The body line the caret is parked on before the raw-YAML click, so the gesture is identical to a user
 * clicking into the YAML from elsewhere. Resolved to a line index in Node, where the fixture is written.
 */
const BODY_HEADING_LINE_INDEX = INITIAL_SOURCE_CONTENT.split('\n').indexOf('# Body');

const EXPECTED_EDITED_VALUE = `[${NEW_ALIAS}](${NEW_URL})`;
const EXPECTED_ALIAS_ONLY_VALUE = `[${NEW_ALIAS}](${TEXT_PROPERTY_URL})`;

const MENU_ITEM_TITLE = 'Edit link alias';
const PROMPT_INPUT_SELECTOR = '.prompt-modal input.text-box';
const PROMPT_OK_BUTTON_SELECTOR = '.prompt-modal .ok-button';

const ALT_CLICK_SETTING_NAME = 'shouldOpenLinkEditorOnAltClick';

/**
 * The popover `obsidian-dev-utils` builds for this plugin. Every field carries the same `text-box` class, so
 * the fields are told apart by their order — the order they were handed to `editFieldsInPopover`: alias
 * first, URL second (the alias leads so the popover focuses it — GH #7).
 */
const POPOVER_SELECTOR = `.obsidian-dev-utils.${PLUGIN_ID}.popover`;

const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
const POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS = 5000;

/**
 * Node-side budget for one whole scenario. Without it the shared config's 30s desktop / 60s android
 * `testTimeout` would expire long before the waits below do, which is the ceiling that made moving the
 * waiting out of the closure only half a fix.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

/**
 * The popover's URL and alias fields — the count is what tells "the popover is fully built" apart from "it is
 * halfway through being built".
 */
const POPOVER_FIELD_COUNT = 2;

interface ChildrenHolder {
  _children?: unknown[];
}

type FrontmatterScenario = 'panel-list' | 'panel-text' | 'panel-uppercase-key' | 'raw-yaml';

interface FrontmatterScenarioResult {
  readonly frontmatter: ParsedFrontmatter;
  readonly wasPopoverShown: boolean;
}

/**
 * What one scenario keeps alive between closures: neither value survives serialization, and neither is worth
 * re-deriving in every call that needs it.
 */
interface FrontmatterSuiteContext {
  settingsComponent?: SettingsHolder;
  sourceFile?: TFile;
}

interface MenuScenarioResult {
  readonly frontmatter: ParsedFrontmatter;
  readonly wasItemFound: boolean;
}

interface ParsedFrontmatter {
  readonly Homepage?: string;
  readonly links?: string[];
  readonly url?: string;
}

/**
 * The plugin's settings component, as the tree walk below recognizes it.
 */
interface SettingsHolder {
  saveToFile: (context: unknown) => Promise<void>;
  setProperty: (propertyName: string, value: unknown) => Promise<string>;
  settings: Record<string, unknown>;
}
describe('Edit a link in the frontmatter', () => {
  it('opens the editor on an Alt click on a text property link and writes valid quoted YAML', async () => {
    const result = await runClickScenario('panel-text');

    expect(result.wasPopoverShown).toBe(true);
    // Parsed back by Obsidian's own YAML parser, so this is proof the block still parses (GH #5).
    expect(result.frontmatter.url).toBe(EXPECTED_EDITED_VALUE);
    expect(result.frontmatter.links).toEqual([FIRST_LIST_URL, SECOND_LIST_URL]);
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('opens the editor on an Alt click on a list property pill and rewrites only that item', async () => {
    const result = await runClickScenario('panel-list');

    expect(result.wasPopoverShown).toBe(true);
    expect(result.frontmatter.links).toEqual([FIRST_LIST_URL, EXPECTED_EDITED_VALUE]);
    expect(result.frontmatter.url).toBe(TEXT_PROPERTY_URL);
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('opens the editor on an Alt click on a property whose key is spelled with capitals', async () => {
    /*
     * The GH #8 regression test. The panel hands the click `homepage` (it lowercases every key it renders)
     * while the cache holds `Homepage`, and comparing them as written reported "Could not locate the link
     * in the source note" — on a link the context menu could edit perfectly well.
     */
    const result = await runClickScenario('panel-uppercase-key');

    expect(result.wasPopoverShown).toBe(true);
    expect(result.frontmatter.Homepage).toBe(EXPECTED_EDITED_VALUE);
    expect(result.frontmatter.url).toBe(TEXT_PROPERTY_URL);
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('opens the editor on an Alt click on a link in the raw YAML in Source mode', async () => {
    const result = await runClickScenario('raw-yaml');

    expect(result.wasPopoverShown).toBe(true);
    expect(result.frontmatter.url).toBe(EXPECTED_EDITED_VALUE);
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('rewrites a frontmatter link from the link context menu without breaking the YAML', async () => {
    // The literal GH #5 repro: the menu path is what the reporter used.
    const result = await runMenuScenario();

    expect(result.wasItemFound).toBe(true);
    expect(result.frontmatter.url).toBe(EXPECTED_ALIAS_ONLY_VALUE);
    expect(result.frontmatter.links).toEqual([FIRST_LIST_URL, SECOND_LIST_URL]);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * Fills the popover's two fields and confirms.
 *
 * One closure deliberately: the popover is rebuilt on re-render, so a split would set values on inputs the
 * confirm no longer belongs to.
 */
async function applyPopoverEdit(): Promise<void> {
  await evalInObsidian({
    callback({ newAlias, newUrl, popoverSelector }): void {
      const popoverEl = document.body.querySelector<HTMLElement>(popoverSelector);
      const [aliasInputEl, urlInputEl] = [...popoverEl?.querySelectorAll('input') ?? []];
      const okButtonEl = popoverEl?.querySelector<HTMLElement>('.ok-button');
      if (!urlInputEl || !aliasInputEl || !okButtonEl) {
        throw new Error('The link editor popover is missing its fields');
      }

      urlInputEl.value = newUrl;
      urlInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      aliasInputEl.value = newAlias;
      aliasInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      okButtonEl.click();
    },
    input: {
      newAlias: NEW_ALIAS,
      newUrl: NEW_URL,
      popoverSelector: POPOVER_SELECTOR
    },
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Waits — from Node — for the link editor popover to be fully built.
 *
 * Polling for the popover's PRESENCE is what makes a timeout a legitimate answer rather than a lost race: the
 * budget is spent in full before `false` is returned, exactly as the in-closure settle it replaces did.
 *
 * @returns Whether the popover opened within the settle budget.
 */
async function checkPopoverShown(): Promise<boolean> {
  try {
    await pollInObsidian({
      input: { popoverSelector: POPOVER_SELECTOR },
      poll({ popoverSelector }): number {
        return document.body.querySelector<HTMLElement>(popoverSelector)?.querySelectorAll('input').length ?? 0;
      },
      timeoutInMilliseconds: POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the link editor popover did not open',
      until: (fieldCount: number): boolean => fieldCount === POPOVER_FIELD_COUNT,
      vaultPath: getTemporaryVault().path
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * `Alt` + clicks the rendered property link the Properties panel shows.
 *
 * Finding the element and clicking its centre stay in ONE closure: a rect handed back to Node is a snapshot,
 * and the panel may have re-rendered by the time the click returns.
 *
 * A TRUSTED click on BOTH platforms, so it reaches the editor's pointer handling the way a user's does; a
 * dispatched `MouseEvent` is `isTrusted === false` and can be ignored outright. `clickMouse` is an Electron
 * `sendInputEvent` on desktop and a CDP touch injection on Android, and the `Alt` modifier rides along on
 * either — so this file needs no platform branch.
 *
 * @param scenario - The panel scenario being run.
 */
async function clickPanelLink(scenario: FrontmatterScenario): Promise<void> {
  await evalInObsidian({
    async callback({ app, isListScenario, lib: { clickMouse }, obsidianModule, propertyKey, secondListUrl }): Promise<void> {
      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      if (!view) {
        throw new Error('The source note view disappeared');
      }

      const linkEls = [...view.containerEl.querySelectorAll<HTMLElement>(`.metadata-property[data-property-key="${CSS.escape(propertyKey)}"] .external-link`)];
      // The list scenario deliberately targets the SECOND pill, so a "first match wins" bug cannot pass.
      const linkEl = isListScenario ? linkEls.find((candidate) => candidate.dataset['href'] === secondListUrl) : linkEls[0];
      if (!linkEl) {
        throw new Error('The rendered property link disappeared');
      }

      const rect = linkEl.getBoundingClientRect();
      await clickMouse({ modifiers: ['Alt'], x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    },
    input: {
      isListScenario: scenario === 'panel-list',
      propertyKey: getPanelPropertyKey(scenario),
      secondListUrl: SECOND_LIST_URL
    },
    vaultPath: getTemporaryVault().path
  });
}

/**
 * `Alt` + clicks the url where Source mode renders it as plain text.
 *
 * Measuring the rect and clicking its centre stay in ONE closure, for the reason
 * {@link clickPanelLink} gives.
 */
async function clickRawYamlUrl(): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { clickMouse }, obsidianModule, textPropertyUrl }): Promise<void> {
      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      if (!view) {
        throw new Error('The source note view disappeared');
      }

      // The element rendering the url itself, so the click lands on it rather than merely somewhere on its line.
      const spanEls = [...view.containerEl.querySelectorAll<HTMLElement>(':scope .cm-line span, :scope .cm-line')];
      const spanEl = spanEls.find((candidate) => candidate.textContent.includes(textPropertyUrl));
      if (!spanEl) {
        throw new Error(`The raw YAML does not render the text ${textPropertyUrl}`);
      }

      const rect = spanEl.getBoundingClientRect();
      await clickMouse({ modifiers: ['Alt'], x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    },
    input: { textPropertyUrl: TEXT_PROPERTY_URL },
    vaultPath: getTemporaryVault().path
  });
}

/**
 * The `data-property-key` a panel scenario clicks under.
 *
 * The uppercase scenario answers the LOWERCASE key on purpose: that is what the panel puts in the attribute,
 * and the mismatch with the note's own `Homepage` spelling is exactly what GH #8 was.
 *
 * @param scenario - The scenario being run.
 * @returns The property key to query the panel by.
 */
function getPanelPropertyKey(scenario: FrontmatterScenario): string {
  switch (scenario) {
    case 'panel-list': {
      return 'links';
    }
    case 'panel-uppercase-key': {
      return UPPERCASE_PROPERTY_KEY_AS_RENDERED;
    }
    default: {
      return 'url';
    }
  }
}

/**
 * Waits — from Node — for the source note's frontmatter to reach the metadata cache.
 *
 * The resolver reads the frontmatter out of the METADATA CACHE, and a note created a moment ago is not in it
 * yet — the rendered property link appears first, so waiting on the element is not enough. Every candidate
 * then comes back empty and the click reports "could not locate the link". Only the suite's FIRST scenario
 * was slow enough to lose this race, which is exactly how it read as a flake.
 *
 * @param contextId - The context the created note is stashed on.
 */
async function pollFrontmatterCached(contextId: ContextId<FrontmatterSuiteContext>): Promise<void> {
  await pollInObsidian({
    contextId,
    input: { initialSourceContent: INITIAL_SOURCE_CONTENT, sourcePath: SOURCE_PATH },
    poll({ app, context }): boolean {
      return context.sourceFile ? Boolean(app.metadataCache.getFileCache(context.sourceFile)?.frontmatter) : false;
    },
    async start({ app, context, initialSourceContent, lib: { createNote }, sourcePath }): Promise<void> {
      const existing = app.vault.getAbstractFileByPath(sourcePath);
      if (existing) {
        await app.fileManager.trashFile(existing);
      }
      context.sourceFile = await createNote({ content: initialSourceContent, path: sourcePath });
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the frontmatter did not reach the metadata cache',
    until: (isCached: boolean): boolean => isCached,
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Waits — from Node — for the Properties panel to render the scenario's link.
 *
 * @param scenario - The panel scenario being run.
 */
async function pollPanelLinkRendered(scenario: FrontmatterScenario): Promise<void> {
  const propertyKey = getPanelPropertyKey(scenario);
  await pollInObsidian({
    input: { propertyKey },
    poll({ app, obsidianModule, propertyKey: key }): boolean {
      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      return Boolean(view?.containerEl.querySelector(`.metadata-property[data-property-key="${CSS.escape(key)}"] .external-link`));
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: `the ${propertyKey} property did not render a link`,
    until: (isRendered: boolean): boolean => isRendered,
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Parks the caret on the body heading and waits — from Node — for the raw frontmatter to render.
 *
 * Source mode renders the frontmatter as plain text either way; the caret keeps the gesture identical to a
 * user clicking into the YAML from elsewhere.
 */
async function pollRawYamlRendered(): Promise<void> {
  await pollInObsidian({
    input: { bodyHeadingLineIndex: BODY_HEADING_LINE_INDEX, textPropertyUrl: TEXT_PROPERTY_URL },
    poll({ app, obsidianModule, textPropertyUrl }): boolean {
      return app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.containerEl.textContent.includes(textPropertyUrl) ?? false;
    },
    start({ app, bodyHeadingLineIndex, obsidianModule }): void {
      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      if (!view) {
        throw new Error('The source note view disappeared');
      }
      view.editor.setCursor({ ch: 0, line: bodyHeadingLineIndex });
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the raw frontmatter did not render',
    until: (isRendered: boolean): boolean => isRendered,
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Waits — from Node — for an edit to reach the note on disk.
 *
 * @param contextId - The context the created note is stashed on.
 */
async function pollSourceRewritten(contextId: ContextId<FrontmatterSuiteContext>): Promise<void> {
  await pollInObsidian({
    contextId,
    input: { initialSourceContent: INITIAL_SOURCE_CONTENT },
    async poll({ app, context, initialSourceContent }): Promise<boolean> {
      if (!context.sourceFile) {
        throw new Error('The source note was never created');
      }
      return (await app.vault.read(context.sourceFile)) !== initialSourceContent;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the frontmatter was not rewritten',
    until: (wasRewritten: boolean): boolean => wasRewritten,
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Reads the note's frontmatter back through Obsidian's own YAML parser, then trashes the note.
 *
 * Parsing with `parseYaml` is the assertion that matters: before the fix the rewritten block did not parse at
 * all, which is what GH #5 reported.
 *
 * @param contextId - The context the created note is stashed on.
 * @returns The parsed frontmatter.
 */
async function readFrontmatterAndTrash(contextId: ContextId<FrontmatterSuiteContext>): Promise<ParsedFrontmatter> {
  return await evalInObsidian({
    async callback({ app, context, obsidianModule }): Promise<ParsedFrontmatter> {
      if (!context.sourceFile) {
        throw new Error('The source note was never created');
      }

      const content = await app.vault.read(context.sourceFile);
      const frontmatter: ParsedFrontmatter = obsidianModule.parseYaml(obsidianModule.getFrontMatterInfo(content).frontmatter) ?? {};

      await app.fileManager.trashFile(context.sourceFile);
      return frontmatter;
    },
    contextId,
    vaultPath: getTemporaryVault().path
  });
}

async function runClickScenario(requestedScenario: FrontmatterScenario): Promise<FrontmatterScenarioResult> {
  const isRawYaml = requestedScenario === 'raw-yaml';
  const contextId = new ContextId<FrontmatterSuiteContext>();

  try {
    await pollFrontmatterCached(contextId);

    /*
     * The Alt-click setting is set explicitly rather than relied on: it defaults to on, but a suite that ran
     * earlier in the same Obsidian instance turns it off for its own control case and does not restore it.
     */
    await pollInObsidian({
      contextId,
      input: { altClickSettingName: ALT_CLICK_SETTING_NAME, pluginId: PLUGIN_ID },
      poll({ altClickSettingName, context }): boolean {
        return context.settingsComponent?.settings[altClickSettingName] === true;
      },
      async start({ altClickSettingName, app, context, pluginId }): Promise<void> {
        const queue: unknown[] = [app.plugins.getPlugin(pluginId)];
        while (queue.length > 0) {
          const candidate = queue.shift();
          if (typeof candidate !== 'object' || candidate === null) {
            continue;
          }
          const settings = (candidate as Partial<SettingsHolder>).settings;
          if (settings && typeof settings === 'object' && typeof settings[altClickSettingName] === 'boolean') {
            context.settingsComponent = candidate as SettingsHolder;
            break;
          }
          queue.push(...((candidate as ChildrenHolder)._children ?? []));
        }

        const settingsComponent = context.settingsComponent;
        if (!settingsComponent) {
          throw new Error('Could not find the plugin settings component');
        }
        await settingsComponent.setProperty(altClickSettingName, true);
        await settingsComponent.saveToFile(null);
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the Alt-click setting did not take effect',
      until: (isEnabled: boolean): boolean => isEnabled,
      vaultPath: getTemporaryVault().path
    });

    await pollInObsidian({
      contextId,
      input: { isRawYaml, sourcePath: SOURCE_PATH },
      poll({ app, obsidianModule, sourcePath }): boolean {
        return app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.file?.path === sourcePath;
      },
      async start({ app, context, isRawYaml: isRaw }): Promise<void> {
        if (!context.sourceFile) {
          throw new Error('The source note was never created');
        }
        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(context.sourceFile, { state: { mode: 'source', source: isRaw } });
        await app.workspace.revealLeaf(leaf);
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the source note did not become the active editing view',
      until: (isActive: boolean): boolean => isActive,
      vaultPath: getTemporaryVault().path
    });

    if (isRawYaml) {
      await pollRawYamlRendered();
      await clickRawYamlUrl();
    } else {
      await pollPanelLinkRendered(requestedScenario);
      await clickPanelLink(requestedScenario);
    }

    const wasPopoverShown = await checkPopoverShown();

    if (wasPopoverShown) {
      await applyPopoverEdit();
      await pollSourceRewritten(contextId);
    }

    return {
      frontmatter: await readFrontmatterAndTrash(contextId),
      wasPopoverShown
    };
  } finally {
    await contextId.dispose(getTemporaryVault().path);
  }
}

async function runMenuScenario(): Promise<MenuScenarioResult> {
  const contextId = new ContextId<FrontmatterSuiteContext>();

  try {
    await pollFrontmatterCached(contextId);

    await pollInObsidian({
      contextId,
      input: { sourcePath: SOURCE_PATH },
      poll({ app, obsidianModule, sourcePath }): boolean {
        return app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.file?.path === sourcePath;
      },
      async start({ app, context }): Promise<void> {
        if (!context.sourceFile) {
          throw new Error('The source note was never created');
        }
        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(context.sourceFile, { state: { mode: 'preview' } });
        await app.workspace.revealLeaf(leaf);
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the source note did not become the active reading view',
      until: (isActive: boolean): boolean => isActive,
      vaultPath: getTemporaryVault().path
    });

    /*
     * Raising the menu, finding the item and invoking it stay in ONE closure: `Menu` is a live object this
     * closure builds, and it has nowhere to live between transport calls.
     *
     * Right-clicking a rendered external link makes Obsidian raise the `url-menu` event, which is the only
     * thing the plugin sees — so triggering that event IS the gesture, and it avoids depending on
     * `Workspace.handleExternalLinkMenu`, which obsidian-typings does not declare.
     */
    const wasItemFound = await evalInObsidian({
      callback({ app, menuItemTitle, obsidianModule, textPropertyUrl }): boolean {
        const menu = new obsidianModule.Menu();
        app.workspace.trigger('url-menu', menu, textPropertyUrl);

        const menuItem = menu.items.find((item): item is MenuItem => 'titleEl' in item && item.titleEl.textContent === menuItemTitle);
        if (!menuItem) {
          return false;
        }

        menuItem.callback?.();
        return true;
      },
      input: {
        menuItemTitle: MENU_ITEM_TITLE,
        textPropertyUrl: TEXT_PROPERTY_URL
      },
      vaultPath: getTemporaryVault().path
    });

    if (!wasItemFound) {
      return {
        frontmatter: {},
        wasItemFound: false
      };
    }

    await pollInObsidian({
      input: { promptInputSelector: PROMPT_INPUT_SELECTOR },
      poll({ promptInputSelector }): boolean {
        return document.querySelector(promptInputSelector) !== null;
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the prompt modal did not open',
      until: (isOpen: boolean): boolean => isOpen,
      vaultPath: getTemporaryVault().path
    });

    // The fill and the OK click stay in ONE closure: a modal re-render between them would submit an empty field.
    await evalInObsidian({
      callback({ newAlias, promptInputSelector, promptOkButtonSelector }): void {
        const inputEl = document.querySelector<HTMLInputElement>(promptInputSelector);
        const okButtonEl = document.querySelector<HTMLElement>(promptOkButtonSelector);
        if (!inputEl || !okButtonEl) {
          throw new Error('The prompt modal is missing its field');
        }

        inputEl.value = newAlias;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        okButtonEl.click();
      },
      input: {
        newAlias: NEW_ALIAS,
        promptInputSelector: PROMPT_INPUT_SELECTOR,
        promptOkButtonSelector: PROMPT_OK_BUTTON_SELECTOR
      },
      vaultPath: getTemporaryVault().path
    });

    await pollSourceRewritten(contextId);

    return {
      frontmatter: await readFrontmatterAndTrash(contextId),
      wasItemFound: true
    };
  } finally {
    await contextId.dispose(getTemporaryVault().path);
  }
}
