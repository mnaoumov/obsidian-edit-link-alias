import type {
  App,
  Menu,
  Plugin,
  TAbstractFile,
  WorkspaceLeaf
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import {
  MarkdownView,
  Platform
} from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { isFile } from 'obsidian-dev-utils/obsidian/file-system';

import type { EditParsedLink } from './edit-link.ts';
import type { LinkTarget } from './resolve-link-occurrence.ts';

import {
  editParsedLinkAlias,
  editParsedLinkUrlAndAlias
} from './edit-link.ts';
import { resolveAndEditLink } from './resolve-link-occurrence.ts';

const LINK_CONTEXT_MENU_SOURCE = 'link-context-menu';
const MENU_ITEM_SECTION = 'action';

/**
 * Describes one action the handler adds to a link/url context menu: its title, icon, and the editor to run.
 */
interface LinkMenuItemDescriptor {
  /**
   * The editor to run when the item is clicked.
   */
  readonly editParsedLink: EditParsedLink;

  /**
   * The icon of the menu item.
   */
  readonly icon: string;

  /**
   * The title of the menu item.
   */
  readonly title: string;
}

const MENU_ITEM_DESCRIPTORS: readonly LinkMenuItemDescriptor[] = [
  {
    editParsedLink: editParsedLinkAlias,
    icon: 'text-cursor-input',
    title: 'Edit link alias'
  },
  {
    editParsedLink: editParsedLinkUrlAndAlias,
    icon: 'link',
    title: 'Edit link (URL and alias)'
  }
];

/**
 * Parameters for constructing a {@link LinkMenuHandler}.
 */
export interface LinkMenuHandlerConstructorParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * The owning plugin, used to register the workspace event handlers with lifecycle management.
   */
  readonly plugin: Plugin;

  /**
   * The plugin notice component, used to surface user-facing notices.
   */
  readonly pluginNoticeComponent: PluginNoticeComponent;
}

/**
 * Surfaces the "Edit link alias" and "Edit link (URL and alias)" actions on the link long-press / context
 * menus that Obsidian raises outside the editor menu.
 *
 * On mobile, long-pressing a link (in any mode) and right-clicking a rendered link in Reading view route
 * through `Workspace.handleLinkContextMenu` / `handleExternalLinkMenu`, which fire the `file-menu`
 * (source `link-context-menu`) and `url-menu` events rather than `editor-menu`. Those events carry only
 * the target file/url, so the specific link occurrence is resolved from the active {@link MarkdownView}:
 * the editor cursor in an editing mode, or a scan of the source note in Reading mode. The resolution is
 * shared by both actions, which differ only in the editor ({@link EditParsedLink}) they run.
 */
export class LinkMenuHandler {
  private readonly app: App;
  private readonly plugin: Plugin;
  private readonly pluginNoticeComponent: PluginNoticeComponent;

  /**
   * Creates a new link menu handler.
   *
   * @param params - The parameters for the link menu handler.
   */
  public constructor(params: LinkMenuHandlerConstructorParams) {
    this.app = params.app;
    this.plugin = params.plugin;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
  }

  /**
   * Registers the `file-menu` and `url-menu` event handlers.
   */
  public register(): void {
    this.plugin.registerEvent(
      this.app.workspace.on('file-menu', (menu, file, source, leaf) => {
        this.handleFileMenu(menu, file, source, leaf);
      })
    );
    this.plugin.registerEvent(
      this.app.workspace.on('url-menu', (menu, url) => {
        this.handleUrlMenu(menu, url);
      })
    );
  }

  protected handleFileMenu(menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf): void {
    if (source !== LINK_CONTEXT_MENU_SOURCE || !isFile(file) || this.isHandledByEditorMenu()) {
      return;
    }
    this.addMenuItems(menu, { target: file }, leaf);
  }

  protected handleUrlMenu(menu: Menu, url: string): void {
    if (this.isHandledByEditorMenu()) {
      return;
    }
    this.addMenuItems(menu, { externalUrl: url });
  }

  protected async resolveAndEdit(editParsedLink: EditParsedLink, linkTarget: LinkTarget, leaf?: WorkspaceLeaf): Promise<void> {
    await resolveAndEditLink({
      app: this.app,
      editParsedLink,
      linkTarget,
      showCouldNotLocateNotice: () => {
        this.showCouldNotLocateNotice();
      },
      view: this.getSourceView(leaf)
    });
  }

  private addMenuItems(menu: Menu, linkTarget: LinkTarget, leaf?: WorkspaceLeaf): void {
    for (const descriptor of MENU_ITEM_DESCRIPTORS) {
      menu.addItem((item) => {
        item
          .setTitle(descriptor.title)
          .setIcon(descriptor.icon)
          .setSection(MENU_ITEM_SECTION)
          .onClick(convertAsyncToSync(async () => {
            await this.resolveAndEdit(descriptor.editParsedLink, linkTarget, leaf);
          }));
      });
    }
  }

  private getSourceView(leaf?: WorkspaceLeaf): MarkdownView | null {
    if (leaf?.view instanceof MarkdownView) {
      return leaf.view;
    }
    return this.app.workspace.getActiveViewOfType(MarkdownView);
  }

  /**
   * On desktop, a link right-click in the editor fires both this link/url menu and the `editor-menu`
   * event, so the {@link EditorCommandHandler} already surfaces the items there. Detect that case (the
   * cursor sits on a link in an editing view) so we do not add duplicates. On mobile, Obsidian skips
   * `editor-menu` for link long-presses, so this menu is the only one — never suppress there.
   *
   * @returns Whether the editor menu already handles the current link.
   */
  private isHandledByEditorMenu(): boolean {
    if (!Platform.isDesktop) {
      return false;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      return false;
    }

    if (view.getMode() !== 'source') {
      return false;
    }

    const clickableTokenType = view.editor.getClickableTokenAt(view.editor.getCursor())?.type;
    return clickableTokenType === 'internal-link' || clickableTokenType === 'external-link';
  }

  private showCouldNotLocateNotice(): void {
    this.pluginNoticeComponent.showNotice('Could not locate the link in the source note.');
  }
}
