/* eslint-disable unicorn/prefer-https -- A scheme-less `www.` link opens as `http://`, so that is the url these tests expect. */
/**
 * @file
 *
 * Shared integration suite for links written without a scheme (GH #11): `<www.example.com>` and the bare
 * `www.example.com`. Obsidian links both as GFM `www.` autolink literals and opens them as `http://` urls,
 * and the plugin used to report "Could not locate the link in the source note" for either, because nothing it
 * parsed recognized a link without `://`.
 *
 * Each shape is edited three ways, because each resolves it differently: an `Alt` click in Reading view
 * matches the rendered anchor's `href` — which for the bracketed shape is `http://www.example.com%3E`, Obsidian
 * swallowing the closing `>` into the link; an `Alt` click in Live Preview resolves it by the click's own
 * position; and the context menu matches the url the `url-menu` event carries, the same `%3E` one.
 *
 * The rewritten link must carry the scheme: `[alias](www.example.com)` is an INTERNAL link to Obsidian, so
 * the expected text is `[alias](http://www.example.com)`.
 *
 * `window.open` is stubbed for every scenario, so a click that is NOT intercepted cannot open a real browser.
 *
 * Named `*.cross-platform.integration.test.ts`, so the desktop AND android projects both collect it. Like
 * `link-click-popover`, the waiting happens in NODE, one short closure per transport call.
 */

import type {
  MenuItem,
  TFile
} from 'obsidian';

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
const SOURCE_PATH = 'www-link-source.md';
const NEW_ALIAS = 'new alias';
const EXPECTED_URL = 'http://www.example.com';

/**
 * The link sits two lines below the intro: in Live Preview the caret's own line is shown as raw markdown, so
 * the caret is parked on the intro, and the blank line keeps the link in a paragraph of its own.
 */
const SOURCE_INTRO = 'intro\n\n';

const READING_VIEW_LINK_SELECTOR = 'a.external-link';

/**
 * Live Preview renders a `www.` literal as `.cm-url` text, which the plugin's link selector does not match, so
 * this also proves the position fallback picks it up.
 */
const LIVE_PREVIEW_LINK_SELECTOR = '.cm-url';

const POPOVER_SELECTOR = `.obsidian-dev-utils.${PLUGIN_ID}.popover`;
const POPOVER_FIELD_COUNT = 2;
const URL_AND_ALIAS_MENU_ITEM_TITLE = 'Edit link (URL and alias)';
const ALT_CLICK_SETTING_NAME = 'shouldOpenLinkEditorOnAltClick';

const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;

/**
 * Node-side budget for one whole scenario; the shared config's 30s desktop / 60s android `testTimeout` would
 * expire before the waits do.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

interface ChildrenHolder {
  _children?: unknown[];
}

type Gesture = 'context-menu' | 'live-preview-click' | 'reading-click';

interface LinkShape {
  readonly expectedContent: string;
  readonly name: string;
  readonly raw: string;
  readonly renderedUrl: string;
}

interface ScenarioResult {
  readonly sourceContent: string;
  readonly urlFieldValue: string;
}

/**
 * The plugin's settings component, as the tree walk recognizes it.
 */
interface SettingsHolder {
  saveToFile: (context: unknown) => Promise<void>;
  setProperty: (propertyName: string, value: unknown) => Promise<string>;
  settings: Record<string, unknown>;
}

interface WwwSuiteContext {
  originalWindowOpen?: typeof window.open;
  settingsComponent?: SettingsHolder;
  sourceFile?: TFile;
}

const LINK_SHAPES: readonly LinkShape[] = [
  {
    expectedContent: `${SOURCE_INTRO}[${NEW_ALIAS}](<${EXPECTED_URL}>)`,
    name: '<www.example.com>',
    raw: '<www.example.com>',
    renderedUrl: `${EXPECTED_URL}%3E`
  },
  {
    expectedContent: `${SOURCE_INTRO}[${NEW_ALIAS}](${EXPECTED_URL})`,
    name: 'www.example.com',
    raw: 'www.example.com',
    renderedUrl: EXPECTED_URL
  }
];

const GESTURES: readonly Gesture[] = ['reading-click', 'live-preview-click', 'context-menu'];

describe('Edit a link written without a scheme', () => {
  for (const shape of LINK_SHAPES) {
    for (const gesture of GESTURES) {
      it(`edits ${shape.name} via ${gesture} and writes it back with the scheme`, async () => {
        const result = await runScenario(shape, gesture);

        expect(result.urlFieldValue).toBe(EXPECTED_URL);
        expect(result.sourceContent).toBe(shape.expectedContent);
      }, TEST_TIMEOUT_IN_MILLISECONDS);
    }
  }
});

async function runScenario(shape: LinkShape, gesture: Gesture): Promise<ScenarioResult> {
  const contextId = new ContextId<WwwSuiteContext>();
  const isLivePreview = gesture === 'live-preview-click';
  const initialContent = `${SOURCE_INTRO}${shape.raw}`;
  const linkSelector = isLivePreview ? LIVE_PREVIEW_LINK_SELECTOR : READING_VIEW_LINK_SELECTOR;

  try {
    /*
     * Turn the Alt-click setting on: the other suites share this Obsidian, and `link-click-popover`'s last case
     * leaves it off.
     */
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

        if (!context.settingsComponent) {
          throw new Error('Could not find the plugin settings component');
        }
        await context.settingsComponent.setProperty(altClickSettingName, true);
        await context.settingsComponent.saveToFile(null);
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the Alt-click setting did not take effect',
      until: (isEnabled: boolean): boolean => isEnabled,
      vaultPath: getTemporaryVault().path
    });

    await pollInObsidian({
      contextId,
      input: { initialContent, isLivePreview, sourcePath: SOURCE_PATH },
      poll({ app, isLivePreview: isEditing, obsidianModule, sourcePath }): boolean {
        const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
        return view?.file?.path === sourcePath && view.getMode() === (isEditing ? 'source' : 'preview');
      },
      async start({ app, context, initialContent: content, isLivePreview: isEditing, lib: { createNote }, sourcePath }): Promise<void> {
        context.originalWindowOpen = window.open;
        window.open = (): null => null;

        const existing = app.vault.getAbstractFileByPath(sourcePath);
        if (existing) {
          await app.fileManager.trashFile(existing);
        }
        context.sourceFile = await createNote({ content, path: sourcePath });
        await app.workspace.getLeaf(true).openFile(context.sourceFile, {
          state: isEditing ? { mode: 'source', source: false } : { mode: 'preview' }
        });
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'source note did not become the active view in the expected mode',
      until: (isActive: boolean): boolean => isActive,
      vaultPath: getTemporaryVault().path
    });

    await pollInObsidian({
      input: { isLivePreview, linkSelector },
      poll({ app, linkSelector: selector, obsidianModule }): boolean {
        return Boolean(app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.containerEl.querySelector(selector));
      },
      start({ app, isLivePreview: isEditing, obsidianModule }): void {
        if (isEditing) {
          app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.setCursor({ ch: 0, line: 0 });
        }
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the rendered link did not appear',
      until: (hasAppeared: boolean): boolean => hasAppeared,
      vaultPath: getTemporaryVault().path
    });

    if (gesture === 'context-menu') {
      await evalInObsidian({
        callback({ app, menuItemTitle, obsidianModule, renderedUrl }): void {
          const menu = new obsidianModule.Menu();
          app.workspace.handleExternalLinkContextMenu(menu, renderedUrl);
          const menuItem = menu.items.find((item): item is MenuItem => 'titleEl' in item && item.titleEl.textContent === menuItemTitle);
          if (!menuItem) {
            throw new Error('The url-and-alias menu item was not added');
          }
          menuItem.callback?.();
        },
        input: { menuItemTitle: URL_AND_ALIAS_MENU_ITEM_TITLE, renderedUrl: shape.renderedUrl },
        vaultPath: getTemporaryVault().path
      });
    } else {
      // Finding the element and clicking it stay in ONE closure: `clickElement` takes a live renderer node.
      await evalInObsidian({
        async callback({ app, lib: { clickElement }, linkSelector: selector, obsidianModule }): Promise<void> {
          const linkEl = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.containerEl.querySelector<HTMLElement>(selector);
          if (!linkEl) {
            throw new Error('The rendered link disappeared');
          }
          await clickElement({ element: linkEl, modifiers: ['Alt'] });
        },
        input: { linkSelector },
        vaultPath: getTemporaryVault().path
      });
    }

    await pollInObsidian({
      input: { popoverSelector: POPOVER_SELECTOR },
      poll({ popoverSelector }): number {
        return document.body.querySelector<HTMLElement>(popoverSelector)?.querySelectorAll('input').length ?? 0;
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the link editor popover did not open',
      until: (fieldCount: number): boolean => fieldCount === POPOVER_FIELD_COUNT,
      vaultPath: getTemporaryVault().path
    });

    // Reading the url, filling the alias and confirming stay in ONE closure: the popover is rebuilt on re-render.
    const urlFieldValue = await evalInObsidian({
      callback({ newAlias, popoverSelector }): string {
        const popoverEl = document.body.querySelector<HTMLElement>(popoverSelector);
        const [aliasInputEl, urlInputEl] = [...popoverEl?.querySelectorAll('input') ?? []];
        const okButtonEl = popoverEl?.querySelector<HTMLElement>('.ok-button');
        if (!aliasInputEl || !urlInputEl || !okButtonEl) {
          throw new Error('The link editor popover is missing its fields');
        }

        const url = urlInputEl.value;
        aliasInputEl.value = newAlias;
        aliasInputEl.dispatchEvent(new Event('input', { bubbles: true }));
        okButtonEl.click();
        return url;
      },
      input: { newAlias: NEW_ALIAS, popoverSelector: POPOVER_SELECTOR },
      vaultPath: getTemporaryVault().path
    });

    await pollInObsidian({
      contextId,
      input: { initialContent },
      async poll({ app, context, initialContent: content }): Promise<boolean> {
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

    const sourceContent = await evalInObsidian({
      async callback({ app, context }): Promise<string> {
        if (!context.sourceFile) {
          throw new Error('The source note was never created');
        }
        return await app.vault.read(context.sourceFile);
      },
      contextId,
      vaultPath: getTemporaryVault().path
    });

    return { sourceContent, urlFieldValue };
  } finally {
    await evalInObsidian({
      async callback({ app, context, popoverSelector }): Promise<void> {
        document.body.querySelector<HTMLElement>(`${popoverSelector} .cancel-button`)?.click();
        if (context.originalWindowOpen) {
          window.open = context.originalWindowOpen;
        }
        if (context.sourceFile) {
          await app.fileManager.trashFile(context.sourceFile);
        }
      },
      contextId,
      input: { popoverSelector: POPOVER_SELECTOR },
      vaultPath: getTemporaryVault().path
    });
    await contextId.dispose(getTemporaryVault().path);
  }
}

/* eslint-enable unicorn/prefer-https -- Paired with the file-level disable above. */
