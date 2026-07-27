/**
 * @file
 *
 * Resolves a *rendered* link back to its occurrence in the source note and edits it there.
 *
 * Obsidian's link context menu, and a click on a rendered link, both identify a link only by what it
 * points at (a target {@link TFile} or an external url) — never by where its raw text sits in the note.
 * Reading view has no editor to consult either, so the occurrence is recovered by scanning the source
 * note for links resolving to the same destination, disambiguating with `selectItem` when a note links
 * to the same destination more than once, and writing back through `vault.process`.
 *
 * Shared by {@link LinkMenuHandler} (long-press / context menu) and {@link LinkClickComponent} (click
 * interception) so the scan, the match rules, and the shifted-offset write-back live in one place.
 */

import type {
  App,
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
 */
export interface LinkTarget {
  /**
   * The external url, when the link is external.
   */
  readonly externalUrl?: string;

  /**
   * The internal target file, when the link is internal.
   */
  readonly target?: TFile;
}

interface LinkMatch {
  readonly line: number;
  readonly parsedLink: ParseLinkResult;
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
    target
  } = linkTarget;

  if (externalUrl !== undefined) {
    return parsedLink.isExternal && (parsedLink.url === externalUrl || parsedLink.encodedUrl === externalUrl);
  }

  if (!target || parsedLink.isExternal) {
    return false;
  }

  const dest = app.metadataCache.getFirstLinkpathDest(getLinkpath(parsedLink.url), sourcePath);
  return dest?.path === target.path;
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
