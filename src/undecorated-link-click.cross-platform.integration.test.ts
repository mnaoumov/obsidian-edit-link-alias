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
 * `clientX`/`clientY` — a click without coordinates resolves to the very start of the document and
 * would pass or fail for the wrong reason. And unlike the decorated suite, the caret is deliberately parked
 * **on** the link's line: that is what makes Live Preview show the raw markdown these cases need.
 *
 * Named `*.cross-platform.integration.test.ts`, so the desktop AND android projects both
 * collect it and the same flow is verified on each.
 *
 * **The waiting happens in NODE.** One `evalInObsidian` closure is one transport call, capped at ~30s, and
 * this flow used to declare five waits inside a single one — 85s that the cap could only ever kill as a bare
 * `script timeout` naming the harness rather than the wait that overran. Each wait is now a
 * `pollInObsidian`: a short DOM-reading `poll` per transport call, the acceptance decided in Node, and the
 * budget in `timeoutInMilliseconds`, so `WAIT_TIMEOUT_IN_MILLISECONDS` is a real ceiling for every wait
 * rather than a share of one it never had. The `it`s carry their own `TEST_TIMEOUT_IN_MILLISECONDS` for the
 * same reason: the shared config gives this project 30s (desktop) and 60s (android), which is a second
 * ceiling underneath the waits.
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
 * The popover's alias and URL fields — the count is what tells "the popover is fully built" apart from "it is
 * halfway through being built".
 */
const POPOVER_FIELD_COUNT = 2;

interface ChildrenHolder {
  _children?: unknown[];
}

/**
 * The plugin's settings component, as the tree walk below recognizes it.
 */
interface SettingsHolder {
  saveToFile(context: unknown): Promise<void>;
  setProperty(propertyName: string, value: unknown): Promise<string>;
  settings: Record<string, unknown>;
}

type UndecoratedScenario = 'bare-url' | 'markdown-link-url-half';

interface UndecoratedScenarioResult {
  readonly sourceContent: string;
  readonly wasPopoverShown: boolean;
}

/**
 * What one scenario keeps alive between closures: neither value survives serialization, and neither is worth
 * re-deriving in every call that needs it.
 */
interface UndecoratedSuiteContext {
  settingsComponent?: SettingsHolder;
  sourceFile?: TFile;
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
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('opens the popover when the click lands on the url half of a markdown link', async () => {
    // The other half of GH #9: only the alias was clickable, because only the alias is decorated.
    const result = await runScenario('markdown-link-url-half');

    expect(result.wasPopoverShown).toBe(true);
    expect(result.sourceContent).toBe(`${INTRO_LINE}\n${EXPECTED_EDITED_LINK}`);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * Fills the popover and confirms, then waits — from Node — for the note to change.
 *
 * The fill and the OK click stay in ONE closure deliberately: the popover is rebuilt on re-render, so a
 * split would set values on inputs the confirm no longer belongs to.
 *
 * @param contextId - The context carrying the note this run created.
 * @param initialSourceContent - What the note held before the edit, which is what "changed" is measured
 * against.
 */
async function applyPopoverEdit(contextId: ContextId<UndecoratedSuiteContext>, initialSourceContent: string): Promise<void> {
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

function getInitialSourceContent(scenario: UndecoratedScenario): string {
  const link = scenario === 'bare-url' ? BARE_URL : `[${MARKDOWN_LINK_ALIAS}](${MARKDOWN_LINK_URL})`;
  return `${INTRO_LINE}\n${link}`;
}

async function runScenario(requestedScenario: UndecoratedScenario): Promise<UndecoratedScenarioResult> {
  const clickedUrl = requestedScenario === 'bare-url' ? BARE_URL : MARKDOWN_LINK_URL;
  const initialSourceContent = getInitialSourceContent(requestedScenario);
  const contextId = new ContextId<UndecoratedSuiteContext>();

  try {
    /*
     * The Alt-click setting is set explicitly rather than relied on: it defaults to on, but a suite that ran
     * earlier in the same Obsidian instance turns it off for its own control case and does not restore it.
     */
    await pollInObsidian({
      contextId,
      input: {
        altClickSettingName: ALT_CLICK_SETTING_NAME,
        initialSourceContent,
        pluginId: PLUGIN_ID,
        sourcePath: SOURCE_PATH
      },
      poll({ altClickSettingName, context }): boolean {
        return context.settingsComponent?.settings[altClickSettingName] === true;
      },
      async start({ altClickSettingName, app, context, initialSourceContent: content, lib: { createNote }, pluginId, sourcePath }): Promise<void> {
        const existing = app.vault.getAbstractFileByPath(sourcePath);
        if (existing) {
          await app.fileManager.trashFile(existing);
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
      input: { sourcePath: SOURCE_PATH },
      poll({ app, obsidianModule, sourcePath }): boolean {
        const candidate = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
        return candidate?.file?.path === sourcePath && candidate.getMode() === 'source';
      },
      async start({ app, context }): Promise<void> {
        if (!context.sourceFile) {
          throw new Error('The source note was never created');
        }
        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(context.sourceFile, { state: { mode: 'source', source: false } });
        await app.workspace.revealLeaf(leaf);
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the source note did not become the active Live Preview view',
      until: (isActive: boolean): boolean => isActive,
      vaultPath: getTemporaryVault().path
    });

    await pollInObsidian({
      input: { clickedUrl, linkLineIndex: LINK_LINE_INDEX },
      poll({ app, clickedUrl: url, obsidianModule }): boolean {
        return app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.containerEl.textContent.includes(url) ?? false;
      },
      /*
       * ON the link's line, not off it. Live Preview renders the caret's own line as raw markdown, which is
       * what strips the decoration and produces the very situation GH #9 reported.
       *
       * The editor is focused FIRST, and that is not redundant: Live Preview only un-decorates the caret's
       * line while the editor actually has the focus, and on Android neither `openFile` nor `revealLeaf`
       * gives it any — the active element stays the `body`, so the line keeps rendering as `old alias` and
       * the url never appears at all.
       */
      start({ app, linkLineIndex, obsidianModule }): void {
        const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
        if (!view) {
          throw new Error('The source note view disappeared');
        }
        view.editor.focus();
        view.editor.setCursor({ ch: 0, line: linkLineIndex });
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the raw link text did not render',
      until: (isRendered: boolean): boolean => isRendered,
      vaultPath: getTemporaryVault().path
    });

    /*
     * Measuring the rect and clicking its centre stay in ONE closure: a rect handed back to Node is a
     * snapshot, and the editor may have scrolled or re-laid-out by the time the click returns.
     *
     * A TRUSTED click on BOTH platforms, so it reaches the editor's pointer handling the way a user's
     * does; a dispatched `MouseEvent` is `isTrusted === false` and can be ignored outright. `clickMouse`
     * is an Electron `sendInputEvent` on desktop and a CDP touch injection on Android, and the `Alt`
     * modifier rides along on either — so this file needs no platform branch.
     */
    await evalInObsidian({
      async callback({ app, clickedUrl: url, lib: { clickMouse }, obsidianModule }): Promise<void> {
        const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
        if (!view) {
          throw new Error('The source note view disappeared');
        }

        /*
         * The innermost element rendering the url, so the click lands on the url itself rather than merely
         * somewhere on its line: an outer `.cm-line` also contains the text, but its centre may miss the
         * url. The url half of a markdown link is its own span, which is precisely why the link selector
         * never matched it.
         */
        const candidateEls = [...view.containerEl.querySelectorAll<HTMLElement>(':scope .cm-line span, :scope .cm-line')];
        // eslint-disable-next-line unicorn/prefer-array-find -- `findLast` is ES2023 and this project's `lib` is ES2022, so it resolves to no type at all.
        const el = candidateEls.filter((candidate) => candidate.textContent.includes(url)).at(-1);
        if (!el) {
          throw new Error(`The editor does not render the text ${url}`);
        }

        const rect = el.getBoundingClientRect();
        await clickMouse({ modifiers: ['Alt'], x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      },
      input: { clickedUrl },
      vaultPath: getTemporaryVault().path
    });

    const wasPopoverShown = await checkPopoverShown();

    if (wasPopoverShown) {
      await applyPopoverEdit(contextId, initialSourceContent);
    }

    const sourceContent = await evalInObsidian({
      async callback({ app, context }): Promise<string> {
        if (!context.sourceFile) {
          throw new Error('The source note was never created');
        }

        const content = await app.vault.read(context.sourceFile);
        await app.fileManager.trashFile(context.sourceFile);
        return content;
      },
      contextId,
      vaultPath: getTemporaryVault().path
    });

    return {
      sourceContent,
      wasPopoverShown
    };
  } finally {
    await contextId.dispose(getTemporaryVault().path);
  }
}
