/**
 * @file
 *
 * Resolves a *rendered* link back to its occurrence in the source note and edits it there.
 *
 * Obsidian's link context menu identifies a link only by what it points at (a target {@link TFile} or an
 * external url) — never by where its raw text sits in the note. Reading view has no editor to consult
 * either, so the occurrence is recovered by scanning the source note for links resolving to the same
 * destination, disambiguating with `selectItem` when a note links to the same destination more than once,
 * and writing back through `vault.process`.
 *
 * A click carries more: its own coordinates, which an editing view turns into an exact source position
 * ({@link ResolveAndEditLinkParams.sourcePosition}). That is what makes Live Preview work at all — there
 * the link is editor text with no `href` to read, so the position is the ONLY identity available.
 *
 * A link in the note's FRONTMATTER is handed to `frontmatter-link-occurrence.ts` instead: the raw-text
 * splice this module performs would produce invalid YAML there (GH #5). Every route into that module goes
 * through here, which is why the shared {@link LinkTarget} vocabulary lives in `link-target.ts` rather
 * than in either resolver.
 *
 * Shared by {@link LinkMenuHandler} (long-press / context menu) and {@link LinkClickComponent} (click
 * interception) so the scan, the match rules, and the shifted-offset write-back live in one place.
 */

import type {
  App,
  EditorPosition,
  MarkdownView,
  TFile
} from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

import { selectItem } from 'obsidian-dev-utils/obsidian/modals/select-item';
import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';

import type { EditParsedLink } from './edit-link.ts';
import type { LinkTarget } from './link-target.ts';

import {
  didResolveAndEditFrontmatterLink,
  isLineInFrontmatter,
  isOffsetInFrontmatter
} from './frontmatter-link-occurrence.ts';
import {
  doesLinkMatchTarget,
  isTargetKnown
} from './link-target.ts';

/**
 * Parameters for {@link resolveAndEditLink}.
 */
export interface ResolveAndEditLinkParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * The editor to run on the resolved link occurrence.
   */
  readonly editParsedLink: EditParsedLink;

  /**
   * The link to edit.
   */
  readonly linkTarget: LinkTarget;

  /**
   * The frontmatter property the gesture happened in, when the caller knows it. Only the Properties panel
   * does — it rendered that property — and knowing it means the link is in the frontmatter, so no position
   * is consulted at all.
   */
  readonly propertyKey?: string;

  /**
   * Reports that the link could not be located in the source note.
   */
  showCouldNotLocateNotice(this: void): void;

  /**
   * Where in the source note the gesture landed, when the caller knows it. A click knows it exactly (from
   * its own coordinates); a context menu does not, and leaves it unset so the caret is used instead.
   */
  readonly sourcePosition?: EditorPosition;

  /**
   * The view the link was raised from, or `null` when it could not be determined.
   */
  readonly view: MarkdownView | null;
}

interface EditLinkOccurrenceViaSourceScanParams {
  readonly app: App;
  readonly editParsedLink: EditParsedLink;
  readonly linkTarget: LinkTarget;
  showCouldNotLocateNotice(this: void): void;
  readonly sourceFile: TFile;
}

interface LinkMatch {
  readonly line: number;
  readonly parsedLink: ParseLinkResult;
}

interface TryEditLinkAtPositionParams {
  readonly app: App;
  readonly editorPosition: EditorPosition;
  readonly editParsedLink: EditParsedLink;
  readonly linkTarget: LinkTarget;
  showCouldNotLocateNotice(this: void): void;
  readonly sourceFile: TFile;
  readonly view: MarkdownView;
}

/**
 * Resolves the link occurrence a menu or a click refers to and runs the editor on it.
 *
 * In an editing view the link at a position in the source is tried first — that pins the exact occurrence
 * even when the note links to the same destination several times, and it edits through the editor so the
 * change joins the undo history. The position is {@link ResolveAndEditLinkParams.sourcePosition} when the
 * caller knows it, and the caret otherwise.
 *
 * @param params - The parameters for the resolution.
 */
export async function resolveAndEditLink(params: ResolveAndEditLinkParams): Promise<void> {
  const {
    app,
    editParsedLink,
    linkTarget,
    propertyKey,
    showCouldNotLocateNotice,
    sourcePosition,
    view
  } = params;

  const sourceFile = view?.file ?? null;
  if (!view || !sourceFile) {
    showCouldNotLocateNotice();
    return;
  }

  /*
   * A Properties panel gesture names the property it happened in, which says outright that the link is in
   * the frontmatter. No position may be consulted on this path: in Live Preview the caret sits wherever the
   * user last left it in the body, so a position would resolve a different link entirely.
   */
  if (propertyKey !== undefined) {
    const wasEditedInFrontmatter = await didResolveAndEditFrontmatterLink({
      app,
      editParsedLink,
      linkTarget,
      propertyKey,
      showCouldNotLocateNotice,
      sourceFile
    });
    if (!wasEditedInFrontmatter) {
      showCouldNotLocateNotice();
    }
    return;
  }

  // `source` covers Live Preview and raw Source mode alike; only Reading view has no editor to ask.
  if (view.getMode() === 'source') {
    const wasEditedAtPosition = await didEditLinkAtPosition({
      app,
      editorPosition: sourcePosition ?? view.editor.getCursor(),
      editParsedLink,
      linkTarget,
      showCouldNotLocateNotice,
      sourceFile,
      view
    });
    if (wasEditedAtPosition) {
      return;
    }
  }

  const wasEditedViaScan = await didEditLinkOccurrenceViaSourceScan({
    app,
    editParsedLink,
    linkTarget,
    showCouldNotLocateNotice,
    sourceFile
  });
  if (wasEditedViaScan) {
    return;
  }

  /*
   * The body holds no such link. A right-click on a Properties panel link lands here — the `url-menu` /
   * `file-menu` events carry no property key — so the frontmatter is the remaining place to look.
   */
  const wasEditedInFrontmatter = await didResolveAndEditFrontmatterLink({
    app,
    editParsedLink,
    linkTarget,
    showCouldNotLocateNotice,
    sourceFile
  });
  if (!wasEditedInFrontmatter) {
    showCouldNotLocateNotice();
  }
}

async function didEditLinkAtPosition(params: TryEditLinkAtPositionParams): Promise<boolean> {
  const {
    app,
    editorPosition,
    editParsedLink,
    linkTarget,
    showCouldNotLocateNotice,
    sourceFile,
    view
  } = params;

  const { editor } = view;
  const line = editor.getDoc().getLine(editorPosition.line);
  const parsedLink = parseLinks(line).find((link) => link.startOffset <= editorPosition.ch && editorPosition.ch <= link.endOffset);
  if (!parsedLink) {
    return false;
  }

  /*
   * A known target always wins: it is what the gesture actually named, so a position that disagrees with
   * it is resolving something else and must fall through to the scan. The case that makes this matter is a
   * link inside an `![[embed]]`-rendered block in Live Preview — the clicked anchor names the embedded
   * note's link, while the source position holds the embed link.
   *
   * An unknown target has nothing to verify against, and the position is then the whole identity. It comes
   * from the click's own coordinates, so there is no staleness to guard against either.
   */
  if (
    isTargetKnown(linkTarget) && !doesLinkMatchTarget({
      app,
      linkTarget,
      parsedLink,
      sourcePath: sourceFile.path
    })
  ) {
    return false;
  }

  /*
   * Raw YAML in Source mode: the position is inside the frontmatter, so the edit must go through the
   * frontmatter rather than `replaceRange` — the same reason the scan skips those lines.
   */
  if (isOffsetInFrontmatter(editor.getValue(), editor.posToOffset(editorPosition))) {
    return await didResolveAndEditFrontmatterLink({
      app,
      editParsedLink,
      linkTarget,
      rawLink: parsedLink.raw,
      showCouldNotLocateNotice,
      sourceFile
    });
  }

  await editParsedLink({
    app,
    applyReplacement: (newRawLink) => {
      editor.replaceRange(
        newRawLink,
        { ch: parsedLink.startOffset, line: editorPosition.line },
        { ch: parsedLink.endOffset, line: editorPosition.line }
      );
    },
    parsedLink
  });
  return true;
}

/**
 * Scans the source note's BODY for links pointing at the given target, asks which one to edit when there is
 * more than one, and runs the editor on it, writing the result back to the note.
 *
 * @param params - The parameters for the scan.
 * @returns Whether a link occurrence was found and handed to the editor.
 */
async function didEditLinkOccurrenceViaSourceScan(params: EditLinkOccurrenceViaSourceScanParams): Promise<boolean> {
  const {
    app,
    editParsedLink,
    linkTarget,
    showCouldNotLocateNotice,
    sourceFile
  } = params;

  const content = await app.vault.read(sourceFile);
  const matches = findMatches(app, content, sourceFile.path, linkTarget);

  if (matches.length === 0) {
    return false;
  }

  const chosen = matches.length > 1
    ? await selectItem({
      app,
      items: matches,
      itemTextFunction: (match) => `Line ${String(match.line + 1)}: ${match.parsedLink.raw}`,
      placeholder: 'Select the link to edit'
    })
    : matches[0];

  if (!chosen) {
    // The picker was dismissed. The link WAS located, so this is a cancel, not a failure to resolve.
    return true;
  }

  const match = chosen;

  await editParsedLink({
    app,
    /*
     * Only reached once the editor is confirmed, so a failure to locate the link here means the
     * source shifted while the editor was open — a genuine "could not locate", not a silent cancel.
     */
    applyReplacement: async (newRawLink) => {
      const applyState = { didApply: false };
      await app.vault.process(sourceFile, (data) => {
        const lines = data.split('\n');
        const lineText = lines[match.line];
        if (lineText === undefined) {
          return data;
        }

        const {
          endOffset,
          raw,
          startOffset
        } = match.parsedLink;
        if (lineText.slice(startOffset, endOffset) === raw) {
          lines[match.line] = lineText.slice(0, startOffset) + newRawLink + lineText.slice(endOffset);
          applyState.didApply = true;
          return lines.join('\n');
        }

        const rawIndex = lineText.indexOf(raw);
        if (rawIndex !== -1) {
          lines[match.line] = lineText.slice(0, rawIndex) + newRawLink + lineText.slice(rawIndex + raw.length);
          applyState.didApply = true;
          return lines.join('\n');
        }

        return data;
      });

      if (!applyState.didApply) {
        showCouldNotLocateNotice();
      }
    },
    parsedLink: match.parsedLink
  });

  return true;
}

function findMatches(app: App, content: string, sourcePath: string, linkTarget: LinkTarget): LinkMatch[] {
  const matches: LinkMatch[] = [];
  const lines = content.split('\n');
  for (const [line, lineText] of lines.entries()) {
    /*
     * Frontmatter is YAML, not markdown: splicing a rebuilt link into its raw text produces a syntax error
     * (GH #5). Those links are resolved and written by `frontmatter-link-occurrence.ts` instead.
     */
    if (isLineInFrontmatter(content, line)) {
      continue;
    }

    for (const parsedLink of parseLinks(lineText)) {
      if (
        doesLinkMatchTarget({
          app,
          linkTarget,
          parsedLink,
          sourcePath
        })
      ) {
        matches.push({
          line,
          parsedLink
        });
      }
    }
  }
  return matches;
}
