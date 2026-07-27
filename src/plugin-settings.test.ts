import {
  describe,
  expect,
  it
} from 'vitest';

import { LinkClickAction } from './link-click-action.ts';
import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should leave link clicks alone by default', () => {
    const settings = new PluginSettings();

    expect(settings.linkClickAction).toBe(LinkClickAction.Disabled);
  });
});
