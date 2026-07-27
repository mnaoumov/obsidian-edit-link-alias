import type {
  App as AppOriginal,
  PluginManifest
} from 'obsidian';

import { Component } from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
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

vi.mock('obsidian-dev-utils/obsidian/command-handlers/command-handler-component', () => ({
  // eslint-disable-next-line prefer-arrow-callback, func-names -- mock must be constructable with `new` and return a loadable Component exposing registerCommandHandlers.
  CommandHandlerComponent: vi.fn(function (): Component {
    return Object.assign(new Component(), { registerCommandHandlers });
  })
}));

vi.mock('obsidian-dev-utils/obsidian/components/menu-event-registrar-component', () => ({
  // eslint-disable-next-line prefer-arrow-callback, func-names -- mock must be constructable with `new` and return a loadable Component.
  MenuEventRegistrarComponent: vi.fn(function (): Component {
    return new Component();
  })
}));

vi.mock('obsidian-dev-utils/obsidian/active-file-provider', () => ({
  AppActiveFileProvider: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/command-registrar', () => ({
  PluginCommandRegistrar: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler', () => ({
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
  register(): void;
}

vi.mock('./link-menu-handler.ts', () => ({
  // eslint-disable-next-line prefer-arrow-callback, func-names -- mock must be constructable with `new` and expose register.
  LinkMenuHandler: vi.fn(function (): MockLinkMenuHandler {
    return { register };
  })
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { EditCommandHandler } from './edit-command-handler.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { EditUrlAndAliasCommandHandler } from './edit-url-and-alias-command-handler.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { LinkClickAction } from './link-click-action.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { LinkMenuHandler } from './link-menu-handler.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettings } from './plugin-settings.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';

interface AppGlobal {
  app: AppOriginal;
}

const STRICT_PROXY_TARGET_SYMBOL = Symbol.for('strictProxyTarget');

const manifest = strictProxy<PluginManifest>({
  id: 'edit-link-alias',
  name: 'Edit Link Alias',
  version: '1.0.0'
});

interface ComponentChildrenHolder {
  readonly _children: readonly Component[];
}

let app: AppOriginal;

async function createLoadedPlugin(): Promise<Plugin> {
  const plugin = new Plugin(app, manifest);
  // PluginBase.onload is async; driving the real async load path directly (as the obsidian-dev-utils reference test does) runs every universal component plus onloadImpl.
  await plugin.onload();
  return plugin;
}

function seedOnRawTarget(strictProxiedObject: object, key: string, value: unknown): void {
  const proxyWithTarget = castTo<Partial<Record<symbol, object>>>(strictProxiedObject);
  const rawTarget = proxyWithTarget[STRICT_PROXY_TARGET_SYMBOL] ?? strictProxiedObject;
  castTo<Record<string, unknown>>(rawTarget)[key] = value;
}

beforeEach(() => {
  vi.clearAllMocks();

  const appMock = App.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((cb: () => void) => {
    cb();
  });
  app = appMock.asOriginalType__();

  // Seed the obsidianDevUtilsState holder on the raw target behind the strict-proxy App so the real dev-utils universal components can read/write shared state during load.
  seedOnRawTarget(app, 'obsidianDevUtilsState', {});

  // Expose the app as the global instance so dev-utils helpers that resolve shared state without an explicit app argument read/write the same seeded holder.
  castTo<AppGlobal>(window).app = app;
});

describe('Plugin', () => {
  it('should register the edit, edit-url-and-alias, and open-demo-vault command handlers on the shared command handler component on load', async () => {
    await createLoadedPlugin();

    const editCommandHandler = vi.mocked(EditCommandHandler).mock.instances[0];
    const editUrlAndAliasCommandHandler = vi.mocked(EditUrlAndAliasCommandHandler).mock.instances[0];
    const openDemoVaultCommandHandler = vi.mocked(OpenDemoVaultCommandHandler).mock.instances[0];
    expect(registerCommandHandlers).toHaveBeenCalledWith([editCommandHandler, editUrlAndAliasCommandHandler, openDemoVaultCommandHandler]);
  });

  it('should construct the edit command handler with the app', async () => {
    await createLoadedPlugin();

    expect(vi.mocked(EditCommandHandler)).toHaveBeenCalledExactlyOnceWith(app);
  });

  it('should construct the edit-url-and-alias command handler with the app', async () => {
    await createLoadedPlugin();

    expect(vi.mocked(EditUrlAndAliasCommandHandler)).toHaveBeenCalledExactlyOnceWith(app);
  });

  it('should construct the open-demo-vault command handler with the app, plugin id, and version', async () => {
    await createLoadedPlugin();

    expect(vi.mocked(OpenDemoVaultCommandHandler)).toHaveBeenCalledOnce();
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

  it('should load the plugin settings with the default link click action', async () => {
    const plugin = await createLoadedPlugin();

    const settingsComponent = findAddedChild(plugin, PluginSettingsComponentBase<PluginSettings>);
    expect(settingsComponent.settings.linkClickAction).toBe(LinkClickAction.Disabled);
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
function findAddedChild<T>(plugin: Plugin, componentClass: abstract new (...args: never[]) => T): T {
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
