# Edit Link Alias

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov)
[![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-edit-link-alias)](https://github.com/mnaoumov/obsidian-edit-link-alias/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-edit-link-alias/total)](https://github.com/mnaoumov/obsidian-edit-link-alias/releases)
[![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/mnaoumov/obsidian-edit-link-alias)

This is a plugin for [Obsidian](https://obsidian.md/) that adds an **Edit link alias** command (changes only the display text of the link under your cursor) and an **Edit link (URL and alias)** command (a two-field pop-up that edits the link's target and display text together). Both are available from the Command Palette, the editor right-click menu, and the link long-press / Reading-view context menu, and work on internal wikilinks, markdown links, and external links alike. Optionally, **clicking** a link can open the editor right at the link instead of opening it.

![Prompt](./images/prompt.png)

## Editing a link by clicking it

Optionally, a **click on a link** can open the editor as a small pop-up anchored at the link, instead of opening the link. This is **off by default**, so installing the plugin does not change how links behave until you opt in.

In **Settings → Edit Link Alias**, set **Link click action** to one of:

- **Open the link, as Obsidian does by default** — the default. A click opens the link; `Ctrl` + click (`Cmd` + click on macOS) opens it in a new tab.
- **Open the link editor on click** — a click opens the editor; `Ctrl` + click opens the link in a new tab.
- **Open the link editor on Ctrl + click** — a click still opens the link; `Ctrl` + click opens the editor.

It works in Reading view, Live Preview, and source mode, on desktop and mobile. The gesture that is *not* assigned to the editor is left untouched, so it keeps its usual Obsidian meaning — in particular, `Ctrl` + click still opens the link in a **new** tab rather than the current one.

## Demo vault

A demo vault with usage examples ships with every release. You can access it via any of the following:

1. Running the **Edit Link Alias: Open demo vault** command.
2. Downloading `edit-link-alias.demo-vault.zip` from the [Releases](https://github.com/mnaoumov/obsidian-edit-link-alias/releases).
3. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

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

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" width="217"></a>

<!-- markdownlint-enable MD033 -->

## My other Obsidian resources

[See my other Obsidian resources](https://github.com/mnaoumov/obsidian-resources).

## License

© [Michael Naumov](https://github.com/mnaoumov/)
