import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';
import type { PopoverAnchor } from 'obsidian-dev-utils/obsidian/popovers/popover-anchor';
import type { Promisable } from 'type-fest';

import { generateRawMarkdownLink } from 'obsidian-dev-utils/obsidian/link';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';
import { editFieldsInPopover } from 'obsidian-dev-utils/obsidian/popovers/field-popover';

/**
 * A function that edits a parsed link and applies the replacement. Both {@link editParsedLinkAlias} and
 * the one built by {@link createEditParsedLinkUrlAndAliasInPopover} conform to it, so callers (the
 * editor command handlers, the link context-menu handler, the click interception) can be parameterized
 * by which editor to invoke.
 *
 * @param params - The parameters for editing the link.
 * @returns A {@link Promise} that resolves when the edit flow completes.
 */
export type EditParsedLink = (params: EditParsedLinkParams) => Promise<void>;

/**
 * Parameters for an {@link EditParsedLink}.
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
 * Builds an {@link EditParsedLink} that edits the URL and alias in a popover at the given anchor.
 *
 * A factory rather than a plain exported {@link EditParsedLink} because the anchor differs per entry
 * point (a clicked link, the pointer that opened a context menu, the caret) and is only known at
 * invocation time; threading it through {@link EditParsedLinkParams} would burden the alias-only
 * editor with an anchor it has no use for.
 *
 * @param anchor - Where to place the popover.
 * @returns An {@link EditParsedLink} that edits the link in an anchored popover.
 */
export function createEditParsedLinkUrlAndAliasInPopover(anchor: PopoverAnchor): EditParsedLink {
  return async (params: EditParsedLinkParams): Promise<void> => {
    const {
      applyReplacement,
      parsedLink
    } = params;

    const edited = await editFieldsInPopover({
      anchor,
      /*
       * The alias comes FIRST, and that order is load-bearing rather than cosmetic: the popover focuses and
       * selects its first input, so whichever field is declared first is the one ready to be typed over.
       * Changing an alias is the more frequent edit (GH #7), so it gets the caret. Do not reorder these —
       * alphabetically or otherwise — without moving the focus somewhere else on purpose.
       */
      fields: [
        {
          defaultValue: parsedLink.alias ?? '',
          key: 'alias',
          name: 'Alias'
        },
        {
          defaultValue: parsedLink.url,
          key: 'url',
          name: 'URL'
        }
      ]
    });

    if (edited === null) {
      return;
    }

    await applyReplacement(rebuildRawLink(parsedLink, edited.url, edited.alias));
  };
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
