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

vi.mock('./edit-command-handler.ts', () => ({
  EditCommandHandler: vi.fn()
}));

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
  it('should register the edit command handler on the shared command handler component on load', async () => {
    await createLoadedPlugin();

    const editCommandHandler = vi.mocked(EditCommandHandler).mock.instances[0];
    expect(registerCommandHandlers).toHaveBeenCalledWith([editCommandHandler]);
  });

  it('should construct the single edit command handler with the app', async () => {
    await createLoadedPlugin();

    expect(vi.mocked(EditCommandHandler)).toHaveBeenCalledExactlyOnceWith(app);
  });
});
