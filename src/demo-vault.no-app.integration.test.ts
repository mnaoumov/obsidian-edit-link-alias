import process from 'node:process';
import { registerDemoVaultCoverageSuite } from 'obsidian-dev-utils/script-utils/demo-vault-coverage';
import { getRootFolder } from 'obsidian-dev-utils/script-utils/root';

/*
 * Keeps the in-repo `demo-vault/` in sync with the plugin's public surface WITHOUT launching Obsidian:
 * it reflects the real settings from source and asserts each one is documented in a note, and that the
 * guard note/member still exist (so a rename drifts loudly instead of silently un-documenting a
 * setting). It does NOT validate behavior — that is the integration suites' job.
 *
 * The suite became applicable only once the plugin gained settings; before that there was no
 * non-trivial surface to reflect. The two editors themselves are commands with no public API
 * interface, so `interfaces` stays empty.
 */
registerDemoVaultCoverageSuite({
  configInterfaces: [{ interfaceName: 'PluginSettings', sourcePath: 'src/plugin-settings.ts' }],
  interfaces: [],
  nonTrivialGuard: {
    expectDemoNote: '04 Alt click a link to edit it.md',
    expectMember: 'shouldOpenLinkEditorOnAltClick',
    interfaceName: 'PluginSettings',
    sourcePath: 'src/plugin-settings.ts'
  },
  rootFolder: getRootFolder() ?? process.cwd()
});
