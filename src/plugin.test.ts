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

vi.mock('obsidian-dev-utils/obsidian/command-handlers/command-handler-component', () => ({
  // eslint-disable-next-line prefer-arrow-callback, func-names -- mock must be constructable with `new` and return a loadable Component.
  CommandHandlerComponent: vi.fn(function (): Component {
    return new Component();
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

vi.mock('./edit-command-handler.ts', () => ({
  EditCommandHandler: vi.fn()
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { MenuEventRegistrarComponent } from 'obsidian-dev-utils/obsidian/components/menu-event-registrar-component';

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { EditCommandHandler } from './edit-command-handler.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';

interface AppGlobal {
  app: AppOriginal;
}

const STRICT_PROXY_TARGET_SYMBOL = Symbol.for('strictProxyTarget');

const manifest = strictProxy<PluginManifest>({
  id: 'edit-link-alias',
  name: 'Edit Link Alias'
});

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
  it('should wire up the command handler once on load', async () => {
    await createLoadedPlugin();

    expect(vi.mocked(CommandHandlerComponent)).toHaveBeenCalledOnce();
  });

  it('should register the single edit command handler constructed with the app', async () => {
    await createLoadedPlugin();

    const params = vi.mocked(CommandHandlerComponent).mock.calls[0]?.[0];
    expect(params?.commandHandlers.length).toBe(1);
    expect(vi.mocked(EditCommandHandler)).toHaveBeenCalledWith(app);
  });

  it('should register the command handler with the plugin name', async () => {
    await createLoadedPlugin();

    const params = vi.mocked(CommandHandlerComponent).mock.calls[0]?.[0];
    expect(params?.pluginName).toBe('Edit Link Alias');
  });

  it('should wire the menu event registrar into the command handler', async () => {
    await createLoadedPlugin();

    expect(vi.mocked(MenuEventRegistrarComponent)).toHaveBeenCalledWith(app);
    const menuEventRegistrar: unknown = vi.mocked(MenuEventRegistrarComponent).mock.results[0]?.value;
    const params = vi.mocked(CommandHandlerComponent).mock.calls[0]?.[0];
    expect(params?.menuEventRegistrar).toBe(menuEventRegistrar);
  });
});
