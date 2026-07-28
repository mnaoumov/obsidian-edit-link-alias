/**
 * @file
 *
 * A small floating editor anchored near a link, editing its URL (target) and alias (display text).
 *
 * This is the plugin's only presentation of the two-field editor — the click, the link context menu and
 * the editor command all open it, so the feature looks the same however it is reached. It deliberately
 * does NOT use the Obsidian `Modal` machinery: a modal dims the screen and is positioned by Obsidian,
 * neither of which suits an editor that should appear where the link is.
 *
 * The three entry points know the position in three different ways, so the popover takes a resolved
 * {@link PopoverAnchor} rather than an element: a clicked link has a rect, a context menu has the
 * pointer that opened it, and a command has the caret. {@link createAnchorFromElement},
 * {@link createAnchorFromPoint} and {@link createAnchorFromSelection} build one for each case.
 */

import {
  Setting,
  TextComponent
} from 'obsidian';

const ALIAS_INPUT_CSS_CLASS = 'link-editor-popover-alias-input';
const CANCEL_BUTTON_CSS_CLASS = 'link-editor-popover-cancel-button';
const OK_BUTTON_CSS_CLASS = 'link-editor-popover-ok-button';
const POPOVER_CSS_CLASS = 'link-editor-popover';
const URL_INPUT_CSS_CLASS = 'link-editor-popover-url-input';

/**
 * The gap in pixels between the anchor and the popover.
 */
const ANCHOR_GAP_IN_PIXELS = 4;

/**
 * The minimum gap in pixels the popover keeps from the edges of the window when it has to be clamped
 * back into view.
 */
const VIEWPORT_MARGIN_IN_PIXELS = 8;

/**
 * The fraction of the window used to place a centered anchor.
 */
const CENTER_FRACTION = 0.5;

/**
 * Parameters for {@link editLinkUrlAndAliasInPopover}.
 */
export interface EditLinkUrlAndAliasInPopoverParams {
  /**
   * Where to place the popover.
   */
  readonly anchor: PopoverAnchor;

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
 * The URL (target) and alias (display text) captured by {@link editLinkUrlAndAliasInPopover}.
 */
export interface LinkUrlAndAlias {
  /**
   * The alias (display text) of the link. Empty when the link has no alias.
   */
  readonly alias: string;

  /**
   * The URL (target) of the link.
   */
  readonly url: string;
}

/**
 * Where the popover is placed: viewport coordinates plus the document they belong to.
 *
 * Carrying the document explicitly is what makes a link inside a pop-out window work — the popover is
 * appended to, and clamped against, that window rather than the main one.
 */
export interface PopoverAnchor {
  /**
   * The viewport `y` coordinate the popover is placed below.
   */
  readonly bottom: number;

  /**
   * The document the coordinates belong to.
   */
  readonly doc: Document;

  /**
   * The viewport `x` coordinate the popover is aligned to.
   */
  readonly left: number;
}

/**
 * Anchors the popover in the middle of the document, for the cases where nothing better is known.
 *
 * @param doc - The document to anchor in.
 * @returns The anchor.
 */
export function createAnchorFromDocumentCenter(doc: Document): PopoverAnchor {
  const win = doc.win;
  return {
    bottom: win.innerHeight * CENTER_FRACTION,
    doc,
    left: win.innerWidth * CENTER_FRACTION
  };
}

/**
 * Anchors the popover just below an element — used for a clicked link, whose rect is exactly where the
 * user is looking.
 *
 * @param el - The element to anchor at.
 * @returns The anchor.
 */
export function createAnchorFromElement(el: HTMLElement): PopoverAnchor {
  const rect = el.getBoundingClientRect();
  return {
    bottom: rect.bottom,
    doc: el.doc,
    left: rect.left
  };
}

/**
 * Anchors the popover at a pointer position — used for the link context menu, which is raised by a
 * right-click or a long-press whose coordinates are where the link is.
 *
 * @param x - The viewport `x` coordinate.
 * @param y - The viewport `y` coordinate.
 * @param doc - The document the coordinates belong to.
 * @returns The anchor.
 */
export function createAnchorFromPoint(x: number, y: number, doc: Document): PopoverAnchor {
  return {
    bottom: y,
    doc,
    left: x
  };
}

/**
 * Anchors the popover at the caret — used by the editor command, which is invoked from the keyboard
 * with the cursor already inside the link being edited.
 *
 * @param doc - The document holding the selection.
 * @returns The anchor, or a centered one when there is no caret to read.
 */
export function createAnchorFromSelection(doc: Document): PopoverAnchor {
  const range = doc.getSelection()?.rangeCount ? doc.getSelection()?.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect();
  if (!rect || (rect.bottom === 0 && rect.left === 0)) {
    return createAnchorFromDocumentCenter(doc);
  }

  return {
    bottom: rect.bottom,
    doc,
    left: rect.left
  };
}

/**
 * Displays the two-field link editor at the given anchor and resolves with the edited URL and alias, or
 * `null` if it was dismissed without confirming.
 *
 * @param params - The parameters for the popover.
 * @returns A {@link Promise} that resolves with the edited {@link LinkUrlAndAlias}, or `null` if dismissed.
 */
export async function editLinkUrlAndAliasInPopover(params: EditLinkUrlAndAliasInPopoverParams): Promise<LinkUrlAndAlias | null> {
  const {
    anchor,
    defaultAlias,
    defaultUrl
  } = params;

  const doc = anchor.doc;
  const win = doc.win;
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
    positionAtAnchor(popoverEl, anchor, win);
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
 * @param anchor - Where the popover belongs.
 * @param win - The window the anchor lives in (a pop-out window has its own).
 */
function positionAtAnchor(popoverEl: HTMLElement, anchor: PopoverAnchor, win: Window): void {
  const maxLeft = Math.max(VIEWPORT_MARGIN_IN_PIXELS, win.innerWidth - popoverEl.offsetWidth - VIEWPORT_MARGIN_IN_PIXELS);
  const maxTop = Math.max(VIEWPORT_MARGIN_IN_PIXELS, win.innerHeight - popoverEl.offsetHeight - VIEWPORT_MARGIN_IN_PIXELS);

  const left = Math.min(Math.max(anchor.left, VIEWPORT_MARGIN_IN_PIXELS), maxLeft);
  const top = Math.min(Math.max(anchor.bottom + ANCHOR_GAP_IN_PIXELS, VIEWPORT_MARGIN_IN_PIXELS), maxTop);

  popoverEl.style.left = `${String(Math.round(left + win.scrollX))}px`;
  popoverEl.style.top = `${String(Math.round(top + win.scrollY))}px`;
}
