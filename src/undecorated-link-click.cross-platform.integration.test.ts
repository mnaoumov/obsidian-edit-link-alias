/**
 * @file
 *
 * Shared integration suite for `Alt` + clicking a link an editing view is showing as PLAIN TEXT.
 *
 * `link-click-popover.cross-platform.integration.test.ts` covers the decorated link — the one Obsidian renders as an
 * anchor or wraps in its own CodeMirror classes, which `LINK_SELECTOR` can match. This file covers the case
 * that has no element to match at all, which is GH #9:
 *
 * - a **bare url** with the caret inside it, which drops Live Preview's decoration and leaves raw text;
 * - the **`(url)` half** of a markdown link, which is never part of the decorated alias.
 *
 * Both are resolved by the click's position through `Editor.posAtMouse`, so both **must** be clicked with real
 * `clientX`/`clientY` — a click dispatched without coordinates resolves to the very start of the document and
 * would pass or fail for the wrong reason. And unlike the decorated suite, the caret is deliberately parked
 * **on** the link's line: that is what makes Live Preview show the raw markdown these cases need.
 *
 * Named `*.cross-platform.integration.test.ts` (per G47), so the desktop AND android projects both
 * collect it and the same flow is verified on each.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'edit-link-alias';
const SOURCE_PATH = 'undecorated-link-source.md';

const BARE_URL = 'https://bare.example.com';
const MARKDOWN_LINK_URL = 'https://markdown.example.com';
const MARKDOWN_LINK_ALIAS = 'old alias';

const NEW_ALIAS = 'new alias';
const NEW_URL = 'https://renamed.example.com';

const EXPECTED_EDITED_LINK = `[${NEW_ALIAS}](${NEW_URL})`;

/**
 * The link sits on the SECOND line so the caret can be parked on it by line index, and so a line-index bug in
 * the write-back cannot pass unnoticed.
 */
const INTRO_LINE = 'intro';
const LINK_LINE_INDEX = 1;

const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
const POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS = 5000;

/**
 * The popover's alias and URL fields — the count is what tells "the popover is fully built" apart from "it is
 * halfway through being built".
 */
const POPOVER_FIELD_COUNT = 2;

type UndecoratedScenario = 'bare-url' | 'markdown-link-url-half';

interface UndecoratedScenarioResult {
  readonly sourceContent: string;
  readonly wasPopoverShown: boolean;
}
describe('Edit an undecorated link by Alt + clicking it', () => {
  it('opens the popover on a bare url the caret is sitting in, and rewrites it', async () => {
    /*
     * Half of GH #9: with the caret elsewhere the bare url renders as a clickable link and this worked, but
     * with the caret inside it there is no link element left for the selector to match.
     */
    const result = await runScenario('bare-url');

    expect(result.wasPopoverShown).toBe(true);
    expect(result.sourceContent).toBe(`${INTRO_LINE}\n${EXPECTED_EDITED_LINK}`);
  });

  it('opens the popover when the click lands on the url half of a markdown link', async () => {
    // The other half of GH #9: only the alias was clickable, because only the alias is decorated.
    const result = await runScenario('markdown-link-url-half');

    expect(result.wasPopoverShown).toBe(true);
    expect(result.sourceContent).toBe(`${INTRO_LINE}\n${EXPECTED_EDITED_LINK}`);
  });
});

function getInitialSourceContent(scenario: UndecoratedScenario): string {
  const link = scenario === 'bare-url' ? BARE_URL : `[${MARKDOWN_LINK_ALIAS}](${MARKDOWN_LINK_URL})`;
  return `${INTRO_LINE}\n${link}`;
}

async function runScenario(requestedScenario: UndecoratedScenario): Promise<UndecoratedScenarioResult> {
  return await evalInObsidian({
    async callback({
      app,
      clickedUrl,
      initialSourceContent,
      lib: { clickMouse, createNote, waitUntil },
      linkLineIndex,
      newAlias,
      newUrl,
      obsidianModule,
      pluginId,
      popoverFieldCount,
      popoverSettleTimeoutInMilliseconds,
      sourcePath,
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

      /**
       * Finds where the given text is rendered, so the click lands on the url itself rather than merely
       * somewhere on its line. The url half of a markdown link is its own span, which is precisely why the
       * link selector never matched it.
       *
       * @param containerEl - The view container to search.
       * @param text - The text to locate.
       * @returns The rectangle of the innermost element rendering the text.
       */
      function findTextRect(containerEl: HTMLElement, text: string): DOMRect {
        const candidateEls = [...containerEl.querySelectorAll<HTMLElement>(':scope .cm-line span, :scope .cm-line')];
        // The innermost match: an outer `.cm-line` also contains the text, but its centre may miss the url.
        const matchingEls = candidateEls.filter((candidate) => candidate.textContent.includes(text));
        const el = matchingEls.at(-1);
        if (!el) {
          throw new Error(`The editor does not render the text ${text}`);
        }
        return el.getBoundingClientRect();
      }

      async function trashSourceNote(): Promise<void> {
        const existing = app.vault.getAbstractFileByPath(sourcePath);
        if (existing) {
          await app.fileManager.trashFile(existing);
        }
      }

      await trashSourceNote();
      const sourceFile = await createNote({ content: initialSourceContent, path: sourcePath });

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
      await leaf.openFile(sourceFile, { state: { mode: 'source', source: false } });
      await app.workspace.revealLeaf(leaf);

      await waitUntil({
        message: 'the source note did not become the active Live Preview view',
        predicate: () => {
          const candidate = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
          return candidate?.file?.path === sourcePath && candidate.getMode() === 'source';
        },
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      if (!view) {
        throw new Error('The source note view disappeared');
      }

      /*
       * ON the link's line, not off it. Live Preview renders the caret's own line as raw markdown, which is
       * what strips the decoration and produces the very situation GH #9 reported.
       *
       * The editor is focused FIRST, and that is not redundant: Live Preview only un-decorates the caret's
       * line while the editor actually has the focus, and on Android neither `openFile` nor `revealLeaf`
       * gives it any — the active element stays the `body`, so the line keeps rendering as `old alias` and
       * the url never appears at all.
       */
      view.editor.focus();
      view.editor.setCursor({ ch: 0, line: linkLineIndex });

      await waitUntil({
        message: 'the raw link text did not render',
        predicate: () => view.containerEl.textContent.includes(clickedUrl),
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      /*
       * On desktop this is a TRUSTED click, so it reaches the editor's pointer handling the way a user's
       * does; a dispatched `MouseEvent` is `isTrusted === false` and can be ignored outright. The trusted
       * helpers are built on `window.electron`, which Android does not have, so the phone keeps the
       * dispatch — this file runs on both platforms.
       */
      const rect = findTextRect(view.containerEl, clickedUrl);
      const clickX = rect.left + rect.width / 2;
      const clickY = rect.top + rect.height / 2;
      if (obsidianModule.Platform.isDesktopApp) {
        await clickMouse({ modifiers: ['Alt'], x: clickX, y: clickY });
      } else {
        // eslint-disable-next-line obsidian-dev-utils/no-untrusted-input-events -- The mobile arm of a Platform.isDesktopApp branch: the trusted helpers need window.electron, which Android does not have, and this file runs on both platforms.
        view.containerEl.dispatchEvent(
          new MouseEvent('click', {
            altKey: true,
            bubbles: true,
            button: 0,
            cancelable: true,
            clientX: clickX,
            clientY: clickY
          })
        );
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
          message: 'the source note was not rewritten',
          predicate: async () => (await app.vault.read(sourceFile)) !== initialSourceContent,
          timeoutInMilliseconds: waitTimeoutInMilliseconds
        });
      }

      const sourceContent = await app.vault.read(sourceFile);

      await trashSourceNote();

      return {
        sourceContent,
        wasPopoverShown
      };
    },
    input: {
      clickedUrl: requestedScenario === 'bare-url' ? BARE_URL : MARKDOWN_LINK_URL,
      initialSourceContent: getInitialSourceContent(requestedScenario),
      linkLineIndex: LINK_LINE_INDEX,
      newAlias: NEW_ALIAS,
      newUrl: NEW_URL,
      pluginId: PLUGIN_ID,
      popoverFieldCount: POPOVER_FIELD_COUNT,
      popoverSettleTimeoutInMilliseconds: POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS,
      sourcePath: SOURCE_PATH,
      waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
    },
    vaultPath: getTemporaryVault().path
  });
}
