import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';
import type { PopoverAnchor } from 'obsidian-dev-utils/obsidian/popovers/popover-anchor';

import { generateRawMarkdownLink } from 'obsidian-dev-utils/obsidian/link';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';
import { editFieldsInPopover } from 'obsidian-dev-utils/obsidian/popovers/field-popover';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  createEditParsedLinkUrlAndAliasInPopover,
  editParsedLinkAlias
} from './edit-link.ts';

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  generateRawMarkdownLink: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/modals/prompt', () => ({
  prompt: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/popovers/field-popover', () => ({
  editFieldsInPopover: vi.fn()
}));

const mockGenerateRawMarkdownLink = vi.mocked(generateRawMarkdownLink);
const mockPrompt = vi.mocked(prompt);

const mockEditFieldsInPopover = vi.mocked(editFieldsInPopover);

function createMockApp(): App {
  return strictProxy<App>({});
}

function createParsedLink(overrides: Partial<ParseLinkResult> = {}): ParseLinkResult {
  return {
    endOffset: 20,
    isEmbed: false,
    isExternal: false,
    isFileUrl: false,
    isWikilink: true,
    raw: '[[target|old alias]]',
    startOffset: 0,
    url: 'target',
    ...overrides
  };
}

describe('editParsedLinkAlias', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should prompt with the current alias as the default value', async () => {
    mockPrompt.mockResolvedValue(null);

    await editParsedLinkAlias({
      app: createMockApp(),
      applyReplacement: vi.fn(),
      parsedLink: createParsedLink({ alias: 'current' })
    });

    expect(mockPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultValue: 'current',
        title: 'Edit link alias'
      })
    );
  });

  it('should prompt with the url as the default value when there is no alias', async () => {
    mockPrompt.mockResolvedValue(null);

    await editParsedLinkAlias({
      app: createMockApp(),
      applyReplacement: vi.fn(),
      parsedLink: createParsedLink({ url: 'target' })
    });

    expect(mockPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ defaultValue: 'target' })
    );
  });

  it('should not apply a replacement when the prompt is cancelled', async () => {
    mockPrompt.mockResolvedValue(null);
    const applyReplacement = vi.fn();

    await editParsedLinkAlias({
      app: createMockApp(),
      applyReplacement,
      parsedLink: createParsedLink()
    });

    expect(mockGenerateRawMarkdownLink).not.toHaveBeenCalled();
    expect(applyReplacement).not.toHaveBeenCalled();
  });

  it('should rebuild the link preserving its flags and apply the replacement', async () => {
    mockPrompt.mockResolvedValue('new alias');
    mockGenerateRawMarkdownLink.mockReturnValue('[[target|new alias]]');
    const applyReplacement = vi.fn();

    await editParsedLinkAlias({
      app: createMockApp(),
      applyReplacement,
      parsedLink: createParsedLink({
        hasAngleBrackets: true,
        isEmbed: true,
        isWikilink: true,
        title: 'the title',
        url: 'target'
      })
    });

    expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith({
      alias: 'new alias',
      isEmbed: true,
      isWikilink: true,
      shouldUseAngleBrackets: true,
      title: 'the title',
      url: 'target'
    });
    expect(applyReplacement).toHaveBeenCalledWith('[[target|new alias]]');
  });

  it('should default the flags for a plain external link', async () => {
    mockPrompt.mockResolvedValue('visit');
    mockGenerateRawMarkdownLink.mockReturnValue('[visit](https://example.com)');
    const applyReplacement = vi.fn();

    await editParsedLinkAlias({
      app: createMockApp(),
      applyReplacement,
      parsedLink: createParsedLink({
        alias: 'click here',
        isExternal: true,
        isWikilink: false,
        raw: '[click here](https://example.com)',
        url: 'https://example.com'
      })
    });

    expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith({
      alias: 'visit',
      isEmbed: false,
      isWikilink: false,
      shouldUseAngleBrackets: false,
      title: '',
      url: 'https://example.com'
    });
  });
});

describe('createEditParsedLinkUrlAndAliasInPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should open the popover at the given anchor, pre-filled with the current url and alias', async () => {
    mockEditFieldsInPopover.mockResolvedValue(null);
    const anchor = createTestAnchor();

    await createEditParsedLinkUrlAndAliasInPopover(anchor)({
      app: createMockApp(),
      applyReplacement: vi.fn(),
      parsedLink: createParsedLink({ alias: 'current', url: 'target' })
    });

    expect(mockEditFieldsInPopover).toHaveBeenCalledWith({
      anchor,
      fields: [
        {
          defaultValue: 'target',
          key: 'url',
          name: 'URL'
        },
        {
          defaultValue: 'current',
          key: 'alias',
          name: 'Alias'
        }
      ]
    });
  });

  it('should default the alias field to empty when there is no alias', async () => {
    mockEditFieldsInPopover.mockResolvedValue(null);

    await createEditParsedLinkUrlAndAliasInPopover(createTestAnchor())({
      app: createMockApp(),
      applyReplacement: vi.fn(),
      parsedLink: createParsedLink({ url: 'target' })
    });

    expect(mockEditFieldsInPopover).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [
          expect.objectContaining({ defaultValue: 'target', key: 'url' }),
          expect.objectContaining({ defaultValue: '', key: 'alias' })
        ]
      })
    );
  });

  it('should not apply a replacement when the popover is dismissed', async () => {
    mockEditFieldsInPopover.mockResolvedValue(null);
    const applyReplacement = vi.fn();

    await createEditParsedLinkUrlAndAliasInPopover(createTestAnchor())({
      app: createMockApp(),
      applyReplacement,
      parsedLink: createParsedLink()
    });

    expect(mockGenerateRawMarkdownLink).not.toHaveBeenCalled();
    expect(applyReplacement).not.toHaveBeenCalled();
  });

  it('should rebuild the link with the new url and alias preserving its flags and apply the replacement', async () => {
    mockEditFieldsInPopover.mockResolvedValue({ alias: 'new alias', url: 'new-target' });
    mockGenerateRawMarkdownLink.mockReturnValue('[[new-target|new alias]]');
    const applyReplacement = vi.fn();

    await createEditParsedLinkUrlAndAliasInPopover(createTestAnchor())({
      app: createMockApp(),
      applyReplacement,
      parsedLink: createParsedLink({
        hasAngleBrackets: true,
        isEmbed: true,
        isWikilink: true,
        title: 'the title',
        url: 'target'
      })
    });

    expect(mockGenerateRawMarkdownLink).toHaveBeenCalledWith({
      alias: 'new alias',
      isEmbed: true,
      isWikilink: true,
      shouldUseAngleBrackets: true,
      title: 'the title',
      url: 'new-target'
    });
    expect(applyReplacement).toHaveBeenCalledWith('[[new-target|new alias]]');
  });
});

function createTestAnchor(): PopoverAnchor {
  return {
    bottom: 100,
    doc: document,
    left: 40
  };
}
