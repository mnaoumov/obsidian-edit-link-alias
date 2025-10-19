import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';

import type { PluginTypes } from './PluginTypes.ts';

import { EditCommand } from './EditCommand.ts';

export class Plugin extends PluginBase<PluginTypes> {
  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();

    new EditCommand(this).register();
  }
}
