import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type {
  App,
  Editor,
  EditorPosition,
  MarkdownFileInfo
} from 'obsidian';

import { EditorCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/editor-command-handler';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { MarkdownView } from 'obsidian';
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
  readonly content?: string;
  readonly cursor?: EditorPosition;
}

interface EditorCommandHandlerProtected {
  readonly canExecuteEditor: (editor: Editor, context: MarkdownFileInfo) => boolean;
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
    content = '',
    cursor = { ch: 0, line: 0 }
  } = params;

  const lines = content.split('\n');

  return strictProxy<Editor>({
    getCursor: vi.fn().mockReturnValue(cursor),
    getLine: (lineIndex: number) => lines[lineIndex] ?? '',
    lineCount: () => lines.length
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

      const editor = createMockEditor({ content: '[[target]]' });
      expect(handler.testCanExecuteEditor(editor, createMockContext())).toBe(false);
    });

    it('should return false when the cursor is not on a link', () => {
      const editor = createMockEditor({ content: 'some #tag text', cursor: { ch: 6, line: 0 } });
      expect(handler.testCanExecuteEditor(editor, createMockContext())).toBe(false);
    });

    it('should return true when the cursor is right before a markdown link', () => {
      const editor = createMockEditor({ content: '[alias](https://example.com)', cursor: { ch: 0, line: 0 } });
      expect(handler.testCanExecuteEditor(editor, createMockContext())).toBe(true);
    });

    it('should return true when the cursor is inside an internal link', () => {
      const editor = createMockEditor({ content: '[[target|alias]]', cursor: { ch: 5, line: 0 } });
      expect(handler.testCanExecuteEditor(editor, createMockContext())).toBe(true);
    });

    it('should return true when the cursor is right after an external link', () => {
      const editor = createMockEditor({ content: '[alias](https://example.com)', cursor: { ch: 28, line: 0 } });
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
