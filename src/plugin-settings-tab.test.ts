import type {
  App as AppOriginal,
  Plugin
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';

let app: AppOriginal;

beforeEach(() => {
  app = App.createConfigured__().asOriginalType__();
  vi.spyOn(PluginSettingsTabBase.prototype, 'bind').mockImplementation((params) => params.valueComponent);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PluginSettingsTab', () => {
  it('should bind the Alt-click setting when displayLegacy() is called', () => {
    const tab = createSettingsTab(true);

    tab.displayLegacy();

    expect(getBoundKeys()).toContain('shouldOpenLinkEditorOnAltClick');
  });

  it('should explain the gesture and that other clicks are untouched', () => {
    const tab = createSettingsTab(true);

    tab.displayLegacy();

    const renderedText = tab.containerEl.textContent;
    expect(renderedText).toContain('Alt + click');
    expect(renderedText).toContain('Ctrl + click');
  });

  it('should render when the setting is turned off', () => {
    const tab = createSettingsTab(false);

    tab.displayLegacy();

    expect(getBoundKeys()).toContain('shouldOpenLinkEditorOnAltClick');
  });
});

function createMockPlugin(appInstance: AppOriginal): Plugin {
  return strictProxy<Plugin>({
    app: appInstance,
    manifest: { id: 'edit-link-alias' }
  });
}

function createMockSettingsComponent(shouldOpenLinkEditorOnAltClick: boolean): PluginSettingsComponentBase<PluginSettings> {
  const settings = new PluginSettings();
  settings.shouldOpenLinkEditorOnAltClick = shouldOpenLinkEditorOnAltClick;
  const defaultSettings = new PluginSettings();
  return strictProxy<PluginSettingsComponentBase<PluginSettings>>({
    defaultSettings,
    on: castTo<PluginSettingsComponentBase<PluginSettings>['on']>(vi.fn(() => ({
      asyncEventSource: {
        offref: vi.fn()
      }
    }))),
    revalidate: vi.fn(() => Promise.resolve(castTo<Record<keyof PluginSettings, string>>({}))),
    saveToFile: vi.fn(() => noopAsync()),
    setProperty: vi.fn(() => Promise.resolve('')),
    settings,
    settingsState: {
      effectiveValues: settings,
      inputValues: settings,
      validationMessages: castTo<Record<keyof PluginSettings, string>>({})
    }
  });
}

function createSettingsTab(shouldOpenLinkEditorOnAltClick: boolean): PluginSettingsTab {
  const plugin = createMockPlugin(app);
  const pluginSettingsComponent = createMockSettingsComponent(shouldOpenLinkEditorOnAltClick);
  return new PluginSettingsTab({ plugin, pluginSettingsComponent });
}

function getBoundKeys(): string[] {
  return vi.mocked(PluginSettingsTabBase.prototype.bind).mock.calls.map((call) => call[0].propertyName);
}
