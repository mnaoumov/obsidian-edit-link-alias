import type {
  App,
  PluginManifest
} from 'obsidian';

import { AppActiveFileProvider } from 'obsidian-dev-utils/obsidian/active-file-provider';
import { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import { PluginCommandRegistrar } from 'obsidian-dev-utils/obsidian/command-registrar';
import { AppMenuEventRegistrar } from 'obsidian-dev-utils/obsidian/menu-event-registrar';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { EditCommandHandler } from './edit-command-handler.ts';

export class Plugin extends PluginBase {
  public constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);

    this.addChild(
      new CommandHandlerComponent({
        activeFileProvider: new AppActiveFileProvider(app),
        commandHandlers: [new EditCommandHandler(app)],
        commandRegistrar: new PluginCommandRegistrar(this),
        menuEventRegistrar: new AppMenuEventRegistrar(app, this),
        pluginName: manifest.name
      })
    );
  }
}
