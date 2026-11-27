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

import { getLinkAtEditorPosition } from '@mnaoumov/obsidian-lib/link-at-position';

import type { EditParsedLink } from './edit-link.ts';

import { didResolveAndEditFrontmatterLink } from '../link-occurrence/frontmatter-link-occurrence.ts';

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
  readonly showCouldNotLocateNotice: (this: void) => void;

  /**
   * The note being edited, or `null` when the editor is not backed by a file. A cursor in the frontmatter
   * needs the file, because that edit is written through the frontmatter rather than the editor.
   */
  readonly sourceFile: null | TFile;
}

/**
 * Determines whether the cursor sits on a link this plugin can edit.
 *
 * The answer comes from the same lookup {@link editLinkAtEditorCursor} edits through, so a command is
 * available exactly where it can act. `Editor.getClickableTokenAt` is deliberately not consulted: it misses a
 * cursor right before a link (`{cursor}[alias](url)`) and reports nothing inside the frontmatter.
 *
 * @param editor - The editor to inspect.
 * @returns Whether the cursor is on an editable link.
 */
export function checkIsCursorOnEditableLink(editor: Editor): boolean {
  return getLinkAtEditorPosition({ editor }) !== null;
}

/**
 * Resolves the link occurrence under the editor cursor and applies the given editor to it in place. Does
 * nothing when the cursor is not on a link.
 *
 * A cursor inside the note's frontmatter is routed to {@link didResolveAndEditFrontmatterLink} instead: the
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

  const link = getLinkAtEditorPosition({ editor });
  if (!link) {
    return;
  }

  if (link.isInFrontmatter) {
    /*
     * Without a file there is no frontmatter to write through — and `replaceRange` is not an acceptable
     * fallback here, because splicing into raw YAML is the very corruption this branch exists to prevent.
     */
    if (!sourceFile) {
      showCouldNotLocateNotice();
      return;
    }

    const wasEditedInFrontmatter = await didResolveAndEditFrontmatterLink({
      app,
      editParsedLink,
      linkTarget: {},
      rawLink: link.parseLinkResult.raw,
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
      editor.replaceRange(newRawLink, { ch: link.startCh, line: link.line }, { ch: link.endCh, line: link.line });
    },
    parsedLink: link.parseLinkResult
  });
}
