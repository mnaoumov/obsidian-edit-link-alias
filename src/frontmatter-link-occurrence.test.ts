import type {
  App as AppOriginal,
  TFile
} from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

import {
  getFrontMatterInfo,
  parseYaml
} from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { selectItem } from 'obsidian-dev-utils/obsidian/modals/select-item';
import {
  parseFrontmatterLinks,
  parseLink
} from 'obsidian-dev-utils/obsidian/parse-link';
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
  isLineInFrontmatter,
  isOffsetInFrontmatter,
  resolveAndEditFrontmatterLink
} from './frontmatter-link-occurrence.ts';

vi.mock('obsidian-dev-utils/obsidian/modals/select-item', () => ({ selectItem: vi.fn() }));

vi.mock('obsidian-dev-utils/obsidian/parse-link', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian-dev-utils/obsidian/parse-link')>();
  return {
    ...original,
    parseFrontmatterLinks: vi.fn(original.parseFrontmatterLinks),
    parseLink: vi.fn(original.parseLink)
  };
});

const mockSelectItem = vi.mocked(selectItem);
const mockParseFrontmatterLinks = vi.mocked(parseFrontmatterLinks);
const mockParseLink = vi.mocked(parseLink);

const SOURCE_PATH = 'source.md';
const URL = 'https://example.com';
const OTHER_URL = 'https://other.example.com';
const NEW_RAW_LINK = `[Alias](${URL})`;

let app: AppOriginal;
let showCouldNotLocateNotice: ReturnType<typeof vi.fn<(this: void) => void>>;

interface ResolveOptions {
  readonly beforeApply?: (() => Promise<void>) | undefined;
  readonly linkTarget?: Parameters<typeof resolveAndEditFrontmatterLink>[0]['linkTarget'];
  readonly newRawLink?: string;
  readonly propertyKey?: string;
  readonly rawLink?: string;
  readonly shouldApply?: boolean;
}

function getFrontmatter(content: string): unknown {
  return parseYaml(getFrontMatterInfo(content).frontmatter);
}

function getSourceFile(): TFile {
  const file = app.vault.getFileByPath(SOURCE_PATH);
  if (!file) {
    throw new Error(`Test fixture ${SOURCE_PATH} is missing`);
  }
  return file;
}

async function readSource(): Promise<string> {
  return await app.vault.read(getSourceFile());
}

/**
 * Runs the resolution with an editor that applies the given replacement, which is what a confirmed popover
 * or prompt does.
 *
 * @param options - The scenario options.
 * @returns Whether a frontmatter link was resolved.
 */
async function resolve(options: ResolveOptions = {}): Promise<boolean> {
  const {
    beforeApply,
    newRawLink = NEW_RAW_LINK,
    propertyKey,
    rawLink,
    shouldApply = true
  } = options;

  return await resolveAndEditFrontmatterLink({
    app,
    editParsedLink: async (params: EditParsedLinkParams) => {
      if (!shouldApply) {
        return;
      }
      await beforeApply?.();
      await params.applyReplacement(newRawLink);
    },
    linkTarget: options.linkTarget ?? {},
    showCouldNotLocateNotice,
    sourceFile: getSourceFile(),
    ...propertyKey === undefined ? {} : { propertyKey },
    ...rawLink === undefined ? {} : { rawLink }
  });
}

function setUpVault(sourceContent: string): void {
  app = App.createConfigured__({ files: { [SOURCE_PATH]: sourceContent } }).asOriginalType__();
}

describe('isOffsetInFrontmatter', () => {
  it('should report false for a note without frontmatter', () => {
    expect(isOffsetInFrontmatter('# Body\n', 2)).toBe(false);
  });

  it('should report true inside the frontmatter and false in the body', () => {
    const content = `---\nurl: ${URL}\n---\n\n# Body\n`;
    const frontmatterInfo = getFrontMatterInfo(content);
    expect(isOffsetInFrontmatter(content, frontmatterInfo.from + 1)).toBe(true);
    expect(isOffsetInFrontmatter(content, content.length - 1)).toBe(false);
  });
});

describe('isLineInFrontmatter', () => {
  it('should report false for a note without frontmatter', () => {
    expect(isLineInFrontmatter('# Body\n', 0)).toBe(false);
  });

  it('should report true for the property lines and false for the body', () => {
    const content = `---\nurl: ${URL}\nother: 1\n---\n\n# Body\n`;
    expect(isLineInFrontmatter(content, 1)).toBe(true);
    expect(isLineInFrontmatter(content, 2)).toBe(true);
    expect(isLineInFrontmatter(content, 5)).toBe(false);
  });
});

describe('resolveAndEditFrontmatterLink', () => {
  beforeEach(() => {
    showCouldNotLocateNotice = vi.fn();
    mockSelectItem.mockReset();
    setUpVault('');
  });

  it('should report no link when the note has no frontmatter', async () => {
    setUpVault('# Body\n');

    expect(await resolve()).toBe(false);
    expect(showCouldNotLocateNotice).not.toHaveBeenCalled();
  });

  it('should report no link when the frontmatter holds no link', async () => {
    setUpVault('---\ntitle: plain text\n---\n');

    expect(await resolve()).toBe(false);
  });

  it('should quote the rebuilt link so the frontmatter stays valid YAML', async () => {
    setUpVault(`---\nurl: ${URL}\n---\n`);

    expect(await resolve()).toBe(true);
    expect(getFrontmatter(await readSource())).toEqual({ url: NEW_RAW_LINK });
    expect(showCouldNotLocateNotice).not.toHaveBeenCalled();
  });

  it('should edit only the targeted item of a list property', async () => {
    setUpVault(`---\nlinks:\n  - ${URL}\n  - ${OTHER_URL}\n---\n`);

    expect(await resolve({ linkTarget: { externalUrl: OTHER_URL } })).toBe(true);
    expect(getFrontmatter(await readSource())).toEqual({ links: [URL, NEW_RAW_LINK] });
  });

  it('should ignore links outside the given property', async () => {
    setUpVault(`---\nurl: ${URL}\nother: ${OTHER_URL}\n---\n`);

    expect(await resolve({ propertyKey: 'other' })).toBe(true);
    expect(getFrontmatter(await readSource())).toEqual({
      other: NEW_RAW_LINK,
      url: URL
    });
  });

  it('should match a list item by its property key prefix', async () => {
    setUpVault(`---\nlinks:\n  - ${URL}\n---\n`);

    expect(await resolve({ propertyKey: 'links' })).toBe(true);
    expect(getFrontmatter(await readSource())).toEqual({ links: [NEW_RAW_LINK] });
  });

  /*
   * The Properties panel renders the key it hands the click as `key.toLowerCase()`, while the cache keeps the
   * note's own casing, so a property spelled with capitals resolved to nothing at all (GH #8).
   */
  it('should match a property key whose note spells it with capitals', async () => {
    setUpVault(`---\nHomepage: ${URL}\n---\n`);

    expect(await resolve({ propertyKey: 'homepage' })).toBe(true);
    expect(getFrontmatter(await readSource())).toEqual({ Homepage: NEW_RAW_LINK });
  });

  it('should match a list item under a property key spelled with capitals', async () => {
    setUpVault(`---\nBookmarks:\n  - ${URL}\n---\n`);

    expect(await resolve({ propertyKey: 'bookmarks' })).toBe(true);
    expect(getFrontmatter(await readSource())).toEqual({ Bookmarks: [NEW_RAW_LINK] });
  });

  it('should still ignore links outside the property when the casing differs', async () => {
    setUpVault(`---\nHomepage: ${URL}\nOther: ${OTHER_URL}\n---\n`);

    expect(await resolve({ propertyKey: 'other' })).toBe(true);
    expect(getFrontmatter(await readSource())).toEqual({
      Homepage: URL,
      Other: NEW_RAW_LINK
    });
  });

  it('should replace only the matching link inside a value holding several', async () => {
    setUpVault(`---\nurls: ${URL} and ${OTHER_URL}\n---\n`);

    expect(await resolve({ rawLink: OTHER_URL })).toBe(true);
    expect(getFrontmatter(await readSource())).toEqual({ urls: `${URL} and ${NEW_RAW_LINK}` });
  });

  it('should edit an internal link that Obsidian cached natively', async () => {
    setUpVault('---\nnote: "[[some note]]"\n---\n');

    expect(await resolve({ newRawLink: '[[some note|Alias]]' })).toBe(true);
    expect(getFrontmatter(await readSource())).toEqual({ note: '[[some note|Alias]]' });
  });

  it('should offer a link cached in both sources only once', async () => {
    /*
     * Obsidian's own cache and `parseFrontmatterLinks` are disjoint today — the latter deliberately skips the
     * internal single-link values Obsidian already covers — so the overlap is forced here. Without the
     * de-duplication the same link would appear twice and raise a pointless "which one?" picker.
     */
    setUpVault('---\nnote: "[[some note]]"\n---\n');
    mockParseFrontmatterLinks.mockReturnValueOnce({
      frontmatterExternalLinks: [{
        key: 'note',
        link: 'some note',
        original: '[[some note]]',
        parseLinkResult: castTo<ParseLinkResult>({ raw: '[[some note]]' })
      }],
      multiValueFrontmatterExternalLinks: [],
      multiValueFrontmatterLinks: []
    });

    expect(await resolve({ newRawLink: '[[some note|Alias]]' })).toBe(true);
    expect(mockSelectItem).not.toHaveBeenCalled();
    expect(getFrontmatter(await readSource())).toEqual({ note: '[[some note|Alias]]' });
  });

  it('should skip a cached reference whose text does not parse as a link', async () => {
    setUpVault('---\nnote: "[[some note]]"\n---\n');
    mockParseLink.mockReturnValueOnce(null);

    expect(await resolve()).toBe(false);
  });

  it('should ask which link to edit when several match', async () => {
    setUpVault(`---\nfirst: ${URL}\nsecond: ${OTHER_URL}\n---\n`);
    mockSelectItem.mockImplementation(async (params) => await Promise.resolve(params.items[1]));

    expect(await resolve()).toBe(true);
    expect(mockSelectItem).toHaveBeenCalledOnce();
    expect(getFrontmatter(await readSource())).toEqual({
      first: URL,
      second: NEW_RAW_LINK
    });
  });

  it('should label the choices by property key and link text', async () => {
    setUpVault(`---\nfirst: ${URL}\nsecond: ${OTHER_URL}\n---\n`);
    mockSelectItem.mockResolvedValue(null);

    await resolve();

    const params = mockSelectItem.mock.calls[0]?.[0];
    const firstItem = params?.items[0];
    expect(firstItem).toBeDefined();
    expect(params?.itemTextFunc(firstItem)).toBe(`first: ${URL}`);
  });

  it('should leave the note alone when the picker is dismissed', async () => {
    const content = `---\nfirst: ${URL}\nsecond: ${OTHER_URL}\n---\n`;
    setUpVault(content);
    mockSelectItem.mockResolvedValue(null);

    // The link WAS located, so this counts as handled: a dismissed picker is a cancel, not a failure.
    expect(await resolve()).toBe(true);
    expect(await readSource()).toBe(content);
    expect(showCouldNotLocateNotice).not.toHaveBeenCalled();
  });

  it('should not rewrite the note when the editor is cancelled', async () => {
    const content = `---\nurl: ${URL}\n---\n`;
    setUpVault(content);

    expect(await resolve({ shouldApply: false })).toBe(true);
    expect(await readSource()).toBe(content);
    expect(showCouldNotLocateNotice).not.toHaveBeenCalled();
  });

  it('should not rewrite the note when the link is unchanged', async () => {
    const content = `---\nurl: ${URL}\n---\n`;
    setUpVault(content);

    expect(await resolve({ newRawLink: URL })).toBe(true);
    expect(await readSource()).toBe(content);
    expect(showCouldNotLocateNotice).not.toHaveBeenCalled();
  });

  it('should report a failure when the frontmatter changed while the editor was open', async () => {
    setUpVault(`---\nurl: ${URL}\n---\n`);

    await resolve({
      beforeApply: async () => {
        // The value the change was validated against is gone, so the write cannot be applied.
        await app.vault.modify(getSourceFile(), '---\nurl: replaced\n---\n');
      }
    });

    expect(showCouldNotLocateNotice).toHaveBeenCalledOnce();
    expect(getFrontmatter(await readSource())).toEqual({ url: 'replaced' });
  });
});
