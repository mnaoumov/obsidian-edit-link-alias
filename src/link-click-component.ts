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

import type {
  App,
  EditorPosition
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import type { PopoverAnchor } from 'obsidian-dev-utils/obsidian/popovers/popover-anchor';

import {
  getLinkpath,
  Keymap,
  MarkdownView
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { normalizeOptionalProperties } from 'obsidian-dev-utils/object-utils';
import { AllWindowsEventComponent } from 'obsidian-dev-utils/obsidian/components/all-windows-event-component';
import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';
import {
  createAnchorFromElement,
  createAnchorFromPoint
} from 'obsidian-dev-utils/obsidian/popovers/popover-anchor';

import type { LinkTarget } from './link-target.ts';
import type { PluginSettings } from './plugin-settings.ts';
import type { ResolveAndEditLinkParams } from './resolve-link-occurrence.ts';

import { createEditParsedLinkUrlAndAliasInPopover } from './edit-link.ts';
import { isOffsetInFrontmatter } from './frontmatter-link-occurrence.ts';
import { COULD_NOT_LOCATE_LINK_NOTICE } from './notices.ts';
import { resolveAndEditLink } from './resolve-link-occurrence.ts';

/**
 * The rendered forms a link takes. Reading view renders real anchors; Live Preview keeps the link as
 * styled editor text, so the wikilink / markdown-link wrappers and the underlined display text have to
 * be matched too.
 */
const LINK_SELECTOR = [
  'a.internal-link',
  'a.external-link',
  '.cm-hmd-internal-link',
  '.cm-link',
  '.cm-underline',
  /*
   * The Properties panel. Obsidian renders a property link as a `div` carrying `data-href` and the
   * internal-link / external-link class — never an anchor — so the tag cannot be part of the selector
   * (this is why GH #6 saw nothing happen). The same markup covers the text widget and the list pills.
   */
  '.metadata-property-value .internal-link',
  '.metadata-property-value .external-link'
].join(', ');

const EXTERNAL_LINK_CSS_CLASS = 'external-link';
const PRIMARY_MOUSE_BUTTON = 0;
const PROPERTY_KEY_ATTRIBUTE = 'data-property-key';

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

interface LinkClickComponentInterceptAndEditParams {
  /**
   * Where to place the link editor.
   */
  readonly anchor: PopoverAnchor;

  /**
   * The click being intercepted.
   */
  readonly evt: MouseEvent;

  /**
   * What the click said the link points at.
   */
  readonly linkTarget: LinkTarget;

  /**
   * The frontmatter property the click landed in, or `null` when it was not a Properties panel click.
   */
  readonly propertyKey: null | string;

  /**
   * The source position the click resolves to, when there is one.
   */
  readonly sourcePosition?: EditorPosition;

  /**
   * The view the click landed in, or `null` when it could not be determined.
   */
  readonly view: MarkdownView | null;
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
      /*
       * A rendered anchor carries its url in `href`; a Properties panel link is a `div` and carries it in
       * `data-href` instead, so both are read here.
       */
      const externalUrl = href ?? dataHref;
      return externalUrl === null ? null : { externalUrl };
    }

    const linkText = dataHref ?? href;
    const sourcePath = view?.file?.path;
    if (linkText === null || sourcePath === undefined) {
      /*
       * Live Preview and Source mode render links as plain editor text with no href at all, so there is
       * nothing to read the target from. An unknown target is deliberately NOT treated as "no link": the
       * click position resolves it instead (see `resolveAndEditLink`).
       */
      return {};
    }

    const target = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(linkText), sourcePath);
    /*
     * A link to a note that does not exist yet resolves to nothing, so it is carried by its path text —
     * editing the alias of a link to an uncreated note is ordinary, and Reading view has no editor
     * position to fall back on.
     */
    return target === null ? { linkPath: linkText } : { target };
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

  private handleClick(evt: MouseEvent): void {
    if (!this.shouldOpenEditor(evt)) {
      return;
    }

    const linkEl = getClickedLinkEl(evt);
    if (!linkEl) {
      this.handleRawFrontmatterClick(evt);
      return;
    }

    const view = this.getViewContaining(linkEl);
    const linkTarget = this.getLinkTarget(linkEl, view);
    if (!linkTarget) {
      return;
    }

    const propertyKey = getClickedPropertyKey(linkEl);

    /*
     * The click's own coordinates are the exact identity of the clicked link — the ONLY one in Live
     * Preview, where the link carries no href. The caret is NOT usable here: an Alt click on a Live
     * Preview link leaves it at the end of the line, not inside the link (verified against a real
     * Obsidian). Reading view has no editor to ask, hence the mode check.
     *
     * A Properties panel link is deliberately excluded: it sits outside the editor's text, so its
     * coordinates resolve to an unrelated position, and the property key it carries is the better
     * identity anyway.
     */
    const sourcePosition = propertyKey === null && view?.getMode() === 'source' ? view.editor.posAtMouse(evt) : undefined;

    this.interceptAndEdit({
      anchor: createAnchorFromElement(linkEl),
      evt,
      linkTarget,
      propertyKey,
      view,
      ...normalizeOptionalProperties<Pick<LinkClickComponentInterceptAndEditParams, 'sourcePosition'>>({ sourcePosition })
    });
  }

  /**
   * Handles a click that landed on no rendered link, in case it landed on a link inside the raw YAML of a
   * note's frontmatter in Source mode. Nothing there is a link element — Obsidian decorates no links inside
   * the frontmatter block — so the pointer position is the only identity available (GH #6).
   *
   * @param evt - The click event.
   */
  private handleRawFrontmatterClick(evt: MouseEvent): void {
    const { target } = evt;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const view = this.getViewContaining(target);
    if (view?.getMode() !== 'source') {
      return;
    }

    const { editor } = view;
    const sourcePosition = editor.posAtMouse(evt);
    if (!isOffsetInFrontmatter(editor.getValue(), editor.posToOffset(sourcePosition))) {
      return;
    }

    const line = editor.getDoc().getLine(sourcePosition.line);
    const isPointerOnLink = parseLinks(line)
      .some((parsedLink) => parsedLink.startOffset <= sourcePosition.ch && sourcePosition.ch <= parsedLink.endOffset);
    if (!isPointerOnLink) {
      return;
    }

    this.interceptAndEdit({
      anchor: createAnchorFromPoint(evt.clientX, evt.clientY, target.doc),
      evt,
      // Raw YAML says nothing about what the link points at; the position resolves it.
      linkTarget: {},
      propertyKey: null,
      sourcePosition,
      view
    });
  }

  /**
   * Stops Obsidian from acting on the click and opens the link editor instead.
   *
   * @param params - The parameters for the interception.
   */
  private interceptAndEdit(params: LinkClickComponentInterceptAndEditParams): void {
    const {
      anchor,
      evt,
      linkTarget,
      propertyKey,
      sourcePosition,
      view
    } = params;

    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();

    invokeAsyncSafely(async () => {
      await resolveAndEditLink({
        app: this.app,
        editParsedLink: createEditParsedLinkUrlAndAliasInPopover(anchor),
        linkTarget,
        showCouldNotLocateNotice: () => {
          this.pluginNoticeComponent.showNotice(COULD_NOT_LOCATE_LINK_NOTICE);
        },
        view,
        ...normalizeOptionalProperties<Pick<ResolveAndEditLinkParams, 'propertyKey' | 'sourcePosition'>>({
          propertyKey: propertyKey ?? undefined,
          sourcePosition
        })
      });
    });
  }

  private shouldOpenEditor(evt: MouseEvent): boolean {
    if (evt.button !== PRIMARY_MOUSE_BUTTON) {
      return false;
    }

    if (!this.pluginSettingsComponent.settings.shouldOpenLinkEditorOnAltClick) {
      return false;
    }

    /*
     * Alt, not Mod: Ctrl/Cmd + click is already Obsidian's "open the link in a new tab", so the editor
     * must not take it over. Obsidian gives Alt + click no meaning on a link.
     *
     * Requiring that no OTHER modifier is held keeps every gesture Obsidian does assign a meaning to —
     * Ctrl/Cmd, Shift, and their combinations with Alt — reaching Obsidian untouched.
     */
    if (Keymap.isModifier(evt, 'Mod') || Keymap.isModifier(evt, 'Shift')) {
      return false;
    }

    return Keymap.isModifier(evt, 'Alt');
  }
}

function getClickedLinkEl(evt: MouseEvent): HTMLElement | null {
  const { target } = evt;
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return target.closest<HTMLElement>(LINK_SELECTOR);
}

/**
 * Reads the frontmatter property a clicked link belongs to, when it was rendered by the Properties panel.
 *
 * @param linkEl - The clicked link element.
 * @returns The property key, or `null` when the link was not rendered by the Properties panel.
 */
function getClickedPropertyKey(linkEl: HTMLElement): null | string {
  return linkEl.closest<HTMLElement>(`[${PROPERTY_KEY_ATTRIBUTE}]`)?.getAttribute(PROPERTY_KEY_ATTRIBUTE) ?? null;
}
