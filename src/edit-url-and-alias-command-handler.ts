import type {
  App,
  Editor,
  MarkdownFileInfo
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { MarkdownView } from 'obsidian';
import { EditorCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/editor-command-handler';
import { createAnchorFromSelection } from 'obsidian-dev-utils/obsidian/popovers/popover-anchor';

import {
  checkIsCursorOnEditableLink,
  editLinkAtEditorCursor
} from './edit-in-editor.ts';
import { createEditParsedLinkUrlAndAliasInPopover } from './edit-link.ts';
import { COULD_NOT_LOCATE_LINK_NOTICE } from './notices.ts';

/**
 * Parameters for constructing an {@link EditUrlAndAliasCommandHandler}.
 */
export interface EditUrlAndAliasCommandHandlerConstructorParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * The plugin notice component, used to surface user-facing notices.
   */
  readonly pluginNoticeComponent: PluginNoticeComponent;
}

export class EditUrlAndAliasCommandHandler extends EditorCommandHandler {
  private readonly app: App;
  private readonly pluginNoticeComponent: PluginNoticeComponent;

  /**
   * Creates a new URL and alias command handler.
   *
   * @param params - The parameters for the handler.
   */
  public constructor(params: EditUrlAndAliasCommandHandlerConstructorParams) {
    super({
      editorMenuItemName: 'Edit link (URL and alias)',
      editorMenuSection: 'selection',
      icon: 'link',
      id: 'edit-link',
      name: 'Edit link (URL and alias)'
    });
    this.app = params.app;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
  }

  protected override canExecuteEditor(editor: Editor, ctx: MarkdownFileInfo): boolean {
    if (!super.canExecuteEditor(editor, ctx)) {
      return false;
    }

    return checkIsCursorOnEditableLink(editor);
  }

  protected override async executeEditor(editor: Editor, ctx: MarkdownFileInfo): Promise<void> {
    /*
     * Invoked from the keyboard or the editor menu, so there is no pointer to anchor to — but the
     * command only runs with the cursor inside a link, which makes the caret the right place to put
     * the editor. The document is taken from the view so a pop-out window anchors in its own window.
     */
    const doc = ctx instanceof MarkdownView ? ctx.containerEl.doc : document;
    await editLinkAtEditorCursor({
      app: this.app,
      editor,
      editParsedLink: createEditParsedLinkUrlAndAliasInPopover(createAnchorFromSelection(doc)),
      showCouldNotLocateNotice: () => {
        this.pluginNoticeComponent.showNotice(COULD_NOT_LOCATE_LINK_NOTICE);
      },
      sourceFile: ctx.file ?? null
    });
  }

  protected override shouldAddToEditorMenu(editor: Editor, ctx: MarkdownFileInfo): boolean {
    super.shouldAddToEditorMenu(editor, ctx);
    return true;
  }
}
