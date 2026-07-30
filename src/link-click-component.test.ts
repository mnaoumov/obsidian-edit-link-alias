import type {
  App as AppOriginal,
  Editor,
  EditorPosition,
  MarkdownView as MarkdownViewType,
  TFile,
  WorkspaceLeaf
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import {
  MarkdownView,
  Platform
} from 'obsidian';
import { waitForAllAsyncOperations } from 'obsidian-dev-utils/async';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { EMPTY } from 'obsidian-dev-utils/string';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettings } from './plugin-settings.ts';

import { createEditParsedLinkUrlAndAliasInPopover } from './edit-link.ts';
import { LinkClickComponent } from './link-click-component.ts';
import { resolveAndEditLink } from './resolve-link-occurrence.ts';

vi.mock('./edit-link.ts', () => ({ createEditParsedLinkUrlAndAliasInPopover: vi.fn() }));
vi.mock('./resolve-link-occurrence.ts', () => ({ resolveAndEditLink: vi.fn() }));

const mockCreateEditParsedLinkUrlAndAliasInPopover = vi.mocked(createEditParsedLinkUrlAndAliasInPopover);
const mockResolveAndEditLink = vi.mocked(resolveAndEditLink);

const SECONDARY_MOUSE_BUTTON = 2;
const SOURCE_PATH = 'source.md';
const TARGET_PATH = 'target.md';

/**
 * Where `posAtMouse` claims the click landed. Arbitrary, but distinct from `{ ch: 0, line: 0 }` so a
 * forwarded position cannot be confused with a default one.
 */
const CLICK_POSITION: EditorPosition = { ch: 7, line: 3 };

const PROPERTY_URL = 'https://example.com';

/**
 * Raw frontmatter whose line 3 holds a url spanning {@link CLICK_POSITION}, so a click "lands" on it.
 */
const RAW_FRONTMATTER_CONTENT = `---\nurl: ${PROPERTY_URL}\ntags: x\nfoo: ${PROPERTY_URL}/deep\n---\n`;

interface ClickOptions {
  readonly altKey?: boolean;
  readonly button?: number;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}

interface CreatePropertyLinkElOptions {
  readonly cls?: string;
  readonly dataHref?: string;
  readonly propertyKey: string;
}

let app: AppOriginal;
let component: LinkClickComponent;
let containerEl: HTMLElement;
let getFirstLinkpathDest: ReturnType<typeof vi.fn>;
let posAtMouse: ReturnType<typeof vi.fn>;
let showNotice: ReturnType<typeof vi.fn>;
let viewMode: 'preview' | 'source';
/**
 * What the editor reports as the note content. Only the raw-frontmatter click path reads it, so it stays
 * empty (no frontmatter) unless a test sets it.
 */
let editorContent: string;

function click(el: HTMLElement, options: ClickOptions = {}): void {
  const {
    altKey = true,
    button = 0,
    ctrlKey = false,
    metaKey = false,
    shiftKey = false
  } = options;
  el.dispatchEvent(
    new MouseEvent('click', {
      altKey,
      bubbles: true,
      button,
      cancelable: true,
      ctrlKey,
      metaKey,
      shiftKey
    })
  );
}

function createInternalLinkEl(dataHref = 'target'): HTMLElement {
  return containerEl.createEl('a', {
    attr: { 'data-href': dataHref },
    cls: 'internal-link'
  });
}

/**
 * Builds the markup Obsidian's Properties panel renders for a link: a `div` carrying `data-href` and the
 * internal-link / external-link class — never an anchor, and never an `href` — inside a
 * `.metadata-property-value` whose `.metadata-property` ancestor names the property. Verified against
 * Obsidian 1.13.4.
 *
 * @param options - What to render.
 * @returns The link element.
 */
function createPropertyLinkEl(options: CreatePropertyLinkElOptions): HTMLElement {
  const {
    cls = 'metadata-link-inner external-link',
    dataHref = PROPERTY_URL,
    propertyKey
  } = options;

  const propertyEl = containerEl.createDiv({
    attr: { 'data-property-key': propertyKey },
    cls: 'metadata-property'
  });
  const valueEl = propertyEl.createDiv({ cls: 'metadata-property-value' });
  return valueEl.createDiv({
    attr: { 'data-href': dataHref },
    cls
  });
}

function loadComponent(shouldOpenLinkEditorOnAltClick = true): void {
  component = new LinkClickComponent(app, {
    pluginNoticeComponent: castTo<PluginNoticeComponent>({ showNotice }),
    pluginSettingsComponent: strictProxy<PluginSettingsComponentBase<PluginSettings>>({ settings: { shouldOpenLinkEditorOnAltClick } })
  });
  component.load();
}

/**
 * Converts an editor position into a character offset, the way `Editor.posToOffset` does.
 *
 * @param content - The editor content.
 * @param position - The position to convert.
 * @returns The character offset.
 */
function toOffset(content: string, position: EditorPosition): number {
  const lines = content.split('\n').slice(0, position.line);
  const precedingLength = lines.reduce((total, lineText) => total + lineText.length + 1, 0);
  return precedingLength + position.ch;
}

beforeEach(() => {
  document.body.empty();
  viewMode = 'source';
  showNotice = vi.fn();
  posAtMouse = vi.fn().mockReturnValue(CLICK_POSITION);
  editorContent = '';

  getFirstLinkpathDest = vi.fn().mockReturnValue(strictProxy<TFile>({ path: TARGET_PATH }));

  const appMock = App.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((cb: () => void) => {
    cb();
  });
  app = appMock.asOriginalType__();

  containerEl = document.body.createDiv();
  const view = castTo<MarkdownViewType>(Object.create(MarkdownView.prototype));
  Object.assign(view, {
    containerEl,
    editor: strictProxy<Editor>({
      getDoc: vi.fn().mockImplementation(() => strictProxy({ getLine: (line: number) => editorContent.split('\n')[line] ?? '' })),
      getValue: () => editorContent,
      posAtMouse: castTo<Editor['posAtMouse']>(posAtMouse),
      posToOffset: (position: EditorPosition) => toOffset(editorContent, position)
    }),
    file: strictProxy<TFile>({ path: SOURCE_PATH }),
    getMode: () => viewMode
  });
  app.workspace.iterateAllLeaves = vi.fn((callback: (leaf: WorkspaceLeaf) => unknown) => {
    callback(castTo<WorkspaceLeaf>({ view }));
  });
  app.metadataCache.getFirstLinkpathDest = castTo<AppOriginal['metadataCache']['getFirstLinkpathDest']>(getFirstLinkpathDest);

  mockCreateEditParsedLinkUrlAndAliasInPopover.mockReset().mockReturnValue(vi.fn());
  mockResolveAndEditLink.mockReset().mockResolvedValue();
});

afterEach(() => {
  component.unload();
  vi.restoreAllMocks();

  /*
   * A plain property write on the shared Platform mock, so vi.restoreAllMocks() does not undo it — reset
   * it here or a macOS test would leak its platform into every later test.
   */
  Platform.isMacOS = false;
  document.body.empty();
});

describe('LinkClickComponent', () => {
  it('should not intercept an Alt click when the setting is turned off', async () => {
    loadComponent(false);

    click(createInternalLinkEl());
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).not.toHaveBeenCalled();
  });

  it('should open the editor for the Alt-clicked link and suppress the navigation', async () => {
    loadComponent();
    const linkEl = createInternalLinkEl();

    const evt = new MouseEvent('click', {
      altKey: true,
      bubbles: true,
      cancelable: true
    });
    linkEl.dispatchEvent(evt);
    await waitForAllAsyncOperations();

    expect(evt.defaultPrevented).toBe(true);
    expect(mockCreateEditParsedLinkUrlAndAliasInPopover).toHaveBeenCalledWith(expect.objectContaining({ doc: document }));
    const resolveParams = mockResolveAndEditLink.mock.calls[0]?.[0];
    expect(resolveParams?.app).toBe(app);
    expect(resolveParams?.linkTarget.target?.path).toBe(TARGET_PATH);
  });

  it('should leave a plain click alone, so the link still opens', async () => {
    loadComponent();

    click(createInternalLinkEl(), { altKey: false });
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).not.toHaveBeenCalled();
  });

  it('should leave Ctrl + click alone, so it still opens the link in a new tab', async () => {
    loadComponent();

    click(createInternalLinkEl(), { ctrlKey: true });
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).not.toHaveBeenCalled();
  });

  it('should leave Cmd + click alone on macOS, so it still opens the link in a new tab', async () => {
    Platform.isMacOS = true;
    loadComponent();

    click(createInternalLinkEl(), { metaKey: true });
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).not.toHaveBeenCalled();
  });

  it('should leave Shift + Alt click alone', async () => {
    loadComponent();

    click(createInternalLinkEl(), { shiftKey: true });
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).not.toHaveBeenCalled();
  });

  it('should ignore a non-primary button', async () => {
    loadComponent();

    click(createInternalLinkEl(), { button: SECONDARY_MOUSE_BUTTON });
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).not.toHaveBeenCalled();
  });

  it('should ignore a click that is not on a link', async () => {
    loadComponent();

    click(containerEl.createEl('p', { text: `${EMPTY}not a link` }));
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).not.toHaveBeenCalled();
  });

  it('should ignore a click whose target is not an element', async () => {
    loadComponent();

    document.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true }));
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).not.toHaveBeenCalled();
  });

  describe('frontmatter links', () => {
    it('should resolve a Properties panel link by its property key rather than a position', async () => {
      loadComponent();

      click(createPropertyLinkEl({ propertyKey: 'url' }));
      await waitForAllAsyncOperations();

      const params = mockResolveAndEditLink.mock.calls[0]?.[0];
      expect(params?.propertyKey).toBe('url');
      expect(params?.linkTarget).toEqual({ externalUrl: PROPERTY_URL });
      /*
       * A panel link sits outside the editor's text, so its coordinates would resolve to an unrelated
       * position — the property key is the identity here.
       */
      expect(params?.sourcePosition).toBeUndefined();
    });

    it('should resolve a list property pill, which Obsidian renders with a different class', async () => {
      loadComponent();

      click(createPropertyLinkEl({
        cls: 'multi-select-pill-content external-link',
        propertyKey: 'links'
      }));
      await waitForAllAsyncOperations();

      const params = mockResolveAndEditLink.mock.calls[0]?.[0];
      expect(params?.propertyKey).toBe('links');
      expect(params?.linkTarget).toEqual({ externalUrl: PROPERTY_URL });
    });

    it('should open the editor for a link in the raw YAML, where there is no link element at all', async () => {
      editorContent = RAW_FRONTMATTER_CONTENT;
      loadComponent();

      click(containerEl.createEl('p', { text: `${EMPTY}raw yaml` }));
      await waitForAllAsyncOperations();

      const params = mockResolveAndEditLink.mock.calls[0]?.[0];
      // Nothing says what the link points at, so the position is the whole identity.
      expect(params?.linkTarget).toEqual({});
      expect(params?.sourcePosition).toEqual(CLICK_POSITION);
      expect(params?.propertyKey).toBeUndefined();
    });

    it('should ignore a click inside the frontmatter that is not on a link', async () => {
      editorContent = '---\ntitle: plain\nother: plain\nmore: plain\n---\n';
      loadComponent();

      click(containerEl.createEl('p', { text: `${EMPTY}raw yaml` }));
      await waitForAllAsyncOperations();

      expect(mockResolveAndEditLink).not.toHaveBeenCalled();
    });

    it('should ignore a click on a link that is outside the frontmatter', async () => {
      // Same url, but the click position is on a body line, which the body paths already handle.
      editorContent = `# Body\n\n\n${PROPERTY_URL}\n`;
      loadComponent();

      click(containerEl.createEl('p', { text: `${EMPTY}body` }));
      await waitForAllAsyncOperations();

      expect(mockResolveAndEditLink).not.toHaveBeenCalled();
    });

    it('should ignore a non-link click in Reading view, where there is no editor to ask', async () => {
      viewMode = 'preview';
      editorContent = RAW_FRONTMATTER_CONTENT;
      loadComponent();

      click(containerEl.createEl('p', { text: `${EMPTY}reading view` }));
      await waitForAllAsyncOperations();

      expect(mockResolveAndEditLink).not.toHaveBeenCalled();
    });
  });

  it('should resolve the link from an ancestor when an inner element is clicked', async () => {
    loadComponent();
    const linkEl = createInternalLinkEl();
    const innerEl = linkEl.createSpan({ text: 'display' });

    linkEl.getBoundingClientRect = (): DOMRect => castTo<DOMRect>({ bottom: 42, left: 7 });
    click(innerEl);
    await waitForAllAsyncOperations();

    // The popover anchors at the LINK, not at the inner element that received the click.
    expect(mockCreateEditParsedLinkUrlAndAliasInPopover).toHaveBeenCalledWith({
      bottom: 42,
      doc: document,
      left: 7
    });
  });

  it('should carry the external url for an external link', async () => {
    loadComponent();
    const linkEl = containerEl.createEl('a', {
      attr: { href: 'https://example.com' },
      cls: 'external-link'
    });

    click(linkEl);
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).toHaveBeenCalledWith(
      expect.objectContaining({ linkTarget: { externalUrl: 'https://example.com' } })
    );
  });

  it('should ignore an external link with no url', async () => {
    loadComponent();

    click(containerEl.createEl('a', { cls: 'external-link' }));
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).not.toHaveBeenCalled();
  });

  it('should identify a Live Preview link that carries no href by the click position alone', async () => {
    loadComponent();

    click(containerEl.createSpan({ cls: 'cm-hmd-internal-link' }));
    await waitForAllAsyncOperations();

    // No href to read the target from, so the position the click resolves to is the whole identity.
    expect(mockResolveAndEditLink).toHaveBeenCalledWith(
      expect.objectContaining({
        linkTarget: {},
        sourcePosition: CLICK_POSITION
      })
    );
  });

  it('should carry the link path when the target note does not exist', async () => {
    loadComponent();
    getFirstLinkpathDest.mockReturnValue(null);

    click(createInternalLinkEl('missing'));
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).toHaveBeenCalledWith(expect.objectContaining({ linkTarget: { linkPath: 'missing' } }));
  });

  it('should not resolve a click position in Reading view, which has no editor to ask', async () => {
    viewMode = 'preview';
    loadComponent();

    click(createInternalLinkEl());
    await waitForAllAsyncOperations();

    expect(posAtMouse).not.toHaveBeenCalled();
    expect(mockResolveAndEditLink.mock.calls[0]?.[0].sourcePosition).toBeUndefined();
  });

  it('should not resolve a click position when the link is outside every leaf', async () => {
    loadComponent();

    click(document.body.createEl('a', {
      attr: { 'data-href': 'target' },
      cls: 'internal-link'
    }));
    await waitForAllAsyncOperations();

    expect(posAtMouse).not.toHaveBeenCalled();
    expect(mockResolveAndEditLink.mock.calls[0]?.[0].sourcePosition).toBeUndefined();
  });

  it('should pass the view containing the link, and no view when it is outside every leaf', async () => {
    loadComponent();
    const outsideLinkEl = document.body.createEl('a', {
      attr: { 'data-href': 'target' },
      cls: 'internal-link'
    });

    click(outsideLinkEl);
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).toHaveBeenCalledWith(expect.objectContaining({ view: null }));

    mockResolveAndEditLink.mockClear();
    click(createInternalLinkEl());
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).toHaveBeenCalledWith(
      expect.objectContaining({ view: expect.any(MarkdownView) as unknown })
    );
  });

  it('should surface a notice when the link cannot be located in the source note', async () => {
    loadComponent();

    click(createInternalLinkEl());
    await waitForAllAsyncOperations();

    const showCouldNotLocateNotice = mockResolveAndEditLink.mock.calls[0]?.[0].showCouldNotLocateNotice;
    showCouldNotLocateNotice?.();

    expect(showNotice).toHaveBeenCalledOnce();
  });
});
