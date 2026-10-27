import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

// The button suite proves the `Try it` button in `04 Alt click a link to edit it` runs without an error;
// it cannot tell a button that does nothing from one that does what its note promises. This file calls
// the same `demoSetup.ts` helper that button calls, through the same `CodeScript Toolkit` `require`, and
// asserts both halves of the setup: `Alt` + click is on, and the link playground is open and pristine.

interface AltClickPlaygroundResult {
  readonly activeFilePath: string;
  readonly playgroundContent: string;
  readonly shouldOpenLinkEditorOnAltClick: boolean;
}

const PLAYGROUND_NOTE_PATH = 'Materials/01 Edit link alias/Link playground.md';

describe('demo vault Alt + click button', () => {
  it('should turn Alt + click on and open a freshly reset link playground', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, playgroundNotePath }): Promise<AltClickPlaygroundResult> {
        interface DemoSetup {
          prepareAltClickPlayground: (this: void, app: unknown) => Promise<void>;
          resetLinkPlayground: (this: void, app: unknown) => Promise<void>;
          setAltClickEditing: (this: void, app: unknown, shouldOpenLinkEditorOnAltClick: boolean) => Promise<void>;
        }

        await waitUntil({
          message: 'CodeScript Toolkit never patched require for root-relative modules',
          predicate: () => !!app.plugins.getPlugin('fix-require-modules')
        });
        const demoSetup = window.require('/demoSetup.ts') as DemoSetup;

        // Start from the opposite of what the button promises, so a no-op cannot pass.
        await demoSetup.setAltClickEditing(app, false);
        await demoSetup.resetLinkPlayground(app);
        const playground = app.vault.getFileByPath(playgroundNotePath);
        if (!playground) {
          throw new Error(`${playgroundNotePath} was not created`);
        }
        await app.vault.modify(playground, 'scribbled over');
        await app.workspace.getLeaf(false).openFile(app.vault.getFileByPath('First target.md') ?? playground);

        await demoSetup.prepareAltClickPlayground(app);

        interface PluginData {
          shouldOpenLinkEditorOnAltClick?: boolean;
        }

        const data = await app.plugins.getPlugin('edit-link-alias')?.loadData() as null | PluginData;
        return {
          activeFilePath: app.workspace.getActiveFile()?.path ?? '',
          playgroundContent: await app.vault.read(playground),
          shouldOpenLinkEditorOnAltClick: data?.shouldOpenLinkEditorOnAltClick ?? false
        };
      },
      input: { playgroundNotePath: PLAYGROUND_NOTE_PATH }
    });

    expect(result.shouldOpenLinkEditorOnAltClick).toBe(true);
    expect(result.activeFilePath).toBe(PLAYGROUND_NOTE_PATH);
    expect(result.playgroundContent).not.toBe('scribbled over');
    expect(result.playgroundContent).toContain('# Link playground');
  });
});
