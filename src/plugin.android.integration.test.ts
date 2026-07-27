import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  registerEditAliasMenuSuite,
  registerEditUrlAndAliasMenuSuite
} from './edit-link-alias-menu-shared.integration.test.ts';
import { registerLinkClickPopoverSuite } from './link-click-popover-shared.integration.test.ts';

describe('Smoke test', () => {
  it('should load plugin on Android', () => {
    const vault = getTempVault();
    expect(vault.path).toBeTruthy();
  });
});

registerEditAliasMenuSuite('Android');
registerEditUrlAndAliasMenuSuite('Android');
registerLinkClickPopoverSuite('Android');
