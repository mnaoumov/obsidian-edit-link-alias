import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { EditCommandHandler } from './edit-command-handler.ts';
import { LinkMenuHandler } from './link-menu-handler.ts';

export class Plugin extends PluginBase {
  protected override onloadImpl(): void {
    this.commandHandlerComponent.registerCommandHandlers([
      new EditCommandHandler(this.app),
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
      pluginNoticeComponent: this.pluginNoticeComponent
    }).register();
  }
}
