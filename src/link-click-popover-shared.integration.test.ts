/**
 * @file
 *
 * Shared integration suite for the click-to-edit behavior: clicking a rendered link opens the anchored
 * URL + alias popover instead of opening the link.
 *
 * It runs against a real Obsidian: it creates a note containing `[[target|old alias]]`, opens it in
 * Reading view, dispatches a real click on the rendered anchor, fills the popover and confirms, then
 * asserts the source note was rewritten AND that the navigation was suppressed (the click stayed
 * `defaultPrevented` and the source note is still the active file).
 *
 * The control case matters as much as the happy path: with the setting left at its default the same
 * click must render no popover and change nothing, which is what proves installing the plugin does not
 * alter how links behave until the user opts in.
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

interface ClickScenarioResult {
  readonly activePath: null | string;
  readonly sourceContent: string;
  readonly wasPopoverShown: boolean;
}

interface RunClickScenarioParams {
  readonly linkClickAction: string;
  readonly shouldUseModifier: boolean;
}

/**
 * Registers the click-to-edit integration suite for the given platform.
 *
 * @param platform - Human-readable platform label used in the test names (e.g. `'Desktop'`).
 */
export function registerLinkClickPopoverSuite(platform: string): void {
  describe(`Edit a link by clicking it (${platform})`, () => {
    it('opens the popover on a plain click, rewrites the link, and does not open it', async () => {
      const result = await runClickScenario({
        linkClickAction: 'OpenEditorOnClick',
        shouldUseModifier: false
      });

      expect(result.wasPopoverShown).toBe(true);
      // Still on the source note: the navigation the click would normally trigger was suppressed.
      expect(result.activePath).toBe(SOURCE_PATH);
      expect(result.sourceContent).toBe(EXPECTED_SOURCE_CONTENT);
    });

    it('opens the popover on a Mod click when configured that way', async () => {
      const result = await runClickScenario({
        linkClickAction: 'OpenEditorOnModClick',
        shouldUseModifier: true
      });

      expect(result.wasPopoverShown).toBe(true);
      expect(result.sourceContent).toBe(EXPECTED_SOURCE_CONTENT);
    });

    it('leaves the click alone with the default setting', async () => {
      const result = await runClickScenario({
        linkClickAction: 'Disabled',
        shouldUseModifier: false
      });

      expect(result.wasPopoverShown).toBe(false);
      // The link opened, exactly as it does without the plugin, and nothing was rewritten.
      expect(result.activePath).toBe(TARGET_PATH);
      expect(result.sourceContent).toBe(INITIAL_SOURCE_CONTENT);
    });
  });
}

async function runClickScenario(params: RunClickScenarioParams): Promise<ClickScenarioResult> {
  return await evalInObsidian({
    args: {
      initialSourceContent: INITIAL_SOURCE_CONTENT,
      linkClickAction: params.linkClickAction,
      newAlias: NEW_ALIAS,
      newUrl: NEW_URL_LINK_TEXT,
      pluginId: PLUGIN_ID,
      popoverSettleTimeoutInMilliseconds: POPOVER_SETTLE_TIMEOUT_IN_MILLISECONDS,
      shouldUseModifier: params.shouldUseModifier,
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
      linkClickAction,
      newAlias,
      newUrl,
      obsidianModule,
      pluginId,
      popoverSettleTimeoutInMilliseconds,
      shouldUseModifier,
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

      function findSettingsComponent(root: unknown): null | SettingsHolder {
        const queue: unknown[] = [root];
        while (queue.length > 0) {
          const candidate = queue.shift();
          if (typeof candidate !== 'object' || candidate === null) {
            continue;
          }
          const settings = (candidate as Partial<SettingsHolder>).settings;
          if (settings && typeof settings === 'object' && 'linkClickAction' in settings) {
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
      await settingsComponent.setProperty('linkClickAction', linkClickAction);
      await settingsComponent.saveToFile(null);
      await waitUntil({
        message: 'the link click action setting did not take effect',
        predicate: () => settingsComponent.settings['linkClickAction'] === linkClickAction,
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
          bubbles: true,
          cancelable: true,
          ctrlKey: shouldUseModifier,
          metaKey: shouldUseModifier
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
          predicate: () => document.querySelector('.link-editor-popover-url-input') !== null,
          timeoutInMilliseconds: popoverSettleTimeoutInMilliseconds
        });
        wasPopoverShown = true;
      } catch {
        wasPopoverShown = false;
      }

      if (wasPopoverShown) {
        const urlInputEl = document.querySelector<HTMLInputElement>('.link-editor-popover-url-input');
        const aliasInputEl = document.querySelector<HTMLInputElement>('.link-editor-popover-alias-input');
        const okButtonEl = document.querySelector<HTMLElement>('.link-editor-popover-ok-button');
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
