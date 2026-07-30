/**
 * @file
 *
 * What a gesture said the link points at, and how to tell whether a parsed link is that link.
 *
 * Lives in its own module because BOTH occurrence resolvers need it — the body one
 * ({@link resolveAndEditLink} in `resolve-link-occurrence.ts`) and the frontmatter one
 * ({@link resolveAndEditFrontmatterLink} in `frontmatter-link-occurrence.ts`) — and the body resolver
 * routes into the frontmatter resolver, so keeping this vocabulary in either of them would make the two
 * modules import each other.
 */

import type {
  App,
  TFile
} from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

import { getLinkpath } from 'obsidian';

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
 * Determines whether the caller could tell what the link points at. An unknown target carries none of the
 * three fields and is resolved by position instead — {@link doesLinkMatchTarget} has nothing to compare it
 * against and would reject every link, so callers must skip the match test for it.
 *
 * @param linkTarget - The link target to inspect.
 * @returns Whether the target is known.
 */
export function isTargetKnown(linkTarget: LinkTarget): boolean {
  return linkTarget.externalUrl !== undefined || linkTarget.linkPath !== undefined || Boolean(linkTarget.target);
}
