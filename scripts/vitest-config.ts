import { defineObsidianPluginVitestConfig } from 'obsidian-dev-utils/script-utils/test-runners/vitest-config';

export const config = defineObsidianPluginVitestConfig({
  editContext(context) {
    /*
     * Kept deliberately, and it is NOT what the shared config does on its own: the shared config sets
     * `obsidianVersion` only when `OBSIDIAN_VERSION` is set, because an explicit version makes the
     * harness resolve it and swap the asar (`transport-factory.ts` guards on
     * `obsidianVersion !== undefined`). This repo has always pinned an unset run to the latest public
     * build, and its issue verifications are recorded against a specific Obsidian, so dropping the
     * fallback would silently change what the desktop suite runs against.
     */
    context.desktop.environmentOptions = {
      obsidianTransport: {
        obsidianVersion: process.env['OBSIDIAN_VERSION'] ?? 'public-latest',
        type: 'obsidian-cdp'
      }
    };
  }
});
