/**
 * @file
 *
 * Shared helper that resolves the link occurrence under the editor cursor and hands it to an
 * {@link EditParsedLink} function. Used by both editor command handlers (alias-only and URL+alias) so the
 * cursor-resolution + `replaceRange` logic lives in one place.
 */

import type {
  App,
  Editor,
  TFile
} from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';

import type { EditParsedLink } from './edit-link.ts';

import {
  isOffsetInFrontmatter,
  resolveAndEditFrontmatterLink
} from './frontmatter-link-occurrence.ts';

/**
 * Parameters for {@link editLinkAtEditorCursor}.
 */
export interface EditLinkAtEditorCursorParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * The active editor.
   */
  readonly editor: Editor;

  /**
   * The editor to apply to the resolved link.
   */
  readonly editParsedLink: EditParsedLink;

  /**
   * Reports that the link could not be located in the source note.
   */
  showCouldNotLocateNotice(this: void): void;

  /**
   * The note being edited, or `null` when the editor is not backed by a file. A cursor in the frontmatter
   * needs the file, because that edit is written through the frontmatter rather than the editor.
   */
  readonly sourceFile: null | TFile;
}

/**
 * Determines whether the cursor sits on a link this plugin can edit.
 *
 * A clickable token covers the note body. The frontmatter has none — Obsidian decorates no links inside the
 * frontmatter block — so a link there is recognized by parsing the line instead, which is what makes the
 * commands and their editor-menu items available on a raw YAML link at all.
 *
 * @param editor - The editor to inspect.
 * @returns Whether the cursor is on an editable link.
 */
export function checkIsCursorOnEditableLink(editor: Editor): boolean {
  const clickableTokenType = editor.getClickableTokenAt(editor.getCursor())?.type;
  if (clickableTokenType === 'internal-link' || clickableTokenType === 'external-link') {
    return true;
  }

  return findFrontmatterLinkAtEditorCursor(editor) !== null;
}

/**
 * Resolves the link occurrence under the editor cursor and applies the given editor to it in place. Does
 * nothing when the cursor is not inside a parsed link.
 *
 * A cursor inside the note's frontmatter is routed to {@link resolveAndEditFrontmatterLink} instead: the
 * `replaceRange` below would splice the rebuilt link into raw YAML and break it (GH #5).
 *
 * @param params - The parameters for the edit.
 */
export async function editLinkAtEditorCursor(params: EditLinkAtEditorCursorParams): Promise<void> {
  const {
    app,
    editor,
    editParsedLink,
    showCouldNotLocateNotice,
    sourceFile
  } = params;

  const cursor = editor.getCursor();
  const line = editor.getDoc().getLine(cursor.line);
  const parsedLinks = parseLinks(line);
  const parsedLink = parsedLinks.find((link) => link.startOffset <= cursor.ch && cursor.ch <= link.endOffset);
  if (!parsedLink) {
    return;
  }

  if (isOffsetInFrontmatter(editor.getValue(), editor.posToOffset(cursor))) {
    /*
     * Without a file there is no frontmatter to write through — and `replaceRange` is not an acceptable
     * fallback here, because splicing into raw YAML is the very corruption this branch exists to prevent.
     */
    if (!sourceFile) {
      showCouldNotLocateNotice();
      return;
    }

    const wasEditedInFrontmatter = await resolveAndEditFrontmatterLink({
      app,
      editParsedLink,
      linkTarget: {},
      rawLink: parsedLink.raw,
      showCouldNotLocateNotice,
      sourceFile
    });
    if (!wasEditedInFrontmatter) {
      showCouldNotLocateNotice();
    }
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

/**
 * Finds the link under the editor cursor when the cursor sits inside the note's frontmatter.
 *
 * The command handlers need this in their `canExecute` check: `Editor.getClickableTokenAt` reports nothing
 * inside the frontmatter block — Obsidian decorates no links there — so without this the commands would be
 * unavailable on exactly the links this module knows how to edit.
 *
 * @param editor - The editor to inspect.
 * @returns The link under the cursor, or `null` when the cursor is outside the frontmatter or not on a link.
 */
export function findFrontmatterLinkAtEditorCursor(editor: Editor): null | ParseLinkResult {
  const cursor = editor.getCursor();
  if (!isOffsetInFrontmatter(editor.getValue(), editor.posToOffset(cursor))) {
    return null;
  }

  const line = editor.getDoc().getLine(cursor.line);
  return parseLinks(line).find((link) => link.startOffset <= cursor.ch && cursor.ch <= link.endOffset) ?? null;
}
