import type { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import type {
  App as AppOriginal,
  Plugin,
  SettingDefinition,
  SettingGroup
} from 'obsidian';

import { PluginSettingsTabBase } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';
import { SettingEx } from '@mnaoumov/obsidian-lib/setting-ex';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
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
  it('should bind the Alt-click setting when the declared row is rendered', () => {
    const tab = createSettingsTab(true);

    renderRows(tab);

    expect(getBoundKeys()).toContain('shouldOpenLinkEditorOnAltClick');
  });

  it('should group the row under the link-click heading', () => {
    const tab = createSettingsTab(true);

    const headings = tab.getSettingDefinitions().map((item) => 'heading' in item ? item.heading : '');

    expect(headings).toStrictEqual(['Link click']);
  });

  it('should explain the gesture and that other clicks are untouched', () => {
    const tab = createSettingsTab(true);

    const descriptionsText = getDescriptionsText(tab);
    expect(descriptionsText).toContain('Alt + click');
    expect(descriptionsText).toContain('Ctrl + click');
  });

  it('should render when the setting is turned off', () => {
    const tab = createSettingsTab(false);

    renderRows(tab);

    expect(getBoundKeys()).toContain('shouldOpenLinkEditorOnAltClick');
  });
});

/**
 * Flattens the declared items into the rows they contain, unwrapping the groups.
 *
 * @param tab - The settings tab.
 * @returns The declared rows.
 */
function collectRows(tab: PluginSettingsTab): SettingDefinition[] {
  const rows: SettingDefinition[] = [];
  for (const item of tab.getSettingDefinitions()) {
    if ('items' in item) {
      rows.push(...castTo<SettingDefinition[]>(item.items ?? []));
    } else {
      rows.push(castTo<SettingDefinition>(item));
    }
  }

  return rows;
}

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

/**
 * Collects the text of every declared row's description.
 *
 * @param tab - The settings tab.
 * @returns The descriptions, joined.
 */
function getDescriptionsText(tab: PluginSettingsTab): string {
  const descriptions: string[] = [];
  for (const row of collectRows(tab)) {
    if (!('desc' in row) || !row.desc) {
      continue;
    }

    descriptions.push(typeof row.desc === 'string' ? row.desc : row.desc.textContent);
  }

  return descriptions.join('\n');
}

/**
 * Invokes every declared row's `render` callback the way Obsidian does when the tab is opened, so the
 * bindings are still exercised now that the rows are declarative.
 *
 * @param tab - The settings tab.
 */
function renderRows(tab: PluginSettingsTab): void {
  for (const row of collectRows(tab)) {
    if ('render' in row) {
      row.render(new SettingEx(tab.containerEl), castTo<SettingGroup>(null));
    }
  }
}
