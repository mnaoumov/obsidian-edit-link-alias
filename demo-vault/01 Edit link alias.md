[Docs](https://github.com/mnaoumov/obsidian-edit-link-alias/)

# Edit link alias

The **Edit link alias** command changes the **display text** (alias) of the link under your cursor, leaving the link target untouched. It works on internal `[[wikilinks]]` and on `[markdown](links)` alike.

## Try it

1. Put your cursor anywhere inside one of the links below.
2. Run **Edit link alias** from the Command Palette, or right-click and choose **Edit link alias**.
3. A prompt appears, pre-filled with the current alias (or the target itself if there is no alias). Type a new alias and press Enter.
4. Only the display text changes; the link still resolves to the same note.

## Internal wikilinks

- No alias yet: [[First target]]
- Already aliased: [[First target|the opening note]]
- Another target: [[Second target|chapter two]]

## Markdown links

- No alias: [First target](<First target.md>)
- Already aliased: [the second note](<Second target.md>)

## What stays the same

The command only rewrites the alias segment. The target path, whether the link is a wikilink or a markdown link, and whether it is an embed are all preserved - so you can relabel a link for readability without breaking navigation.
