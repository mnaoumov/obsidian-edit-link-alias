# Edit link URL and alias

The **Edit link (URL and alias)** command opens a small pop-up that lets you edit **both** the link's target (URL) **and** its display text (alias) at the same time, leaving the kind of link untouched. It works on internal `[[wikilinks]]` and on `[markdown](links)` alike, and complements the alias-only **Edit link alias** command.

![The two-field link editor, open on a link](<./_assets/images/prompt.png>)

## Try it

1. Put your cursor anywhere inside one of the links below (or, on mobile, long-press a rendered link; in Reading view, right-click it).
2. Run **Edit link (URL and alias)** from the Command Palette, or choose it from the link's right-click / long-press menu.
3. A pop-up appears with two fields, pre-filled with the current **URL** and **alias**. Edit either or both and press **OK**.
4. The link is rewritten in place - both the target and the display text - preserving whether it is a wikilink, a markdown link, or an embed.

## Internal wikilinks

- Change the target and the alias: [the opening note](<./First target.md>)
- Give a bare link both a new target and an alias: [Second target](<./Second target.md>)

## Markdown links

- Change URL and alias together: [First target](<First target.md>)

## External links

- Fix a URL and its label at once: [Obsidian Help](https://help.obsidian.md)

## Alias only

If you only want to change the display text and never touch the target, use the companion [01 Edit link alias](<./01 Edit link alias.md>) command instead.
