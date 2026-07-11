import type {
  Editor,
  EditorPosition,
  MarkdownFileInfo
} from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { EditorCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/editor-command-handler';
import { generateRawMarkdownLink } from 'obsidian-dev-utils/obsidian/link';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';
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

import { EditCommandHandler } from './edit-command-handler.ts';

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  generateRawMarkdownLink: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/modals/prompt', () => ({
  prompt: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/parse-link', () => ({
  parseLinks: vi.fn()
}));

const mockParseLinks = vi.mocked(parseLinks);
const mockGenerateRawMarkdownLink = vi.mocked(generateRawMarkdownLink);
const mockPrompt = vi.mocked(prompt);

interface CreateMockEditorParams {
  readonly clickableToken?: MockClickableToken | null;
  readonly cursor?: EditorPosition;
  readonly line?: string;
  readonly replaceRange?: Editor['replaceRange'];
}

interface EditorCommandHandlerProtected {
  canExecuteEditor(editor: Editor, ctx: MarkdownFileInfo): boolean;
}

interface MockClickableToken {
  type: string;
}

class TestableEditCommandHandler extends EditCommandHandler {
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

function createMockApp(): import('obsidian').App {
  return strictProxy<import('obsidian').App>({});
}

function createMockCtx(): MarkdownFileInfo {
  return strictProxy<MarkdownFileInfo>({});
}

function createMockEditor(params: CreateMockEditorParams = {}): Editor {
  const {
    clickableToken = null,
    cursor = { ch: 0, line: 0 },
    line = '',
    replaceRange = vi.fn<Editor['replaceRange']>()
  } = params;

  const mockGetLine = vi.fn().mockReturnValue(line);
  const mockGetDoc = vi.fn().mockReturnValue(strictProxy({ getLine: mockGetLine }));

  return strictProxy<Editor>({
    getClickableTokenAt: vi.fn().mockReturnValue(clickableToken),
    getCursor: vi.fn().mockReturnValue(cursor),
    getDoc: mockGetDoc,
    replaceRange
  });
}

describe('EditCommandHandler', () => {
  let handler: TestableEditCommandHandler;

  beforeEach(() => {
    handler = new TestableEditCommandHandler(createMockApp());
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

      const editor = createMockEditor({ clickableToken: { type: 'internal-link' } });
      const result = handler.testCanExecuteEditor(editor, createMockCtx());

      expect(result).toBe(false);
    });

    it('should return false when no clickable token at cursor', () => {
      const editor = createMockEditor({ clickableToken: null });
      const result = handler.testCanExecuteEditor(editor, createMockCtx());
      expect(result).toBe(false);
    });

    it('should return false when clickable token type is not a link', () => {
      const editor = createMockEditor({ clickableToken: { type: 'tag' } });
      const result = handler.testCanExecuteEditor(editor, createMockCtx());
      expect(result).toBe(false);
    });

    it('should return true when clickable token is internal-link', () => {
      const editor = createMockEditor({ clickableToken: { type: 'internal-link' } });
      const result = handler.testCanExecuteEditor(editor, createMockCtx());
      expect(result).toBe(true);
    });

    it('should return true when clickable token is external-link', () => {
      const editor = createMockEditor({ clickableToken: { type: 'external-link' } });
      const result = handler.testCanExecuteEditor(editor, createMockCtx());
      expect(result).toBe(true);
    });
  });

  describe('executeEditor', () => {
    it('should return early when no parsed link found at cursor position', async () => {
      mockParseLinks.mockReturnValue([]);
      const editor = createMockEditor({
        cursor: { ch: 5, line: 0 },
        line: 'some text'
      });

      await handler.testExecuteEditor(editor);

      expect(mockPrompt).not.toHaveBeenCalled();
      expect(editor.replaceRange).not.toHaveBeenCalled();
    });

    it('should return early when prompt is cancelled', async () => {
      mockParseLinks.mockReturnValue([{
        endOffset: 20,
        isEmbed: false,
        isExternal: false,
        isFileUrl: false,
        isWikilink: true,
        raw: '[[target|alias]]',
        startOffset: 0,
        url: 'target'
      }]);
      mockPrompt.mockResolvedValue(null);

      const editor = createMockEditor({
        cursor: { ch: 5, line: 0 },
        line: '[[target|alias]]'
      });

      await handler.testExecuteEditor(editor);

      expect(editor.replaceRange).not.toHaveBeenCalled();
    });

    it('should replace link with new alias for wikilink', async () => {
      mockParseLinks.mockReturnValue([{
        alias: 'old alias',
        endOffset: 24,
        isEmbed: false,
        isExternal: false,
        isFileUrl: false,
        isWikilink: true,
        raw: '[[target|old alias]]',
        startOffset: 0,
        url: 'target'
      }]);
      mockPrompt.mockResolvedValue('new alias');
      mockGenerateRawMarkdownLink.mockReturnValue('[[target|new alias]]');

      const mockReplaceRange = vi.fn<Editor['replaceRange']>();
      const editor = createMockEditor({
        cursor: { ch: 5, line: 2 },
        line: '[[target|old alias]]',
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
        { ch: 24, line: 2 }
      );
    });

    it('should use url as default value when alias is not set', async () => {
      mockParseLinks.mockReturnValue([{
        endOffset: 10,
        isEmbed: false,
        isExternal: false,
        isFileUrl: false,
        isWikilink: true,
        raw: '[[target]]',
        startOffset: 0,
        url: 'target'
      }]);
      mockPrompt.mockResolvedValue('new alias');
      mockGenerateRawMarkdownLink.mockReturnValue('[[target|new alias]]');

      const editor = createMockEditor({
        cursor: { ch: 5, line: 0 },
        line: '[[target]]',
        replaceRange: vi.fn<Editor['replaceRange']>()
      });

      await handler.testExecuteEditor(editor);

      expect(mockPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ defaultValue: 'target' })
      );
    });

    it('should handle external links', async () => {
      mockParseLinks.mockReturnValue([{
        alias: 'click here',
        endOffset: 30,
        hasAngleBrackets: false,
        isEmbed: false,
        isExternal: true,
        isFileUrl: false,
        isWikilink: false,
        raw: '[click here](https://example.com)',
        startOffset: 0,
        title: 'Example',
        url: 'https://example.com'
      }]);
      mockPrompt.mockResolvedValue('visit site');
      mockGenerateRawMarkdownLink.mockReturnValue('[visit site](https://example.com "Example")');

      const mockReplaceRange = vi.fn<Editor['replaceRange']>();
      const editor = createMockEditor({
        cursor: { ch: 5, line: 0 },
        line: '[click here](https://example.com)',
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
      mockParseLinks.mockReturnValue([{
        alias: 'image',
        endOffset: 20,
        isEmbed: true,
        isExternal: false,
        isFileUrl: false,
        isWikilink: true,
        raw: '![[image.png|image]]',
        startOffset: 0,
        url: 'image.png'
      }]);
      mockPrompt.mockResolvedValue('photo');
      mockGenerateRawMarkdownLink.mockReturnValue('![[image.png|photo]]');

      const editor = createMockEditor({
        cursor: { ch: 5, line: 0 },
        line: '![[image.png|image]]',
        replaceRange: vi.fn<Editor['replaceRange']>()
      });

      await handler.testExecuteEditor(editor);

      expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith(
        expect.objectContaining({ isEmbed: true })
      );
    });

    it('should handle links with angle brackets', async () => {
      mockParseLinks.mockReturnValue([{
        alias: 'link',
        endOffset: 25,
        hasAngleBrackets: true,
        isEmbed: false,
        isExternal: true,
        isFileUrl: false,
        isWikilink: false,
        raw: '[link](<https://example.com>)',
        startOffset: 0,
        url: 'https://example.com'
      }]);
      mockPrompt.mockResolvedValue('updated');
      mockGenerateRawMarkdownLink.mockReturnValue('[updated](<https://example.com>)');

      const editor = createMockEditor({
        cursor: { ch: 5, line: 0 },
        line: '[link](<https://example.com>)',
        replaceRange: vi.fn<Editor['replaceRange']>()
      });

      await handler.testExecuteEditor(editor);

      expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith(
        expect.objectContaining({ shouldUseAngleBrackets: true })
      );
    });

    it('should find the correct link when multiple links are on the same line', async () => {
      mockParseLinks.mockReturnValue([
        {
          alias: 'first',
          endOffset: 15,
          isEmbed: false,
          isExternal: false,
          isFileUrl: false,
          isWikilink: true,
          raw: '[[page1|first]]',
          startOffset: 0,
          url: 'page1'
        },
        {
          alias: 'second',
          endOffset: 40,
          isEmbed: false,
          isExternal: false,
          isFileUrl: false,
          isWikilink: true,
          raw: '[[page2|second]]',
          startOffset: 20,
          url: 'page2'
        }
      ]);
      mockPrompt.mockResolvedValue('updated second');
      mockGenerateRawMarkdownLink.mockReturnValue('[[page2|updated second]]');

      const mockReplaceRange = vi.fn<Editor['replaceRange']>();
      const editor = createMockEditor({
        cursor: { ch: 25, line: 0 },
        line: '[[page1|first]]     [[page2|second]]',
        replaceRange: mockReplaceRange
      });

      await handler.testExecuteEditor(editor);

      expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'page2' })
      );
      expect(mockReplaceRange).toHaveBeenCalledWith(
        '[[page2|updated second]]',
        { ch: 20, line: 0 },
        { ch: 40, line: 0 }
      );
    });
  });

  describe('shouldAddToEditorMenu', () => {
    it('should always return true', () => {
      const editor = createMockEditor();
      const result = handler.testShouldAddToEditorMenu(editor, createMockCtx());
      expect(result).toBe(true);
    });
  });
});
