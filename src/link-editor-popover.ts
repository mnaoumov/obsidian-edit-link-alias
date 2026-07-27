/**
 * @file
 *
 * A small floating editor anchored at a link, editing its URL (target) and alias (display text).
 *
 * This is the popover form of the two-field editor: same contract as {@link editLinkUrlAndAlias} (it
 * resolves with the edited {@link LinkUrlAndAlias} or `null` when dismissed), so both can be handed to
 * the same call sites, but it renders next to the clicked link instead of as a centered modal. It is
 * what the click-interception path opens, where a modal in the middle of the screen would be a jarring
 * answer to "I clicked this link".
 *
 * It deliberately does NOT use the Obsidian `Modal` machinery: a modal grabs focus with a dimmed
 * backdrop and is positioned by Obsidian, neither of which suits an inline anchored editor.
 */

import {
  Setting,
  TextComponent
} from 'obsidian';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { LinkUrlAndAlias } from './link-editor-modal.ts';

const ALIAS_INPUT_CSS_CLASS = 'link-editor-popover-alias-input';
const CANCEL_BUTTON_CSS_CLASS = 'link-editor-popover-cancel-button';
const OK_BUTTON_CSS_CLASS = 'link-editor-popover-ok-button';
const POPOVER_CSS_CLASS = 'link-editor-popover';
const URL_INPUT_CSS_CLASS = 'link-editor-popover-url-input';

/**
 * The gap in pixels between the anchored link and the popover.
 */
const ANCHOR_GAP_IN_PIXELS = 4;

/**
 * The minimum gap in pixels the popover keeps from the edges of the window when it has to be clamped
 * back into view.
 */
const VIEWPORT_MARGIN_IN_PIXELS = 8;

/**
 * Parameters for {@link editLinkUrlAndAliasInPopover}.
 */
export interface EditLinkUrlAndAliasInPopoverParams {
  /**
   * The element the popover is positioned at — the clicked link.
   */
  readonly anchorEl: HTMLElement;

  /**
   * The alias to pre-fill the alias field with.
   */
  readonly defaultAlias: string;

  /**
   * The URL to pre-fill the URL field with.
   */
  readonly defaultUrl: string;
}

/**
 * Displays the two-field link editor anchored at the given element and resolves with the edited URL and
 * alias, or `null` if it was dismissed without confirming.
 *
 * @param params - The parameters for the popover.
 * @returns A {@link Promise} that resolves with the edited {@link LinkUrlAndAlias}, or `null` if dismissed.
 */
export async function editLinkUrlAndAliasInPopover(params: EditLinkUrlAndAliasInPopoverParams): Promise<LinkUrlAndAlias | null> {
  const {
    anchorEl,
    defaultAlias,
    defaultUrl
  } = params;

  /*
   * Resolved from the anchor rather than the globals so a link inside a pop-out window gets its
   * popover appended to — and clamped against — that window, not the main one. The document of a
   * rendered, clicked link always has a view.
   */
  const doc = anchorEl.ownerDocument;
  const win = ensureNonNullable(doc.defaultView, 'The clicked link belongs to a document with no window');
  const popoverEl = doc.body.createDiv({ cls: ['menu', POPOVER_CSS_CLASS] });

  const urlText = addField(popoverEl, 'URL', defaultUrl, URL_INPUT_CSS_CLASS);
  const aliasText = addField(popoverEl, 'Alias', defaultAlias, ALIAS_INPUT_CSS_CLASS);

  return await new Promise<LinkUrlAndAlias | null>((resolve) => {
    const state = { isClosed: false };

    function close(result: LinkUrlAndAlias | null): void {
      if (state.isClosed) {
        return;
      }
      state.isClosed = true;
      doc.removeEventListener('pointerdown', handlePointerDown, true);
      popoverEl.remove();
      resolve(result);
    }

    function handleOk(): void {
      close({
        alias: aliasText.getValue(),
        url: urlText.getValue()
      });
    }

    /**
     * Dismisses the popover when the next gesture starts outside it. Listening for `pointerdown` rather
     * than `click` matters: the popover is opened from a `click` handler, and the very same click would
     * otherwise reach this listener and close the popover the instant it appears.
     *
     * @param evt - The pointer event.
     */
    function handlePointerDown(evt: PointerEvent): void {
      if (evt.target instanceof Node && popoverEl.contains(evt.target)) {
        return;
      }
      close(null);
    }

    popoverEl.addEventListener('keydown', (evt: KeyboardEvent) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        handleOk();
        return;
      }

      if (evt.key === 'Escape') {
        evt.preventDefault();
        close(null);
      }
    });

    const buttonsSetting = new Setting(popoverEl);
    buttonsSetting.addButton((button) => {
      button
        .setButtonText('OK')
        .setCta()
        .setClass(OK_BUTTON_CSS_CLASS)
        .onClick(handleOk);
    });
    buttonsSetting.addButton((button) => {
      button
        .setButtonText('Cancel')
        .setClass(CANCEL_BUTTON_CSS_CLASS)
        .onClick(() => {
          close(null);
        });
    });

    doc.addEventListener('pointerdown', handlePointerDown, true);
    positionAtAnchor(popoverEl, anchorEl, win);
    urlText.inputEl.focus();
    urlText.inputEl.select();
  });
}

function addField(containerEl: HTMLElement, name: string, value: string, cssClass: string): TextComponent {
  const setting = new Setting(containerEl).setName(name);
  const textComponent = new TextComponent(setting.controlEl);
  textComponent.setValue(value);
  textComponent.inputEl.addClass(cssClass);
  return textComponent;
}

/**
 * Places the popover just below the anchor, pulling it back inside the window when it would otherwise
 * overflow — a link near the right or bottom edge is exactly where an unclamped popover would render
 * off-screen.
 *
 * @param popoverEl - The popover to position.
 * @param anchorEl - The element to anchor it to.
 * @param win - The window the anchor lives in (a pop-out window has its own).
 */
function positionAtAnchor(popoverEl: HTMLElement, anchorEl: HTMLElement, win: Window): void {
  const anchorRect = anchorEl.getBoundingClientRect();

  const maxLeft = Math.max(VIEWPORT_MARGIN_IN_PIXELS, win.innerWidth - popoverEl.offsetWidth - VIEWPORT_MARGIN_IN_PIXELS);
  const maxTop = Math.max(VIEWPORT_MARGIN_IN_PIXELS, win.innerHeight - popoverEl.offsetHeight - VIEWPORT_MARGIN_IN_PIXELS);

  const left = Math.min(Math.max(anchorRect.left, VIEWPORT_MARGIN_IN_PIXELS), maxLeft);
  const top = Math.min(Math.max(anchorRect.bottom + ANCHOR_GAP_IN_PIXELS, VIEWPORT_MARGIN_IN_PIXELS), maxTop);

  popoverEl.style.left = `${String(Math.round(left + win.scrollX))}px`;
  popoverEl.style.top = `${String(Math.round(top + win.scrollY))}px`;
}
