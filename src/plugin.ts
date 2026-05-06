import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-base';

import type { PluginTypes } from './plugin-types.ts';

import { EditCommand } from './edit-command.ts';

export class Plugin extends PluginBase<PluginTypes> {
  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();

    new EditCommand(this).register();
  }
}
