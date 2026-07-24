import type {
  App,
  Editor,
  MarkdownFileInfo
} from 'obsidian';

import { EditorCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/editor-command-handler';

import { editLinkAtEditorCursor } from './edit-in-editor.ts';
import { editParsedLinkUrlAndAlias } from './edit-link.ts';

export class EditUrlAndAliasCommandHandler extends EditorCommandHandler {
  public constructor(private readonly app: App) {
    super({
      editorMenuItemName: 'Edit link (URL and alias)',
      editorMenuSection: 'selection',
      icon: 'link',
      id: 'edit-link',
      name: 'Edit link (URL and alias)'
    });
  }

  protected override canExecuteEditor(editor: Editor, ctx: MarkdownFileInfo): boolean {
    if (!super.canExecuteEditor(editor, ctx)) {
      return false;
    }

    const clickableToken = editor.getClickableTokenAt(editor.getCursor());
    if (!clickableToken) {
      return false;
    }

    if (clickableToken.type !== 'internal-link' && clickableToken.type !== 'external-link') {
      return false;
    }

    return !!clickableToken;
  }

  protected override async executeEditor(editor: Editor): Promise<void> {
    await editLinkAtEditorCursor(this.app, editor, editParsedLinkUrlAndAlias);
  }

  protected override shouldAddToEditorMenu(editor: Editor, ctx: MarkdownFileInfo): boolean {
    super.shouldAddToEditorMenu(editor, ctx);
    return true;
  }
}
