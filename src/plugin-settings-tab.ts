import type { SettingDefinitionItem } from 'obsidian';

import { appendCodeBlock } from 'obsidian-dev-utils/obsidian/html-element';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

/**
 * The plugin settings tab.
 */
export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      this.settingGroupEx({
        heading: 'Link click',
        items: [
          this.settingEx({
            desc: createFragment((f) => {
              f.appendText('Whether ');
              appendCodeBlock(f, 'Alt + click');
              f.appendText(' (');
              appendCodeBlock(f, 'Option + click');
              f.appendText(' on macOS) on a link opens the link editor at the link, instead of opening the link.');
              f.createEl('br');
              f.appendText('Every other gesture is left alone: a plain click still opens the link, and ');
              appendCodeBlock(f, 'Ctrl + click');
              f.appendText(' still opens it in a new tab.');
            }),
            name: 'Should open link editor on Alt + click',
            render: (setting) => {
              setting.addToggle((toggle) => {
                this.bind({ propertyName: 'shouldOpenLinkEditorOnAltClick', valueComponent: toggle });
              });
            }
          })
        ]
      })
    ];
  }
}
