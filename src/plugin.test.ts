import type {
  App as AppOriginal,
  PluginManifest
} from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { Component } from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

// The shared command handler component is now constructed and registered by PluginBase itself, so the mock exposes the registerCommandHandlers spy the base (and the plugin) call at load.
const { registerCommandHandlers } = vi.hoisted(() => ({ registerCommandHandlers: vi.fn() }));

vi.mock('@mnaoumov/obsidian-lib/command-handlers/command-handler-component', () => ({
  // eslint-disable-next-line prefer-arrow-callback, func-names -- mock must be constructable with `new` and return a loadable Component exposing registerCommandHandlers.
  CommandHandlerComponent: vi.fn(function (): Component {
    return Object.assign(new Component(), { registerCommandHandlers });
  })
}));

vi.mock('@mnaoumov/obsidian-lib/components/menu-event-registrar-component', () => ({
  // eslint-disable-next-line prefer-arrow-callback, func-names -- mock must be constructable with `new` and return a loadable Component.
  MenuEventRegistrarComponent: vi.fn(function (): Component {
    return new Component();
  })
}));

vi.mock('@mnaoumov/obsidian-lib/active-file-provider', () => ({
  AppActiveFileProvider: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/command-registrar', () => ({
  PluginCommandRegistrar: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler', () => ({
  OpenDemoVaultCommandHandler: vi.fn()
}));

vi.mock('./edit-command-handler.ts', () => ({
  EditCommandHandler: vi.fn()
}));

vi.mock('./edit-url-and-alias-command-handler.ts', () => ({
  EditUrlAndAliasCommandHandler: vi.fn()
}));

const { register } = vi.hoisted(() => ({ register: vi.fn() }));

interface MockLinkMenuHandler {
  register: () => void;
}

vi.mock('./link-menu-handler.ts', () => ({
  // eslint-disable-next-line prefer-arrow-callback, func-names -- mock must be constructable with `new` and expose register.
  LinkMenuHandler: vi.fn(function (): MockLinkMenuHandler {
    return { register };
  })
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { OpenDemoVaultCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsTabComponent } from '@mnaoumov/obsidian-lib/components/plugin-settings-tab-component';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { resetObsidianLibState } from '@mnaoumov/obsidian-lib/obsidian-lib-state';

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { EditCommandHandler } from './edit-command-handler.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { EditUrlAndAliasCommandHandler } from './edit-url-and-alias-command-handler.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { LinkClickComponent } from './link-click-component.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { LinkMenuHandler } from './link-menu-handler.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettings } from './plugin-settings.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';

interface AppGlobal {
  app: AppOriginal;
}

const manifest = strictProxy<PluginManifest>({
  id: 'edit-link-alias',
  name: 'Edit Link Alias',
  version: '1.0.0'
});

interface ComponentChildrenHolder {
  readonly _children: readonly Component[];
}

let app: AppOriginal;

// `registerCommandHandlers` takes a factory, and the base registers its
// own handlers through the same spy — so pick the plugin's own factory by what it builds.
function buildPluginCommandHandlers(): unknown[] {
  const commandHandlerBatches = registerCommandHandlers.mock.calls
    .map(([commandHandlerFactory]) => castTo<() => unknown[]>(commandHandlerFactory)());
  const pluginCommandHandlers = commandHandlerBatches.find((commandHandlers) => commandHandlers.some((commandHandler) => commandHandler instanceof EditCommandHandler));
  if (!pluginCommandHandlers) {
    throw new Error('The plugin did not register its own command handlers.');
  }
  return pluginCommandHandlers;
}

async function createLoadedPlugin(): Promise<Plugin> {
  const plugin = new Plugin(app, manifest);
  // PluginBase.onload is async; driving the real async load path directly (as the `@mnaoumov/obsidian-lib` reference test does) runs every universal component plus onloadImpl.
  await plugin.onload();
  return plugin;
}

beforeEach(() => {
  vi.clearAllMocks();

  const appMock = App.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
  app = appMock.asOriginalType__();

  // Start every test from an empty obsidian-lib shared-state bag, so the real universal components loaded by one test leave nothing behind for the next.
  resetObsidianLibState();

  // Expose the app as the global instance so obsidian-lib helpers that resolve the app without an explicit argument read the same one.
  castTo<AppGlobal>(window).app = app;
});

describe('Plugin', () => {
  it('should register the edit, edit-url-and-alias, and open-demo-vault command handlers on the shared command handler component on load', async () => {
    await createLoadedPlugin();

    expect(buildPluginCommandHandlers()).toStrictEqual([
      expect.any(EditCommandHandler),
      expect.any(EditUrlAndAliasCommandHandler),
      expect.any(OpenDemoVaultCommandHandler)
    ]);
  });

  it('should construct the edit command handler with the app', async () => {
    await createLoadedPlugin();

    buildPluginCommandHandlers();
    expect(vi.mocked(EditCommandHandler)).toHaveBeenCalled();
    const params = vi.mocked(EditCommandHandler).mock.calls[0]?.[0];
    expect(params?.app).toBe(app);
    expect(params?.pluginNoticeComponent).toBeDefined();
  });

  it('should construct the edit-url-and-alias command handler with the app', async () => {
    await createLoadedPlugin();

    buildPluginCommandHandlers();
    expect(vi.mocked(EditUrlAndAliasCommandHandler)).toHaveBeenCalled();
    const params = vi.mocked(EditUrlAndAliasCommandHandler).mock.calls[0]?.[0];
    expect(params?.app).toBe(app);
    expect(params?.pluginNoticeComponent).toBeDefined();
  });

  it('should construct the open-demo-vault command handler with the app, plugin id, and version', async () => {
    await createLoadedPlugin();

    buildPluginCommandHandlers();
    expect(vi.mocked(OpenDemoVaultCommandHandler)).toHaveBeenCalled();
    const params = vi.mocked(OpenDemoVaultCommandHandler).mock.calls[0]?.[0];
    expect(params?.app).toBe(app);
    expect(params?.pluginId).toBe(manifest.id);
    expect(params?.pluginVersion).toBe(manifest.version);
  });

  it('should construct the link menu handler with the app and register it on load', async () => {
    const plugin = await createLoadedPlugin();

    expect(vi.mocked(LinkMenuHandler)).toHaveBeenCalledOnce();
    const params = vi.mocked(LinkMenuHandler).mock.calls[0]?.[0];
    expect(params?.app).toBe(app);
    expect(params?.plugin).toBe(plugin);
    expect(register).toHaveBeenCalledOnce();
  });

  it('should load the plugin settings with the Alt-click editor enabled by default', async () => {
    const plugin = await createLoadedPlugin();

    const settingsComponent = findAddedChild(plugin, PluginSettingsComponentBase<PluginSettings>);
    expect(settingsComponent.settings.shouldOpenLinkEditorOnAltClick).toBe(true);
  });

  it('should register the link click component on load', async () => {
    const plugin = await createLoadedPlugin();

    expect(findAddedChild(plugin, LinkClickComponent)).toBeInstanceOf(LinkClickComponent);
  });

  it('should register the settings tab on load', async () => {
    const plugin = await createLoadedPlugin();

    expect(findAddedChild(plugin, PluginSettingsTabComponent)).toBeInstanceOf(PluginSettingsTabComponent);
  });
});

/**
 * Finds a component the plugin added, at any depth — `PluginBase` nests the components added by
 * `onloadImpl` under an internal container component rather than attaching them to itself directly.
 *
 * @param plugin - The loaded plugin to search.
 * @param componentClass - The component class to look for.
 * @returns The matching component.
 */
function findAddedChild<T>(plugin: Plugin, componentClass: abstract new (...$arguments: never[]) => T): T {
  const queue: Component[] = [...castTo<ComponentChildrenHolder>(plugin)._children];
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate) {
      continue;
    }
    if (candidate instanceof componentClass) {
      return candidate;
    }
    queue.push(...castTo<ComponentChildrenHolder>(candidate)._children);
  }

  throw new Error(`No child of type ${componentClass.name} was added`);
}
