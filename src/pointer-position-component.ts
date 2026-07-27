/**
 * @file
 *
 * Remembers where the last pointer gesture happened, so the link editor can be anchored there.
 *
 * The link context menu is the reason this exists: Obsidian's `file-menu` / `url-menu` events carry the
 * target file or url but no event and no DOM element, and by the time a menu item's callback runs the
 * menu is closing — so there is nothing left to measure. The right-click (or long-press) that raised
 * the menu is, however, exactly where the link is, and it always precedes the menu.
 */

import type { App } from 'obsidian';

import { AllWindowsEventComponent } from 'obsidian-dev-utils/obsidian/components/all-windows-event-component';

import type { PopoverAnchor } from './link-editor-popover.ts';

import { createAnchorFromPoint } from './link-editor-popover.ts';

/**
 * Records the position of the last pointer gesture in any window.
 */
export class PointerPositionComponent extends AllWindowsEventComponent {
  private lastAnchor: null | PopoverAnchor = null;

  /**
   * Creates a new pointer position component.
   *
   * @param app - The Obsidian app instance.
   */
  public constructor(app: App) {
    super(app);
  }

  /**
   * The anchor for the last pointer gesture.
   *
   * @returns The anchor, or `null` when no pointer gesture has happened yet.
   */
  public getLastPointerAnchor(): null | PopoverAnchor {
    return this.lastAnchor;
  }

  public override onload(): void {
    super.onload();

    /*
     * Registered per window rather than through `registerAllDocumentsDomEvent` so the document is
     * taken from the window the listener belongs to. Deriving it from the event target instead would
     * add a branch that a document-level listener can never take.
     *
     * `pointerdown` rather than `click` / `contextmenu`: it fires for every button and for touch, so
     * one listener covers a desktop right-click and a mobile long-press alike, and it always runs
     * before the menu opens.
     */
    this.registerAllWindowsHandler((win) => {
      this.registerDomEvent(win.document, 'pointerdown', (evt) => {
        this.lastAnchor = createAnchorFromPoint(evt.clientX, evt.clientY, win.document);
      }, { capture: true });
    });
  }
}
