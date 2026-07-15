import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { EditCommandHandler } from './edit-command-handler.ts';

export class Plugin extends PluginBase {
  protected override onloadImpl(): void {
    this.commandHandlerComponent.registerCommandHandlers([new EditCommandHandler(this.app)]);
  }
}
