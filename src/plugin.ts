import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { PointerPositionComponent } from 'obsidian-dev-utils/obsidian/components/pointer-position-component';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { EditCommandHandler } from './edit-command-handler.ts';
import { EditUrlAndAliasCommandHandler } from './edit-url-and-alias-command-handler.ts';
import { LinkClickComponent } from './link-click-component.ts';
import { LinkMenuHandler } from './link-menu-handler.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';

export class Plugin extends PluginBase {
  protected override onloadImpl(): void {
    const dataHandler = new PluginDataHandler(this);
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponentBase({
        dataHandler,
        pluginEventSource: this,
        pluginSettingsClass: PluginSettings
      })
    );
    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab: new PluginSettingsTab({
          plugin: this,
          pluginSettingsComponent
        })
      })
    );

    const pointerPositionComponent = this.addChild(new PointerPositionComponent(this.app));

    this.addChild(
      new LinkClickComponent(this.app, {
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent
      })
    );

    this.commandHandlerComponent.registerCommandHandlers([
      new EditCommandHandler(this.app),
      new EditUrlAndAliasCommandHandler(this.app),
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);

    new LinkMenuHandler({
      app: this.app,
      plugin: this,
      pluginNoticeComponent: this.pluginNoticeComponent,
      pointerPositionComponent
    }).register();
  }
}
