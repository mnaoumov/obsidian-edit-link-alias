# External links

**Edit link alias** also works on external `[label](https://...)` links - handy for giving a bare URL a readable label, or renaming an existing one.

## Try it

The playground has external links too, and the button places the cursor in the bare one for you:

```code-button
---
caption: Label the bare URL in the playground
---
await require('/demoSetup.ts').editLinkOnLine(app, 'A labelled URL', 'edit-link-alias');
```

Manual equivalent: open `Materials/01 Edit link alias/Link playground.md`, click inside its external link, and run **Edit link alias**.

Or work on the examples below:

1. Put your cursor inside one of the external links below.
2. Run **Edit link alias** (Command Palette or the editor right-click menu).
3. Type the label you want and press Enter.

## Links to relabel

- Give this one a friendly label: [https://obsidian.md](https://obsidian.md)
- Rename this label: [Obsidian Help](https://help.obsidian.md)
- A project link: [obsidian-dev-utils on GitHub](https://github.com/mnaoumov/obsidian-dev-utils)

The URL itself is never touched - only the text shown in the note changes.
