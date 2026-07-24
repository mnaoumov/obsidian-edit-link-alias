import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';
import type { Promisable } from 'type-fest';

import { generateRawMarkdownLink } from 'obsidian-dev-utils/obsidian/link';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';

import { editLinkUrlAndAlias } from './link-editor-modal.ts';

/**
 * A function that edits a parsed link and applies the replacement. Both {@link editParsedLinkAlias} and
 * {@link editParsedLinkUrlAndAlias} conform to it, so callers (the editor command handlers and the link
 * context-menu handler) can be parameterized by which editor to invoke.
 *
 * @param params - The parameters for editing the link.
 * @returns A {@link Promise} that resolves when the edit flow completes.
 */
export type EditParsedLink = (params: EditParsedLinkParams) => Promise<void>;

/**
 * Parameters for {@link editParsedLinkAlias} and {@link editParsedLinkUrlAndAlias}.
 */
export interface EditParsedLinkParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * Applies the rebuilt raw link, replacing the original occurrence.
   *
   * @param newRawLink - The rebuilt raw markdown/wiki link to write in place of the original.
   */
  applyReplacement(this: void, newRawLink: string): Promisable<void>;

  /**
   * The parsed link being edited.
   */
  readonly parsedLink: ParseLinkResult;
}

/**
 * Prompts for a new alias and, unless cancelled, rebuilds the link preserving its flags and applies the
 * replacement. Shared by the editor command and the link/url context-menu paths so the prompt + rebuild
 * logic lives in one place.
 *
 * @param params - The parameters for editing the alias.
 */
// eslint-disable-next-line obsidian-dev-utils/params-options-name-match -- Conforms to the exported EditParsedLink callback signature, so it shares its param type.
export async function editParsedLinkAlias(params: EditParsedLinkParams): Promise<void> {
  const {
    app,
    applyReplacement,
    parsedLink
  } = params;

  const newAlias = await prompt({
    app,
    defaultValue: parsedLink.alias ?? parsedLink.url,
    title: 'Edit link alias'
  });

  if (newAlias === null) {
    return;
  }

  await applyReplacement(rebuildRawLink(parsedLink, parsedLink.url, newAlias));
}

/**
 * Opens the two-field editor for the link's URL and alias and, unless cancelled, rebuilds the link
 * preserving its remaining flags (embed / wikilink / angle brackets / title) and applies the replacement.
 * Shared by the editor command and the link/url context-menu paths.
 *
 * @param params - The parameters for editing the link.
 */
// eslint-disable-next-line obsidian-dev-utils/params-options-name-match -- Conforms to the exported EditParsedLink callback signature, so it shares its param type.
export async function editParsedLinkUrlAndAlias(params: EditParsedLinkParams): Promise<void> {
  const {
    app,
    applyReplacement,
    parsedLink
  } = params;

  const edited = await editLinkUrlAndAlias({
    app,
    defaultAlias: parsedLink.alias ?? '',
    defaultUrl: parsedLink.url
  });

  if (edited === null) {
    return;
  }

  await applyReplacement(rebuildRawLink(parsedLink, edited.url, edited.alias));
}

/**
 * Rebuilds the raw link text for a parsed link with a new URL and alias, preserving the embed, wikilink,
 * angle-bracket, and title flags of the original.
 *
 * @param parsedLink - The parsed link whose flags are preserved.
 * @param url - The new URL (target) of the link.
 * @param alias - The new alias (display text) of the link.
 * @returns The rebuilt raw markdown/wiki link.
 */
function rebuildRawLink(parsedLink: ParseLinkResult, url: string, alias: string): string {
  return generateRawMarkdownLink({
    alias,
    isEmbed: parsedLink.isEmbed,
    isWikilink: parsedLink.isWikilink,
    shouldUseAngleBrackets: parsedLink.hasAngleBrackets ?? false,
    title: parsedLink.title ?? '',
    url
  });
}
