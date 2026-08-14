# Edit Link Alias

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov)
[![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-edit-link-alias)](https://github.com/mnaoumov/obsidian-edit-link-alias/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-edit-link-alias/total)](https://github.com/mnaoumov/obsidian-edit-link-alias/releases)
[![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/mnaoumov/obsidian-edit-link-alias)

Changing what a link *says* in [Obsidian](https://obsidian.md/) means editing the raw link text by
hand — finding the `|` in a wikilink or the right pair of brackets in a markdown link, in the middle of
a sentence, without breaking either. In Reading view you cannot do it at all without switching modes.

This plugin edits the link under your cursor through a small pop-up: **Edit link alias** changes just
the display text, and **Edit link (URL and alias)** changes the target and the text together. Both work
on wikilinks, markdown links, external links and links in a note's properties, from the Command
Palette, the right-click menu, or `Alt` + clicking the link itself.

## Demo vault

**The documentation is a demo vault.** Every feature has a note that explains what it does and why you
would want it, with links of every kind already in place to edit.

**[Start reading here](<./demo-vault/00 Start.md>)** — it is plain markdown, so it works on GitHub with
nothing installed.

A copy of the vault ships with every release. You can access it via any of the following:

1. Running the **Edit Link Alias: Open demo vault** command.
2. Downloading `edit-link-alias-demo-vault-<version>.zip` (`<version>` is the release version) from the [Releases](https://github.com/mnaoumov/obsidian-edit-link-alias/releases).
3. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

## What it does

- **Edit a link's display text** without hunting for the `|` or the brackets.
  [01 Edit link alias](<./demo-vault/01 Edit link alias.md>)
- **Edit the target and the text together**, in one two-field pop-up.
  [03 Edit link URL and alias](<./demo-vault/03 Edit link URL and alias.md>)
- **`Alt` + click a link to edit it** — in Reading view, Live Preview and source mode, on desktop and
  mobile. It opens on the alias with the text selected, since that is the more common edit, and `Tab`
  moves to the URL. `Alt` + click is used because Obsidian gives it no meaning on a link, so nothing
  you already do changes.
  [04 Alt click a link to edit it](<./demo-vault/04 Alt click a link to edit it.md>)
- **External links** work the same way.
  [02 External links](<./demo-vault/02 External links.md>)
- **Links in properties** are editable too, written back through the frontmatter so the value stays
  valid YAML — with the two consequences that follow from that.
  [05 Frontmatter links](<./demo-vault/05 Frontmatter links.md>)

## Installation

The plugin is available in [the official Community Plugins repository](https://community.obsidian.md/plugins/edit-link-alias).

### Beta versions

To install the latest beta release of this plugin (regardless if it is available in [the official Community Plugins repository](https://community.obsidian.md) or not), follow these steps:

1. Ensure you have the [BRAT plugin](https://community.obsidian.md/plugins/obsidian42-brat) installed and enabled.
2. Click [Install via BRAT](https://intradeus.github.io/http-protocol-redirector?r=obsidian://brat?plugin=https://github.com/mnaoumov/obsidian-edit-link-alias).
3. An Obsidian pop-up window should appear. In the window, click the `Add plugin` button once and wait a few seconds for the plugin to install.

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command in the `DevTools Console`:

```js
window.DEBUG.enable('edit-link-alias');
```

For more details, refer to the [documentation](https://mnaoumov.dev/obsidian-dev-utils/guides/debugging/).

## Changelog

All notable changes to this project will be documented in the [CHANGELOG](./CHANGELOG.md).

## Contributing

Contributions are welcome — see [CONTRIBUTING](./CONTRIBUTING.md) to get set up.

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" width="217"></a>

<!-- markdownlint-enable MD033 -->

## My other Obsidian resources

[See my other Obsidian resources](https://github.com/mnaoumov/obsidian-resources).

## License

© [Michael Naumov](https://github.com/mnaoumov/)
