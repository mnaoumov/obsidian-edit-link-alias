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

import { getLinkpath } from 'obsidian';
import { selectItem } from 'obsidian-dev-utils/obsidian/modals/select-item';
import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';

import type { EditParsedLink } from './edit-link.ts';

/**
 * Parameters for {@link doesLinkMatchTarget}.
 */
export interface DoesLinkMatchTargetParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * The link target to test against.
   */
  readonly linkTarget: LinkTarget;

  /**
   * The link to test.
   */
  readonly parsedLink: ParseLinkResult;

  /**
   * The path of the note the link lives in, used to resolve the link path.
   */
  readonly sourcePath: string;
}

/**
 * Parameters for {@link editLinkOccurrenceViaSourceScan}.
 */
export interface EditLinkOccurrenceViaSourceScanParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * The editor to run on the resolved link occurrence.
   */
  readonly editParsedLink: EditParsedLink;

  /**
   * The link to look for.
   */
  readonly linkTarget: LinkTarget;

  /**
   * Reports that the link could not be located in the source note.
   */
  showCouldNotLocateNotice(this: void): void;

  /**
   * The note to scan and rewrite.
   */
  readonly sourceFile: TFile;
}

/**
 * Identifies the link to edit: either an internal target file or an external url, as carried by the
 * `file-menu` / `url-menu` events and by a clicked rendered link.
 *
 * All three fields are optional, and a target with none set means "unknown" — the caller could not tell
 * what the link points at, and the source position it supplies alongside is the only identity available.
 * That is the Live Preview click: the link is editor text carrying no `href` to read.
 */
export interface LinkTarget {
  /**
   * The external url, when the link is external.
   */
  readonly externalUrl?: string;

  /**
   * The internal link path as written / rendered, when the link is internal but does not resolve to a
   * file. A link to a note that does not exist yet has no {@link target} to match on, so it is matched by
   * this text instead.
   */
  readonly linkPath?: string;

  /**
   * The internal target file, when the link is internal and resolves.
   */
  readonly target?: TFile;
}

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

interface LinkMatch {
  readonly line: number;
  readonly parsedLink: ParseLinkResult;
}

interface TryEditLinkAtPositionParams {
  readonly app: App;
  readonly editorPosition: EditorPosition;
  readonly editParsedLink: EditParsedLink;
  readonly linkTarget: LinkTarget;
  readonly sourcePath: string;
  readonly view: MarkdownView;
}

/**
 * Determines whether a parsed link points at the given target.
 *
 * @param params - The parameters for the match test.
 * @returns Whether the parsed link points at the target.
 */
export function doesLinkMatchTarget(params: DoesLinkMatchTargetParams): boolean {
  const {
    app,
    linkTarget,
    parsedLink,
    sourcePath
  } = params;
  const {
    externalUrl,
    linkPath,
    target
  } = linkTarget;

  if (externalUrl !== undefined) {
    return parsedLink.isExternal && (parsedLink.url === externalUrl || parsedLink.encodedUrl === externalUrl);
  }

  if (parsedLink.isExternal) {
    return false;
  }

  if (target) {
    const dest = app.metadataCache.getFirstLinkpathDest(getLinkpath(parsedLink.url), sourcePath);
    return dest?.path === target.path;
  }

  /*
   * An unresolved internal link has no `TFile` to compare against — `getFirstLinkpathDest` returns null
   * for a link to a note that does not exist yet — so it is matched by its path text instead. Both the
   * decoded and the encoded form are compared, exactly as the external branch above does, so a markdown
   * link written with percent-escapes still matches the `data-href` Obsidian renders it with.
   */
  if (linkPath !== undefined) {
    const wantedLinkpath = getLinkpath(linkPath);
    return getLinkpath(parsedLink.url) === wantedLinkpath || getLinkpath(parsedLink.encodedUrl ?? parsedLink.url) === wantedLinkpath;
  }

  return false;
}

/**
 * Scans the source note for links pointing at the given target, asks which one to edit when there is
 * more than one, and runs the editor on it, writing the result back to the note.
 *
 * @param params - The parameters for the scan.
 */
export async function editLinkOccurrenceViaSourceScan(params: EditLinkOccurrenceViaSourceScanParams): Promise<void> {
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
    showCouldNotLocateNotice();
    return;
  }

  const chosen = matches.length > 1
    ? await selectItem({
      app,
      items: matches,
      itemTextFunc: (match) => `Line ${String(match.line + 1)}: ${match.parsedLink.raw}`,
      placeholder: 'Select the link to edit'
    })
    : matches[0];

  if (!chosen) {
    return;
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
    showCouldNotLocateNotice,
    sourcePosition,
    view
  } = params;

  const sourceFile = view?.file ?? null;
  if (!view || !sourceFile) {
    showCouldNotLocateNotice();
    return;
  }

  // `source` covers Live Preview and raw Source mode alike; only Reading view has no editor to ask.
  if (view.getMode() === 'source') {
    const shouldEditAtPosition = await tryEditLinkAtPosition({
      app,
      editorPosition: sourcePosition ?? view.editor.getCursor(),
      editParsedLink,
      linkTarget,
      sourcePath: sourceFile.path,
      view
    });
    if (shouldEditAtPosition) {
      return;
    }
  }

  await editLinkOccurrenceViaSourceScan({
    app,
    editParsedLink,
    linkTarget,
    showCouldNotLocateNotice,
    sourceFile
  });
}

function findMatches(app: App, content: string, sourcePath: string, linkTarget: LinkTarget): LinkMatch[] {
  const matches: LinkMatch[] = [];
  const lines = content.split('\n');
  lines.forEach((lineText, line) => {
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
  });
  return matches;
}

function isTargetKnown(linkTarget: LinkTarget): boolean {
  return linkTarget.externalUrl !== undefined || linkTarget.linkPath !== undefined || Boolean(linkTarget.target);
}

async function tryEditLinkAtPosition(params: TryEditLinkAtPositionParams): Promise<boolean> {
  const {
    app,
    editorPosition,
    editParsedLink,
    linkTarget,
    sourcePath,
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
      sourcePath
    })
  ) {
    return false;
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
