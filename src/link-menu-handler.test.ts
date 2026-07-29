import type {
  App,
  Editor,
  EditorPosition,
  Menu,
  MenuItem,
  Plugin,
  TAbstractFile,
  TFile,
  WorkspaceLeaf
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { PointerPositionComponent } from 'obsidian-dev-utils/obsidian/components/pointer-position-component';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';
import type { PopoverAnchor } from 'obsidian-dev-utils/obsidian/popovers/popover-anchor';

import {
  MarkdownView,
  Platform
} from 'obsidian';
import { waitForAllAsyncOperations } from 'obsidian-dev-utils/async';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { isFile } from 'obsidian-dev-utils/obsidian/file-system';
import { selectItem } from 'obsidian-dev-utils/obsidian/modals/select-item';
import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EditParsedLink } from './edit-link.ts';

import {
  createEditParsedLinkUrlAndAliasInPopover,
  editParsedLinkAlias
} from './edit-link.ts';
import { LinkMenuHandler } from './link-menu-handler.ts';
import { resolveAndEditLink } from './resolve-link-occurrence.ts';

vi.mock('./edit-link.ts', () => ({ createEditParsedLinkUrlAndAliasInPopover: vi.fn(), editParsedLinkAlias: vi.fn() }));
vi.mock('obsidian-dev-utils/obsidian/parse-link', () => ({ parseLinks: vi.fn() }));
vi.mock('obsidian-dev-utils/obsidian/modals/select-item', () => ({ selectItem: vi.fn() }));
vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({ isFile: vi.fn() }));

const mockEditParsedLinkAlias = vi.mocked(editParsedLinkAlias);
const mockCreateEditParsedLinkUrlAndAliasInPopover = vi.mocked(createEditParsedLinkUrlAndAliasInPopover);
const mockEditParsedLinkUrlAndAlias = vi.fn<EditParsedLink>();
const mockParseLinks = vi.mocked(parseLinks);
const mockSelectItem = vi.mocked(selectItem);
const mockIsFile = vi.mocked(isFile);

const EDIT_ALIAS_ITEM_INDEX = 0;
const EDIT_URL_AND_ALIAS_ITEM_INDEX = 1;
const LINK_CONTEXT_MENU_SOURCE = 'link-context-menu';

interface CapturedMenuItem {
  icon?: string;
  onClick?(this: void): void;
  section?: string;
  title?: string;
}

interface CreateMockEditorParams {
  readonly clickableTokenType?: null | string;
  readonly cursor?: EditorPosition;
  readonly line?: string;
  readonly replaceRange?: Editor['replaceRange'];
}

interface CreateMockMenuResult {
  readonly items: CapturedMenuItem[];
  readonly menu: Menu;
}

type FileMenuCallback = (menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => void;

type UrlMenuCallback = (menu: Menu, url: string) => void;

function createMockEditor(params: CreateMockEditorParams = {}): Editor {
  const {
    clickableTokenType = null,
    cursor = { ch: 0, line: 0 },
    line = '',
    replaceRange = vi.fn<Editor['replaceRange']>()
  } = params;

  const getLine = vi.fn().mockReturnValue(line);
  return strictProxy<Editor>({
    getClickableTokenAt: vi.fn().mockReturnValue(clickableTokenType === null ? null : { type: clickableTokenType }),
    getCursor: vi.fn().mockReturnValue(cursor),
    getDoc: vi.fn().mockReturnValue(strictProxy({ getLine })),
    replaceRange
  });
}

function createMockMenu(): CreateMockMenuResult {
  const items: CapturedMenuItem[] = [];
  const addItem = vi.fn((cb: (item: MenuItem) => void) => {
    const captured: CapturedMenuItem = {};
    const item = castTo<MenuItem>({
      onClick(fn: (this: void) => void) {
        captured.onClick = fn;
        return item;
      },
      setIcon(icon: string) {
        captured.icon = icon;
        return item;
      },
      setSection(section: string) {
        captured.section = section;
        return item;
      },
      setTitle(title: string) {
        captured.title = title;
        return item;
      }
    });
    cb(item);
    items.push(captured);
    return menu;
  });
  const menu = castTo<Menu>({ addItem });
  return {
    items,
    menu
  };
}

function parsedLink(overrides: Partial<ParseLinkResult> = {}): ParseLinkResult {
  return {
    endOffset: 14,
    isEmbed: false,
    isExternal: false,
    isFileUrl: false,
    isWikilink: true,
    raw: '[[target|old]]',
    startOffset: 0,
    url: 'target',
    ...overrides
  };
}

let app: App;
let sourceContent: string;
let processContent: null | string;
let getActiveViewOfType: ReturnType<typeof vi.fn>;
let getFirstLinkpathDest: ReturnType<typeof vi.fn>;
let read: ReturnType<typeof vi.fn>;
let process: ReturnType<typeof vi.fn>;
let showNotice: ReturnType<typeof vi.fn>;
let registerEvent: ReturnType<typeof vi.fn>;
let on: ReturnType<typeof vi.fn>;
let handler: LinkMenuHandler;
let lastPointerAnchor: null | PopoverAnchor;

/**
 * Opens the `url-menu` for the given url and clicks one of the items the handler added to it.
 *
 * @param itemIndex - The index of the menu item to click.
 * @param externalUrl - The url the menu was raised for.
 */
async function clickExternalLinkMenuItem(itemIndex: number, externalUrl: string): Promise<void> {
  const { items, menu } = createMockMenu();
  triggerUrlMenu(menu, externalUrl);
  await clickMenuItem(items, itemIndex);
}

/**
 * Opens the link `file-menu` for the given target and clicks one of the items the handler added to it.
 *
 * @param itemIndex - The index of the menu item to click.
 * @param target - The file the menu was raised for.
 * @param leaf - The leaf the menu was raised in, when the event carries one.
 */
async function clickInternalLinkMenuItem(itemIndex: number, target: TFile, leaf?: WorkspaceLeaf): Promise<void> {
  const { items, menu } = createMockMenu();
  triggerFileMenu(menu, target, LINK_CONTEXT_MENU_SOURCE, leaf);
  await clickMenuItem(items, itemIndex);
}

async function clickMenuItem(items: readonly CapturedMenuItem[], itemIndex: number): Promise<void> {
  items[itemIndex]?.onClick?.();
  await waitForAllAsyncOperations();
}

function createHandler(): LinkMenuHandler {
  sourceContent = '';
  processContent = null;
  getActiveViewOfType = vi.fn().mockReturnValue(null);
  getFirstLinkpathDest = vi.fn().mockReturnValue(null);
  read = vi.fn().mockImplementation(() => Promise.resolve(sourceContent));
  process = vi.fn((_file: TFile, fn: (data: string) => string) => Promise.resolve(fn(processContent ?? sourceContent)));
  showNotice = vi.fn();
  registerEvent = vi.fn();
  on = vi.fn();

  app = castTo<App>({
    metadataCache: { getFirstLinkpathDest },
    vault: {
      process,
      read
    },
    workspace: {
      containerEl: document.body,
      getActiveViewOfType,
      on
    }
  });

  const plugin = castTo<Plugin>({ registerEvent });
  const pluginNoticeComponent = castTo<PluginNoticeComponent>({ showNotice });

  return new LinkMenuHandler({
    app,
    plugin,
    pluginNoticeComponent,
    pointerPositionComponent: strictProxy<PointerPositionComponent>({ getLastPointerAnchor: () => lastPointerAnchor })
  });
}

function createLeafWithMarkdownView(mode: 'preview' | 'source'): WorkspaceLeaf {
  const view = castTo<MarkdownView>(Object.create(MarkdownView.prototype));
  Object.assign(view, {
    editor: createMockEditor(),
    file: strictProxy<TFile>({ path: 'source.md' }),
    getMode: () => mode
  });
  return castTo<WorkspaceLeaf>({ view });
}

function getFileMenuCallback(): FileMenuCallback {
  return on.mock.calls.find((call) => call[0] === 'file-menu')?.[1] as FileMenuCallback;
}

function getUrlMenuCallback(): UrlMenuCallback {
  return on.mock.calls.find((call) => call[0] === 'url-menu')?.[1] as UrlMenuCallback;
}

function mockActiveView(mode: 'preview' | 'source', editor?: Editor): MarkdownView {
  const view = strictProxy<MarkdownView>({
    editor: editor ?? createMockEditor(),
    file: strictProxy<TFile>({ path: 'source.md' }),
    getMode: () => mode
  });
  getActiveViewOfType.mockReturnValue(view);
  return view;
}

function mockEditApplies(newRawLink: string): void {
  mockEditParsedLinkAlias.mockImplementation(async (params) => {
    await params.applyReplacement(newRawLink);
  });
}

function mockExternalLinkInSource(): void {
  mockActiveView('preview');
  sourceContent = '[click](https://example.com)';
  mockParseLinks.mockReturnValue([parsedLink({
    alias: 'click',
    endOffset: 28,
    isExternal: true,
    isWikilink: false,
    raw: '[click](https://example.com)',
    url: 'https://example.com'
  })]);
}

function triggerFileMenu(menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf): void {
  getFileMenuCallback()(menu, file, source, leaf);
}

function triggerUrlMenu(menu: Menu, url: string): void {
  getUrlMenuCallback()(menu, url);
}

beforeEach(() => {
  lastPointerAnchor = {
    bottom: 100,
    doc: document,
    left: 40
  };
  handler = createHandler();
  handler.register();
  Platform.isDesktop = true;
  mockIsFile.mockReset().mockReturnValue(true);
  mockParseLinks.mockReset().mockReturnValue([]);
  mockSelectItem.mockReset();
  mockEditParsedLinkAlias.mockReset().mockResolvedValue();
  mockEditParsedLinkUrlAndAlias.mockReset().mockResolvedValue();
  mockCreateEditParsedLinkUrlAndAliasInPopover.mockReset().mockReturnValue(mockEditParsedLinkUrlAndAlias);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LinkMenuHandler', () => {
  describe('register', () => {
    it('should register file-menu and url-menu event handlers', () => {
      expect(on).toHaveBeenCalledWith('file-menu', expect.any(Function));
      expect(on).toHaveBeenCalledWith('url-menu', expect.any(Function));
      expect(registerEvent).toHaveBeenCalledTimes(2);
    });

    it('should route the file-menu and url-menu events to the menu handlers', () => {
      const fileMenu = createMockMenu();
      getFileMenuCallback()(fileMenu.menu, strictProxy<TAbstractFile>({}), LINK_CONTEXT_MENU_SOURCE);
      expect(fileMenu.items).toHaveLength(2);

      const urlMenu = createMockMenu();
      getUrlMenuCallback()(urlMenu.menu, 'https://example.com');
      expect(urlMenu.items).toHaveLength(2);
    });
  });

  describe('file-menu', () => {
    it('should not add an item when the source is not link-context-menu', () => {
      const { items, menu } = createMockMenu();
      triggerFileMenu(menu, strictProxy<TAbstractFile>({}), 'file-explorer-context-menu');
      expect(items).toHaveLength(0);
    });

    it('should not add an item when the target is not a file', () => {
      mockIsFile.mockReturnValue(false);
      const { items, menu } = createMockMenu();
      triggerFileMenu(menu, strictProxy<TAbstractFile>({}), LINK_CONTEXT_MENU_SOURCE);
      expect(items).toHaveLength(0);
    });

    it('should add the edit-link-alias and edit-url-and-alias items for an internal link context menu', () => {
      const { items, menu } = createMockMenu();
      triggerFileMenu(menu, strictProxy<TAbstractFile>({}), LINK_CONTEXT_MENU_SOURCE);

      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        icon: 'text-cursor-input',
        section: 'action',
        title: 'Edit link alias'
      });
      expect(items[1]).toMatchObject({
        icon: 'link',
        section: 'action',
        title: 'Edit link (URL and alias)'
      });
    });
  });

  describe('url-menu', () => {
    it('should add the edit-link-alias and edit-url-and-alias items for a url menu', () => {
      const { items, menu } = createMockMenu();
      triggerUrlMenu(menu, 'https://example.com');

      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({ title: 'Edit link alias' });
      expect(items[1]).toMatchObject({ title: 'Edit link (URL and alias)' });
    });
  });

  describe('editor-menu de-duplication', () => {
    it('should not add a file-menu item on desktop when the editor already shows it for an internal link', () => {
      mockActiveView('source', createMockEditor({ clickableTokenType: 'internal-link' }));
      const { items, menu } = createMockMenu();
      triggerFileMenu(menu, strictProxy<TAbstractFile>({}), LINK_CONTEXT_MENU_SOURCE);
      expect(items).toHaveLength(0);
    });

    it('should not add a url-menu item on desktop when the editor already shows it for an external link', () => {
      mockActiveView('source', createMockEditor({ clickableTokenType: 'external-link' }));
      const { items, menu } = createMockMenu();
      triggerUrlMenu(menu, 'https://example.com');
      expect(items).toHaveLength(0);
    });

    it('should add the item on desktop when the editor cursor is on a non-link token', () => {
      mockActiveView('source', createMockEditor({ clickableTokenType: 'tag' }));
      const { items, menu } = createMockMenu();
      triggerFileMenu(menu, strictProxy<TAbstractFile>({}), LINK_CONTEXT_MENU_SOURCE);
      expect(items).toHaveLength(2);
    });

    it('should add the item on desktop when there is no clickable token at the cursor', () => {
      mockActiveView('source', createMockEditor({ clickableTokenType: null }));
      const { items, menu } = createMockMenu();
      triggerFileMenu(menu, strictProxy<TAbstractFile>({}), LINK_CONTEXT_MENU_SOURCE);
      expect(items).toHaveLength(2);
    });

    it('should add the item on desktop in reading mode', () => {
      mockActiveView('preview', createMockEditor({ clickableTokenType: 'internal-link' }));
      const { items, menu } = createMockMenu();
      triggerFileMenu(menu, strictProxy<TAbstractFile>({}), LINK_CONTEXT_MENU_SOURCE);
      expect(items).toHaveLength(2);
    });

    it('should add the item on mobile even in an editing view with the cursor on a link', () => {
      Platform.isDesktop = false;
      mockActiveView('source', createMockEditor({ clickableTokenType: 'internal-link' }));
      const { items, menu } = createMockMenu();
      triggerFileMenu(menu, strictProxy<TAbstractFile>({}), LINK_CONTEXT_MENU_SOURCE);
      expect(items).toHaveLength(2);
    });
  });

  describe('link occurrence resolution', () => {
    it('should show a notice when there is no active markdown view', async () => {
      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(showNotice).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias).not.toHaveBeenCalled();
    });

    it('should edit via the editor when in source mode with the cursor on the matching link', async () => {
      const replaceRange = vi.fn<Editor['replaceRange']>();
      const editor = createMockEditor({
        cursor: { ch: 5, line: 0 },
        line: '[[target|old]]',
        replaceRange
      });
      mockActiveView('source', editor);
      mockParseLinks.mockReturnValue([parsedLink()]);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditApplies('[[target|new]]');

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(mockEditParsedLinkAlias).toHaveBeenCalledOnce();
      expect(replaceRange).toHaveBeenCalledWith('[[target|new]]', { ch: 0, line: 0 }, { ch: 14, line: 0 });
      expect(read).not.toHaveBeenCalled();
    });

    it('should edit via the url-and-alias editor when that action is chosen', async () => {
      const replaceRange = vi.fn<Editor['replaceRange']>();
      const editor = createMockEditor({
        cursor: { ch: 5, line: 0 },
        line: '[[target|old]]',
        replaceRange
      });
      mockActiveView('source', editor);
      mockParseLinks.mockReturnValue([parsedLink()]);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditParsedLinkUrlAndAlias.mockImplementation(async (params) => {
        await params.applyReplacement('[[new-target|new]]');
      });

      await clickInternalLinkMenuItem(EDIT_URL_AND_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(mockEditParsedLinkUrlAndAlias).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias).not.toHaveBeenCalled();
      expect(replaceRange).toHaveBeenCalledWith('[[new-target|new]]', { ch: 0, line: 0 }, { ch: 14, line: 0 });
    });

    it('should fall back to the source scan when the editor cursor is not on the target link', async () => {
      const editor = createMockEditor({
        cursor: { ch: 5, line: 0 },
        line: '[[other|old]]'
      });
      mockActiveView('source', editor);
      // Cursor line has no matching link; the file scan finds it on another line.
      mockParseLinks.mockImplementation((text: string) => text.includes('[[target') ? [parsedLink()] : []);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      sourceContent = '[[other|old]]\n[[target|old]]';
      mockEditApplies('[[target|new]]');

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(read).toHaveBeenCalledOnce();
      expect(process).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias).toHaveBeenCalledOnce();
    });

    it('should edit the single matching link in reading mode by rewriting the source', async () => {
      mockActiveView('preview');
      sourceContent = 'intro\n[[target|old]]\noutro';
      mockParseLinks.mockImplementation((text: string) => text.includes('[[target') ? [parsedLink()] : []);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditApplies('[[target|new]]');

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(process).toHaveBeenCalledOnce();
      const processFn = process.mock.calls[0]?.[1] as (data: string) => string;
      expect(processFn('intro\n[[target|old]]\noutro')).toBe('intro\n[[target|new]]\noutro');
      expect(showNotice).not.toHaveBeenCalled();
    });

    it('should disambiguate multiple matches in reading mode via selectItem', async () => {
      mockActiveView('preview');
      sourceContent = '[[target|a]]\n[[target|b]]';
      const first = parsedLink({ raw: '[[target|a]]' });
      const second = parsedLink({ raw: '[[target|b]]' });
      mockParseLinks.mockImplementation((text: string) => {
        if (text === '[[target|a]]') {
          return [first];
        }
        if (text === '[[target|b]]') {
          return [second];
        }
        return [];
      });
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      const chosen = { line: 1, parsedLink: second };
      mockSelectItem.mockImplementation((params) => {
        // Exercise the display-text formatter for each candidate.
        const labels = params.items.map((item) => params.itemTextFunc(item));
        expect(labels).toStrictEqual(['Line 1: [[target|a]]', 'Line 2: [[target|b]]']);
        return Promise.resolve(chosen);
      });
      mockEditApplies('[[target|new]]');

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(mockSelectItem).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias).toHaveBeenCalledWith(expect.objectContaining({ parsedLink: second }));
    });

    it('should not edit when the multi-match picker is cancelled', async () => {
      mockActiveView('preview');
      sourceContent = '[[target|a]]\n[[target|b]]';
      mockParseLinks.mockImplementation((text: string) => text.startsWith('[[target') ? [parsedLink({ raw: text })] : []);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockSelectItem.mockResolvedValue(null);

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(mockEditParsedLinkAlias).not.toHaveBeenCalled();
    });

    it('should show a notice when no matching link is found in the source', async () => {
      mockActiveView('preview');
      sourceContent = 'no links here';
      mockParseLinks.mockReturnValue([]);

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(showNotice).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias).not.toHaveBeenCalled();
    });

    it('should match an external link by url for the url menu', async () => {
      mockActiveView('preview');
      sourceContent = '[click](https://example.com)';
      mockParseLinks.mockReturnValue([parsedLink({
        alias: 'click',
        endOffset: 28,
        isExternal: true,
        isWikilink: false,
        raw: '[click](https://example.com)',
        url: 'https://example.com'
      })]);
      mockEditApplies('[visit](https://example.com)');

      await clickExternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, 'https://example.com');

      expect(process).toHaveBeenCalledOnce();
      expect(getFirstLinkpathDest).not.toHaveBeenCalled();
    });

    it('should resolve the source view from the provided leaf when it is a markdown view', async () => {
      const leaf = createLeafWithMarkdownView('preview');
      const leafFile = castTo<MarkdownView>(leaf.view).file;
      const activeView = mockActiveView('preview');
      sourceContent = '[[target|old]]';
      mockParseLinks.mockReturnValue([parsedLink()]);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditApplies('[[target|new]]');

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }), leaf);

      expect(read.mock.calls[0]?.[0]).toBe(leafFile);
      expect(read.mock.calls[0]?.[0]).not.toBe(activeView.file);
      expect(process).toHaveBeenCalledOnce();
    });

    it('should rewrite using the raw text when the link offset shifted before saving', async () => {
      mockActiveView('preview');
      sourceContent = '[[target|old]]';
      // The link is still present at save time but no longer at the scanned offset.
      processContent = 'XX[[target|old]]';
      mockParseLinks.mockImplementation((text: string) => text.includes('[[target') ? [parsedLink()] : []);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditApplies('[[target|new]]');

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      const processFn = process.mock.calls[0]?.[1] as (data: string) => string;
      expect(processFn('XX[[target|old]]')).toBe('XX[[target|new]]');
      expect(showNotice).not.toHaveBeenCalled();
    });

    it('should show a notice when the matched line no longer exists at save time', async () => {
      mockActiveView('preview');
      sourceContent = 'a\nb\n[[target|old]]';
      processContent = 'a';
      mockParseLinks.mockImplementation((text: string) => text.includes('[[target') ? [parsedLink()] : []);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditApplies('[[target|new]]');

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(showNotice).toHaveBeenCalledOnce();
    });

    it('should show a notice when the link text is gone at save time', async () => {
      mockActiveView('preview');
      sourceContent = '[[target|old]]';
      processContent = 'completely different';
      mockParseLinks.mockImplementation((text: string) => text.includes('[[target') ? [parsedLink()] : []);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditApplies('[[target|new]]');

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(showNotice).toHaveBeenCalledOnce();
    });

    it('should skip external links when resolving an internal target', async () => {
      mockActiveView('preview');
      sourceContent = '[ext](https://x.com)\n[[target|old]]';
      mockParseLinks.mockImplementation((text: string) => {
        if (text.startsWith('[ext')) {
          return [parsedLink({
            alias: 'ext',
            isExternal: true,
            isWikilink: false,
            raw: '[ext](https://x.com)',
            url: 'https://x.com'
          })];
        }
        if (text.includes('[[target')) {
          return [parsedLink()];
        }
        return [];
      });
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditApplies('[[target|new]]');

      await clickInternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, strictProxy<TFile>({ path: 'target.md' }));

      expect(mockEditParsedLinkAlias).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias.mock.calls[0]?.[0].parsedLink.url).toBe('target');
    });

    it('should not match any link when neither a target nor a url is provided', async () => {
      /*
       * An unknown link target is never produced by a menu — it comes from the click path in Live Preview,
       * where the clicked element carries no href at all — so the shared resolver is driven directly. With
       * no target AND no click position (Reading view has no editor to ask), there is no identity left to
       * resolve, and reporting the failure is correct.
       */
      const view = mockActiveView('preview');
      sourceContent = '[[target|old]]';
      mockParseLinks.mockImplementation((text: string) => text.includes('[[target') ? [parsedLink()] : []);

      await resolveAndEditLink({
        app,
        editParsedLink: editParsedLinkAlias,
        linkTarget: {},
        showCouldNotLocateNotice: castTo<(this: void) => void>(showNotice),
        view
      });

      expect(showNotice).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias).not.toHaveBeenCalled();
    });

    it('should edit the link at the click position when the clicked link carries no target', async () => {
      // The Live Preview click: no href to read a target from, so the position is the whole identity.
      const replaceRange = vi.fn<Editor['replaceRange']>();
      const view = mockActiveView(
        'source',
        createMockEditor({
          line: '[[target|old]]',
          replaceRange
        })
      );
      mockParseLinks.mockReturnValue([parsedLink()]);
      mockEditApplies('[[target|new]]');

      await resolveAndEditLink({
        app,
        editParsedLink: editParsedLinkAlias,
        linkTarget: {},
        showCouldNotLocateNotice: castTo<(this: void) => void>(showNotice),
        sourcePosition: { ch: 5, line: 0 },
        view
      });

      expect(replaceRange).toHaveBeenCalledWith('[[target|new]]', { ch: 0, line: 0 }, { ch: 14, line: 0 });
      expect(read).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();
    });

    it('should pick the clicked occurrence when the line links to the same note twice', async () => {
      // What the caret cannot do: both links match the target, so only the position tells them apart.
      const replaceRange = vi.fn<Editor['replaceRange']>();
      const view = mockActiveView(
        'source',
        createMockEditor({
          line: '[[target|a]] [[target|b]]',
          replaceRange
        })
      );
      mockParseLinks.mockReturnValue([
        parsedLink({
          endOffset: 12,
          raw: '[[target|a]]'
        }),
        parsedLink({
          endOffset: 25,
          raw: '[[target|b]]',
          startOffset: 13
        })
      ]);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditApplies('[[target|second]]');

      await resolveAndEditLink({
        app,
        editParsedLink: editParsedLinkAlias,
        linkTarget: { target: strictProxy<TFile>({ path: 'target.md' }) },
        showCouldNotLocateNotice: castTo<(this: void) => void>(showNotice),
        sourcePosition: { ch: 20, line: 0 },
        view
      });

      expect(replaceRange).toHaveBeenCalledWith('[[target|second]]', { ch: 13, line: 0 }, { ch: 25, line: 0 });
    });

    it('should fall back to the source scan when no link sits at the click position', async () => {
      const view = mockActiveView('source', createMockEditor({ line: 'no link here' }));
      sourceContent = 'no link here';
      mockParseLinks.mockReturnValue([]);

      await resolveAndEditLink({
        app,
        editParsedLink: editParsedLinkAlias,
        linkTarget: {},
        showCouldNotLocateNotice: castTo<(this: void) => void>(showNotice),
        sourcePosition: { ch: 3, line: 0 },
        view
      });

      expect(read).toHaveBeenCalledOnce();
      expect(showNotice).toHaveBeenCalledOnce();
    });

    it('should fall back to the source scan when the link at the click position points elsewhere', async () => {
      /*
       * A known target always wins over the position — the case that makes this matter is a link inside an
       * `![[embed]]`-rendered block in Live Preview, where the two name different links.
       */
      const view = mockActiveView('source', createMockEditor({ line: '[[other|old]]' }));
      sourceContent = '[[other|old]]\n[[target|old]]';
      mockParseLinks.mockImplementation((text: string) => text.includes('[[target') ? [parsedLink()] : [parsedLink({ raw: '[[other|old]]', url: 'other' })]);
      getFirstLinkpathDest.mockImplementation((linkpath: string) => linkpath === 'target' ? strictProxy<TFile>({ path: 'target.md' }) : null);
      mockEditApplies('[[target|new]]');

      await resolveAndEditLink({
        app,
        editParsedLink: editParsedLinkAlias,
        linkTarget: { target: strictProxy<TFile>({ path: 'target.md' }) },
        showCouldNotLocateNotice: castTo<(this: void) => void>(showNotice),
        sourcePosition: { ch: 5, line: 0 },
        view
      });

      expect(read).toHaveBeenCalledOnce();
      expect(process).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias).toHaveBeenCalledOnce();
    });

    it('should edit an external link at the click position', async () => {
      const replaceRange = vi.fn<Editor['replaceRange']>();
      const view = mockActiveView(
        'source',
        createMockEditor({
          line: '[click](https://example.com)',
          replaceRange
        })
      );
      mockParseLinks.mockReturnValue([parsedLink({
        alias: 'click',
        endOffset: 28,
        isExternal: true,
        isWikilink: false,
        raw: '[click](https://example.com)',
        url: 'https://example.com'
      })]);
      mockEditApplies('[new](https://example.com)');

      await resolveAndEditLink({
        app,
        editParsedLink: editParsedLinkAlias,
        linkTarget: { externalUrl: 'https://example.com' },
        showCouldNotLocateNotice: castTo<(this: void) => void>(showNotice),
        sourcePosition: { ch: 3, line: 0 },
        view
      });

      expect(replaceRange).toHaveBeenCalledWith('[new](https://example.com)', { ch: 0, line: 0 }, { ch: 28, line: 0 });
    });

    it('should edit an unresolved link at the click position by its link path', async () => {
      const replaceRange = vi.fn<Editor['replaceRange']>();
      const view = mockActiveView(
        'source',
        createMockEditor({
          line: '[[missing|old]]',
          replaceRange
        })
      );
      mockParseLinks.mockReturnValue([parsedLink({
        endOffset: 15,
        raw: '[[missing|old]]',
        url: 'missing'
      })]);
      mockEditApplies('[[missing|new]]');

      await resolveAndEditLink({
        app,
        editParsedLink: editParsedLinkAlias,
        linkTarget: { linkPath: 'missing' },
        showCouldNotLocateNotice: castTo<(this: void) => void>(showNotice),
        sourcePosition: { ch: 5, line: 0 },
        view
      });

      // `getFirstLinkpathDest` is never consulted: there is no file to resolve to.
      expect(getFirstLinkpathDest).not.toHaveBeenCalled();
      expect(replaceRange).toHaveBeenCalledWith('[[missing|new]]', { ch: 0, line: 0 }, { ch: 15, line: 0 });
    });

    it('should edit an unresolved link in reading mode by scanning for its link path', async () => {
      // Reading view has no editor, so an unresolved link is only reachable through the path scan.
      const view = mockActiveView('preview');
      sourceContent = 'intro\n[[missing|old]]';
      const missingLink = parsedLink({
        endOffset: 15,
        raw: '[[missing|old]]',
        url: 'missing'
      });
      mockParseLinks.mockImplementation((text: string) => text.includes('[[missing') ? [missingLink] : []);
      mockEditApplies('[[missing|new]]');

      await resolveAndEditLink({
        app,
        editParsedLink: editParsedLinkAlias,
        linkTarget: { linkPath: 'missing' },
        showCouldNotLocateNotice: castTo<(this: void) => void>(showNotice),
        view
      });

      expect(process).toHaveBeenCalledOnce();
      const processFn = process.mock.calls[0]?.[1] as (data: string) => string;
      expect(processFn('intro\n[[missing|old]]')).toBe('intro\n[[missing|new]]');
      expect(showNotice).not.toHaveBeenCalled();
    });

    it('should match an unresolved link whose rendered path kept its percent-escapes', async () => {
      const view = mockActiveView('preview');
      sourceContent = '[old](my%20note)';
      mockParseLinks.mockReturnValue([parsedLink({
        alias: 'old',
        encodedUrl: 'my%20note',
        endOffset: 16,
        isWikilink: false,
        raw: '[old](my%20note)',
        url: 'my note'
      })]);
      mockEditApplies('[new](my%20note)');

      await resolveAndEditLink({
        app,
        editParsedLink: editParsedLinkAlias,
        // The decoded form does not match, so the encoded one has to.
        linkTarget: { linkPath: 'my%20note' },
        showCouldNotLocateNotice: castTo<(this: void) => void>(showNotice),
        view
      });

      expect(mockEditParsedLinkAlias).toHaveBeenCalledOnce();
      expect(showNotice).not.toHaveBeenCalled();
    });

    it('should not match an unresolved link whose path differs', async () => {
      const view = mockActiveView('preview');
      sourceContent = '[[target|old]]';
      mockParseLinks.mockImplementation((text: string) => text.includes('[[target') ? [parsedLink()] : []);

      await resolveAndEditLink({
        app,
        editParsedLink: editParsedLinkAlias,
        linkTarget: { linkPath: 'other' },
        showCouldNotLocateNotice: castTo<(this: void) => void>(showNotice),
        view
      });

      expect(showNotice).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias).not.toHaveBeenCalled();
    });

    it('should match an external link by its encoded url and skip internal links', async () => {
      mockActiveView('preview');
      sourceContent = '[[internal]]\n[space](<https://ex.com/a b>)';
      mockParseLinks.mockImplementation((text: string) => {
        if (text.startsWith('[[internal')) {
          return [parsedLink({ url: 'internal' })];
        }
        if (text.startsWith('[space')) {
          return [parsedLink({
            alias: 'space',
            encodedUrl: 'https://ex.com/a%20b',
            endOffset: 30,
            isExternal: true,
            isWikilink: false,
            raw: '[space](<https://ex.com/a b>)',
            url: 'https://ex.com/a b'
          })];
        }
        return [];
      });
      mockEditApplies('[new](<https://ex.com/a b>)');

      await clickExternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, 'https://ex.com/a%20b');

      expect(mockEditParsedLinkAlias).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias.mock.calls[0]?.[0].parsedLink.url).toBe('https://ex.com/a b');
    });
  });

  describe('menu item click', () => {
    it('should run the alias editor when the edit-link-alias menu item is clicked', async () => {
      mockExternalLinkInSource();

      await clickExternalLinkMenuItem(EDIT_ALIAS_ITEM_INDEX, 'https://example.com');

      expect(mockEditParsedLinkAlias).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkUrlAndAlias).not.toHaveBeenCalled();
    });

    it('should run the url-and-alias editor when the edit-url-and-alias menu item is clicked', async () => {
      mockExternalLinkInSource();

      await clickExternalLinkMenuItem(EDIT_URL_AND_ALIAS_ITEM_INDEX, 'https://example.com');

      expect(mockEditParsedLinkUrlAndAlias).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias).not.toHaveBeenCalled();
    });

    it('should anchor the editor at the gesture that opened the menu', async () => {
      await clickExternalLinkMenuItem(EDIT_URL_AND_ALIAS_ITEM_INDEX, 'https://example.com');

      expect(mockCreateEditParsedLinkUrlAndAliasInPopover).toHaveBeenCalledWith(lastPointerAnchor);
    });

    it('should fall back to the middle of the window when no pointer gesture has happened', async () => {
      lastPointerAnchor = null;

      await clickExternalLinkMenuItem(EDIT_URL_AND_ALIAS_ITEM_INDEX, 'https://example.com');

      expect(mockCreateEditParsedLinkUrlAndAliasInPopover).toHaveBeenCalledWith({
        bottom: window.innerHeight / 2,
        doc: document,
        left: window.innerWidth / 2
      });
    });
  });
});
