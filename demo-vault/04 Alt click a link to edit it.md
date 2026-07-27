[Docs](https://github.com/mnaoumov/obsidian-edit-link-alias/)

# Alt + click a link to edit it

`Alt` + click a link (`Option` + click on macOS) and a small pop-up appears **at the link**, with its **URL** and **alias** ready to edit. No command to run, no cursor to place carefully inside the link syntax.

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

- Retarget and rename: [[First target|the opening note]]
- A bare link with no alias yet: [[Second target]]

## Markdown links

- Fix the path and the label together: [First target](<First target.md>)

## External links

- Correct a URL and its text: [Obsidian Help](https://help.obsidian.md)

## The same editor, from the menu

Right-click a link (or long-press it on mobile) and choose **Edit link (URL and alias)** - it opens the very same pop-up, at the link you clicked. See [[03 Edit link URL and alias]].

## Settings

- `shouldOpenLinkEditorOnAltClick` - whether `Alt` + click opens the link editor instead of opening the link. On by default; turn it off to leave `Alt` + click alone.

## Good to know

- In Reading view a link carries no information about *where* in the note it was written. If the note links to the same destination more than once, you are asked which occurrence to edit.
