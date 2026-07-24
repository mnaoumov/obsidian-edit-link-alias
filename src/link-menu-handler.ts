import type {
  App,
  Menu,
  Plugin,
  TAbstractFile,
  TFile,
  WorkspaceLeaf
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

import {
  getLinkpath,
  MarkdownView,
  Platform
} from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { isFile } from 'obsidian-dev-utils/obsidian/file-system';
import { selectItem } from 'obsidian-dev-utils/obsidian/modals/select-item';
import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';

import type { EditParsedLink } from './edit-link.ts';

import {
  editParsedLinkAlias,
  editParsedLinkUrlAndAlias
} from './edit-link.ts';

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
 * Identifies the link to edit: either an internal target file or an external url, as carried by the
 * `file-menu` / `url-menu` events.
 */
export interface LinkTarget {
  /**
   * The external url, when the menu was raised for an external link (`url-menu`).
   */
  readonly externalUrl?: string;

  /**
   * The internal target file, when the menu was raised for an internal link (`file-menu`).
   */
  readonly target?: TFile;
}

interface LinkMatch {
  readonly line: number;
  readonly parsedLink: ParseLinkResult;
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
    const view = this.getSourceView(leaf);
    const sourceFile = view?.file ?? null;
    if (!view || !sourceFile) {
      this.showCouldNotLocateNotice();
      return;
    }

    if (view.getMode() === 'source' && await this.tryEditInEditor(editParsedLink, view, sourceFile.path, linkTarget)) {
      return;
    }

    await this.editViaSourceScan(editParsedLink, sourceFile, linkTarget);
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

  private async editViaSourceScan(editParsedLink: EditParsedLink, sourceFile: TFile, linkTarget: LinkTarget): Promise<void> {
    const content = await this.app.vault.read(sourceFile);
    const matches = this.findMatches(content, sourceFile.path, linkTarget);

    if (matches.length === 0) {
      this.showCouldNotLocateNotice();
      return;
    }

    const chosen = matches.length > 1
      ? await selectItem({
        app: this.app,
        items: matches,
        itemTextFunc: (match) => `Line ${String(match.line + 1)}: ${match.parsedLink.raw}`,
        placeholder: 'Select the link to edit'
      })
      : matches[0];

    if (!chosen) {
      return;
    }

    const match = chosen;

    await editParsedLink({
      app: this.app,
      /*
       * Only reached once the editor is confirmed, so a failure to locate the link here means the
       * source shifted while the editor was open — a genuine "could not locate", not a silent cancel.
       */
      applyReplacement: async (newRawLink) => {
        const applyState = { didApply: false };
        await this.app.vault.process(sourceFile, (data) => {
          const lines = data.split('\n');
          const lineText = lines[match.line];
          if (lineText === undefined) {
            return data;
          }

          const { endOffset, raw, startOffset } = match.parsedLink;
          if (lineText.slice(startOffset, endOffset) === raw) {
            lines[match.line] = lineText.slice(0, startOffset) + newRawLink + lineText.slice(endOffset);
            applyState.didApply = true;
            return lines.join('\n');
          }

          const rawIndex = lineText.indexOf(raw);
          if (rawIndex !== -1) {
            lines[match.line] = lineText.slice(0, rawIndex) + newRawLink + lineText.slice(rawIndex + raw.length);
            applyState.didApply = true;
            return lines.join('\n');
          }

          return data;
        });

        if (!applyState.didApply) {
          this.showCouldNotLocateNotice();
        }
      },
      parsedLink: match.parsedLink
    });
  }

  private findMatches(content: string, sourcePath: string, linkTarget: LinkTarget): LinkMatch[] {
    const matches: LinkMatch[] = [];
    const lines = content.split('\n');
    lines.forEach((lineText, line) => {
      for (const parsedLink of parseLinks(lineText)) {
        if (this.linkMatches(parsedLink, sourcePath, linkTarget)) {
          matches.push({
            line,
            parsedLink
          });
        }
      }
    });
    return matches;
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

  private linkMatches(parsedLink: ParseLinkResult, sourcePath: string, linkTarget: LinkTarget): boolean {
    const { externalUrl, target } = linkTarget;

    if (externalUrl !== undefined) {
      return parsedLink.isExternal && (parsedLink.url === externalUrl || parsedLink.encodedUrl === externalUrl);
    }

    if (!target || parsedLink.isExternal) {
      return false;
    }

    const dest = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(parsedLink.url), sourcePath);
    return dest?.path === target.path;
  }

  private showCouldNotLocateNotice(): void {
    this.pluginNoticeComponent.showNotice('Could not locate the link in the source note.');
  }

  private async tryEditInEditor(editParsedLink: EditParsedLink, view: MarkdownView, sourcePath: string, linkTarget: LinkTarget): Promise<boolean> {
    const { editor } = view;
    const cursor = editor.getCursor();
    const line = editor.getDoc().getLine(cursor.line);
    const parsedLink = parseLinks(line).find((link) => link.startOffset <= cursor.ch && cursor.ch <= link.endOffset);
    if (!parsedLink || !this.linkMatches(parsedLink, sourcePath, linkTarget)) {
      return false;
    }

    await editParsedLink({
      app: this.app,
      applyReplacement: (newRawLink) => {
        editor.replaceRange(newRawLink, { ch: parsedLink.startOffset, line: cursor.line }, { ch: parsedLink.endOffset, line: cursor.line });
      },
      parsedLink
    });
    return true;
  }
}
