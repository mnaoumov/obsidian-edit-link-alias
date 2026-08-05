import type {
  App,
  Editor,
  EditorPosition,
  MarkdownFileInfo
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { MarkdownView } from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { EditorCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/editor-command-handler';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { editLinkAtEditorCursor } from './edit-in-editor.ts';
import { createEditParsedLinkUrlAndAliasInPopover } from './edit-link.ts';
import { EditUrlAndAliasCommandHandler } from './edit-url-and-alias-command-handler.ts';

// Only the edit itself is stubbed; the real `checkIsCursorOnEditableLink` decides availability.
vi.mock('./edit-in-editor.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./edit-in-editor.ts')>();
  return {
    ...original,
    editLinkAtEditorCursor: vi.fn()
  };
});
vi.mock('./edit-link.ts', () => ({ createEditParsedLinkUrlAndAliasInPopover: vi.fn() }));

const mockEditLinkAtEditorCursor = vi.mocked(editLinkAtEditorCursor);
const mockCreateEditParsedLinkUrlAndAliasInPopover = vi.mocked(createEditParsedLinkUrlAndAliasInPopover);

interface CreateMockEditorParams {
  readonly clickableToken?: MockClickableToken | null;
  readonly cursor?: EditorPosition;
  readonly line?: string;
}

interface EditorCommandHandlerProtected {
  canExecuteEditor(editor: Editor, context: MarkdownFileInfo): boolean;
}

interface MockClickableToken {
  type: string;
}

class TestableEditUrlAndAliasCommandHandler extends EditUrlAndAliasCommandHandler {
  public testCanExecuteEditor(editor: Editor, context: MarkdownFileInfo): boolean {
    return this.canExecuteEditor(editor, context);
  }

  public async testExecuteEditor(editor: Editor, context: MarkdownFileInfo): Promise<void> {
    return this.executeEditor(editor, context);
  }

  public testShouldAddToEditorMenu(editor: Editor, context: MarkdownFileInfo): boolean {
    return this.shouldAddToEditorMenu(editor, context);
  }
}

function createMockApp(): App {
  return strictProxy<App>({});
}

function createMockContext(): MarkdownFileInfo {
  return strictProxy<MarkdownFileInfo>({ file: null });
}

function createMockEditor(params: CreateMockEditorParams = {}): Editor {
  const {
    clickableToken = null,
    cursor = { ch: 0, line: 0 },
    line = ''
  } = params;

  return strictProxy<Editor>({
    getClickableTokenAt: vi.fn().mockReturnValue(clickableToken),
    getCursor: vi.fn().mockReturnValue(cursor),
    getDoc: vi.fn().mockReturnValue(strictProxy({ getLine: vi.fn().mockReturnValue(line) })),
    getValue: vi.fn().mockReturnValue(line),
    posToOffset: vi.fn().mockReturnValue(0)
  });
}

function createMockPluginNoticeComponent(): PluginNoticeComponent {
  return strictProxy<PluginNoticeComponent>({ showNotice: vi.fn() });
}

describe('EditUrlAndAliasCommandHandler', () => {
  let app: App;
  let handler: TestableEditUrlAndAliasCommandHandler;

  beforeEach(() => {
    app = createMockApp();
    handler = new TestableEditUrlAndAliasCommandHandler({
      app,
      pluginNoticeComponent: createMockPluginNoticeComponent()
    });
    mockEditLinkAtEditorCursor.mockReset().mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildCommand', () => {
    it('should create command with correct id', () => {
      expect(handler.buildCommand().id).toBe('edit-link');
    });

    it('should create command with correct name', () => {
      expect(handler.buildCommand().name).toBe('Edit link (URL and alias)');
    });

    it('should create command with correct icon', () => {
      expect(handler.buildCommand().icon).toBe('link');
    });
  });

  describe('canExecuteEditor', () => {
    it('should return false when super.canExecuteEditor returns false', () => {
      vi.spyOn(castTo<EditorCommandHandlerProtected>(EditorCommandHandler.prototype), 'canExecuteEditor').mockReturnValue(false);

      const editor = createMockEditor({ clickableToken: { type: 'internal-link' } });
      expect(handler.testCanExecuteEditor(editor, createMockContext())).toBe(false);
    });

    it('should return false when no clickable token at cursor', () => {
      const editor = createMockEditor({ clickableToken: null });
      expect(handler.testCanExecuteEditor(editor, createMockContext())).toBe(false);
    });

    it('should return false when clickable token type is not a link', () => {
      const editor = createMockEditor({ clickableToken: { type: 'tag' } });
      expect(handler.testCanExecuteEditor(editor, createMockContext())).toBe(false);
    });

    it('should return true when clickable token is internal-link', () => {
      const editor = createMockEditor({ clickableToken: { type: 'internal-link' } });
      expect(handler.testCanExecuteEditor(editor, createMockContext())).toBe(true);
    });

    it('should return true when clickable token is external-link', () => {
      const editor = createMockEditor({ clickableToken: { type: 'external-link' } });
      expect(handler.testCanExecuteEditor(editor, createMockContext())).toBe(true);
    });
  });

  describe('executeEditor', () => {
    it('should delegate to editLinkAtEditorCursor with the popover editor anchored at the caret', async () => {
      const editor = createMockEditor();
      const editParsedLink = vi.fn();
      mockCreateEditParsedLinkUrlAndAliasInPopover.mockReturnValue(editParsedLink);

      await handler.testExecuteEditor(editor, createMockContext());

      // Invoked from the keyboard, so the anchor comes from the caret rather than a pointer.
      expect(mockCreateEditParsedLinkUrlAndAliasInPopover).toHaveBeenCalledWith(expect.objectContaining({ doc: document }));
      expect(mockEditLinkAtEditorCursor).toHaveBeenCalledOnce();
      const params = mockEditLinkAtEditorCursor.mock.calls[0]?.[0];
      expect(params?.app).toBe(app);
      expect(params?.editor).toBe(editor);
      expect(params?.editParsedLink).toBe(editParsedLink);
    });

    it('should surface a notice when the link cannot be located', async () => {
      const showNotice = vi.fn();
      const noticeHandler = new TestableEditUrlAndAliasCommandHandler({
        app,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice })
      });
      mockCreateEditParsedLinkUrlAndAliasInPopover.mockReturnValue(vi.fn());
      mockEditLinkAtEditorCursor.mockImplementation((params) => {
        params.showCouldNotLocateNotice();
        return noopAsync();
      });

      await noticeHandler.testExecuteEditor(createMockEditor(), createMockContext());

      expect(showNotice).toHaveBeenCalledWith('Could not locate the link in the source note.');
    });

    it('should anchor in the view own document, so a pop-out window gets its own popover', async () => {
      const view = castTo<MarkdownFileInfo>(Object.create(MarkdownView.prototype));
      Object.assign(view, { containerEl: document.body.createDiv() });
      mockCreateEditParsedLinkUrlAndAliasInPopover.mockReturnValue(vi.fn());

      await handler.testExecuteEditor(createMockEditor(), view);

      expect(mockCreateEditParsedLinkUrlAndAliasInPopover).toHaveBeenCalledWith(expect.objectContaining({ doc: document }));
    });
  });

  describe('shouldAddToEditorMenu', () => {
    it('should always return true', () => {
      expect(handler.testShouldAddToEditorMenu(createMockEditor(), createMockContext())).toBe(true);
    });
  });
});
