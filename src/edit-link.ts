import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';
import type { Promisable } from 'type-fest';

import { generateRawMarkdownLink } from 'obsidian-dev-utils/obsidian/link';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';

/**
 * Parameters for {@link editParsedLinkAlias}.
 */
export interface EditParsedLinkAliasParams {
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
   * The parsed link whose alias is being edited.
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
export async function editParsedLinkAlias(params: EditParsedLinkAliasParams): Promise<void> {
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

  const newRawLink = generateRawMarkdownLink({
    alias: newAlias,
    isEmbed: parsedLink.isEmbed,
    isWikilink: parsedLink.isWikilink,
    shouldUseAngleBrackets: parsedLink.hasAngleBrackets ?? false,
    title: parsedLink.title ?? '',
    url: parsedLink.url
  });

  await applyReplacement(newRawLink);
}
