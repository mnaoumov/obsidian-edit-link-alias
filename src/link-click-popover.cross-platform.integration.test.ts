/**
 * @file
 *
 * Shared integration suite for the Alt-click-to-edit behavior: `Alt` + clicking a rendered link opens
 * the anchored URL + alias popover instead of opening the link.
 *
 * It runs against a real Obsidian: it creates a note containing `[[target|old alias]]`, opens it, dispatches
 * a real `Alt` click on the rendered link, fills the popover and confirms, then asserts the source note was
 * rewritten AND that the navigation was suppressed (the source note is still the active file).
 *
 * **Every mode is covered, not just Reading view.** A Reading-view-only suite is exactly what let GH #4 ship:
 * Reading view renders real anchors carrying `data-href`, while Live Preview renders the link as styled
 * editor text with no href at all, so the two resolve the clicked link by completely different routes (the
 * rendered target vs. the click's own coordinates). The unresolved-link case is here for the same reason —
 * a link to a note that does not exist has no target to resolve to, and used to fail in Reading view too.
 *
 * The control cases matter as much as the happy path: a PLAIN click must still open the link, which is what
 * proves the feature takes no existing gesture away; and with the setting turned off even the `Alt` click
 * must be left alone.
 *
 * Note that `defaultPrevented` is NOT usable as evidence here — Obsidian calls `preventDefault()` on
 * link clicks itself — so the assertions are on which note ends up active.
 *
 * Named `*.cross-platform.integration.test.ts` (per G47), so the desktop AND android projects both
 * collect it and the same flow is verified on each.
 */

import type { TFile } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'edit-link-alias';
const TARGET_PATH = 'link-click-target.md';
const TARGET_CONTENT = '# Target';
const TARGET_LINK_TEXT = 'link-click-target';
const MISSING_LINK_TEXT = 'link-click-never-created';
const SOURCE_PATH = 'link-click-source.md';
const OLD_ALIAS = 'old alias';
const NEW_ALIAS = 'new alias';
const NEW_URL_LINK_TEXT = 'link-click-target-renamed';

/**
 * The link deliberately sits on the SECOND line: in Live Preview the line holding the caret is shown as raw
 * markdown, so a link on the caret's line would never be rendered in its decorated form. A non-zero line
 * index also means a line-index bug in the write-back cannot pass unnoticed.
 */
const SOURCE_INTRO_LINE = 'intro';

const READING_VIEW_LINK_SELECTOR = 'a.internal-link';

/**
 * Both editing modes wrap the link in `.cm-hmd-internal-link` — Live Preview around the displayed alias
 * (inside a `.cm-underline`), raw Source mode around the link path itself. Neither is an anchor and neither
 * carries a `data-href` to read the target from, which is the whole reason the click position is needed.
 */
const EDITING_MODE_LINK_SELECTOR = '.cm-hmd-internal-link';

const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
const POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS = 2000;

/**
 * The popover's URL and alias fields — the count is what tells "the popover is fully built" apart from
 * "it is halfway through being built".
 */
const POPOVER_FIELD_COUNT = 2;

interface ClickScenarioResult {
  readonly activePath: null | string;
  /**
   * The name of the field the popover put the caret in, read from the label of the focused input's row —
   * `null` when nothing inside the popover was focused.
   */
  readonly focusedFieldName: null | string;
  /**
   * Whether the focused field's whole value was selected, so typing replaces it rather than appending.
   */
  readonly isFocusedFieldSelected: boolean;
  readonly sourceContent: string;
  readonly wasPopoverShown: boolean;
}

interface RunClickScenarioParams {
  readonly linkText: string;
  readonly shouldOpenLinkEditorOnAltClick: boolean;
  readonly shouldTargetExist: boolean;
  readonly shouldUseAlt: boolean;
  readonly viewMode: 'live-preview' | 'reading' | 'source';
}
describe('Edit a link by Alt + clicking it', () => {
  it('opens the popover on an Alt click in Reading view, rewrites the link, and does not open it', async () => {
    const result = await runClickScenario({
      linkText: TARGET_LINK_TEXT,
      shouldOpenLinkEditorOnAltClick: true,
      shouldTargetExist: true,
      shouldUseAlt: true,
      viewMode: 'reading'
    });

    expect(result.wasPopoverShown).toBe(true);
    // Still on the source note: the navigation the click would normally trigger was suppressed.
    expect(result.activePath).toBe(SOURCE_PATH);
    expect(result.sourceContent).toBe(getExpectedSourceContent());
  });

  it('opens the popover on an Alt click in Live Preview, rewrites the link, and does not open it', async () => {
    /*
     * The GH #4 regression test. Live Preview gives the clicked element no href, so the link is identified
     * by the click's own coordinates; before the fix this reported "Could not locate the link in the
     * source note".
     */
    const result = await runClickScenario({
      linkText: TARGET_LINK_TEXT,
      shouldOpenLinkEditorOnAltClick: true,
      shouldTargetExist: true,
      shouldUseAlt: true,
      viewMode: 'live-preview'
    });

    expect(result.wasPopoverShown).toBe(true);
    expect(result.activePath).toBe(SOURCE_PATH);
    expect(result.sourceContent).toBe(getExpectedSourceContent());
  });

  it('opens the popover on an Alt click in Source mode, rewrites the link, and does not open it', async () => {
    /*
     * Source mode shares Live Preview's code path (`getMode()` is `source` for both), but GH #4 reported
     * both, and Source mode wraps the link PATH rather than the displayed alias — so the resolved position
     * lands in a different part of the same link.
     */
    const result = await runClickScenario({
      linkText: TARGET_LINK_TEXT,
      shouldOpenLinkEditorOnAltClick: true,
      shouldTargetExist: true,
      shouldUseAlt: true,
      viewMode: 'source'
    });

    expect(result.wasPopoverShown).toBe(true);
    expect(result.activePath).toBe(SOURCE_PATH);
    expect(result.sourceContent).toBe(getExpectedSourceContent());
  });

  it('opens the popover on an Alt click on a link whose target note does not exist', async () => {
    // No target to resolve to, so the link is matched by its path text instead.
    const result = await runClickScenario({
      linkText: MISSING_LINK_TEXT,
      shouldOpenLinkEditorOnAltClick: true,
      shouldTargetExist: false,
      shouldUseAlt: true,
      viewMode: 'reading'
    });

    expect(result.wasPopoverShown).toBe(true);
    expect(result.activePath).toBe(SOURCE_PATH);
    expect(result.sourceContent).toBe(getExpectedSourceContent());
  });

  it('opens with the alias focused and selected, so it can be typed over straight away', async () => {
    /*
     * GH #7. The alias is the more frequently edited field, so it is the one the popover opens on — which
     * it achieves by being declared first, the popover focusing its first input.
     */
    const result = await runClickScenario({
      linkText: TARGET_LINK_TEXT,
      shouldOpenLinkEditorOnAltClick: true,
      shouldTargetExist: true,
      shouldUseAlt: true,
      viewMode: 'reading'
    });

    expect(result.wasPopoverShown).toBe(true);
    expect(result.focusedFieldName).toBe('Alias');
    expect(result.isFocusedFieldSelected).toBe(true);
  });

  it('leaves a plain click alone, so the link still opens', async () => {
    const result = await runClickScenario({
      linkText: TARGET_LINK_TEXT,
      shouldOpenLinkEditorOnAltClick: true,
      shouldTargetExist: true,
      shouldUseAlt: false,
      viewMode: 'reading'
    });

    expect(result.wasPopoverShown).toBe(false);
    expect(result.activePath).toBe(TARGET_PATH);
    expect(result.sourceContent).toBe(getInitialSourceContent(TARGET_LINK_TEXT));
  });

  it('leaves the Alt click alone when the setting is turned off', async () => {
    const result = await runClickScenario({
      linkText: TARGET_LINK_TEXT,
      shouldOpenLinkEditorOnAltClick: false,
      shouldTargetExist: true,
      shouldUseAlt: true,
      viewMode: 'reading'
    });

    expect(result.wasPopoverShown).toBe(false);
    expect(result.sourceContent).toBe(getInitialSourceContent(TARGET_LINK_TEXT));
  });
});

function getExpectedSourceContent(): string {
  return `${SOURCE_INTRO_LINE}\n[[${NEW_URL_LINK_TEXT}|${NEW_ALIAS}]]`;
}

function getInitialSourceContent(linkText: string): string {
  return `${SOURCE_INTRO_LINE}\n[[${linkText}|${OLD_ALIAS}]]`;
}

async function runClickScenario(params: RunClickScenarioParams): Promise<ClickScenarioResult> {
  const isEditingScenario = params.viewMode !== 'reading';
  return await evalInObsidian({
    async callback({
      app,
      initialSourceContent,
      isEditing,
      isRawSource,
      lib: { clickElement, createNote, waitUntil },
      linkSelector,
      linkText,
      newAlias,
      newUrl,
      obsidianModule,
      pluginId,
      popoverFieldCount,
      popoverSettleTimeoutInMilliseconds,
      shouldOpenLinkEditorOnAltClick,
      shouldTargetExist,
      shouldUseAlt,
      sourcePath,
      targetContent,
      targetPath,
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
       * The popover comes from `obsidian-dev-utils`, which classes it `obsidian-dev-utils <pluginId>
       * popover` and gives every field the same `text-box` class. The fields are therefore told apart by
       * their order, which is the order they were handed to `editFieldsInPopover`: alias first, URL second
       * (the alias leads so the popover focuses it — GH #7).
       */
      function getPopoverEl(): HTMLElement | null {
        return document.body.querySelector<HTMLElement>(`.obsidian-dev-utils.${pluginId}.popover`);
      }

      function getPopoverInputEls(): HTMLInputElement[] {
        return [...getPopoverEl()?.querySelectorAll('input') ?? []];
      }

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

      /*
       * The coordinates are what identifies the link in an editing view (`Editor.posAtMouse`), so a click
       * without them would resolve to the very start of the document. The element's own centre is the
       * point the user would have hit.
       *
       * On desktop it is a TRUSTED click, so it reaches the editor's pointer handling the way a user's
       * does; a dispatched `MouseEvent` is `isTrusted === false` and can be ignored outright. The trusted
       * helpers are built on `window.electron`, which Android does not have, so the phone keeps the
       * dispatch — this file runs on both platforms.
       */
      function clickLink(linkEl: HTMLElement): void {
        if (obsidianModule.Platform.isDesktopApp) {
          clickElement({ element: linkEl, modifiers: shouldUseAlt ? ['Alt'] : [] });
          return;
        }

        const rect = linkEl.getBoundingClientRect();
        // eslint-disable-next-line obsidian-dev-utils/no-untrusted-input-events -- The mobile arm of a Platform.isDesktopApp branch: the trusted helpers need window.electron, which Android does not have, and this file runs on both platforms.
        linkEl.dispatchEvent(
          new MouseEvent('click', {
            altKey: shouldUseAlt,
            bubbles: true,
            button: 0,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          })
        );
      }

      async function trashNotes(): Promise<void> {
        for (const path of [sourcePath, targetPath]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }
      }

      /**
       * Reads which field the popover opened on, by the name shown on the focused input's own row. Reading
       * the LABEL rather than an index is what makes this an assertion about the feature (the alias is the
       * field you can type over straight away) instead of a restatement of the field order.
       *
       * @returns The focused field's name, or `null` when the focus is not on a popover field.
       */
      function getFocusedFieldName(): null | string {
        const activeEl = getPopoverEl()?.doc.activeElement;
        if (!(activeEl instanceof HTMLInputElement) || !getPopoverEl()?.contains(activeEl)) {
          return null;
        }
        return activeEl.closest('.setting-item')?.querySelector('.setting-item-name')?.textContent ?? null;
      }

      function isFocusedFieldFullySelected(): boolean {
        const activeEl = getPopoverEl()?.doc.activeElement;
        if (!(activeEl instanceof HTMLInputElement)) {
          return false;
        }
        return activeEl.selectionStart === 0 && activeEl.selectionEnd === activeEl.value.length && activeEl.value.length > 0;
      }

      async function applyPopoverEdit(sourceFile: TFile): Promise<void> {
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

      /*
       * No popover means the click was left alone, so Obsidian should be opening the link. Give the
       * navigation a moment to settle; a timeout is reported through activePath, not thrown, so the
       * calling test states what should have happened.
       */
      async function waitForNavigation(): Promise<void> {
        try {
          await waitUntil({
            message: 'the link did not open',
            predicate: () => app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.file?.path !== sourcePath,
            timeoutInMilliseconds: popoverSettleTimeoutInMilliseconds
          });
        } catch {
          // Reported through activePath below.
        }
      }

      await trashNotes();

      if (shouldTargetExist) {
        await createNote({ content: targetContent, path: targetPath });
      }
      const sourceFile = await createNote({ content: initialSourceContent, path: sourcePath });

      const plugin = app.plugins.getPlugin(pluginId);
      const settingsComponent = findSettingsComponent(plugin);
      if (!settingsComponent) {
        throw new Error('Could not find the plugin settings component');
      }
      await settingsComponent.setProperty('shouldOpenLinkEditorOnAltClick', shouldOpenLinkEditorOnAltClick);
      await settingsComponent.saveToFile(null);
      await waitUntil({
        message: 'the Alt-click setting did not take effect',
        predicate: () => settingsComponent.settings['shouldOpenLinkEditorOnAltClick'] === shouldOpenLinkEditorOnAltClick,
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      const leaf = app.workspace.getLeaf(true);
      await leaf.openFile(sourceFile, { state: isEditing ? { mode: 'source', source: isRawSource } : { mode: 'preview' } });

      const expectedMode = isEditing ? 'source' : 'preview';
      await waitUntil({
        message: 'source note did not become the active view in the expected mode',
        predicate: () => {
          const candidate = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
          return candidate?.file?.path === sourcePath && candidate.getMode() === expectedMode;
        },
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      if (shouldTargetExist) {
        await waitUntil({
          message: 'link target did not resolve',
          predicate: () => app.metadataCache.getFirstLinkpathDest(linkText, sourcePath) !== null,
          timeoutInMilliseconds: waitTimeoutInMilliseconds
        });
      }

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      if (isEditing) {
        // Live Preview shows the caret's own line as raw markdown, so park it off the link's line.
        view?.editor.setCursor({ ch: 0, line: 0 });
      }

      await waitUntil({
        message: 'the rendered link did not appear',
        predicate: () => Boolean(view?.containerEl.querySelector(linkSelector)),
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      const linkEl = view?.containerEl.querySelector<HTMLElement>(linkSelector);
      if (!linkEl) {
        throw new Error('The rendered link disappeared');
      }

      clickLink(linkEl);

      /*
       * The popover is expected NOT to open in the control cases, so a timeout here is a legitimate
       * outcome rather than a failure — the assertions live in the calling test.
       */
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

      // Read BEFORE the edit is applied — filling the fields moves the focus and clears the selection.
      const focusedFieldName = wasPopoverShown ? getFocusedFieldName() : null;
      const isFocusedFieldSelected = wasPopoverShown && isFocusedFieldFullySelected();

      if (wasPopoverShown) {
        await applyPopoverEdit(sourceFile);
      } else {
        await waitForNavigation();
      }

      const sourceContent = await app.vault.read(sourceFile);
      const activePath = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.file?.path ?? null;

      await trashNotes();

      return {
        activePath,
        focusedFieldName,
        isFocusedFieldSelected,
        sourceContent,
        wasPopoverShown
      };
    },
    input: {
      initialSourceContent: getInitialSourceContent(params.linkText),
      isEditing: isEditingScenario,
      // Live Preview is `mode: 'source'` with `source: false`; raw Source mode is `source: true`.
      isRawSource: params.viewMode === 'source',
      linkSelector: isEditingScenario ? EDITING_MODE_LINK_SELECTOR : READING_VIEW_LINK_SELECTOR,
      linkText: params.linkText,
      newAlias: NEW_ALIAS,
      newUrl: NEW_URL_LINK_TEXT,
      pluginId: PLUGIN_ID,
      popoverFieldCount: POPOVER_FIELD_COUNT,
      popoverSettleTimeoutInMilliseconds: POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS,
      shouldOpenLinkEditorOnAltClick: params.shouldOpenLinkEditorOnAltClick,
      shouldTargetExist: params.shouldTargetExist,
      shouldUseAlt: params.shouldUseAlt,
      sourcePath: SOURCE_PATH,
      targetContent: TARGET_CONTENT,
      targetPath: TARGET_PATH,
      waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
    },
    vaultPath: getTemporaryVault().path
  });
}
