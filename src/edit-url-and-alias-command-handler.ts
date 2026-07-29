import type {
  App,
  Editor,
  MarkdownFileInfo
} from 'obsidian';

import { MarkdownView } from 'obsidian';
import { EditorCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/editor-command-handler';
import { createAnchorFromSelection } from 'obsidian-dev-utils/obsidian/popovers/popover-anchor';

import { editLinkAtEditorCursor } from './edit-in-editor.ts';
import { createEditParsedLinkUrlAndAliasInPopover } from './edit-link.ts';

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

  protected override async executeEditor(editor: Editor, ctx: MarkdownFileInfo): Promise<void> {
    /*
     * Invoked from the keyboard or the editor menu, so there is no pointer to anchor to — but the
     * command only runs with the cursor inside a link, which makes the caret the right place to put
     * the editor. The document is taken from the view so a pop-out window anchors in its own window.
     */
    const doc = ctx instanceof MarkdownView ? ctx.containerEl.doc : document;
    await editLinkAtEditorCursor(this.app, editor, createEditParsedLinkUrlAndAliasInPopover(createAnchorFromSelection(doc)));
  }

  protected override shouldAddToEditorMenu(editor: Editor, ctx: MarkdownFileInfo): boolean {
    super.shouldAddToEditorMenu(editor, ctx);
    return true;
  }
}
