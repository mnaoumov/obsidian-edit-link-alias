import { LinkClickAction } from './link-click-action.ts';

/**
 * The plugin settings.
 */
export class PluginSettings {
  /**
   * What clicking a link in a note does. Defaults to {@link LinkClickAction.Disabled}, so the plugin
   * changes nothing about how links behave until the user opts in.
   */
  public linkClickAction = LinkClickAction.Disabled;
}
