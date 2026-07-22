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
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

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

import type { LinkTarget } from './link-menu-handler.ts';

import { editParsedLinkAlias } from './edit-link.ts';
import { LinkMenuHandler } from './link-menu-handler.ts';

vi.mock('./edit-link.ts', () => ({ editParsedLinkAlias: vi.fn() }));
vi.mock('obsidian-dev-utils/obsidian/parse-link', () => ({ parseLinks: vi.fn() }));
vi.mock('obsidian-dev-utils/obsidian/modals/select-item', () => ({ selectItem: vi.fn() }));
vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({ isFile: vi.fn() }));

const mockEditParsedLinkAlias = vi.mocked(editParsedLinkAlias);
const mockParseLinks = vi.mocked(parseLinks);
const mockSelectItem = vi.mocked(selectItem);
const mockIsFile = vi.mocked(isFile);

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

class TestableLinkMenuHandler extends LinkMenuHandler {
  public testHandleFileMenu(menu: Menu, file: TAbstractFile, source: string): void {
    this.handleFileMenu(menu, file, source);
  }

  public testHandleUrlMenu(menu: Menu, url: string): void {
    this.handleUrlMenu(menu, url);
  }

  public async testResolveAndEdit(linkTarget: LinkTarget, leaf?: WorkspaceLeaf): Promise<void> {
    return this.resolveAndEdit(linkTarget, leaf);
  }
}

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
let handler: TestableLinkMenuHandler;

function createHandler(): TestableLinkMenuHandler {
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
      getActiveViewOfType,
      on
    }
  });

  const plugin = castTo<Plugin>({ registerEvent });
  const pluginNoticeComponent = castTo<PluginNoticeComponent>({ showNotice });

  return new TestableLinkMenuHandler({
    app,
    plugin,
    pluginNoticeComponent
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

function mockActiveView(mode: 'preview' | 'source', editor?: Editor): void {
  const view = strictProxy<MarkdownView>({
    editor: editor ?? createMockEditor(),
    file: strictProxy<TFile>({ path: 'source.md' }),
    getMode: () => mode
  });
  getActiveViewOfType.mockReturnValue(view);
}

function mockEditApplies(newRawLink: string): void {
  mockEditParsedLinkAlias.mockImplementation(async (params) => {
    await params.applyReplacement(newRawLink);
  });
}

beforeEach(() => {
  handler = createHandler();
  Platform.isDesktop = true;
  mockIsFile.mockReset().mockReturnValue(true);
  mockParseLinks.mockReset().mockReturnValue([]);
  mockSelectItem.mockReset();
  mockEditParsedLinkAlias.mockReset().mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LinkMenuHandler', () => {
  describe('register', () => {
    it('should register file-menu and url-menu event handlers', () => {
      handler.register();

      expect(on).toHaveBeenCalledWith('file-menu', expect.any(Function));
      expect(on).toHaveBeenCalledWith('url-menu', expect.any(Function));
      expect(registerEvent).toHaveBeenCalledTimes(2);
    });

    it('should route the file-menu and url-menu events to the menu handlers', () => {
      handler.register();

      const fileMenuCallback = on.mock.calls.find((call) => call[0] === 'file-menu')?.[1] as (menu: Menu, file: TAbstractFile, source: string) => void;
      const urlMenuCallback = on.mock.calls.find((call) => call[0] === 'url-menu')?.[1] as (menu: Menu, url: string) => void;

      const fileMenu = createMockMenu();
      fileMenuCallback(fileMenu.menu, strictProxy<TAbstractFile>({}), 'link-context-menu');
      expect(fileMenu.items).toHaveLength(1);

      const urlMenu = createMockMenu();
      urlMenuCallback(urlMenu.menu, 'https://example.com');
      expect(urlMenu.items).toHaveLength(1);
    });
  });

  describe('handleFileMenu', () => {
    it('should not add an item when the source is not link-context-menu', () => {
      const { items, menu } = createMockMenu();
      handler.testHandleFileMenu(menu, strictProxy<TAbstractFile>({}), 'file-explorer-context-menu');
      expect(items).toHaveLength(0);
    });

    it('should not add an item when the target is not a file', () => {
      mockIsFile.mockReturnValue(false);
      const { items, menu } = createMockMenu();
      handler.testHandleFileMenu(menu, strictProxy<TAbstractFile>({}), 'link-context-menu');
      expect(items).toHaveLength(0);
    });

    it('should add the edit-link-alias item for an internal link context menu', () => {
      const { items, menu } = createMockMenu();
      handler.testHandleFileMenu(menu, strictProxy<TAbstractFile>({}), 'link-context-menu');

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        icon: 'text-cursor-input',
        section: 'action',
        title: 'Edit link alias'
      });
    });
  });

  describe('handleUrlMenu', () => {
    it('should add the edit-link-alias item for a url menu', () => {
      const { items, menu } = createMockMenu();
      handler.testHandleUrlMenu(menu, 'https://example.com');

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ title: 'Edit link alias' });
    });
  });

  describe('editor-menu de-duplication', () => {
    it('should not add a file-menu item on desktop when the editor already shows it for an internal link', () => {
      mockActiveView('source', createMockEditor({ clickableTokenType: 'internal-link' }));
      const { items, menu } = createMockMenu();
      handler.testHandleFileMenu(menu, strictProxy<TAbstractFile>({}), 'link-context-menu');
      expect(items).toHaveLength(0);
    });

    it('should not add a url-menu item on desktop when the editor already shows it for an external link', () => {
      mockActiveView('source', createMockEditor({ clickableTokenType: 'external-link' }));
      const { items, menu } = createMockMenu();
      handler.testHandleUrlMenu(menu, 'https://example.com');
      expect(items).toHaveLength(0);
    });

    it('should add the item on desktop when the editor cursor is on a non-link token', () => {
      mockActiveView('source', createMockEditor({ clickableTokenType: 'tag' }));
      const { items, menu } = createMockMenu();
      handler.testHandleFileMenu(menu, strictProxy<TAbstractFile>({}), 'link-context-menu');
      expect(items).toHaveLength(1);
    });

    it('should add the item on desktop when there is no clickable token at the cursor', () => {
      mockActiveView('source', createMockEditor({ clickableTokenType: null }));
      const { items, menu } = createMockMenu();
      handler.testHandleFileMenu(menu, strictProxy<TAbstractFile>({}), 'link-context-menu');
      expect(items).toHaveLength(1);
    });

    it('should add the item on desktop in reading mode', () => {
      mockActiveView('preview', createMockEditor({ clickableTokenType: 'internal-link' }));
      const { items, menu } = createMockMenu();
      handler.testHandleFileMenu(menu, strictProxy<TAbstractFile>({}), 'link-context-menu');
      expect(items).toHaveLength(1);
    });

    it('should add the item on mobile even in an editing view with the cursor on a link', () => {
      Platform.isDesktop = false;
      mockActiveView('source', createMockEditor({ clickableTokenType: 'internal-link' }));
      const { items, menu } = createMockMenu();
      handler.testHandleFileMenu(menu, strictProxy<TAbstractFile>({}), 'link-context-menu');
      expect(items).toHaveLength(1);
    });
  });

  describe('resolveAndEdit', () => {
    it('should show a notice when there is no active markdown view', async () => {
      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

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

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

      expect(mockEditParsedLinkAlias).toHaveBeenCalledOnce();
      expect(replaceRange).toHaveBeenCalledWith('[[target|new]]', { ch: 0, line: 0 }, { ch: 14, line: 0 });
      expect(read).not.toHaveBeenCalled();
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

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

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

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

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

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

      expect(mockSelectItem).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias).toHaveBeenCalledWith(expect.objectContaining({ parsedLink: second }));
    });

    it('should not edit when the multi-match picker is cancelled', async () => {
      mockActiveView('preview');
      sourceContent = '[[target|a]]\n[[target|b]]';
      mockParseLinks.mockImplementation((text: string) => text.startsWith('[[target') ? [parsedLink({ raw: text })] : []);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockSelectItem.mockResolvedValue(null);

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

      expect(mockEditParsedLinkAlias).not.toHaveBeenCalled();
    });

    it('should show a notice when no matching link is found in the source', async () => {
      mockActiveView('preview');
      sourceContent = 'no links here';
      mockParseLinks.mockReturnValue([]);

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

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

      await handler.testResolveAndEdit({ externalUrl: 'https://example.com' });

      expect(process).toHaveBeenCalledOnce();
      expect(getFirstLinkpathDest).not.toHaveBeenCalled();
    });

    it('should resolve the source view from the provided leaf when it is a markdown view', async () => {
      const leaf = createLeafWithMarkdownView('preview');
      sourceContent = '[[target|old]]';
      mockParseLinks.mockReturnValue([parsedLink()]);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditApplies('[[target|new]]');

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) }, leaf);

      expect(getActiveViewOfType).not.toHaveBeenCalled();
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

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

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

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

      expect(showNotice).toHaveBeenCalledOnce();
    });

    it('should show a notice when the link text is gone at save time', async () => {
      mockActiveView('preview');
      sourceContent = '[[target|old]]';
      processContent = 'completely different';
      mockParseLinks.mockImplementation((text: string) => text.includes('[[target') ? [parsedLink()] : []);
      getFirstLinkpathDest.mockReturnValue(strictProxy<TFile>({ path: 'target.md' }));
      mockEditApplies('[[target|new]]');

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

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

      await handler.testResolveAndEdit({ target: strictProxy<TFile>({ path: 'target.md' }) });

      expect(mockEditParsedLinkAlias).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias.mock.calls[0]?.[0].parsedLink.url).toBe('target');
    });

    it('should not match any link when neither a target nor a url is provided', async () => {
      mockActiveView('preview');
      sourceContent = '[[target|old]]';
      mockParseLinks.mockImplementation((text: string) => text.includes('[[target') ? [parsedLink()] : []);

      await handler.testResolveAndEdit({});

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

      await handler.testResolveAndEdit({ externalUrl: 'https://ex.com/a%20b' });

      expect(mockEditParsedLinkAlias).toHaveBeenCalledOnce();
      expect(mockEditParsedLinkAlias.mock.calls[0]?.[0].parsedLink.url).toBe('https://ex.com/a b');
    });
  });

  describe('menu item click', () => {
    it('should invoke resolution when the menu item is clicked', async () => {
      const { items, menu } = createMockMenu();
      handler.testHandleUrlMenu(menu, 'https://example.com');
      items[0]?.onClick?.();
      await waitForAllAsyncOperations();

      expect(getActiveViewOfType).toHaveBeenCalled();
    });
  });
});
