import type {
  App,
  Editor,
  MarkdownFileInfo
} from 'obsidian';

import { EditorCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/editor-command-handler';
import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';

import { editParsedLinkAlias } from './edit-link.ts';

export class EditCommandHandler extends EditorCommandHandler {
  public constructor(private readonly app: App) {
    super({
      editorMenuItemName: 'Edit link alias',
      editorMenuSection: 'selection',
      icon: 'text-cursor-input',
      id: 'edit-link-alias',
      name: 'Edit'
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
    const cursor = editor.getCursor();
    const line = editor.getDoc().getLine(cursor.line);
    const parsedLinks = parseLinks(line);
    const parsedLink = parsedLinks.find((link) => link.startOffset <= cursor.ch && cursor.ch <= link.endOffset);
    if (!parsedLink) {
      return;
    }

    await editParsedLinkAlias({
      app: this.app,
      applyReplacement: (newRawLink) => {
        editor.replaceRange(newRawLink, { ch: parsedLink.startOffset, line: cursor.line }, { ch: parsedLink.endOffset, line: cursor.line });
      },
      parsedLink
    });
  }

  protected override shouldAddToEditorMenu(editor: Editor, ctx: MarkdownFileInfo): boolean {
    super.shouldAddToEditorMenu(editor, ctx);
    return true;
  }
}
