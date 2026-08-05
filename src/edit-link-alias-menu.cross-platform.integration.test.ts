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
 * Named `*.cross-platform.integration.test.ts` (per G47), so the desktop AND android projects both
 * collect it and the exact same flow is verified on each.
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
describe('Edit link alias via link context menu', () => {
  it('adds the menu item on a link long-press and rewrites the alias when invoked', async () => {
    const result = await evalInObsidian({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
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
      // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
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

const URL_AND_ALIAS_MENU_ITEM_TITLE = 'Edit link (URL and alias)';
const NEW_URL_LINK_TEXT = 'edit-link-alias-target-renamed';
const URL_AND_ALIAS_EXPECTED_SOURCE_CONTENT = `[[${NEW_URL_LINK_TEXT}|${NEW_ALIAS}]]`;
const PLUGIN_ID = 'edit-link-alias';

/**
 * The popover's URL and alias fields — the count is what tells "the popover is fully built" apart from
 * "it is halfway through being built".
 */
const POPOVER_FIELD_COUNT = 2;
describe('Edit link URL and alias via link context menu', () => {
  it('adds the url-and-alias menu item on a link long-press and rewrites both url and alias when invoked', async () => {
    const result = await evalInObsidian({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
      args: {
        expectedSourceContent: URL_AND_ALIAS_EXPECTED_SOURCE_CONTENT,
        initialSourceContent: INITIAL_SOURCE_CONTENT,
        menuItemTitle: URL_AND_ALIAS_MENU_ITEM_TITLE,
        newAlias: NEW_ALIAS,
        newUrl: NEW_URL_LINK_TEXT,
        pluginId: PLUGIN_ID,
        popoverFieldCount: POPOVER_FIELD_COUNT,
        sourcePath: SOURCE_PATH,
        targetContent: TARGET_CONTENT,
        targetLinkText: TARGET_LINK_TEXT,
        targetPath: TARGET_PATH,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
      async fn({
        app,
        expectedSourceContent,
        initialSourceContent,
        lib: { waitUntil },
        menuItemTitle,
        newAlias,
        newUrl,
        obsidianModule,
        pluginId,
        popoverFieldCount,
        sourcePath,
        targetContent,
        targetLinkText,
        targetPath,
        waitTimeoutInMilliseconds
      }) {
        /*
         * The popover comes from `obsidian-dev-utils`, which classes it `obsidian-dev-utils <pluginId>
         * popover` and gives every field the same `text-box` class. The fields are therefore told apart
         * by their order, which is the order they were handed to `editFieldsInPopover`: alias first,
         * URL second (the alias leads so the popover focuses it — GH #7).
         */
        function getPopoverEl(): HTMLElement | null {
          return document.body.querySelector<HTMLElement>(`.obsidian-dev-utils.${pluginId}.popover`);
        }

        function getPopoverInputEls(): HTMLInputElement[] {
          return [...getPopoverEl()?.querySelectorAll('input') ?? []];
        }

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
          message: 'link editor popover did not open',
          predicate: () => getPopoverInputEls().length === popoverFieldCount,
          timeoutInMilliseconds: waitTimeoutInMilliseconds
        });

        const [aliasInputEl, urlInputEl] = getPopoverInputEls();
        const okButtonEl = getPopoverEl()?.querySelector<HTMLElement>('.ok-button');
        if (!urlInputEl || !aliasInputEl || !okButtonEl) {
          return {
            itemFound: true,
            sourceContent: ''
          };
        }

        urlInputEl.value = newUrl;
        urlInputEl.dispatchEvent(new Event('input', { bubbles: true }));
        aliasInputEl.value = newAlias;
        aliasInputEl.dispatchEvent(new Event('input', { bubbles: true }));
        okButtonEl.click();

        await waitUntil({
          message: 'source note url and alias were not rewritten',
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
    expect(result.sourceContent).toBe(URL_AND_ALIAS_EXPECTED_SOURCE_CONTENT);
  });
});
