# Edit link alias

The **Edit link alias** command changes the **display text** (alias) of the link under your cursor, leaving the link target untouched. It works on internal `[[wikilinks]]` and on `[markdown](links)` alike.

## Try it

Try things on the scratch note rather than on this one - editing links here would slowly dismantle the documentation, and you could only try it once:

```code-button
---
caption: Open the link playground (and reset it)
---
await require('/demoSetup.ts').resetLinkPlayground(app);
```

Manual equivalent: open `Materials/01 Edit link alias/Link playground.md`. To reset it later, press this button again.

1. Put your cursor anywhere inside one of the links in the playground.
2. Run **Edit link alias** from the Command Palette, or right-click and choose **Edit link alias**.
3. A prompt appears, pre-filled with the current alias (or the target itself if there is no alias). Type a new alias and press Enter.
4. Only the display text changes; the link still resolves to the same note.

Placing the cursor inside the right link is the fiddly part, so this does it for you - it resets the playground, puts the cursor in the un-aliased wikilink, and opens the prompt:

```code-button
---
caption: Edit the alias of the un-aliased wikilink
---
await require('/demoSetup.ts').editLinkOnLine(app, 'No alias yet', 'edit-link-alias');
```

Manual equivalent: click inside the `No alias yet` link in the playground, then run **Edit link alias**.

## Internal wikilinks

- No alias yet: [First target](<./First target.md>)
- Already aliased: [the opening note](<./First target.md>)
- Another target: [chapter two](<./Second target.md>)

## Markdown links

- No alias: [First target](<First target.md>)
- Already aliased: [the second note](<Second target.md>)

## What stays the same

The command only rewrites the alias segment. The target path, whether the link is a wikilink or a markdown link, and whether it is an embed are all preserved - so you can relabel a link for readability without breaking navigation.
