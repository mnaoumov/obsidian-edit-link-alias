import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type {
  Editor,
  EditorPosition,
  MarkdownFileInfo
} from 'obsidian';

import { EditorCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/editor-command-handler';
import { generateRawMarkdownLink } from '@mnaoumov/obsidian-lib/link';
import { prompt } from '@mnaoumov/obsidian-lib/modals/prompt';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { EditCommandHandler } from './edit-command-handler.ts';

vi.mock('@mnaoumov/obsidian-lib/link', () => ({
  generateRawMarkdownLink: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/modals/prompt', () => ({
  prompt: vi.fn()
}));

const mockGenerateRawMarkdownLink = vi.mocked(generateRawMarkdownLink);
const mockPrompt = vi.mocked(prompt);

interface CreateMockEditorParams {
  readonly content?: string;
  readonly cursor?: EditorPosition;
  readonly replaceRange?: Editor['replaceRange'];
}

interface EditorCommandHandlerProtected {
  readonly canExecuteEditor: (editor: Editor, context: MarkdownFileInfo) => boolean;
}

class TestableEditCommandHandler extends EditCommandHandler {
  public testCanExecuteEditor(editor: Editor, context: MarkdownFileInfo): boolean {
    return this.canExecuteEditor(editor, context);
  }

  public async testExecuteEditor(editor: Editor, context: MarkdownFileInfo = createMockContext()): Promise<void> {
    return this.executeEditor(editor, context);
  }

  public testShouldAddToEditorMenu(editor: Editor, context: MarkdownFileInfo): boolean {
    return this.shouldAddToEditorMenu(editor, context);
  }
}

function createMockApp(): import('obsidian').App {
  return strictProxy<import('obsidian').App>({});
}

function createMockContext(): MarkdownFileInfo {
  return strictProxy<MarkdownFileInfo>({ file: null });
}

function createMockEditor(params: CreateMockEditorParams = {}): Editor {
  const {
    content = '',
    cursor = { ch: 0, line: 0 },
    replaceRange = vi.fn<Editor['replaceRange']>()
  } = params;

  const lines = content.split('\n');

  return strictProxy<Editor>({
    getCursor: vi.fn().mockReturnValue(cursor),
    getLine: (lineIndex: number) => lines[lineIndex] ?? '',
    lineCount: () => lines.length,
    replaceRange
  });
}

function createMockPluginNoticeComponent(): PluginNoticeComponent {
  return strictProxy<PluginNoticeComponent>({ showNotice: vi.fn() });
}

describe('EditCommandHandler', () => {
  let handler: TestableEditCommandHandler;

  beforeEach(() => {
    handler = new TestableEditCommandHandler({
      app: createMockApp(),
      pluginNoticeComponent: createMockPluginNoticeComponent()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildCommand', () => {
    it('should create command with correct id', () => {
      const command = handler.buildCommand();
      expect(command.id).toBe('edit-link-alias');
    });

    it('should create command with correct name', () => {
      const command = handler.buildCommand();
      expect(command.name).toBe('Edit');
    });

    it('should create command with correct icon', () => {
      const command = handler.buildCommand();
      expect(command.icon).toBe('text-cursor-input');
    });
  });

  describe('canExecuteEditor', () => {
    it('should return false when super.canExecuteEditor returns false', () => {
      vi.spyOn(castTo<EditorCommandHandlerProtected>(EditorCommandHandler.prototype), 'canExecuteEditor').mockReturnValue(false);

      const editor = createMockEditor({ content: '[[target]]' });
      const isResult = handler.testCanExecuteEditor(editor, createMockContext());

      expect(isResult).toBe(false);
    });

    it('should return false when the cursor is not on a link', () => {
      const editor = createMockEditor({ content: 'some #tag text', cursor: { ch: 6, line: 0 } });
      const isResult = handler.testCanExecuteEditor(editor, createMockContext());
      expect(isResult).toBe(false);
    });

    it('should return true when the cursor is right before an internal link', () => {
      const editor = createMockEditor({ content: 'see [[target]]', cursor: { ch: 4, line: 0 } });
      const isResult = handler.testCanExecuteEditor(editor, createMockContext());
      expect(isResult).toBe(true);
    });

    it('should return true when the cursor is right before a markdown link', () => {
      const editor = createMockEditor({ content: '[alias](https://example.com)', cursor: { ch: 0, line: 0 } });
      const isResult = handler.testCanExecuteEditor(editor, createMockContext());
      expect(isResult).toBe(true);
    });

    it('should return true when the cursor is right after an external link', () => {
      const editor = createMockEditor({ content: '[alias](https://example.com)', cursor: { ch: 28, line: 0 } });
      const isResult = handler.testCanExecuteEditor(editor, createMockContext());
      expect(isResult).toBe(true);
    });
  });
  describe('executeEditor', () => {
    it('should return early when no parsed link found at cursor position', async () => {
      const editor = createMockEditor({
        content: 'some text',
        cursor: { ch: 5, line: 0 }
      });

      await handler.testExecuteEditor(editor);

      expect(mockPrompt).not.toHaveBeenCalled();
      expect(editor.replaceRange).not.toHaveBeenCalled();
    });

    it('should surface a notice when a frontmatter link cannot be located', async () => {
      const showNotice = vi.fn();

      const noticeHandler = new TestableEditCommandHandler({
        // The note holds no cached frontmatter link, so the resolution finds nothing to edit.
        app: strictProxy<import('obsidian').App>({ metadataCache: strictProxy({ getFileCache: vi.fn().mockReturnValue(null) }) }),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice })
      });

      const editor = createMockEditor({
        content: '---\nurl: https://example.com\n---\n',
        cursor: { ch: 10, line: 1 }
      });

      await noticeHandler.testExecuteEditor(editor, strictProxy<MarkdownFileInfo>({ file: strictProxy({ path: 'source.md' }) }));

      expect(showNotice).toHaveBeenCalledWith('Could not locate the link in the source note.');
      expect(mockPrompt).not.toHaveBeenCalled();
    });

    it('should return early when prompt is cancelled', async () => {
      mockPrompt.mockResolvedValue(null);

      const editor = createMockEditor({
        content: '[[target|alias]]',
        cursor: { ch: 5, line: 0 }
      });

      await handler.testExecuteEditor(editor);

      expect(editor.replaceRange).not.toHaveBeenCalled();
    });

    it('should replace link with new alias for wikilink', async () => {
      mockPrompt.mockResolvedValue('new alias');
      mockGenerateRawMarkdownLink.mockReturnValue('[[target|new alias]]');

      const mockReplaceRange = vi.fn<Editor['replaceRange']>();
      const editor = createMockEditor({
        content: '\n\n[[target|old alias]]',
        cursor: { ch: 5, line: 2 },
        replaceRange: mockReplaceRange
      });

      await handler.testExecuteEditor(editor);

      expect(mockPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultValue: 'old alias',
          title: 'Edit link alias'
        })
      );
      expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith({
        alias: 'new alias',
        isEmbed: false,
        isWikilink: true,
        shouldUseAngleBrackets: false,
        title: '',
        url: 'target'
      });
      expect(mockReplaceRange).toHaveBeenCalledWith(
        '[[target|new alias]]',
        { ch: 0, line: 2 },
        { ch: 20, line: 2 }
      );
    });

    it('should use url as default value when alias is not set', async () => {
      mockPrompt.mockResolvedValue('new alias');
      mockGenerateRawMarkdownLink.mockReturnValue('[[target|new alias]]');

      const editor = createMockEditor({
        content: '[[target]]',
        cursor: { ch: 5, line: 0 },
        replaceRange: vi.fn<Editor['replaceRange']>()
      });

      await handler.testExecuteEditor(editor);

      expect(mockPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ defaultValue: 'target' })
      );
    });

    it('should handle external links', async () => {
      mockPrompt.mockResolvedValue('visit site');
      mockGenerateRawMarkdownLink.mockReturnValue('[visit site](https://example.com "Example")');

      const mockReplaceRange = vi.fn<Editor['replaceRange']>();
      const editor = createMockEditor({
        content: '[click here](https://example.com "Example")',
        cursor: { ch: 5, line: 0 },
        replaceRange: mockReplaceRange
      });

      await handler.testExecuteEditor(editor);

      expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith({
        alias: 'visit site',
        isEmbed: false,
        isWikilink: false,
        shouldUseAngleBrackets: false,
        title: 'Example',
        url: 'https://example.com'
      });
    });

    it('should handle embed links', async () => {
      mockPrompt.mockResolvedValue('photo');
      mockGenerateRawMarkdownLink.mockReturnValue('![[image.png|photo]]');

      const editor = createMockEditor({
        content: '![[image.png|image]]',
        cursor: { ch: 5, line: 0 },
        replaceRange: vi.fn<Editor['replaceRange']>()
      });

      await handler.testExecuteEditor(editor);

      expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith(
        expect.objectContaining({ isEmbed: true })
      );
    });

    it('should handle links with angle brackets', async () => {
      mockPrompt.mockResolvedValue('updated');
      mockGenerateRawMarkdownLink.mockReturnValue('[updated](<https://example.com>)');

      const editor = createMockEditor({
        content: '[link](<https://example.com>)',
        cursor: { ch: 5, line: 0 },
        replaceRange: vi.fn<Editor['replaceRange']>()
      });

      await handler.testExecuteEditor(editor);

      expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith(
        expect.objectContaining({ shouldUseAngleBrackets: true })
      );
    });

    it('should find the correct link when multiple links are on the same line', async () => {
      mockPrompt.mockResolvedValue('updated second');
      mockGenerateRawMarkdownLink.mockReturnValue('[[page2|updated second]]');

      const mockReplaceRange = vi.fn<Editor['replaceRange']>();
      const editor = createMockEditor({
        content: '[[page1|first]]     [[page2|second]]',
        cursor: { ch: 25, line: 0 },
        replaceRange: mockReplaceRange
      });

      await handler.testExecuteEditor(editor);

      expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'page2' })
      );
      expect(mockReplaceRange).toHaveBeenCalledWith(
        '[[page2|updated second]]',
        { ch: 20, line: 0 },
        { ch: 36, line: 0 }
      );
    });
  });

  describe('shouldAddToEditorMenu', () => {
    it('should always return true', () => {
      const editor = createMockEditor();
      const isResult = handler.testShouldAddToEditorMenu(editor, createMockContext());
      expect(isResult).toBe(true);
    });
  });
});
