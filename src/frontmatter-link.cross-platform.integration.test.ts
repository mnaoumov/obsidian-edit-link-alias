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
 * Named `*.cross-platform.integration.test.ts` (per G47), so the desktop AND android projects both
 * collect it and the same flow is verified on each.
 */

import type { MenuItem } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
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

const EXPECTED_EDITED_VALUE = `[${NEW_ALIAS}](${NEW_URL})`;
const EXPECTED_ALIAS_ONLY_VALUE = `[${NEW_ALIAS}](${TEXT_PROPERTY_URL})`;

const MENU_ITEM_TITLE = 'Edit link alias';
const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
const POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS = 5000;

/**
 * The popover's URL and alias fields — the count is what tells "the popover is fully built" apart from "it is
 * halfway through being built".
 */
const POPOVER_FIELD_COUNT = 2;

type FrontmatterScenario = 'panel-list' | 'panel-text' | 'panel-uppercase-key' | 'raw-yaml';

interface FrontmatterScenarioResult {
  readonly frontmatter: ParsedFrontmatter;
  readonly wasPopoverShown: boolean;
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
describe('Edit a link in the frontmatter', () => {
  it('opens the editor on an Alt click on a text property link and writes valid quoted YAML', async () => {
    const result = await runClickScenario('panel-text');

    expect(result.wasPopoverShown).toBe(true);
    // Parsed back by Obsidian's own YAML parser, so this is proof the block still parses (GH #5).
    expect(result.frontmatter.url).toBe(EXPECTED_EDITED_VALUE);
    expect(result.frontmatter.links).toEqual([FIRST_LIST_URL, SECOND_LIST_URL]);
  });

  it('opens the editor on an Alt click on a list property pill and rewrites only that item', async () => {
    const result = await runClickScenario('panel-list');

    expect(result.wasPopoverShown).toBe(true);
    expect(result.frontmatter.links).toEqual([FIRST_LIST_URL, EXPECTED_EDITED_VALUE]);
    expect(result.frontmatter.url).toBe(TEXT_PROPERTY_URL);
  });

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
  });

  it('opens the editor on an Alt click on a link in the raw YAML in Source mode', async () => {
    const result = await runClickScenario('raw-yaml');

    expect(result.wasPopoverShown).toBe(true);
    expect(result.frontmatter.url).toBe(EXPECTED_EDITED_VALUE);
  });

  it('rewrites a frontmatter link from the link context menu without breaking the YAML', async () => {
    // The literal GH #5 repro: the menu path is what the reporter used.
    const result = await runMenuScenario();

    expect(result.wasItemFound).toBe(true);
    expect(result.frontmatter.url).toBe(EXPECTED_ALIAS_ONLY_VALUE);
    expect(result.frontmatter.links).toEqual([FIRST_LIST_URL, SECOND_LIST_URL]);
  });
});

async function runClickScenario(requestedScenario: FrontmatterScenario): Promise<FrontmatterScenarioResult> {
  return await evalInObsidian({
    async callback({
      app,
      initialSourceContent,
      lib: { clickMouse, createNote, waitUntil },
      newAlias,
      newUrl,
      obsidianModule,
      pluginId,
      popoverFieldCount,
      popoverSettleTimeoutInMilliseconds,
      scenario,
      secondListUrl,
      sourcePath,
      textPropertyUrl,
      uppercasePropertyKeyAsRendered,
      waitTimeoutInMilliseconds
    }) {
      interface ChildrenHolder {
        _children?: unknown[];
      }

      interface SettingsHolder {
        saveToFile(context: unknown): Promise<void>;
        setProperty(propertyName: string, value: unknown): Promise<string>;
        settings: Record<string, unknown>;
      }

      const isRawYaml = scenario === 'raw-yaml';

      /*
       * The Alt-click setting is set explicitly rather than relied on: it defaults to on, but a suite that ran
       * earlier in the same Obsidian instance turns it off for its own control case and does not restore it.
       */
      function findSettingsComponent(root: unknown): null | SettingsHolder {
        const queue: unknown[] = [root];
        while (queue.length > 0) {
          const candidate = queue.shift();
          if (typeof candidate !== 'object' || candidate === null) {
            continue;
          }
          const settings = (candidate as Partial<SettingsHolder>).settings;
          if (settings && typeof settings === 'object' && 'shouldOpenLinkEditorOnAltClick' in settings) {
            return candidate as SettingsHolder;
          }
          queue.push(...((candidate as ChildrenHolder)._children ?? []));
        }
        return null;
      }

      function getPopoverEl(): HTMLElement | null {
        return document.body.querySelector<HTMLElement>(`.obsidian-dev-utils.${pluginId}.popover`);
      }

      /*
       * Every popover field carries the same `text-box` class, so the fields are told apart by their order —
       * the order they were handed to `editFieldsInPopover`: alias first, URL second (the alias leads so the
       * popover focuses it — GH #7).
       *
       * @returns The popover's input elements, in declaration order.
       */
      function getPopoverInputEls(): HTMLInputElement[] {
        return [...getPopoverEl()?.querySelectorAll('input') ?? []];
      }

      /*
       * A click carries real coordinates because the raw-YAML path resolves the link through
       * `Editor.posAtMouse` — a click without them lands at the very start of the document.
       *
       * On desktop it is a TRUSTED click, so it reaches the editor's pointer handling the way a user's
       * does; a dispatched `MouseEvent` is `isTrusted === false` and can be ignored outright. The trusted
       * helpers are built on `window.electron`, which Android does not have, so the phone keeps the
       * dispatch — this file runs on both platforms.
       */
      function clickAt(el: HTMLElement, clientX: number, clientY: number): void {
        if (obsidianModule.Platform.isDesktopApp) {
          clickMouse({ modifiers: ['Alt'], x: clientX, y: clientY });
          return;
        }

        // eslint-disable-next-line obsidian-dev-utils/no-untrusted-input-events -- The mobile arm of a Platform.isDesktopApp branch: the trusted helpers need window.electron, which Android does not have, and this file runs on both platforms.
        el.dispatchEvent(
          new MouseEvent('click', {
            altKey: true,
            bubbles: true,
            button: 0,
            cancelable: true,
            clientX,
            clientY
          })
        );
      }

      function clickElementCentre(el: HTMLElement): void {
        const rect = el.getBoundingClientRect();
        clickAt(el, rect.left + rect.width / 2, rect.top + rect.height / 2);
      }

      /**
       * Finds the point where the given text is rendered inside the raw frontmatter, so the click lands on
       * the url itself rather than merely somewhere on its line.
       *
       * @param containerEl - The view container to search.
       * @param text - The text to locate.
       * @returns The centre of the text's rectangle.
       */
      function findTextPoint(containerEl: HTMLElement, text: string): DOMRect {
        const spanEls = [...containerEl.querySelectorAll<HTMLElement>(':scope .cm-line span, :scope .cm-line')];
        const spanEl = spanEls.find((candidate) => candidate.textContent.includes(text));
        if (!spanEl) {
          throw new Error(`The raw YAML does not render the text ${text}`);
        }
        return spanEl.getBoundingClientRect();
      }

      async function trashSourceNote(): Promise<void> {
        const existing = app.vault.getAbstractFileByPath(sourcePath);
        if (existing) {
          await app.fileManager.trashFile(existing);
        }
      }

      await trashSourceNote();
      const sourceFile = await createNote({ content: initialSourceContent, path: sourcePath });

      /*
       * The resolver reads the frontmatter out of the METADATA CACHE, and a note created a moment ago is not
       * in it yet — the rendered property link appears first, so waiting on the element is not enough. Every
       * candidate then comes back empty and the click reports "could not locate the link". Only the suite's
       * FIRST scenario was slow enough to lose this race, which is exactly how it read as a flake.
       */
      await waitUntil({
        message: 'the frontmatter did not reach the metadata cache',
        predicate: () => Boolean(app.metadataCache.getFileCache(sourceFile)?.frontmatter),
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      const settingsComponent = findSettingsComponent(app.plugins.getPlugin(pluginId));
      if (!settingsComponent) {
        throw new Error('Could not find the plugin settings component');
      }
      await settingsComponent.setProperty('shouldOpenLinkEditorOnAltClick', true);
      await settingsComponent.saveToFile(null);
      await waitUntil({
        message: 'the Alt-click setting did not take effect',
        predicate: () => settingsComponent.settings['shouldOpenLinkEditorOnAltClick'] === true,
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      const leaf = app.workspace.getLeaf(true);
      await leaf.openFile(sourceFile, { state: { mode: 'source', source: isRawYaml } });
      await app.workspace.revealLeaf(leaf);

      await waitUntil({
        message: 'the source note did not become the active editing view',
        predicate: () => app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.file?.path === sourcePath,
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      if (!view) {
        throw new Error('The source note view disappeared');
      }

      if (isRawYaml) {
        /*
         * The caret is parked on the body heading: Source mode renders the frontmatter as plain text either
         * way, but this keeps the gesture identical to a user clicking into the YAML from elsewhere. The line
         * index tracks the fixture — adding a property to the frontmatter pushes the body down.
         */
        view.editor.setCursor({ ch: 0, line: initialSourceContent.split('\n').indexOf('# Body') });
        await waitUntil({
          message: 'the raw frontmatter did not render',
          predicate: () => view.containerEl.textContent.includes(textPropertyUrl),
          timeoutInMilliseconds: waitTimeoutInMilliseconds
        });

        const rect = findTextPoint(view.containerEl, textPropertyUrl);
        clickAt(view.containerEl, rect.left + rect.width / 2, rect.top + rect.height / 2);
      } else {
        /*
         * The uppercase scenario queries the LOWERCASE key on purpose: that is what the panel puts in the
         * attribute, and the mismatch with the note's own `Homepage` spelling is exactly what GH #8 was.
         */
        const propertyKeyByScenario: Record<string, string> = {
          'panel-list': 'links',
          'panel-text': 'url',
          'panel-uppercase-key': uppercasePropertyKeyAsRendered
        };
        const propertyKey = propertyKeyByScenario[scenario] ?? 'url';
        await waitUntil({
          message: `the ${propertyKey} property did not render a link`,
          predicate: () => Boolean(view.containerEl.querySelector(`.metadata-property[data-property-key="${CSS.escape(propertyKey)}"] .external-link`)),
          timeoutInMilliseconds: waitTimeoutInMilliseconds
        });

        const linkEls = [...view.containerEl.querySelectorAll<HTMLElement>(`.metadata-property[data-property-key="${CSS.escape(propertyKey)}"] .external-link`)];
        // The list scenario deliberately targets the SECOND pill, so a "first match wins" bug cannot pass.
        const linkEl = scenario === 'panel-list' ? linkEls.find((candidate) => candidate.dataset['href'] === secondListUrl) : linkEls[0];
        if (!linkEl) {
          throw new Error('The rendered property link disappeared');
        }

        clickElementCentre(linkEl);
      }

      let wasPopoverShown: boolean;
      try {
        await waitUntil({
          message: 'the link editor popover did not open',
          predicate: () => getPopoverInputEls().length === popoverFieldCount,
          timeoutInMilliseconds: popoverSettleTimeoutInMilliseconds
        });
        wasPopoverShown = true;
      } catch {
        wasPopoverShown = false;
      }

      if (wasPopoverShown) {
        const [aliasInputEl, urlInputEl] = getPopoverInputEls();
        const okButtonEl = getPopoverEl()?.querySelector<HTMLElement>('.ok-button');
        if (!urlInputEl || !aliasInputEl || !okButtonEl) {
          throw new Error('The link editor popover is missing its fields');
        }

        urlInputEl.value = newUrl;
        urlInputEl.dispatchEvent(new Event('input', { bubbles: true }));
        aliasInputEl.value = newAlias;
        aliasInputEl.dispatchEvent(new Event('input', { bubbles: true }));
        okButtonEl.click();

        await waitUntil({
          message: 'the frontmatter was not rewritten',
          predicate: async () => (await app.vault.read(sourceFile)) !== initialSourceContent,
          timeoutInMilliseconds: waitTimeoutInMilliseconds
        });
      }

      const content = await app.vault.read(sourceFile);
      /*
       * Parsing with Obsidian's own YAML parser is the assertion that matters: before the fix the rewritten
       * block did not parse at all, which is what GH #5 reported.
       */
      const frontmatter = obsidianModule.parseYaml(obsidianModule.getFrontMatterInfo(content).frontmatter) ?? {};

      await trashSourceNote();

      return {
        frontmatter,
        wasPopoverShown
      };
    },
    input: {
      firstListUrl: FIRST_LIST_URL,
      initialSourceContent: INITIAL_SOURCE_CONTENT,
      newAlias: NEW_ALIAS,
      newUrl: NEW_URL,
      pluginId: PLUGIN_ID,
      popoverFieldCount: POPOVER_FIELD_COUNT,
      popoverSettleTimeoutInMilliseconds: POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS,
      scenario: requestedScenario,
      secondListUrl: SECOND_LIST_URL,
      sourcePath: SOURCE_PATH,
      textPropertyUrl: TEXT_PROPERTY_URL,
      uppercasePropertyKeyAsRendered: UPPERCASE_PROPERTY_KEY_AS_RENDERED,
      waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
    },
    vaultPath: getTemporaryVault().path
  });
}

async function runMenuScenario(): Promise<MenuScenarioResult> {
  return await evalInObsidian({
    async callback({
      app,
      initialSourceContent,
      lib: { createNote, waitUntil },
      menuItemTitle,
      newAlias,
      obsidianModule,
      sourcePath,
      textPropertyUrl,
      waitTimeoutInMilliseconds
    }) {
      async function trashSourceNote(): Promise<void> {
        const existing = app.vault.getAbstractFileByPath(sourcePath);
        if (existing) {
          await app.fileManager.trashFile(existing);
        }
      }

      await trashSourceNote();
      const sourceFile = await createNote({ content: initialSourceContent, path: sourcePath });

      const leaf = app.workspace.getLeaf(true);
      await leaf.openFile(sourceFile, { state: { mode: 'preview' } });
      await app.workspace.revealLeaf(leaf);

      await waitUntil({
        message: 'the source note did not become the active reading view',
        predicate: () => app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.file?.path === sourcePath,
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      /*
       * Right-clicking a rendered external link makes Obsidian raise the `url-menu` event, which is the only
       * thing the plugin sees — so triggering that event IS the gesture, and it avoids depending on
       * `Workspace.handleExternalLinkMenu`, which obsidian-typings does not declare.
       */
      const menu = new obsidianModule.Menu();
      app.workspace.trigger('url-menu', menu, textPropertyUrl);

      const menuItem = menu.items.find((item): item is MenuItem => 'titleEl' in item && item.titleEl.textContent === menuItemTitle);
      if (!menuItem) {
        return {
          frontmatter: {},
          wasItemFound: false
        };
      }

      menuItem.callback?.();

      await waitUntil({
        message: 'the prompt modal did not open',
        predicate: () => document.querySelector('.prompt-modal input.text-box') !== null,
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      const inputEl = document.querySelector<HTMLInputElement>('.prompt-modal input.text-box');
      const okButtonEl = document.querySelector<HTMLElement>('.prompt-modal .ok-button');
      if (!inputEl || !okButtonEl) {
        throw new Error('The prompt modal is missing its field');
      }

      inputEl.value = newAlias;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      okButtonEl.click();

      await waitUntil({
        message: 'the frontmatter was not rewritten',
        predicate: async () => (await app.vault.read(sourceFile)) !== initialSourceContent,
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      const content = await app.vault.read(sourceFile);
      const frontmatter = obsidianModule.parseYaml(obsidianModule.getFrontMatterInfo(content).frontmatter) ?? {};

      await trashSourceNote();

      return {
        frontmatter,
        wasItemFound: true
      };
    },
    input: {
      initialSourceContent: INITIAL_SOURCE_CONTENT,
      menuItemTitle: MENU_ITEM_TITLE,
      newAlias: NEW_ALIAS,
      sourcePath: SOURCE_PATH,
      textPropertyUrl: TEXT_PROPERTY_URL,
      waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
    },
    vaultPath: getTemporaryVault().path
  });
}
