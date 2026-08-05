import type {
  App,
  Editor,
  MarkdownFileInfo
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { EditorCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/editor-command-handler';

import {
  checkIsCursorOnEditableLink,
  editLinkAtEditorCursor
} from './edit-in-editor.ts';
import { editParsedLinkAlias } from './edit-link.ts';
import { COULD_NOT_LOCATE_LINK_NOTICE } from './notices.ts';

/**
 * Parameters for constructing an {@link EditCommandHandler}.
 */
export interface EditCommandHandlerConstructorParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * The plugin notice component, used to surface user-facing notices.
   */
  readonly pluginNoticeComponent: PluginNoticeComponent;
}

export class EditCommandHandler extends EditorCommandHandler {
  private readonly app: App;
  private readonly pluginNoticeComponent: PluginNoticeComponent;

  /**
   * Creates a new edit command handler.
   *
   * @param params - The parameters for the handler.
   */
  public constructor(params: EditCommandHandlerConstructorParams) {
    super({
      editorMenuItemName: 'Edit link alias',
      editorMenuSection: 'selection',
      icon: 'text-cursor-input',
      id: 'edit-link-alias',
      name: 'Edit'
    });
    this.app = params.app;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
  }

  protected override canExecuteEditor(editor: Editor, context: MarkdownFileInfo): boolean {
    if (!super.canExecuteEditor(editor, context)) {
      return false;
    }

    return checkIsCursorOnEditableLink(editor);
  }

  protected override async executeEditor(editor: Editor, context: MarkdownFileInfo): Promise<void> {
    await editLinkAtEditorCursor({
      app: this.app,
      editor,
      editParsedLink: editParsedLinkAlias,
      showCouldNotLocateNotice: () => {
        this.pluginNoticeComponent.showNotice(COULD_NOT_LOCATE_LINK_NOTICE);
      },
      sourceFile: context.file ?? null
    });
  }

  protected override shouldAddToEditorMenu(editor: Editor, context: MarkdownFileInfo): boolean {
    super.shouldAddToEditorMenu(editor, context);
    return true;
  }
}
