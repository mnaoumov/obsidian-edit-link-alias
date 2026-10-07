---
obsidian-dev-utils:
  demo-vault-validation:
    allow-wikilinks: The wikilink property values are the fixtures this note edits.
url: https://help.obsidian.md
Homepage: https://obsidian.md/about
note: "[[First target]]"
links:
  - https://obsidian.md
  - "[[Second target]]"
---
# Frontmatter links

Links also live in a note's **properties** - this very note carries five link properties, right above. They are edited by the same two editors, and the plugin writes them back **through the frontmatter** so the YAML stays valid.

That last part is the whole difficulty. A property value holding a bare URL needs no quotes:

```yaml
url: https://help.obsidian.md
```

but the moment it becomes a markdown link it does, because `[` starts a YAML list:

```yaml
url: "[Obsidian Help](https://help.obsidian.md)"
```

Writing that value as raw text - the way a link in the note body is written - would leave the note with a frontmatter syntax error. So a frontmatter link is never spliced into the raw YAML; the property value is replaced and the block is re-serialized with whatever quoting it needs.

## Try it

The link playground carries a `related` property holding a wikilink, so you can experiment there instead of editing this note's own properties:

```code-button
---
caption: Open the link playground (and reset it)
---
await require('/demoSetup.ts').resetLinkPlayground(app);
```

Manual equivalent: open `Materials/01 Edit link alias/Link playground.md` and look at its `related` property.

Or work on this note's five properties directly - it is the richer fixture, and the reset button above will not undo those edits:

1. In **Live Preview** or **Reading view**, `Alt` + click one of the links in the Properties panel at the top of this note.
2. Edit the URL, the alias, or both, and press **OK**.
3. Look at the property: it now holds a quoted markdown link, and the Properties panel still parses it.

Then try the other two routes to the same edit:

- **Right-click** (or long-press) a property link and choose **Edit link alias** or **Edit link (URL and alias)**.
- Switch to **source mode** (`Ctrl`/`Cmd` + click the note title menu → *Source mode*), where the frontmatter is plain YAML text, and `Alt` + click a URL inside it. There is no link to click there as far as Obsidian is concerned - the position under the pointer is what identifies it.

The `links` list works the same way, one item at a time: only the item you clicked is rewritten.

## Property names with capitals

The `Homepage` property above is spelled with a capital letter on purpose. Obsidian shows every property name in lowercase but stores it exactly as the note wrote it, so the two have to be matched case-insensitively - `Alt` + click that link and it opens like any other.

## Links shown in a Base

A **Base** shows every matching note's properties in a table, so a link in it belongs to the note in its **row** - not to the note the Base is embedded in, and not to a `.base` file, which has no properties of its own. `Alt` + click (or right-click) a link in the table below and the plugin edits that row's note:

```base
filters:
  or:
    - file.hasProperty("note")
    - file.hasProperty("related")
views:
  - type: table
    name: Link properties
    order:
      - file.name
      - note
      - related
```

The `related` row appears once the link playground exists - press the button above. Only note properties can be edited this way: a formula column is computed, so it has nothing to write back to.

## Good to know

- **The frontmatter block is re-serialized on such an edit.** Its links and values are preserved, but comments and hand formatting inside the block are normalized - the same thing happens when any plugin writes a property through Obsidian's own API.
- A frontmatter edit is written to the file rather than typed into the editor, so it does **not** join the editor's undo history. An edit to a link in the note body still does.
- If the same URL appears in several properties, you are asked which one to edit - exactly as for a note that links to the same destination twice.
