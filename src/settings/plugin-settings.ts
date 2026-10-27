/**
 * The plugin settings.
 */
export class PluginSettings {
  /**
   * Whether `Alt` + clicking a link (`Option` + click on macOS) opens the link editor instead of
   * following the link.
   *
   * Defaults to `true`: Obsidian gives `Alt` + click no meaning on a link, so this takes no gesture
   * away — a plain click still opens the link, and `Ctrl`/`Cmd` + click still opens it in a new tab.
   */
  public shouldOpenLinkEditorOnAltClick = true;
}
