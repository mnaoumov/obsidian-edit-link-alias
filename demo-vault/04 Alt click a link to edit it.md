# Alt + click a link to edit it

`Alt` + click a link (`Option` + click on macOS) and a small pop-up appears **at the link**, with its **alias** and **URL** ready to edit. No command to run, no cursor to place carefully inside the link syntax.

The **alias** is the field the pop-up opens on, already selected - changing the display text is the more common edit, so you can start typing straight away. `Tab` moves to the URL.

`Alt` + click was chosen because Obsidian gives it no meaning on a link, so **nothing you already do changes**:

| Gesture | What happens |
| - | - |
| Plain click | Opens the link, as always |
| `Ctrl` / `Cmd` + click | Opens the link in a new tab, as always |
| `Alt` + click | Opens the link editor |

## Try it

1. `Alt` + click one of the links below - in Reading view, in Live Preview, or in source mode.
2. The pop-up appears at the link, pre-filled with its target and display text. Edit either field and press **OK**.
3. The link is rewritten in place. `Esc`, the **Cancel** button, or a click anywhere outside dismisses it without changing anything.

Then try a plain click on the same link: it still opens the note, untouched.

## Internal wikilinks

- Retarget and rename: [the opening note](<./First target.md>)
- A bare link with no alias yet: [Second target](<./Second target.md>)

## Markdown links

- Fix the path and the label together: [First target](<First target.md>)

## External links

- Correct a URL and its text: [Obsidian Help](https://help.obsidian.md)
<!-- markdownlint-disable-next-line MD034 -- The bare URL is the point of this example; wrapping it would remove what it demonstrates. -->
- A bare URL, no markdown around it: https://obsidian.md

## Anywhere on the link, with the cursor anywhere

It does not matter which part of the link you click or where the text cursor happens to be:

- Click the **display text** or the **destination** - both open the same pop-up.
- The cursor may sit inside the link, right next to it, or on the other side of the note.

That second point is worth trying deliberately: in Live Preview, click into the bare URL above so the cursor is inside it (the line turns back into plain text), then `Alt` + click it.

## The same editor, from the menu

Right-click a link (or long-press it on mobile) and choose **Edit link (URL and alias)** - it opens the very same pop-up, at the link you clicked. See [03 Edit link URL and alias](<./03 Edit link URL and alias.md>).

## Settings

- `shouldOpenLinkEditorOnAltClick`
  - whether `Alt` + click opens the link editor instead of opening the link. On by default; turn it off to leave `Alt` + click alone.

Turn it off, `Alt` + click a link and watch nothing happen, then turn it back on:

```code-button
---
caption: Leave Alt + click alone
---
await require('/demoSetup.ts').setAltClickEditing(app, false);
```

```code-button
---
caption: Alt + click opens the link editor again (the default)
---
await require('/demoSetup.ts').setAltClickEditing(app, true);
```

Manual equivalent: toggle **Should open link editor on alt click** in **Settings -> Community plugins -> Edit Link Alias**.

Try things on the scratch note rather than on this one:

```code-button
---
caption: Open the link playground (and reset it)
---
await require('/demoSetup.ts').resetLinkPlayground(app);
```

Manual equivalent: open `Materials/01 Edit link alias/Link playground.md`.

## Good to know

- In Reading view a link carries no information about *where* in the note it was written. If the note links to the same destination more than once, you are asked which occurrence to edit.
