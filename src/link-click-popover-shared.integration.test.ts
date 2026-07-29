/**
 * @file
 *
 * Shared integration suite for the Alt-click-to-edit behavior: `Alt` + clicking a rendered link opens
 * the anchored URL + alias popover instead of opening the link.
 *
 * It runs against a real Obsidian: it creates a note containing `[[target|old alias]]`, opens it in
 * Reading view, dispatches a real `Alt` click on the rendered anchor, fills the popover and confirms,
 * then asserts the source note was rewritten AND that the navigation was suppressed (the source note is
 * still the active file).
 *
 * The two control cases matter as much as the happy path: a PLAIN click must still open the link, which
 * is what proves the feature takes no existing gesture away; and with the setting turned off even the
 * `Alt` click must be left alone.
 *
 * Note that `defaultPrevented` is NOT usable as evidence here — Obsidian calls `preventDefault()` on
 * link clicks itself — so the assertions are on which note ends up active.
 *
 * Registered by the platform entry points (`plugin.desktop.integration.test.ts`,
 * `plugin.android.integration.test.ts`) so the same flow runs on Desktop and Android.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'edit-link-alias';
const TARGET_PATH = 'link-click-target.md';
const TARGET_CONTENT = '# Target';
const TARGET_LINK_TEXT = 'link-click-target';
const SOURCE_PATH = 'link-click-source.md';
const OLD_ALIAS = 'old alias';
const NEW_ALIAS = 'new alias';
const NEW_URL_LINK_TEXT = 'link-click-target-renamed';
const INITIAL_SOURCE_CONTENT = `[[${TARGET_LINK_TEXT}|${OLD_ALIAS}]]`;
const EXPECTED_SOURCE_CONTENT = `[[${NEW_URL_LINK_TEXT}|${NEW_ALIAS}]]`;
const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
const POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS = 2_000;

/**
 * The popover's URL and alias fields — the count is what tells "the popover is fully built" apart from
 * "it is halfway through being built".
 */
const POPOVER_FIELD_COUNT = 2;

interface ClickScenarioResult {
  readonly activePath: null | string;
  readonly sourceContent: string;
  readonly wasPopoverShown: boolean;
}

interface RunClickScenarioParams {
  readonly shouldOpenLinkEditorOnAltClick: boolean;
  readonly shouldUseAlt: boolean;
}

/**
 * Registers the Alt-click-to-edit integration suite for the given platform.
 *
 * @param platform - Human-readable platform label used in the test names (e.g. `'Desktop'`).
 */
export function registerLinkClickPopoverSuite(platform: string): void {
  describe(`Edit a link by Alt + clicking it (${platform})`, () => {
    it('opens the popover on an Alt click, rewrites the link, and does not open it', async () => {
      const result = await runClickScenario({
        shouldOpenLinkEditorOnAltClick: true,
        shouldUseAlt: true
      });

      expect(result.wasPopoverShown).toBe(true);
      // Still on the source note: the navigation the click would normally trigger was suppressed.
      expect(result.activePath).toBe(SOURCE_PATH);
      expect(result.sourceContent).toBe(EXPECTED_SOURCE_CONTENT);
    });

    it('leaves a plain click alone, so the link still opens', async () => {
      const result = await runClickScenario({
        shouldOpenLinkEditorOnAltClick: true,
        shouldUseAlt: false
      });

      expect(result.wasPopoverShown).toBe(false);
      expect(result.activePath).toBe(TARGET_PATH);
      expect(result.sourceContent).toBe(INITIAL_SOURCE_CONTENT);
    });

    it('leaves the Alt click alone when the setting is turned off', async () => {
      const result = await runClickScenario({
        shouldOpenLinkEditorOnAltClick: false,
        shouldUseAlt: true
      });

      expect(result.wasPopoverShown).toBe(false);
      expect(result.sourceContent).toBe(INITIAL_SOURCE_CONTENT);
    });
  });
}

async function runClickScenario(params: RunClickScenarioParams): Promise<ClickScenarioResult> {
  return await evalInObsidian({
    args: {
      initialSourceContent: INITIAL_SOURCE_CONTENT,
      newAlias: NEW_ALIAS,
      newUrl: NEW_URL_LINK_TEXT,
      pluginId: PLUGIN_ID,
      popoverFieldCount: POPOVER_FIELD_COUNT,
      popoverSettleTimeoutInMilliseconds: POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS,
      shouldOpenLinkEditorOnAltClick: params.shouldOpenLinkEditorOnAltClick,
      shouldUseAlt: params.shouldUseAlt,
      sourcePath: SOURCE_PATH,
      targetContent: TARGET_CONTENT,
      targetLinkText: TARGET_LINK_TEXT,
      targetPath: TARGET_PATH,
      waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
    },
    async fn({
      app,
      initialSourceContent,
      lib: { waitUntil },
      newAlias,
      newUrl,
      obsidianModule,
      pluginId,
      popoverFieldCount,
      popoverSettleTimeoutInMilliseconds,
      shouldOpenLinkEditorOnAltClick,
      shouldUseAlt,
      sourcePath,
      targetContent,
      targetLinkText,
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
       * their order, which is the order they were handed to `editFieldsInPopover`: URL first, alias second.
       */
      function getPopoverEl(): HTMLElement | null {
        return document.body.querySelector<HTMLElement>(`.obsidian-dev-utils.${pluginId}.popover`);
      }

      function getPopoverInputEls(): HTMLInputElement[] {
        return Array.from(getPopoverEl()?.querySelectorAll('input') ?? []);
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

      for (const path of [sourcePath, targetPath]) {
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          await app.fileManager.trashFile(existing);
        }
      }

      await app.vault.create(targetPath, targetContent);
      const sourceFile = await app.vault.create(sourcePath, initialSourceContent);

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
      await leaf.openFile(sourceFile, { state: { mode: 'preview' } });

      await waitUntil({
        message: 'source note did not become the active reading view',
        predicate: () => app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.file?.path === sourcePath,
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      await waitUntil({
        message: 'link target did not resolve',
        predicate: () => app.metadataCache.getFirstLinkpathDest(targetLinkText, sourcePath) !== null,
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      await waitUntil({
        message: 'the rendered link did not appear in the reading view',
        predicate: () => Boolean(view?.containerEl.querySelector('a.internal-link')),
        timeoutInMilliseconds: waitTimeoutInMilliseconds
      });

      const linkEl = view?.containerEl.querySelector<HTMLElement>('a.internal-link');
      if (!linkEl) {
        throw new Error('The rendered link disappeared');
      }

      linkEl.dispatchEvent(
        new MouseEvent('click', {
          altKey: shouldUseAlt,
          bubbles: true,
          cancelable: true
        })
      );

      /*
       * The popover is expected NOT to open in the control case, so a timeout here is a legitimate
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

      if (wasPopoverShown) {
        const [urlInputEl, aliasInputEl] = getPopoverInputEls();
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
      } else {
        /*
         * No popover means the click was left alone, so Obsidian should be opening the link. Give the
         * navigation a moment to settle; a timeout is reported through activePath, not thrown, so the
         * calling test states what should have happened.
         */
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

      const sourceContent = await app.vault.read(sourceFile);
      const activePath = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.file?.path ?? null;

      for (const path of [sourcePath, targetPath]) {
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          await app.fileManager.trashFile(existing);
        }
      }

      return {
        activePath,
        sourceContent,
        wasPopoverShown
      };
    },
    vaultPath: getTempVault().path
  });
}
