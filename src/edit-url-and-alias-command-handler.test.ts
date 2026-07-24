import type {
  App,
  Editor,
  EditorPosition,
  MarkdownFileInfo
} from 'obsidian';

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
import { editParsedLinkUrlAndAlias } from './edit-link.ts';
import { EditUrlAndAliasCommandHandler } from './edit-url-and-alias-command-handler.ts';

vi.mock('./edit-in-editor.ts', () => ({ editLinkAtEditorCursor: vi.fn() }));

const mockEditLinkAtEditorCursor = vi.mocked(editLinkAtEditorCursor);

interface CreateMockEditorParams {
  readonly clickableToken?: MockClickableToken | null;
  readonly cursor?: EditorPosition;
}

interface EditorCommandHandlerProtected {
  canExecuteEditor(editor: Editor, ctx: MarkdownFileInfo): boolean;
}

interface MockClickableToken {
  type: string;
}

class TestableEditUrlAndAliasCommandHandler extends EditUrlAndAliasCommandHandler {
  public testCanExecuteEditor(editor: Editor, ctx: MarkdownFileInfo): boolean {
    return this.canExecuteEditor(editor, ctx);
  }

  public async testExecuteEditor(editor: Editor): Promise<void> {
    return this.executeEditor(editor);
  }

  public testShouldAddToEditorMenu(editor: Editor, ctx: MarkdownFileInfo): boolean {
    return this.shouldAddToEditorMenu(editor, ctx);
  }
}

function createMockApp(): App {
  return strictProxy<App>({});
}

function createMockCtx(): MarkdownFileInfo {
  return strictProxy<MarkdownFileInfo>({});
}

function createMockEditor(params: CreateMockEditorParams = {}): Editor {
  const {
    clickableToken = null,
    cursor = { ch: 0, line: 0 }
  } = params;

  return strictProxy<Editor>({
    getClickableTokenAt: vi.fn().mockReturnValue(clickableToken),
    getCursor: vi.fn().mockReturnValue(cursor)
  });
}

describe('EditUrlAndAliasCommandHandler', () => {
  let app: App;
  let handler: TestableEditUrlAndAliasCommandHandler;

  beforeEach(() => {
    app = createMockApp();
    handler = new TestableEditUrlAndAliasCommandHandler(app);
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
      expect(handler.testCanExecuteEditor(editor, createMockCtx())).toBe(false);
    });

    it('should return false when no clickable token at cursor', () => {
      const editor = createMockEditor({ clickableToken: null });
      expect(handler.testCanExecuteEditor(editor, createMockCtx())).toBe(false);
    });

    it('should return false when clickable token type is not a link', () => {
      const editor = createMockEditor({ clickableToken: { type: 'tag' } });
      expect(handler.testCanExecuteEditor(editor, createMockCtx())).toBe(false);
    });

    it('should return true when clickable token is internal-link', () => {
      const editor = createMockEditor({ clickableToken: { type: 'internal-link' } });
      expect(handler.testCanExecuteEditor(editor, createMockCtx())).toBe(true);
    });

    it('should return true when clickable token is external-link', () => {
      const editor = createMockEditor({ clickableToken: { type: 'external-link' } });
      expect(handler.testCanExecuteEditor(editor, createMockCtx())).toBe(true);
    });
  });

  describe('executeEditor', () => {
    it('should delegate to editLinkAtEditorCursor with the url-and-alias editor', async () => {
      const editor = createMockEditor();

      await handler.testExecuteEditor(editor);

      expect(mockEditLinkAtEditorCursor).toHaveBeenCalledWith(app, editor, editParsedLinkUrlAndAlias);
    });
  });

  describe('shouldAddToEditorMenu', () => {
    it('should always return true', () => {
      expect(handler.testShouldAddToEditorMenu(createMockEditor(), createMockCtx())).toBe(true);
    });
  });
});
