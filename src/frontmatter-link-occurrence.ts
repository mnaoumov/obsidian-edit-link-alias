/**
 * @file
 *
 * Resolves a link that lives in a note's YAML frontmatter and edits it there.
 *
 * A frontmatter link cannot be edited the way a body link is. The body paths splice the rebuilt link
 * straight into the raw line, which in frontmatter produces invalid YAML: `url: https://example.com` is a
 * plain scalar, but `url: [Alias](https://example.com)` starts a flow sequence and the note stops parsing
 * (GH #5). The value has to be re-serialized, not spliced.
 *
 * So the edit is expressed as a change against the *parsed property value* and handed to
 * `applyFileChanges`, which applies it to the frontmatter object and re-emits the block through
 * `stringifyYaml` — quoting whatever needs quoting. The trade-off is that the whole frontmatter block is
 * re-serialized, so YAML comments and hand formatting inside it are normalized; that is the same thing
 * Obsidian's own `processFrontMatter` does, and it is the price of a write that is always valid.
 *
 * Occurrence resolution is by property key and link identity rather than by position: the Properties
 * panel knows the key it rendered (`data-property-key`), and raw YAML in Source mode knows the link text
 * under the pointer. Neither knows an offset into the frontmatter object, which is what the write needs.
 */

import type {
  App,
  FrontmatterLinkCache,
  TFile
} from 'obsidian';
import type { FileChange } from 'obsidian-dev-utils/obsidian/file-change';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

import { getFrontMatterInfo } from 'obsidian';
import { normalizeOptionalProperties } from 'obsidian-dev-utils/object-utils';
import { applyFileChanges } from 'obsidian-dev-utils/obsidian/file-change';
import { isFrontmatterLinkCacheWithOffsets } from 'obsidian-dev-utils/obsidian/frontmatter-link-cache-with-offsets';
import { selectItem } from 'obsidian-dev-utils/obsidian/modals/select-item';
import {
  isParseLinkFrontmatterReference,
  parseFrontmatterLinks,
  parseLink
} from 'obsidian-dev-utils/obsidian/parse-link';

import type { EditParsedLink } from './edit-link.ts';
import type { LinkTarget } from './link-target.ts';

import {
  doesLinkMatchTarget,
  isTargetKnown
} from './link-target.ts';

/**
 * Parameters for {@link resolveAndEditFrontmatterLink}.
 */
export interface ResolveAndEditFrontmatterLinkParams {
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
   * The frontmatter property the gesture happened in, when it is known. The Properties panel knows it (it
   * rendered that property); a context menu and the raw YAML do not, and leave it unset so every
   * frontmatter link is considered.
   */
  readonly propertyKey?: string;

  /**
   * The raw text of the link the gesture landed on, when the caller read it out of the note itself. That is
   * the raw YAML path: the pointer position identifies the exact link text, which narrows the candidates
   * far better than the target does when the same url appears in several properties.
   */
  readonly rawLink?: string;

  /**
   * Reports that the link could not be located in the source note.
   */
  showCouldNotLocateNotice(this: void): void;

  /**
   * The note whose frontmatter holds the link.
   */
  readonly sourceFile: TFile;
}

interface ApplyFrontmatterLinkChangeParams {
  readonly app: App;
  readonly candidate: FrontmatterLinkCandidate;
  readonly newRawLink: string;
  readonly sourceFile: TFile;
}

interface FindCandidatesParams {
  readonly app: App;
  readonly linkTarget: LinkTarget;
  readonly propertyKey?: string;
  readonly rawLink?: string;
  readonly sourceFile: TFile;
}

interface FrontmatterLinkCandidate {
  readonly parsedLink: ParseLinkResult;
  readonly reference: FrontmatterLinkCache;
}

/**
 * Determines whether a line of the given content lies inside its frontmatter block.
 *
 * @param content - The note content.
 * @param line - The zero-based line index.
 * @returns Whether the line is inside the frontmatter.
 */
export function isLineInFrontmatter(content: string, line: number): boolean {
  const frontmatterInfo = getFrontMatterInfo(content);
  if (!frontmatterInfo.exists) {
    return false;
  }

  const startLine = countLines(content.slice(0, frontmatterInfo.from));
  const endLine = countLines(content.slice(0, frontmatterInfo.to));
  return startLine <= line && line <= endLine;
}

/**
 * Determines whether an offset into the given content lies inside its frontmatter block.
 *
 * @param content - The note content.
 * @param offset - The character offset.
 * @returns Whether the offset is inside the frontmatter.
 */
export function isOffsetInFrontmatter(content: string, offset: number): boolean {
  const frontmatterInfo = getFrontMatterInfo(content);
  return frontmatterInfo.exists && frontmatterInfo.from <= offset && offset <= frontmatterInfo.to;
}

/**
 * Resolves which frontmatter link the gesture referred to and runs the editor on it, writing the result
 * back through the frontmatter so the YAML stays valid.
 *
 * @param params - The parameters for the resolution.
 * @returns Whether a frontmatter link was resolved and handed to the editor.
 */
export async function resolveAndEditFrontmatterLink(params: ResolveAndEditFrontmatterLinkParams): Promise<boolean> {
  const {
    app,
    editParsedLink,
    linkTarget,
    propertyKey,
    rawLink,
    showCouldNotLocateNotice,
    sourceFile
  } = params;

  const candidates = findCandidates({
    app,
    linkTarget,
    sourceFile,
    ...normalizeOptionalProperties<Pick<FindCandidatesParams, 'propertyKey' | 'rawLink'>>({
      propertyKey,
      rawLink
    })
  });

  if (candidates.length === 0) {
    return false;
  }

  const chosen = candidates.length > 1
    ? await selectItem({
      app,
      items: candidates,
      itemTextFunc: (candidate) => `${candidate.reference.key}: ${candidate.parsedLink.raw}`,
      placeholder: 'Select the link to edit'
    })
    : candidates[0];

  if (!chosen) {
    // The picker was dismissed. The link WAS located, so this is a cancel, not a failure to resolve.
    return true;
  }

  const candidate = chosen;

  await editParsedLink({
    app,
    applyReplacement: async (newRawLink) => {
      const wasApplied = await applyFrontmatterLinkChange({
        app,
        candidate,
        newRawLink,
        sourceFile
      });

      if (!wasApplied) {
        showCouldNotLocateNotice();
      }
    },
    parsedLink: candidate.parsedLink
  });

  return true;
}

/**
 * Applies the rebuilt link to the frontmatter property the reference names.
 *
 * @param params - The parameters for the change.
 * @returns Whether the note was actually rewritten.
 */
async function applyFrontmatterLinkChange(params: ApplyFrontmatterLinkChangeParams): Promise<boolean> {
  const {
    app,
    candidate,
    newRawLink,
    sourceFile
  } = params;
  const {
    parsedLink,
    reference
  } = candidate;

  /*
   * `applyFileChanges` validates a change before applying it, and what it compares against depends on the
   * reference: one carrying offsets is matched against that slice of the property value, one without is
   * matched against the WHOLE value. Getting this wrong makes the write a silent no-op.
   */
  const oldContent = isFrontmatterLinkCacheWithOffsets(reference) ? parsedLink.raw : reference.original;

  if (newRawLink === oldContent) {
    // Nothing was changed in the editor, so there is nothing to write — and nothing failed either.
    return true;
  }

  const change: FileChange = {
    newContent: newRawLink,
    oldContent,
    reference
  };

  const contentBefore = await app.vault.read(sourceFile);
  await applyFileChanges({
    app,
    changesProvider: [change],
    pathOrFile: sourceFile,
    /*
     * Both components are deliberately absent: this is one small frontmatter write, and the body path this
     * sits beside writes through a bare `vault.process` with no read-only lock and no timeout notice either.
     */
    pluginNoticeComponent: null,
    resourceLockComponent: null,
    shouldRetryOnInvalidChanges: false
  });
  const contentAfter = await app.vault.read(sourceFile);

  /*
   * An invalid change leaves the content untouched rather than throwing (`applyContentChanges` returns the
   * original content when validation fails), so comparing is the only way to know the write landed.
   */
  return contentAfter !== contentBefore;
}

/**
 * Collects every link in the note's frontmatter, from the two sources that each hold half of them.
 *
 * Obsidian natively caches only the INTERNAL links whose whole property value is the link
 * (`cache.frontmatterLinks`); the external ones and any value holding several links come from
 * `parseFrontmatterLinks`. The two sets are disjoint by construction — `parseFrontmatterLinks` deliberately
 * skips the internal single-link values Obsidian already covers — but they are de-duplicated anyway, so a
 * future overlap cannot turn into a spurious "which link did you mean?" prompt.
 *
 * @param app - The Obsidian app instance.
 * @param sourceFile - The note to collect from.
 * @returns The frontmatter link references.
 */
function collectFrontmatterReferences(app: App, sourceFile: TFile): FrontmatterLinkCache[] {
  const cache = app.metadataCache.getFileCache(sourceFile);
  if (!cache) {
    return [];
  }

  const parsedFrontmatterLinks = parseFrontmatterLinks(cache.frontmatter);
  const references: FrontmatterLinkCache[] = [
    ...cache.frontmatterLinks ?? [],
    ...parsedFrontmatterLinks.frontmatterExternalLinks,
    ...parsedFrontmatterLinks.multiValueFrontmatterExternalLinks,
    ...parsedFrontmatterLinks.multiValueFrontmatterLinks
  ];

  const seenKeys = new Set<string>();
  return references.filter((reference) => {
    const startOffset = isFrontmatterLinkCacheWithOffsets(reference) ? reference.startOffset : 0;
    const seenKey = `${reference.key}:${String(startOffset)}`;
    if (seenKeys.has(seenKey)) {
      return false;
    }
    seenKeys.add(seenKey);
    return true;
  });
}

function countLines(text: string): number {
  return text.split('\n').length - 1;
}

/**
 * Determines whether a frontmatter link's key belongs to the given property. A list item or a nested
 * value carries a dotted key (`links.0`, `meta.url`), so the property it belongs to is a prefix of it.
 *
 * @param key - The key the link was cached under.
 * @param propertyKey - The property the gesture happened in.
 * @returns Whether the key belongs to the property.
 */
function doesKeyMatch(key: string, propertyKey: string): boolean {
  return key === propertyKey || key.startsWith(`${propertyKey}.`);
}

function findCandidates(params: FindCandidatesParams): FrontmatterLinkCandidate[] {
  const {
    app,
    linkTarget,
    propertyKey,
    rawLink,
    sourceFile
  } = params;

  const references = collectFrontmatterReferences(app, sourceFile);
  const candidates: FrontmatterLinkCandidate[] = [];

  for (const reference of references) {
    if (propertyKey !== undefined && !doesKeyMatch(reference.key, propertyKey)) {
      continue;
    }

    const parsedLink = isParseLinkFrontmatterReference(reference) ? reference.parseLinkResult : parseLink(reference.original);
    if (!parsedLink) {
      continue;
    }

    if (rawLink !== undefined && parsedLink.raw !== rawLink) {
      continue;
    }

    if (
      isTargetKnown(linkTarget) && !doesLinkMatchTarget({
        app,
        linkTarget,
        parsedLink,
        sourcePath: sourceFile.path
      })
    ) {
      continue;
    }

    candidates.push({
      parsedLink,
      reference
    });
  }

  return candidates;
}
