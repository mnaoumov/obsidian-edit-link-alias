import { appendCodeBlock } from 'obsidian-dev-utils/obsidian/html-element';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import { SettingGroupEx } from 'obsidian-dev-utils/obsidian/setting-group-ex';

import type { PluginSettings } from './plugin-settings.ts';

/**
 * The plugin settings tab.
 */
export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  public override displayLegacy(): void {
    super.displayLegacy();

    new SettingGroupEx(this.containerEl)
      .setHeading('Link click')
      .addSettingEx((setting) => {
        setting
          .setName('Link click action')
          .setDesc(createFragment((f) => {
            f.appendText('What clicking a link in a note does.');
            f.createEl('br');
            f.appendText('With ');
            appendCodeBlock(f, 'Open the link editor on click');
            f.appendText(', a plain click opens an editor popover at the link instead of opening the link, and ');
            appendCodeBlock(f, 'Ctrl + click');
            f.appendText(' (');
            appendCodeBlock(f, 'Cmd + click');
            f.appendText(' on macOS) keeps its usual meaning of opening the link in a new tab.');
            f.createEl('br');
            f.appendText('With ');
            appendCodeBlock(f, 'Open the link editor on Ctrl + click');
            f.appendText(', the two are swapped: a plain click still opens the link.');
          }))
          .addDropdown((dropdown) => {
            dropdown.addOptions({
              Disabled: 'Open the link, as Obsidian does by default',
              OpenEditorOnClick: 'Open the link editor on click',
              OpenEditorOnModClick: 'Open the link editor on Ctrl + click (Cmd + click on macOS)'
            });
            this.bind({ propertyName: 'linkClickAction', valueComponent: dropdown });
          });
      });
  }
}
