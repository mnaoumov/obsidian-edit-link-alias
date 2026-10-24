/**
 * @file
 *
 * Shared integration suite for editing a link shown in a Bases table cell (GH #10).
 *
 * A Base renders each note's properties in a row of its own, so the link belongs to the ROW's note, not to
 * the note open in the view: a `.base` file has no note at all, and a Base embedded in a note shows other
 * notes' properties. Each scenario therefore asserts on the row note's frontmatter, and the embedded one also
 * asserts that the host note is untouched.
 *
 * Named `*.cross-platform.integration.test.ts`, so the desktop AND android projects both collect it. Every
 * gesture is TRUSTED input: `clickElement` is an Electron `sendInputEvent` on desktop and a CDP touch on
 * Android, where the right button is the long-press that raises the context menu.
 *
 * The waiting happens in Node, one `pollInObsidian` per wait, for the reason the frontmatter suite gives:
 * one closure is one transport call, capped at ~30s.
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
const FOLDER_PATH = 'bases-link';
const ROW_PATH = `${FOLDER_PATH}/row.md`;
const TARGET_PATH = `${FOLDER_PATH}/target.md`;
const BASE_PATH = 'bases-link.base';
const HOST_PATH = 'bases-link-host.md';

const PROPERTY_KEY = 'related';
const NEW_ALIAS = 'new alias';
const ROW_CONTENT = `---\n${PROPERTY_KEY}: "[[target]]"\n---\nrow\n`;
const EXPECTED_EDITED_VALUE = `[[target|${NEW_ALIAS}]]`;

const BASE_QUERY = [
  'filters:',
  '  and:',
  `    - file.inFolder("${FOLDER_PATH}")`,
  'views:',
  '  - type: table',
  '    name: Table',
  '    order:',
  '      - file.name',
  `      - ${PROPERTY_KEY}`
].join('\n');

const HOST_CONTENT = `host\n\n\`\`\`base\n${BASE_QUERY}\n\`\`\`\n`;

/**
 * The link the table renders in the row note's `related` cell.
 */
const CELL_LINK_SELECTOR = `.bases-td[data-property="note.${PROPERTY_KEY}"] .internal-link`;

const MENU_ITEM_TITLE = 'Edit link alias';
const PROMPT_INPUT_SELECTOR = '.prompt-modal input.text-box';
const PROMPT_OK_BUTTON_SELECTOR = '.prompt-modal .ok-button';
const POPOVER_SELECTOR = `.obsidian-lib.${PLUGIN_ID}.popover`;
const ALT_CLICK_SETTING_NAME = 'shouldOpenLinkEditorOnAltClick';

const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;

/**
 * How long one long-press waits for a menu before it is made again. A loaded emulator can let a long-press
 * go by without raising any menu at all; that is the gesture failing, not the plugin, so it is retried.
 */
const MENU_WAIT_PER_ATTEMPT_IN_MILLISECONDS = 6000;
const MAX_MENU_GESTURE_ATTEMPTS = 3;

/**
 * Node-side budget for one whole scenario, above the shared config's 30s desktop / 60s android `testTimeout`.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

type BasesScenario = 'base-file-click' | 'base-file-menu' | 'embedded-click';

interface BasesScenarioResult {
  readonly hostContent: null | string;
  readonly relatedValue: unknown;
}

interface BasesSuiteContext {
  hostFile?: TFile;
  rowFile?: TFile;
}

interface ChildrenHolder {
  _children?: unknown[];
}

/**
 * Whether the link editor opened, and what a failure report needs: a menu still showing, the OTHER editor open
 * or a changed view means the tap missed its item, and a notice is what the plugin shows when it could not
 * locate the link.
 */
interface EditorState {
  readonly activeViewType: null | string;
  readonly isOpen: boolean;
  readonly isPopoverOpen: boolean;
  readonly menuItemTitles: string[];
  readonly notices: string[];
}

/**
 * What a long-press left on screen, plus what a failure report needs: the on-disk sizes of the row note and
 * the `.base` file, since a 0-byte file is the signature of the Android transport's lost writes (AGENTS.md).
 */
interface MenuState {
  readonly activeViewType: null | string;
  readonly baseFileSize: null | number;
  readonly menuItemTitles: null | string[];
  readonly rowFileSize: null | number;
}

interface ParsedFrontmatter {
  readonly related?: string;
}
interface SettingsHolder {
  saveToFile: (context: unknown) => Promise<void>;
  setProperty: (propertyName: string, value: unknown) => Promise<string>;
  settings: Record<string, unknown>;
}

interface SettingsSuiteContext {
  settingsComponent?: SettingsHolder;
}

describe('Edit a link shown in a Bases table', () => {
  it('edits the row note on an Alt click in a .base file', async () => {
    const result = await runScenario('base-file-click');

    expect(result.relatedValue).toBe(EXPECTED_EDITED_VALUE);
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('edits the row note, not the host note, on an Alt click in an embedded Base', async () => {
    const result = await runScenario('embedded-click');

    expect(result.relatedValue).toBe(EXPECTED_EDITED_VALUE);
    expect(result.hostContent).toBe(HOST_CONTENT);
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('edits the row note from the link context menu in a .base file', async () => {
    const result = await runScenario('base-file-menu');

    expect(result.relatedValue).toBe(EXPECTED_EDITED_VALUE);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * Makes one trusted gesture on the row note's link: a right click (a long-press on Android) or an `Alt` click.
 *
 * @param shouldOpenMenu - Whether to raise the link context menu rather than `Alt` click.
 */
async function clickCellLink(shouldOpenMenu: boolean): Promise<void> {
  await evalInObsidian({
    async callback({ app, cellLinkSelector, lib: { clickElement }, shouldOpenMenu: isMenu }): Promise<void> {
      const view = app.workspace.getMostRecentLeaf()?.view;
      const linkEl = view?.containerEl.querySelector<HTMLElement>(cellLinkSelector);
      if (!linkEl) {
        throw new Error(`The row note's link disappeared; the most recent view is ${view?.getViewType() ?? 'none'}`);
      }
      await clickElement(isMenu ? { button: 'right', element: linkEl } : { element: linkEl, modifiers: ['Alt'] });
    },
    input: { cellLinkSelector: CELL_LINK_SELECTOR, shouldOpenMenu },
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Creates the row note, its link target, the `.base` file and the host note, and waits for the row note's
 * frontmatter to reach the metadata cache, which is what the resolver reads.
 *
 * @param contextId - The context the created notes are stashed on.
 */
async function createFixture(contextId: ContextId<BasesSuiteContext>): Promise<void> {
  await pollInObsidian({
    contextId,
    input: {
      basePath: BASE_PATH,
      baseQuery: BASE_QUERY,
      folderPath: FOLDER_PATH,
      hostContent: HOST_CONTENT,
      hostPath: HOST_PATH,
      rowContent: ROW_CONTENT,
      rowPath: ROW_PATH,
      targetPath: TARGET_PATH
    },
    poll({ app, context }): boolean {
      return context.rowFile ? Boolean(app.metadataCache.getFileCache(context.rowFile)?.frontmatter) : false;
    },
    async start({ app, basePath, baseQuery, context, folderPath, hostContent, hostPath, lib: { createNote }, rowContent, rowPath, targetPath }): Promise<void> {
      // A scenario that failed part-way leaves its fixture behind.
      for (const path of [basePath, folderPath, hostPath]) {
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          await app.fileManager.trashFile(existing);
        }
      }
      await app.vault.createFolder(folderPath);
      await createNote({ content: 'target\n', path: targetPath });
      context.rowFile = await createNote({ content: rowContent, path: rowPath });
      context.hostFile = await createNote({ content: hostContent, path: hostPath });
      await app.vault.create(basePath, baseQuery);
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the row note\'s frontmatter did not reach the metadata cache',
    until: (isCached: boolean): boolean => isCached,
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Turns the Alt-click setting on explicitly: another suite in the same Obsidian instance turns it off for its
 * own control case and does not restore it.
 */
async function enableAltClick(): Promise<void> {
  const contextId = new ContextId<SettingsSuiteContext>();
  try {
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
  } finally {
    await contextId.dispose(getTemporaryVault().path);
  }
}

/**
 * Fills the editor the gesture opened with the new alias and confirms it.
 *
 * Waiting for the editor and filling it are separate calls; the fill and the confirm stay in ONE closure,
 * because a re-render between them would confirm an empty field.
 *
 * @param scenario - The scenario being run: the menu opens the alias prompt, a click the two-field popover.
 */
async function fillEditor(scenario: BasesScenario): Promise<void> {
  const isMenu = scenario === 'base-file-menu';
  const inputSelector = isMenu ? PROMPT_INPUT_SELECTOR : `${POPOVER_SELECTOR} input`;
  const okButtonSelector = isMenu ? PROMPT_OK_BUTTON_SELECTOR : `${POPOVER_SELECTOR} .ok-button`;

  const deadline = Date.now() + WAIT_TIMEOUT_IN_MILLISECONDS;
  const editorState = await pollInObsidian({
    input: { inputSelector, popoverSelector: POPOVER_SELECTOR },
    poll({ app, inputSelector: selector, popoverSelector }): EditorState {
      return {
        activeViewType: app.workspace.getMostRecentLeaf()?.view.getViewType() ?? null,
        isOpen: document.querySelector(selector) !== null,
        isPopoverOpen: document.querySelector(popoverSelector) !== null,
        menuItemTitles: [...document.querySelectorAll('.menu .menu-item-title')].map((el) => el.textContent),
        notices: [...document.querySelectorAll('.notice')].map((el) => el.textContent)
      };
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS * 2,
    timeoutMessage: 'the link editor state could not be read',
    until: (state: EditorState): boolean => state.isOpen || Date.now() >= deadline,
    vaultPath: getTemporaryVault().path
  });
  if (!editorState.isOpen) {
    throw new Error(`The link editor did not open: ${JSON.stringify(editorState)}`);
  }

  await evalInObsidian({
    callback({ inputSelector: selector, newAlias, okButtonSelector: okSelector }): void {
      // The alias is the first field of the popover, and the only field of the prompt.
      const inputEl = document.querySelector<HTMLInputElement>(selector);
      const okButtonEl = document.querySelector<HTMLElement>(okSelector);
      if (!inputEl || !okButtonEl) {
        throw new Error('The link editor is missing its alias field');
      }
      inputEl.value = newAlias;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      okButtonEl.click();
    },
    input: {
      inputSelector,
      newAlias: NEW_ALIAS,
      okButtonSelector
    },
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Opens the scenario's view and waits for the table to render the row note's link.
 *
 * @param contextId - The context the created notes are stashed on.
 * @param scenario - The scenario being run.
 */
async function openTable(contextId: ContextId<BasesSuiteContext>, scenario: BasesScenario): Promise<void> {
  await pollInObsidian({
    contextId,
    input: {
      basePath: BASE_PATH,
      cellLinkSelector: CELL_LINK_SELECTOR,
      isEmbedded: scenario === 'embedded-click'
    },
    poll({ app, cellLinkSelector }): boolean {
      return Boolean(app.workspace.getMostRecentLeaf()?.view.containerEl.querySelector(cellLinkSelector));
    },
    async start({ app, basePath, context, isEmbedded }): Promise<void> {
      const file = isEmbedded ? context.hostFile : app.vault.getFileByPath(basePath);
      if (!file) {
        throw new Error('The view to open was never created');
      }
      const leaf = app.workspace.getLeaf(true);
      await leaf.openFile(file, isEmbedded ? { state: { mode: 'source', source: false } } : {});
      await app.workspace.revealLeaf(leaf);
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the Bases table did not render the row note\'s link',
    until: (isRendered: boolean): boolean => isRendered,
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Makes the scenario's gesture on the row note's link: an `Alt` click, or a right click (a long-press on
 * Android) followed by a click on the plugin's item in the menu Obsidian opens.
 *
 * @param scenario - The scenario being run.
 */
async function performGesture(scenario: BasesScenario): Promise<void> {
  const isMenu = scenario === 'base-file-menu';
  if (!isMenu) {
    await clickCellLink(false);
    return;
  }

  // A menu WITHOUT the plugin's item is a real failure and ends the test at once; only a long-press that
  // raised no menu at all is made again.
  let menuState: MenuState | null = null;
  for (let attempt = 1; attempt <= MAX_MENU_GESTURE_ATTEMPTS; attempt++) {
    await clickCellLink(true);
    menuState = await waitForMenu();
    if (menuState.menuItemTitles !== null) {
      break;
    }
  }

  if (!menuState?.menuItemTitles?.includes(MENU_ITEM_TITLE)) {
    throw new Error(`The link context menu did not offer the plugin's item after ${String(MAX_MENU_GESTURE_ATTEMPTS)} long-press(es) at most: ${JSON.stringify(menuState)}`);
  }

  // On Android the menu is a bottom sheet that slides in, so for a while another item's title sits where this
  // one's centre will end up, and a tap made while it still moves lands on whatever has slid under it. So the
  // item must be on top at its own centre, with no animation left running in its menu, at the same place on two
  // polls in a row. The animation check is what counts on a loaded emulator: a renderer that stalls between two
  // polls reports the same rect for a sheet that is still on its way.
  let previousRect: null | string = null;
  await pollInObsidian({
    input: { menuItemTitle: MENU_ITEM_TITLE },
    poll({ menuItemTitle }): null | string {
      for (const el of document.querySelectorAll<HTMLElement>('.menu .menu-item-title')) {
        if (el.textContent !== menuItemTitle) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        const isOnTop = el.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
        const isAnimating = (el.closest('.menu')?.getAnimations({ subtree: true }).length ?? 0) > 0;
        if (isOnTop && !isAnimating) {
          return `${String(rect.left)},${String(rect.top)},${String(rect.width)},${String(rect.height)}`;
        }
      }
      return null;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the plugin\'s menu item never settled on top',
    until: (rect: null | string): boolean => {
      const isSettled = rect !== null && rect === previousRect;
      previousRect = rect;
      return isSettled;
    },
    vaultPath: getTemporaryVault().path
  });

  // Finding the item and tapping it stay in ONE closure: the rect is measured live, at the tap.
  await evalInObsidian({
    async callback({ lib: { clickElement }, menuItemTitle }): Promise<void> {
      // The title, not the `.menu-item` around it: on Android the title fills the item's centre. The click
      // bubbles to the item.
      const titleEl = [...document.querySelectorAll<HTMLElement>('.menu .menu-item-title')].find((el) => {
        if (el.textContent !== menuItemTitle) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      });
      if (!titleEl) {
        throw new Error('The menu item disappeared');
      }
      await clickElement({ element: titleEl });
    },
    input: { menuItemTitle: MENU_ITEM_TITLE },
    vaultPath: getTemporaryVault().path
  });
}

/**
 * Waits for the edit to reach the row note, reads the result, and deletes the fixture.
 *
 * @param contextId - The context the created notes are stashed on.
 * @returns The row note's `related` value as parsed from its frontmatter, and the host note's content.
 */
async function readResultAndClean(contextId: ContextId<BasesSuiteContext>): Promise<BasesScenarioResult> {
  await pollInObsidian({
    contextId,
    input: { rowContent: ROW_CONTENT },
    async poll({ app, context, rowContent }): Promise<boolean> {
      if (!context.rowFile) {
        throw new Error('The row note was never created');
      }
      return (await app.vault.read(context.rowFile)) !== rowContent;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the row note was not rewritten',
    until: (wasRewritten: boolean): boolean => wasRewritten,
    vaultPath: getTemporaryVault().path
  });

  return await evalInObsidian({
    async callback({ app, basePath, context, folderPath, obsidianModule }): Promise<BasesScenarioResult> {
      if (!context.rowFile || !context.hostFile) {
        throw new Error('The fixture was never created');
      }
      const rowContent = await app.vault.read(context.rowFile);
      const frontmatter: ParsedFrontmatter = obsidianModule.parseYaml(obsidianModule.getFrontMatterInfo(rowContent).frontmatter) ?? {};
      const hostContent = await app.vault.read(context.hostFile);

      document.querySelectorAll('.menu').forEach((el) => {
        el.remove();
      });
      for (const path of [basePath, folderPath, context.hostFile.path]) {
        const file = app.vault.getAbstractFileByPath(path);
        if (file) {
          await app.fileManager.trashFile(file);
        }
      }

      return {
        hostContent,
        relatedValue: frontmatter.related
      };
    },
    contextId,
    input: {
      basePath: BASE_PATH,
      folderPath: FOLDER_PATH
    },
    vaultPath: getTemporaryVault().path
  });
}

async function runScenario(scenario: BasesScenario): Promise<BasesScenarioResult> {
  const contextId = new ContextId<BasesSuiteContext>();
  try {
    await enableAltClick();
    await createFixture(contextId);
    await openTable(contextId, scenario);
    await performGesture(scenario);
    await fillEditor(scenario);
    return await readResultAndClean(contextId);
  } finally {
    await contextId.dispose(getTemporaryVault().path);
  }
}

/**
 * Waits up to {@link MENU_WAIT_PER_ATTEMPT_IN_MILLISECONDS} for a menu to show, and reports what is on screen
 * either way.
 *
 * @returns The menu's item titles (`null` when no menu showed), with the state a failure report needs.
 */
async function waitForMenu(): Promise<MenuState> {
  const deadline = Date.now() + MENU_WAIT_PER_ATTEMPT_IN_MILLISECONDS;
  return await pollInObsidian({
    input: { basePath: BASE_PATH, rowPath: ROW_PATH },
    async poll({ app, basePath, rowPath }): Promise<MenuState> {
      async function getFileSize(path: string): Promise<null | number> {
        const stat = await app.vault.adapter.stat(path);
        return stat?.size ?? null;
      }
      return {
        activeViewType: app.workspace.getMostRecentLeaf()?.view.getViewType() ?? null,
        baseFileSize: await getFileSize(basePath),
        menuItemTitles: document.querySelector('.menu')
          ? [...document.querySelectorAll('.menu .menu-item-title')].map((el) => el.textContent)
          : null,
        rowFileSize: await getFileSize(rowPath)
      };
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the menu state could not be read',
    until: (state: MenuState): boolean => state.menuItemTitles !== null || Date.now() >= deadline,
    vaultPath: getTemporaryVault().path
  });
}
