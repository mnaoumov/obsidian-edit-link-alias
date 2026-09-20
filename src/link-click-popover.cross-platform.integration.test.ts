/**
 * @file
 *
 * Shared integration suite for the Alt-click-to-edit behavior: `Alt` + clicking a rendered link opens
 * the anchored URL + alias popover instead of opening the link.
 *
 * It runs against a real Obsidian: it creates a note containing `[[target|old alias]]`, opens it, lands a
 * real `Alt` click on the rendered link, fills the popover and confirms, then asserts the source note was
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
 * Named `*.cross-platform.integration.test.ts`, so the desktop AND android projects both
 * collect it and the same flow is verified on each.
 *
 * **The waiting happens in NODE.** One `evalInObsidian` closure is one transport call, capped at ~30s, and
 * this flow used to declare seven waits inside a single one — 104s the cap could only ever kill as a bare
 * `script timeout` naming the harness rather than the wait that overran. Each wait is now a
 * `pollInObsidian`: a short DOM-reading `poll` per transport call, the acceptance decided in Node, and the
 * budget in `timeoutInMilliseconds`, so `WAIT_TIMEOUT_IN_MILLISECONDS` is a real ceiling for every wait
 * rather than a share of one it never had. **The two control cases stay honest through the move**: both
 * expect NO popover, and both reach that answer by polling for the popover's PRESENCE until the settle
 * budget is spent, never by asking whether it is absent right now.
 *
 * State that cannot be re-derived rides a {@link ContextId} — the settings component a tree walk finds, and
 * the note this run created. The active view is re-looked-up in each closure instead, because it is one call
 * and a carried reference could go stale.
 */

import type { TFile } from 'obsidian';

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

const ALT_CLICK_SETTING_NAME = 'shouldOpenLinkEditorOnAltClick';

/**
 * The popover `obsidian-dev-utils` builds for this plugin. Every field carries the same `text-box` class, so
 * the fields are told apart by their order — the order they were handed to `editFieldsInPopover`: alias
 * first, URL second (the alias leads so the popover focuses it — GH #7).
 */
const POPOVER_SELECTOR = `.obsidian-dev-utils.${PLUGIN_ID}.popover`;

const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
const POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS = 2000;

/**
 * Node-side budget for one whole scenario. Without it the shared config's 30s desktop / 60s android
 * `testTimeout` would expire long before the waits below do, which is the ceiling that made moving the
 * waiting out of the closure only half a fix.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

/**
 * The popover's URL and alias fields — the count is what tells "the popover is fully built" apart from
 * "it is halfway through being built".
 */
const POPOVER_FIELD_COUNT = 2;

interface ChildrenHolder {
  _children?: unknown[];
}

interface ClickScenarioResult {
  readonly activePath: null | string;
  readonly focusedFieldName: null | string;
  readonly isFocusedFieldSelected: boolean;
  readonly sourceContent: string;
  readonly wasPopoverShown: boolean;
}

/**
 * What one scenario keeps alive between closures: neither value survives serialization, and neither is worth
 * re-deriving in every call that needs it.
 */
interface ClickSuiteContext {
  settingsComponent?: SettingsHolder;
  sourceFile?: TFile;
}

/**
 * What the last closure of a scenario reads back before it trashes the notes.
 */
interface FinalReading {
  readonly activePath: null | string;
  readonly sourceContent: string;
}

/**
 * What the popover opened on, read before the edit fills the fields and moves the focus.
 */
interface FocusReading {
  /**
   * The name of the field the popover put the caret in, read from the label of the focused input's row —
   * `null` when nothing inside the popover was focused.
   */
  readonly focusedFieldName: null | string;

  /**
   * Whether the focused field's whole value was selected, so typing replaces it rather than appending.
   */
  readonly isFocusedFieldSelected: boolean;
}

interface RunClickScenarioParams {
  readonly linkText: string;
  readonly shouldOpenLinkEditorOnAltClick: boolean;
  readonly shouldTargetExist: boolean;
  readonly shouldUseAlt: boolean;
  readonly viewMode: 'live-preview' | 'reading' | 'source';
}

/**
 * The plugin's settings component, as the tree walk below recognizes it.
 */
interface SettingsHolder {
  saveToFile: (context: unknown) => Promise<void>;
  setProperty: (propertyName: string, value: unknown) => Promise<string>;
  settings: Record<string, unknown>;
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
  }, TEST_TIMEOUT_IN_MILLISECONDS);

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
  }, TEST_TIMEOUT_IN_MILLISECONDS);

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
  }, TEST_TIMEOUT_IN_MILLISECONDS);

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
  }, TEST_TIMEOUT_IN_MILLISECONDS);

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
  }, TEST_TIMEOUT_IN_MILLISECONDS);

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
  }, TEST_TIMEOUT_IN_MILLISECONDS);

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
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * Fills the popover's two fields and confirms, then waits — from Node — for the note to change.
 *
 * The fill and the OK click stay in ONE closure deliberately: the popover is rebuilt on re-render, so a
 * split would set values on inputs the confirm no longer belongs to.
 *
 * @param contextId - The context carrying the note this run created.
 * @param initialSourceContent - What the note held before the edit, which is what "changed" is measured
 * against.
 */
async function applyPopoverEdit(contextId: ContextId<ClickSuiteContext>, initialSourceContent: string): Promise<void> {
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
      newUrl: NEW_URL_LINK_TEXT,
      popoverSelector: POPOVER_SELECTOR
    },
    vaultPath: getTemporaryVault().path
  });

  await pollInObsidian({
    contextId,
    input: { initialSourceContent },
    async poll({ app, context, initialSourceContent: content }): Promise<boolean> {
      if (!context.sourceFile) {
        throw new Error('The source note was never created');
      }
      return (await app.vault.read(context.sourceFile)) !== content;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the source note was not rewritten',
    until: (wasRewritten: boolean): boolean => wasRewritten,
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Waits — from Node — for the link editor popover to be fully built.
 *
 * The popover is expected NOT to open in the control cases, so a timeout is a legitimate outcome rather than
 * a failure — the assertions live in the calling test. Polling for the popover's PRESENCE is what keeps that
 * honest: the budget is spent in full before `false` is returned, exactly as the in-closure settle it
 * replaces did. Asking whether the popover is absent would accept instantly, before it had a chance to open.
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
 * `Alt` + clicks the rendered link.
 *
 * Finding the element and clicking it stay in ONE closure: `clickElement` takes a live renderer node, which
 * is not something Node can hold on to between transport calls.
 *
 * `clickElement` aims at the element's own centre — the point the user would have hit — and that point is
 * what identifies the link in an editing view (`Editor.posAtMouse`); a click without coordinates would
 * resolve to the very start of the document.
 *
 * A TRUSTED click on BOTH platforms, so it reaches the editor's pointer handling the way a user's does; a
 * dispatched `MouseEvent` is `isTrusted === false` and can be ignored outright. It is an Electron
 * `sendInputEvent` on desktop and a CDP touch injection on Android, and the `Alt` modifier rides along on
 * either — so this file needs no platform branch.
 *
 * @param linkSelector - What the link is rendered as in this scenario's view mode.
 * @param shouldUseAlt - Whether to hold `Alt`, which is the whole difference between the two control cases
 * and the rest.
 */
async function clickRenderedLink(linkSelector: string, shouldUseAlt: boolean): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { clickElement }, linkSelector: selector, obsidianModule, shouldUseAlt: withAlt }): Promise<void> {
      const linkEl = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.containerEl.querySelector<HTMLElement>(selector);
      if (!linkEl) {
        throw new Error('The rendered link disappeared');
      }

      await clickElement({ element: linkEl, modifiers: withAlt ? ['Alt'] : [] });
    },
    input: { linkSelector, shouldUseAlt },
    vaultPath: getTemporaryVault().path
  });
}

function getExpectedSourceContent(): string {
  return `${SOURCE_INTRO_LINE}\n[[${NEW_URL_LINK_TEXT}|${NEW_ALIAS}]]`;
}

function getInitialSourceContent(linkText: string): string {
  return `${SOURCE_INTRO_LINE}\n[[${linkText}|${OLD_ALIAS}]]`;
}

/**
 * Waits — from Node — for the click to have navigated away from the source note.
 *
 * No popover means the click was left alone, so Obsidian should be opening the link. A timeout is reported
 * through `activePath` rather than thrown, so the calling test states what should have happened.
 */
async function pollNavigatedAway(): Promise<void> {
  try {
    await pollInObsidian({
      input: { sourcePath: SOURCE_PATH },
      poll({ app, obsidianModule, sourcePath }): boolean {
        return app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.file?.path !== sourcePath;
      },
      timeoutInMilliseconds: POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the link did not open',
      until: (hasNavigated: boolean): boolean => hasNavigated,
      vaultPath: getTemporaryVault().path
    });
  } catch {
    // Reported through activePath by the caller.
  }
}

/**
 * Reads which field the popover opened on, and whether its value is ready to be typed over.
 *
 * Read BEFORE the edit is applied — filling the fields moves the focus and clears the selection. Reading the
 * LABEL rather than an index is what makes this an assertion about the feature (the alias is the field you
 * can type over straight away) instead of a restatement of the field order.
 *
 * @returns The focused field's name and whether its whole value is selected.
 */
async function readFocusReading(): Promise<FocusReading> {
  return await evalInObsidian({
    callback({ popoverSelector }): FocusReading {
      const popoverEl = document.body.querySelector<HTMLElement>(popoverSelector);
      const activeEl = popoverEl?.doc.activeElement;
      if (!(activeEl instanceof HTMLInputElement) || !popoverEl?.contains(activeEl)) {
        return {
          focusedFieldName: null,
          isFocusedFieldSelected: false
        };
      }

      return {
        focusedFieldName: activeEl.closest('.setting-item')?.querySelector('.setting-item-name')?.textContent ?? null,
        isFocusedFieldSelected: activeEl.selectionStart === 0 && activeEl.selectionEnd === activeEl.value.length && activeEl.value.length > 0
      };
    },
    input: { popoverSelector: POPOVER_SELECTOR },
    vaultPath: getTemporaryVault().path
  });
}

async function runClickScenario(params: RunClickScenarioParams): Promise<ClickScenarioResult> {
  const isEditingScenario = params.viewMode !== 'reading';
  const initialSourceContent = getInitialSourceContent(params.linkText);
  const linkSelector = isEditingScenario ? EDITING_MODE_LINK_SELECTOR : READING_VIEW_LINK_SELECTOR;
  const contextId = new ContextId<ClickSuiteContext>();

  try {
    await pollInObsidian({
      contextId,
      input: {
        altClickSettingName: ALT_CLICK_SETTING_NAME,
        initialSourceContent,
        pluginId: PLUGIN_ID,
        shouldOpenLinkEditorOnAltClick: params.shouldOpenLinkEditorOnAltClick,
        shouldTargetExist: params.shouldTargetExist,
        sourcePath: SOURCE_PATH,
        targetContent: TARGET_CONTENT,
        targetPath: TARGET_PATH
      },
      poll({ altClickSettingName, context, shouldOpenLinkEditorOnAltClick }): boolean {
        return context.settingsComponent?.settings[altClickSettingName] === shouldOpenLinkEditorOnAltClick;
      },
      async start({
        altClickSettingName,
        app,
        context,
        initialSourceContent: content,
        lib: { createNote },
        pluginId,
        shouldOpenLinkEditorOnAltClick,
        shouldTargetExist,
        sourcePath,
        targetContent,
        targetPath
      }): Promise<void> {
        for (const path of [sourcePath, targetPath]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        if (shouldTargetExist) {
          await createNote({ content: targetContent, path: targetPath });
        }
        context.sourceFile = await createNote({ content, path: sourcePath });

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
        await settingsComponent.setProperty(altClickSettingName, shouldOpenLinkEditorOnAltClick);
        await settingsComponent.saveToFile(null);
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the Alt-click setting did not take effect',
      until: (hasTakenEffect: boolean): boolean => hasTakenEffect,
      vaultPath: getTemporaryVault().path
    });

    await pollInObsidian({
      contextId,
      input: {
        // Live Preview is `mode: 'source'` with `source: false`; raw Source mode is `source: true`.
        expectedMode: isEditingScenario ? 'source' : 'preview',
        isEditing: isEditingScenario,
        isRawSource: params.viewMode === 'source',
        sourcePath: SOURCE_PATH
      },
      poll({ app, expectedMode, obsidianModule, sourcePath }): boolean {
        const candidate = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
        return candidate?.file?.path === sourcePath && candidate.getMode() === expectedMode;
      },
      async start({ app, context, isEditing, isRawSource }): Promise<void> {
        if (!context.sourceFile) {
          throw new Error('The source note was never created');
        }
        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(context.sourceFile, { state: isEditing ? { mode: 'source', source: isRawSource } : { mode: 'preview' } });
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'source note did not become the active view in the expected mode',
      until: (isActive: boolean): boolean => isActive,
      vaultPath: getTemporaryVault().path
    });

    if (params.shouldTargetExist) {
      await pollInObsidian({
        input: { linkText: params.linkText, sourcePath: SOURCE_PATH },
        poll({ app, linkText, sourcePath }): boolean {
          return app.metadataCache.getFirstLinkpathDest(linkText, sourcePath) !== null;
        },
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
        timeoutMessage: 'link target did not resolve',
        until: (hasResolved: boolean): boolean => hasResolved,
        vaultPath: getTemporaryVault().path
      });
    }

    await pollInObsidian({
      input: { isEditing: isEditingScenario, linkSelector },
      poll({ app, linkSelector: selector, obsidianModule }): boolean {
        return Boolean(app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.containerEl.querySelector(selector));
      },
      start({ app, isEditing, obsidianModule }): void {
        if (!isEditing) {
          return;
        }
        // Live Preview shows the caret's own line as raw markdown, so park it off the link's line.
        app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.setCursor({ ch: 0, line: 0 });
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the rendered link did not appear',
      until: (hasAppeared: boolean): boolean => hasAppeared,
      vaultPath: getTemporaryVault().path
    });

    await clickRenderedLink(linkSelector, params.shouldUseAlt);

    const wasPopoverShown = await checkPopoverShown();
    const focusReading = wasPopoverShown
      ? await readFocusReading()
      : { focusedFieldName: null, isFocusedFieldSelected: false };

    if (wasPopoverShown) {
      await applyPopoverEdit(contextId, initialSourceContent);
    } else {
      await pollNavigatedAway();
    }

    const { activePath, sourceContent } = await evalInObsidian({
      async callback({ app, context, obsidianModule, sourcePath, targetPath }): Promise<FinalReading> {
        if (!context.sourceFile) {
          throw new Error('The source note was never created');
        }

        const content = await app.vault.read(context.sourceFile);
        const activeFilePath = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.file?.path ?? null;

        for (const path of [sourcePath, targetPath]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        return {
          activePath: activeFilePath,
          sourceContent: content
        };
      },
      contextId,
      input: { sourcePath: SOURCE_PATH, targetPath: TARGET_PATH },
      vaultPath: getTemporaryVault().path
    });

    return {
      activePath,
      focusedFieldName: focusReading.focusedFieldName,
      isFocusedFieldSelected: focusReading.isFocusedFieldSelected,
      sourceContent,
      wasPopoverShown
    };
  } finally {
    await contextId.dispose(getTemporaryVault().path);
  }
}
