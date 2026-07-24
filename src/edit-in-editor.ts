/**
 * @file
 *
 * Shared helper that resolves the link occurrence under the editor cursor and hands it to an
 * {@link EditParsedLink} function. Used by both editor command handlers (alias-only and URL+alias) so the
 * cursor-resolution + `replaceRange` logic lives in one place.
 */

import type {
  App,
  Editor
} from 'obsidian';

import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';

import type { EditParsedLink } from './edit-link.ts';

/**
 * Resolves the link occurrence under the editor cursor and applies the given editor to it in place. Does
 * nothing when the cursor is not inside a parsed link.
 *
 * @param app - The Obsidian app instance.
 * @param editor - The active editor.
 * @param editParsedLink - The editor to apply to the resolved link.
 */
export async function editLinkAtEditorCursor(app: App, editor: Editor, editParsedLink: EditParsedLink): Promise<void> {
  const cursor = editor.getCursor();
  const line = editor.getDoc().getLine(cursor.line);
  const parsedLinks = parseLinks(line);
  const parsedLink = parsedLinks.find((link) => link.startOffset <= cursor.ch && cursor.ch <= link.endOffset);
  if (!parsedLink) {
    return;
  }

  await editParsedLink({
    app,
    applyReplacement: (newRawLink) => {
      editor.replaceRange(newRawLink, { ch: parsedLink.startOffset, line: cursor.line }, { ch: parsedLink.endOffset, line: cursor.line });
    },
    parsedLink
  });
}
