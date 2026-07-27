import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

import { generateRawMarkdownLink } from 'obsidian-dev-utils/obsidian/link';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';
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
  editParsedLinkAlias,
  editParsedLinkUrlAndAlias
} from './edit-link.ts';
import { editLinkUrlAndAlias } from './link-editor-modal.ts';
import { editLinkUrlAndAliasInPopover } from './link-editor-popover.ts';

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  generateRawMarkdownLink: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/modals/prompt', () => ({
  prompt: vi.fn()
}));

vi.mock('./link-editor-modal.ts', () => ({
  editLinkUrlAndAlias: vi.fn()
}));

vi.mock('./link-editor-popover.ts', () => ({
  editLinkUrlAndAliasInPopover: vi.fn()
}));

const mockGenerateRawMarkdownLink = vi.mocked(generateRawMarkdownLink);
const mockPrompt = vi.mocked(prompt);
const mockEditLinkUrlAndAlias = vi.mocked(editLinkUrlAndAlias);
const mockEditLinkUrlAndAliasInPopover = vi.mocked(editLinkUrlAndAliasInPopover);

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

describe('editParsedLinkUrlAndAlias', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should open the editor pre-filled with the current url and alias', async () => {
    mockEditLinkUrlAndAlias.mockResolvedValue(null);
    const app = createMockApp();

    await editParsedLinkUrlAndAlias({
      app,
      applyReplacement: vi.fn(),
      parsedLink: createParsedLink({ alias: 'current', url: 'target' })
    });

    expect(mockEditLinkUrlAndAlias).toHaveBeenCalledWith({
      app,
      defaultAlias: 'current',
      defaultUrl: 'target'
    });
  });

  it('should default the alias field to empty when there is no alias', async () => {
    mockEditLinkUrlAndAlias.mockResolvedValue(null);

    await editParsedLinkUrlAndAlias({
      app: createMockApp(),
      applyReplacement: vi.fn(),
      parsedLink: createParsedLink({ url: 'target' })
    });

    expect(mockEditLinkUrlAndAlias).toHaveBeenCalledWith(
      expect.objectContaining({ defaultAlias: '', defaultUrl: 'target' })
    );
  });

  it('should not apply a replacement when the editor is cancelled', async () => {
    mockEditLinkUrlAndAlias.mockResolvedValue(null);
    const applyReplacement = vi.fn();

    await editParsedLinkUrlAndAlias({
      app: createMockApp(),
      applyReplacement,
      parsedLink: createParsedLink()
    });

    expect(mockGenerateRawMarkdownLink).not.toHaveBeenCalled();
    expect(applyReplacement).not.toHaveBeenCalled();
  });

  it('should rebuild the link with the new url and alias preserving its flags and apply the replacement', async () => {
    mockEditLinkUrlAndAlias.mockResolvedValue({ alias: 'new alias', url: 'new-target' });
    mockGenerateRawMarkdownLink.mockReturnValue('[[new-target|new alias]]');
    const applyReplacement = vi.fn();

    await editParsedLinkUrlAndAlias({
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

  it('should default the flags for a plain external link', async () => {
    mockEditLinkUrlAndAlias.mockResolvedValue({ alias: 'visit', url: 'https://new.example.com' });
    mockGenerateRawMarkdownLink.mockReturnValue('[visit](https://new.example.com)');
    const applyReplacement = vi.fn();

    await editParsedLinkUrlAndAlias({
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
      url: 'https://new.example.com'
    });
    expect(applyReplacement).toHaveBeenCalledWith('[visit](https://new.example.com)');
  });
});

describe('createEditParsedLinkUrlAndAliasInPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should open the popover anchored at the given element, pre-filled with the current url and alias', async () => {
    mockEditLinkUrlAndAliasInPopover.mockResolvedValue(null);
    const anchorEl = document.body.createEl('a');

    await createEditParsedLinkUrlAndAliasInPopover(anchorEl)({
      app: createMockApp(),
      applyReplacement: vi.fn(),
      parsedLink: createParsedLink({ alias: 'current', url: 'target' })
    });

    expect(mockEditLinkUrlAndAliasInPopover).toHaveBeenCalledWith({
      anchorEl,
      defaultAlias: 'current',
      defaultUrl: 'target'
    });
  });

  it('should default the alias field to empty when there is no alias', async () => {
    mockEditLinkUrlAndAliasInPopover.mockResolvedValue(null);

    await createEditParsedLinkUrlAndAliasInPopover(document.body.createEl('a'))({
      app: createMockApp(),
      applyReplacement: vi.fn(),
      parsedLink: createParsedLink({ url: 'target' })
    });

    expect(mockEditLinkUrlAndAliasInPopover).toHaveBeenCalledWith(
      expect.objectContaining({ defaultAlias: '', defaultUrl: 'target' })
    );
  });

  it('should not apply a replacement when the popover is dismissed', async () => {
    mockEditLinkUrlAndAliasInPopover.mockResolvedValue(null);
    const applyReplacement = vi.fn();

    await createEditParsedLinkUrlAndAliasInPopover(document.body.createEl('a'))({
      app: createMockApp(),
      applyReplacement,
      parsedLink: createParsedLink()
    });

    expect(mockGenerateRawMarkdownLink).not.toHaveBeenCalled();
    expect(applyReplacement).not.toHaveBeenCalled();
  });

  it('should rebuild the link with the new url and alias preserving its flags and apply the replacement', async () => {
    mockEditLinkUrlAndAliasInPopover.mockResolvedValue({ alias: 'new alias', url: 'new-target' });
    mockGenerateRawMarkdownLink.mockReturnValue('[[new-target|new alias]]');
    const applyReplacement = vi.fn();

    await createEditParsedLinkUrlAndAliasInPopover(document.body.createEl('a'))({
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
