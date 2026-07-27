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

import { LinkClickAction } from './link-click-action.ts';
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
  it('should bind the linkClickAction setting when displayLegacy() is called', () => {
    const tab = createSettingsTab(LinkClickAction.Disabled);

    tab.displayLegacy();

    expect(getBoundKeys()).toContain('linkClickAction');
  });

  it('should offer a choice for every link click action', () => {
    const tab = createSettingsTab(LinkClickAction.Disabled);

    tab.displayLegacy();

    const optionValues = Array.from(tab.containerEl.querySelectorAll('select option')).map((option) => option.getAttribute('value'));
    expect(optionValues).toStrictEqual(Object.values(LinkClickAction));
  });

  it('should render when an editor-opening action is selected', () => {
    const tab = createSettingsTab(LinkClickAction.OpenEditorOnClick);

    tab.displayLegacy();

    expect(getBoundKeys()).toContain('linkClickAction');
  });
});

function createMockPlugin(appInstance: AppOriginal): Plugin {
  return strictProxy<Plugin>({
    app: appInstance,
    manifest: { id: 'edit-link-alias' }
  });
}

function createMockSettingsComponent(linkClickAction: LinkClickAction): PluginSettingsComponentBase<PluginSettings> {
  const settings = new PluginSettings();
  settings.linkClickAction = linkClickAction;
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

function createSettingsTab(linkClickAction: LinkClickAction): PluginSettingsTab {
  const plugin = createMockPlugin(app);
  const pluginSettingsComponent = createMockSettingsComponent(linkClickAction);
  return new PluginSettingsTab({ plugin, pluginSettingsComponent });
}

function getBoundKeys(): string[] {
  return vi.mocked(PluginSettingsTabBase.prototype.bind).mock.calls.map((call) => call[0].propertyName);
}
