import { AppActiveFileProvider } from 'obsidian-dev-utils/obsidian/active-file-provider';
import { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import { PluginCommandRegistrar } from 'obsidian-dev-utils/obsidian/command-registrar';
import { MenuEventRegistrarComponent } from 'obsidian-dev-utils/obsidian/components/menu-event-registrar-component';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { EditCommandHandler } from './edit-command-handler.ts';

export class Plugin extends PluginBase {
  protected override onloadImpl(): void {
    const menuEventRegistrar = this.addChild(new MenuEventRegistrarComponent(this.app));
    this.addChild(
      new CommandHandlerComponent({
        activeFileProvider: new AppActiveFileProvider(this.app),
        commandHandlers: [new EditCommandHandler(this.app)],
        commandRegistrar: new PluginCommandRegistrar(this),
        menuEventRegistrar,
        pluginName: this.manifest.name
      })
    );
  }
}
