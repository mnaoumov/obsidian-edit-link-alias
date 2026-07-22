/**
 * @file
 *
 * Shared integration suite that exercises the "Edit link alias" item the plugin adds to the link
 * context menu — the menu a mobile long-press on a link raises (the `file-menu` event with source
 * `link-context-menu`, reproduced faithfully via `Workspace.handleLinkContextMenu`).
 *
 * It creates a note containing `[[target|old alias]]`, opens it in Reading view, triggers the link
 * context menu, invokes the added item, fills the prompt with a new alias, submits, and asserts the
 * source note was rewritten to `[[target|new alias]]`.
 *
 * Registered by the platform entry points (`plugin.desktop.integration.test.ts`,
 * `plugin.android.integration.test.ts`) so the exact same flow runs on both Desktop and Android. This
 * file is intentionally named `*.integration.test.ts` (matching the unit project's exclude glob) so it
 * is excluded from unit collection and coverage, yet matched by no `*.desktop`/`*.android` project glob —
 * it only runs when imported by a platform entry point.
 */

import type { MenuItem } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const TARGET_PATH = 'edit-link-alias-target.md';
const TARGET_CONTENT = '# Target';
const TARGET_LINK_TEXT = 'edit-link-alias-target';
const SOURCE_PATH = 'edit-link-alias-source.md';
const OLD_ALIAS = 'old alias';
const NEW_ALIAS = 'new alias';
const INITIAL_SOURCE_CONTENT = `[[${TARGET_LINK_TEXT}|${OLD_ALIAS}]]`;
const EXPECTED_SOURCE_CONTENT = `[[${TARGET_LINK_TEXT}|${NEW_ALIAS}]]`;
const MENU_ITEM_TITLE = 'Edit link alias';
const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;

/**
 * Registers the "Edit link alias" link-context-menu integration test for the given platform.
 *
 * @param platform - Human-readable platform label used in the test name (e.g. `'Desktop'`).
 */
export function registerEditAliasMenuSuite(platform: string): void {
  describe(`Edit link alias via link context menu (${platform})`, () => {
    it('adds the menu item on a link long-press and rewrites the alias when invoked', async () => {
      const result = await evalInObsidian({
        args: {
          expectedSourceContent: EXPECTED_SOURCE_CONTENT,
          initialSourceContent: INITIAL_SOURCE_CONTENT,
          menuItemTitle: MENU_ITEM_TITLE,
          newAlias: NEW_ALIAS,
          sourcePath: SOURCE_PATH,
          targetContent: TARGET_CONTENT,
          targetLinkText: TARGET_LINK_TEXT,
          targetPath: TARGET_PATH,
          waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
        },
        async fn({
          app,
          expectedSourceContent,
          initialSourceContent,
          lib: { waitUntil },
          menuItemTitle,
          newAlias,
          obsidianModule,
          sourcePath,
          targetContent,
          targetLinkText,
          targetPath,
          waitTimeoutInMilliseconds
        }) {
          for (const path of [sourcePath, targetPath]) {
            const existing = app.vault.getAbstractFileByPath(path);
            if (existing) {
              await app.fileManager.trashFile(existing);
            }
          }

          await app.vault.create(targetPath, targetContent);
          const sourceFile = await app.vault.create(sourcePath, initialSourceContent);

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

          const menu = new obsidianModule.Menu();
          app.workspace.handleLinkContextMenu(menu, targetLinkText, sourcePath);

          const menuItem = menu.items.find((item): item is MenuItem => 'titleEl' in item && item.titleEl.textContent === menuItemTitle);
          if (!menuItem) {
            return {
              itemFound: false,
              sourceContent: ''
            };
          }

          menuItem.callback?.();

          await waitUntil({
            message: 'prompt modal did not open',
            predicate: () => document.querySelector('.prompt-modal input.text-box') !== null,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          const inputEl = document.querySelector<HTMLInputElement>('.prompt-modal input.text-box');
          const okButtonEl = document.querySelector<HTMLElement>('.prompt-modal .ok-button');
          if (!inputEl || !okButtonEl) {
            return {
              itemFound: true,
              sourceContent: ''
            };
          }

          inputEl.value = newAlias;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          okButtonEl.click();

          await waitUntil({
            message: 'source note alias was not rewritten',
            predicate: async () => (await app.vault.read(sourceFile)) === expectedSourceContent,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          const sourceContent = await app.vault.read(sourceFile);

          for (const path of [sourcePath, targetPath]) {
            const existing = app.vault.getAbstractFileByPath(path);
            if (existing) {
              await app.fileManager.trashFile(existing);
            }
          }

          return {
            itemFound: true,
            sourceContent
          };
        },
        vaultPath: getTempVault().path
      });

      expect(result.itemFound).toBe(true);
      expect(result.sourceContent).toBe(EXPECTED_SOURCE_CONTENT);
    });
  });
}
