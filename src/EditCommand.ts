import type {
  Editor,
  MarkdownFileInfo,
  MarkdownView
} from 'obsidian';
import type { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/Commands/CommandBase';

import {
  EditorCommandBase,
  EditorCommandInvocationBase
} from 'obsidian-dev-utils/obsidian/Commands/EditorCommandBase';
import {
  generateRawMarkdownLink,
  parseLinks
} from 'obsidian-dev-utils/obsidian/Link';
import { prompt } from 'obsidian-dev-utils/obsidian/Modals/Prompt';

import type { Plugin } from './Plugin.ts';

class EditLinkAliasCommandInvocation extends EditorCommandInvocationBase<Plugin> {
  public override canExecute(): boolean {
    const clickableToken = this.editor.getClickableTokenAt(this.editor.getCursor());
    if (!clickableToken) {
      return false;
    }

    if (clickableToken.type !== 'internal-link' && clickableToken.type !== 'external-link') {
      return false;
    }

    return !!clickableToken;
  }

  public override async execute(): Promise<void> {
    const cursor = this.editor.getCursor();
    const line = this.editor.getDoc().getLine(cursor.line);
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

    this.editor.replaceRange(newLink, { ch: parsedLink.startOffset, line: cursor.line }, { ch: parsedLink.endOffset, line: cursor.line });
  }
}

export class EditCommand extends EditorCommandBase<Plugin> {
  protected override editorMenuItemName = 'Edit link alias';

  protected override editorMenuSection = 'selection';

  public constructor(plugin: Plugin) {
    super({
      icon: 'text-cursor-input',
      id: 'edit-link-alias',
      name: 'Edit',
      plugin
    });
  }

  protected override createEditorCommandInvocation(editor: Editor, ctx: MarkdownFileInfo | MarkdownView): CommandInvocationBase {
    return new EditLinkAliasCommandInvocation(this.plugin, editor, ctx);
  }

  protected override shouldAddToEditorMenu(_editor: Editor, _ctx: MarkdownFileInfo | MarkdownView): boolean {
    return true;
  }
}
