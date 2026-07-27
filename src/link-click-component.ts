/**
 * @file
 *
 * Turns a click on a link into the link editor instead of navigation.
 *
 * Obsidian raises no event for "a link was clicked" — `openLinkText` is called from the click handlers
 * of several different surfaces, and patching it would also intercept navigation coming from the
 * backlinks pane, search, the graph, and every other place a link can be followed. So this listens for
 * the DOM `click` in the capture phase, which is the only point where the navigation can still be
 * stopped, and only for clicks that actually land on a rendered link. This is a deliberate G51
 * deviation, documented in `AGENTS.md`.
 *
 * The gesture that opens the editor is chosen by {@link LinkClickAction}; the other gesture is left
 * entirely untouched, so it keeps whatever meaning Obsidian gives it.
 */

import type { App } from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import {
  getLinkpath,
  Keymap,
  MarkdownView
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { AllWindowsEventComponent } from 'obsidian-dev-utils/obsidian/components/all-windows-event-component';

import type { PluginSettings } from './plugin-settings.ts';
import type { LinkTarget } from './resolve-link-occurrence.ts';

import { createEditParsedLinkUrlAndAliasInPopover } from './edit-link.ts';
import { LinkClickAction } from './link-click-action.ts';
import { resolveAndEditLink } from './resolve-link-occurrence.ts';

/**
 * The rendered forms a link takes. Reading view renders real anchors; Live Preview keeps the link as
 * styled editor text, so the wikilink / markdown-link wrappers and the underlined display text have to
 * be matched too.
 */
const LINK_SELECTOR = 'a.internal-link, a.external-link, .cm-hmd-internal-link, .cm-link, .cm-underline';

const EXTERNAL_LINK_CSS_CLASS = 'external-link';
const PRIMARY_MOUSE_BUTTON = 0;

/**
 * Parameters for constructing a {@link LinkClickComponent}.
 */
export interface LinkClickComponentConstructorParams {
  /**
   * The plugin notice component, used to surface user-facing notices.
   */
  readonly pluginNoticeComponent: PluginNoticeComponent;

  /**
   * The settings component holding the configured {@link LinkClickAction}.
   */
  readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;
}

interface ContainingViewState {
  view: MarkdownView | null;
}

/**
 * Opens the link editor popover when a link is clicked with the configured gesture, instead of letting
 * Obsidian open the link.
 */
export class LinkClickComponent extends AllWindowsEventComponent {
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;

  /**
   * Creates a new link click component.
   *
   * @param app - The Obsidian app instance.
   * @param options - The remaining collaborators.
   */
  // eslint-disable-next-line obsidian-dev-utils/params-options-name-match -- The base class takes the app as its sole positional argument, so this bag is supplementary.
  public constructor(app: App, options: LinkClickComponentConstructorParams) {
    super(app);
    this.pluginNoticeComponent = options.pluginNoticeComponent;
    this.pluginSettingsComponent = options.pluginSettingsComponent;
  }

  public override onload(): void {
    super.onload();

    this.registerAllDocumentsDomEvent({
      callback: (evt: MouseEvent) => {
        this.handleClick(evt);
      },
      // Capture, because by the time the click bubbles Obsidian has already handled it.
      options: { capture: true },
      type: 'click'
    });
  }

  protected handleClick(evt: MouseEvent): void {
    if (!this.shouldOpenEditor(evt)) {
      return;
    }

    const linkEl = getClickedLinkEl(evt);
    if (!linkEl) {
      return;
    }

    const view = this.getViewContaining(linkEl);
    const linkTarget = this.getLinkTarget(linkEl, view);
    if (!linkTarget) {
      return;
    }

    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();

    invokeAsyncSafely(async () => {
      await resolveAndEditLink({
        app: this.app,
        editParsedLink: createEditParsedLinkUrlAndAliasInPopover(linkEl),
        linkTarget,
        showCouldNotLocateNotice: () => {
          this.pluginNoticeComponent.showNotice('Could not locate the link in the source note.');
        },
        view
      });
    });
  }

  /**
   * Reads what the clicked element points at. An internal link carries the link path in `data-href`,
   * which is resolved against the note it was clicked in; an external one carries its url in `href`.
   *
   * @param linkEl - The clicked link element.
   * @param view - The view the link was clicked in, used to resolve the link path.
   * @returns The link target, or `null` when the element points nowhere resolvable.
   */
  private getLinkTarget(linkEl: HTMLElement, view: MarkdownView | null): LinkTarget | null {
    const dataHref = linkEl.getAttribute('data-href');
    const href = linkEl.getAttribute('href');

    if (linkEl.hasClass(EXTERNAL_LINK_CSS_CLASS)) {
      return href === null ? null : { externalUrl: href };
    }

    const linkText = dataHref ?? href;
    const sourcePath = view?.file?.path;
    if (linkText === null || sourcePath === undefined) {
      /*
       * Live Preview renders links as plain editor text with no href at all. There is nothing to match
       * against, but the caret is already inside the clicked link, so an empty target lets the editor
       * path resolve it — and it is deliberately not treated as "no link".
       */
      return {};
    }

    const target = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(linkText), sourcePath);
    return target === null ? {} : { target };
  }

  private getViewContaining(el: HTMLElement): MarkdownView | null {
    const state: ContainingViewState = { view: null };
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(el)) {
        state.view = leaf.view;
      }
    });
    return state.view;
  }

  private shouldOpenEditor(evt: MouseEvent): boolean {
    if (evt.button !== PRIMARY_MOUSE_BUTTON) {
      return false;
    }

    const isModPressed = Keymap.isModifier(evt, 'Mod');
    switch (this.pluginSettingsComponent.settings.linkClickAction) {
      case LinkClickAction.OpenEditorOnClick:
        return !isModPressed;
      case LinkClickAction.OpenEditorOnModClick:
        return isModPressed;
      default:
        return false;
    }
  }
}

function getClickedLinkEl(evt: MouseEvent): HTMLElement | null {
  const { target } = evt;
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return target.closest<HTMLElement>(LINK_SELECTOR);
}
