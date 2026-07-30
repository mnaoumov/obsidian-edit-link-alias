import type {
  App as AppOriginal,
  Editor,
  EditorPosition,
  TFile
} from 'obsidian';

import {
  getFrontMatterInfo,
  parseYaml
} from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EditParsedLinkParams } from './edit-link.ts';

import {
  checkIsCursorOnEditableLink,
  editLinkAtEditorCursor
} from './edit-in-editor.ts';

const SOURCE_PATH = 'source.md';
const URL = 'https://example.com';
const NEW_RAW_LINK = `[Alias](${URL})`;
const FRONTMATTER_CONTENT = `---\nurl: ${URL}\n---\n\n# Body\n`;
const BODY_CONTENT = `intro ${URL} outro`;

/**
 * A position on the `url:` line of {@link FRONTMATTER_CONTENT}, inside the url itself.
 */
const FRONTMATTER_CURSOR: EditorPosition = { ch: 10, line: 1 };

let app: AppOriginal;
let replaceRange: ReturnType<typeof vi.fn>;
let showCouldNotLocateNotice: ReturnType<typeof vi.fn<(this: void) => void>>;

function createEditor(content: string, cursor: EditorPosition, clickableTokenType: null | string = null): Editor {
  return strictProxy<Editor>({
    getClickableTokenAt: vi.fn().mockReturnValue(clickableTokenType === null ? null : { type: clickableTokenType }),
    getCursor: vi.fn().mockReturnValue(cursor),
    getDoc: vi.fn().mockImplementation(() => strictProxy({ getLine: (line: number) => content.split('\n')[line] ?? '' })),
    getValue: vi.fn().mockReturnValue(content),
    posToOffset: vi.fn().mockImplementation((position: EditorPosition) => toOffset(content, position)),
    replaceRange: castTo<Editor['replaceRange']>(replaceRange)
  });
}

function getSourceFile(): TFile {
  const file = app.vault.getFileByPath(SOURCE_PATH);
  if (!file) {
    throw new Error(`Test fixture ${SOURCE_PATH} is missing`);
  }
  return file;
}

function setUpVault(sourceContent: string): void {
  app = App.createConfigured__({ files: { [SOURCE_PATH]: sourceContent } }).asOriginalType__();
}

function toOffset(content: string, position: EditorPosition): number {
  return content.split('\n').slice(0, position.line).reduce((total, lineText) => total + lineText.length + 1, 0) + position.ch;
}

beforeEach(() => {
  replaceRange = vi.fn();
  showCouldNotLocateNotice = vi.fn();
  setUpVault(FRONTMATTER_CONTENT);
});

describe('checkIsCursorOnEditableLink', () => {
  it('should accept an internal link token', () => {
    expect(checkIsCursorOnEditableLink(createEditor(BODY_CONTENT, { ch: 0, line: 0 }, 'internal-link'))).toBe(true);
  });

  it('should accept an external link token', () => {
    expect(checkIsCursorOnEditableLink(createEditor(BODY_CONTENT, { ch: 0, line: 0 }, 'external-link'))).toBe(true);
  });

  it('should reject a token that is not a link', () => {
    expect(checkIsCursorOnEditableLink(createEditor(BODY_CONTENT, { ch: 0, line: 0 }, 'tag'))).toBe(false);
  });

  it('should accept a frontmatter link, which carries no clickable token at all', () => {
    expect(checkIsCursorOnEditableLink(createEditor(FRONTMATTER_CONTENT, FRONTMATTER_CURSOR))).toBe(true);
  });

  it('should reject a frontmatter position that is not on a link', () => {
    expect(checkIsCursorOnEditableLink(createEditor('---\ntitle: plain\n---\n', { ch: 3, line: 1 }))).toBe(false);
  });

  it('should reject a body position that is not on a link', () => {
    expect(checkIsCursorOnEditableLink(createEditor('plain body', { ch: 2, line: 0 }))).toBe(false);
  });
});

describe('editLinkAtEditorCursor', () => {
  it('should do nothing when the cursor is not on a link', async () => {
    const editParsedLink = vi.fn();

    await editLinkAtEditorCursor({
      app,
      editor: createEditor('plain body', { ch: 2, line: 0 }),
      editParsedLink,
      showCouldNotLocateNotice,
      sourceFile: getSourceFile()
    });

    expect(editParsedLink).not.toHaveBeenCalled();
    expect(showCouldNotLocateNotice).not.toHaveBeenCalled();
  });

  it('should replace a body link through the editor, so the change joins the undo history', async () => {
    setUpVault(BODY_CONTENT);

    await editLinkAtEditorCursor({
      app,
      editor: createEditor(BODY_CONTENT, { ch: 8, line: 0 }),
      editParsedLink: async (params: EditParsedLinkParams) => {
        await params.applyReplacement(NEW_RAW_LINK);
      },
      showCouldNotLocateNotice,
      sourceFile: getSourceFile()
    });

    expect(replaceRange).toHaveBeenCalledWith(NEW_RAW_LINK, { ch: 6, line: 0 }, { ch: 25, line: 0 });
  });

  it('should write a frontmatter link through the frontmatter, keeping the YAML valid', async () => {
    await editLinkAtEditorCursor({
      app,
      editor: createEditor(FRONTMATTER_CONTENT, FRONTMATTER_CURSOR),
      editParsedLink: async (params: EditParsedLinkParams) => {
        await params.applyReplacement(NEW_RAW_LINK);
      },
      showCouldNotLocateNotice,
      sourceFile: getSourceFile()
    });

    // Never through the editor: splicing into raw YAML is what broke the note in GH #5.
    expect(replaceRange).not.toHaveBeenCalled();
    const content = await app.vault.read(getSourceFile());
    expect(parseYaml(getFrontMatterInfo(content).frontmatter)).toEqual({ url: NEW_RAW_LINK });
    expect(showCouldNotLocateNotice).not.toHaveBeenCalled();
  });

  it('should report a failure for a frontmatter link when the editor is not backed by a file', async () => {
    const editParsedLink = vi.fn();

    await editLinkAtEditorCursor({
      app,
      editor: createEditor(FRONTMATTER_CONTENT, FRONTMATTER_CURSOR),
      editParsedLink,
      showCouldNotLocateNotice,
      sourceFile: null
    });

    expect(editParsedLink).not.toHaveBeenCalled();
    expect(replaceRange).not.toHaveBeenCalled();
    expect(showCouldNotLocateNotice).toHaveBeenCalledOnce();
  });

  it('should report a failure when the frontmatter holds no such link', async () => {
    // The note on disk has moved on from what the editor is showing.
    setUpVault('---\ntitle: plain\n---\n');
    const editParsedLink = vi.fn();

    await editLinkAtEditorCursor({
      app,
      editor: createEditor(FRONTMATTER_CONTENT, FRONTMATTER_CURSOR),
      editParsedLink,
      showCouldNotLocateNotice,
      sourceFile: getSourceFile()
    });

    expect(editParsedLink).not.toHaveBeenCalled();
    expect(showCouldNotLocateNotice).toHaveBeenCalledOnce();
  });
});
