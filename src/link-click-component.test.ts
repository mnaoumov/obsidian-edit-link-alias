import type {
  App as AppOriginal,
  MarkdownView as MarkdownViewType,
  TFile,
  WorkspaceLeaf
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import {
  Keymap,
  MarkdownView
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

interface ClickOptions {
  readonly altKey?: boolean;
  readonly button?: number;
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
}

let app: AppOriginal;
let component: LinkClickComponent;
let containerEl: HTMLElement;
let getFirstLinkpathDest: ReturnType<typeof vi.fn>;
let showNotice: ReturnType<typeof vi.fn>;
let viewMode: 'preview' | 'source';

function click(el: HTMLElement, options: ClickOptions = {}): void {
  const {
    altKey = true,
    button = 0,
    ctrlKey = false,
    shiftKey = false
  } = options;
  el.dispatchEvent(
    new MouseEvent('click', {
      altKey,
      bubbles: true,
      button,
      cancelable: true,
      ctrlKey,
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

function loadComponent(shouldOpenLinkEditorOnAltClick = true): void {
  component = new LinkClickComponent(app, {
    pluginNoticeComponent: castTo<PluginNoticeComponent>({ showNotice }),
    pluginSettingsComponent: strictProxy<PluginSettingsComponentBase<PluginSettings>>({ settings: { shouldOpenLinkEditorOnAltClick } })
  });
  component.load();
}

beforeEach(() => {
  document.body.empty();
  viewMode = 'source';
  showNotice = vi.fn();

  /*
   * The obsidian-test-mocks Keymap is a stub that always reports no modifier, so without this spy every
   * gesture case would exercise the same branch and still pass.
   */
  // TODO(T203): Drop this spy once obsidian-test-mocks implements Keymap.isModifier against the event (T202).
  vi.spyOn(Keymap, 'isModifier').mockImplementation((evt, modifier) => {
    if (!('altKey' in evt)) {
      return false;
    }
    switch (modifier) {
      case 'Alt':
        return evt.altKey;
      case 'Shift':
        return evt.shiftKey;
      default:
        return evt.ctrlKey || evt.metaKey;
    }
  });
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

  it('should leave the target unset for a Live Preview link that carries no href', async () => {
    loadComponent();

    click(containerEl.createSpan({ cls: 'cm-hmd-internal-link' }));
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).toHaveBeenCalledWith(expect.objectContaining({ linkTarget: {} }));
  });

  it('should leave the target unset when the link path does not resolve', async () => {
    loadComponent();
    getFirstLinkpathDest.mockReturnValue(null);

    click(createInternalLinkEl('missing'));
    await waitForAllAsyncOperations();

    expect(mockResolveAndEditLink).toHaveBeenCalledWith(expect.objectContaining({ linkTarget: {} }));
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
