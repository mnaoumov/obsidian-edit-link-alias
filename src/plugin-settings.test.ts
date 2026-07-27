import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should open the link editor on Alt + click by default', () => {
    const settings = new PluginSettings();

    expect(settings.shouldOpenLinkEditorOnAltClick).toBe(true);
  });
});
