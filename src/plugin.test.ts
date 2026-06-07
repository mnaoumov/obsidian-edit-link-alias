import type {
  App,
  PluginManifest
} from 'obsidian';

import { Component } from 'obsidian';
import { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import { MenuEventRegistrarComponent } from 'obsidian-dev-utils/obsidian/components/menu-event-registrar-component';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { Plugin } from './plugin.ts';

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin', () => ({
  PluginBase: Component
}));

function createMockManifest(): PluginManifest {
  return {
    author: 'test',
    description: 'test',
    id: 'edit-link-alias',
    minAppVersion: '1.0.0',
    name: 'Edit Link Alias',
    version: '1.0.0'
  };
}

describe('Plugin', () => {
  it('should add CommandHandlerComponent as a child', () => {
    const app = strictProxy<App>({});
    const addChildSpy = vi.spyOn(Component.prototype, 'addChild');

    new Plugin(app, createMockManifest());

    expect(addChildSpy).toHaveBeenCalledTimes(2);
    expect(addChildSpy.mock.calls[0]?.[0]).toBeInstanceOf(MenuEventRegistrarComponent);
    expect(addChildSpy.mock.calls[1]?.[0]).toBeInstanceOf(CommandHandlerComponent);

    addChildSpy.mockRestore();
  });
});
