import type {
  App as AppOriginal,
  Editor,
  EditorPosition,
  MarkdownView,
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

import { resolveAndEditLink } from './resolve-link-occurrence.ts';

const SOURCE_PATH = 'source.md';
const URL = 'https://example.com';
const NEW_RAW_LINK = `[Alias](${URL})`;

/**
 * A position inside the url on the `url:` line of the frontmatter fixtures.
 */
const CURSOR: EditorPosition = { ch: 10, line: 1 };

let app: AppOriginal;
let replaceRange: ReturnType<typeof vi.fn>;

function createPreviewView(): MarkdownView {
  return strictProxy<MarkdownView>({
    file: getSourceFile(),
    getMode: () => 'preview'
  });
}

function createSourceView(mode: 'preview' | 'source', editorContent = ''): MarkdownView {
  return strictProxy<MarkdownView>({
    editor: strictProxy<Editor>({
      getCursor: () => CURSOR,
      getDoc: vi.fn().mockImplementation(() => strictProxy({ getLine: (line: number) => editorContent.split('\n')[line] ?? '' })),
      getValue: () => editorContent,
      posToOffset: (position: EditorPosition) => toOffset(editorContent, position),
      replaceRange: castTo<Editor['replaceRange']>(replaceRange)
    }),
    file: getSourceFile(),
    getMode: () => mode
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

describe('resolveAndEditLink', () => {
  beforeEach(() => {
    replaceRange = vi.fn();
    setUpVault('');
  });

  it('should report a failure when there is no view to resolve against', async () => {
    setUpVault(`---\nurl: ${URL}\n---\n`);
    const showCouldNotLocateNotice = vi.fn();
    const editParsedLink = vi.fn();

    await resolveAndEditLink({
      app,
      editParsedLink,
      linkTarget: { externalUrl: URL },
      showCouldNotLocateNotice,
      view: null
    });

    expect(editParsedLink).not.toHaveBeenCalled();
    expect(showCouldNotLocateNotice).toHaveBeenCalledOnce();
  });

  it('should resolve a Properties panel gesture through its property key, never through the caret', async () => {
    /*
     * The caret is parked on a BODY link to the same url. A panel click must ignore it — in Live Preview the
     * caret is wherever the user last left it, so trusting it would edit the wrong link.
     */
    setUpVault(`---\nurl: ${URL}\n---\n\n${URL}\n`);
    const showCouldNotLocateNotice = vi.fn();

    await resolveAndEditLink({
      app,
      editParsedLink: async (params) => {
        await params.applyReplacement(NEW_RAW_LINK);
      },
      linkTarget: { externalUrl: URL },
      propertyKey: 'url',
      showCouldNotLocateNotice,
      view: createSourceView('source', `---\nurl: ${URL}\n---\n\n${URL}\n`)
    });

    const content = await app.vault.read(getSourceFile());
    expect(parseYaml(getFrontMatterInfo(content).frontmatter)).toEqual({ url: NEW_RAW_LINK });
    // The body link is untouched, and nothing went through the editor.
    expect(content).toContain(`\n${URL}\n`);
    expect(replaceRange).not.toHaveBeenCalled();
    expect(showCouldNotLocateNotice).not.toHaveBeenCalled();
  });

  it('should report a failure when the named property holds no such link', async () => {
    setUpVault(`---\nurl: ${URL}\n---\n`);
    const showCouldNotLocateNotice = vi.fn();

    await resolveAndEditLink({
      app,
      editParsedLink: vi.fn(),
      linkTarget: { externalUrl: URL },
      propertyKey: 'other',
      showCouldNotLocateNotice,
      view: createSourceView('preview')
    });

    expect(showCouldNotLocateNotice).toHaveBeenCalledOnce();
  });

  it('should write through the frontmatter when the click position lands in the raw YAML', async () => {
    const content = `---\nurl: ${URL}\n---\n`;
    setUpVault(content);
    const showCouldNotLocateNotice = vi.fn();

    await resolveAndEditLink({
      app,
      editParsedLink: async (params) => {
        await params.applyReplacement(NEW_RAW_LINK);
      },
      linkTarget: {},
      showCouldNotLocateNotice,
      sourcePosition: CURSOR,
      view: createSourceView('source', content)
    });

    expect(replaceRange).not.toHaveBeenCalled();
    const sourceContent = await app.vault.read(getSourceFile());
    expect(parseYaml(getFrontMatterInfo(sourceContent).frontmatter)).toEqual({ url: NEW_RAW_LINK });
    expect(showCouldNotLocateNotice).not.toHaveBeenCalled();
  });

  it('should report a failure when neither the body nor the frontmatter holds the link', async () => {
    setUpVault('# Body\n');
    const showCouldNotLocateNotice = vi.fn();

    await resolveAndEditLink({
      app,
      editParsedLink: vi.fn(),
      linkTarget: { externalUrl: URL },
      showCouldNotLocateNotice,
      view: createSourceView('preview')
    });

    expect(showCouldNotLocateNotice).toHaveBeenCalledOnce();
  });

  it('should keep the frontmatter valid YAML when a frontmatter link is edited', async () => {
    setUpVault(`---\nurl: ${URL}\n---\n\n# Note\n`);
    const showCouldNotLocateNotice = vi.fn();

    await resolveAndEditLink({
      app,
      editParsedLink: async (params) => {
        await params.applyReplacement(NEW_RAW_LINK);
      },
      linkTarget: { externalUrl: URL },
      showCouldNotLocateNotice,
      view: createPreviewView()
    });

    expect(showCouldNotLocateNotice).not.toHaveBeenCalled();
    const content = await app.vault.read(getSourceFile());
    const frontmatter = parseYaml(getFrontMatterInfo(content).frontmatter);
    expect(frontmatter).toEqual({ url: NEW_RAW_LINK });
  });
});
