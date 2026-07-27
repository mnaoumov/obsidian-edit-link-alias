[Docs](https://github.com/mnaoumov/obsidian-edit-link-alias/)

# Click a link to edit it

Instead of reaching for a command or a context menu, you can make a **click on a link** open the editor right where the link is. A small pop-up appears next to the link with its **URL** and **alias**, so you can retarget or rename it without carefully placing the cursor inside the link syntax.

This is **off by default** - installing the plugin never changes how your links behave until you turn it on.

## Turn it on

1. Open **Settings -> Edit Link Alias**.
2. Set **Link click action** to one of:
   - **Open the link editor on click** - a plain click edits the link; `Ctrl` + click (`Cmd` + click on macOS) still opens it.
   - **Open the link editor on Ctrl + click** - the reverse: a plain click still opens the link, and `Ctrl` + click edits it.

## Try it

1. Turn the setting on as above.
2. Click one of the links below - in Reading view, in Live Preview, or in source mode.
3. The pop-up appears at the link, pre-filled with its target and display text. Edit either field and press **OK**.
4. The link is rewritten in place. `Esc`, the **Cancel** button, or a click anywhere outside dismisses it without changing anything.

## Internal wikilinks

- Retarget and rename: [[First target|the opening note]]
- A bare link with no alias yet: [[Second target]]

## Markdown links

- Fix the path and the label together: [First target](<First target.md>)

## External links

- Correct a URL and its text: [Obsidian Help](https://help.obsidian.md)

## Good to know

- The gesture you did **not** assign to the editor keeps its usual Obsidian meaning. So with **Open the link editor on click**, `Ctrl` + click still opens the link **in a new tab** - that is what `Ctrl` + click has always done in Obsidian, and the plugin deliberately leaves it alone.
- In Reading view a link carries no information about *where* in the note it was written. If the note links to the same destination more than once, you are asked which occurrence to edit.
- The same edit is available without click interception at all, from the Command Palette or the right-click / long-press menu - see [[03 Edit link URL and alias]].
