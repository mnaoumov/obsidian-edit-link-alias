import type {
  App,
  Editor,
  MarkdownFileInfo
} from 'obsidian';

import { EditorCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/editor-command-handler';
import {
  generateRawMarkdownLink,
  parseLinks
} from 'obsidian-dev-utils/obsidian/link';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';

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

    const newAlias = await prompt({
      app: this.app,
      defaultValue: parsedLink.alias ?? parsedLink.url,
      title: 'Edit link alias'
    });

    if (newAlias === null) {
      return;
    }

    const newLink = generateRawMarkdownLink({
      alias: newAlias,
      isEmbed: parsedLink.isEmbed,
      isWikilink: parsedLink.isWikilink,
      shouldUseAngleBrackets: parsedLink.hasAngleBrackets ?? false,
      title: parsedLink.title ?? '',
      url: parsedLink.url
    });

    editor.replaceRange(newLink, { ch: parsedLink.startOffset, line: cursor.line }, { ch: parsedLink.endOffset, line: cursor.line });
  }

  protected override shouldAddToEditorMenu(editor: Editor, ctx: MarkdownFileInfo): boolean {
    super.shouldAddToEditorMenu(editor, ctx);
    return true;
  }
}
