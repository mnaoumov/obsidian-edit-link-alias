/**
 * @file
 *
 * Whether the two editor commands are available at a given caret position, in a real editor.
 *
 * The caret right before a link (`{cursor}[alias](url)`) used to leave both commands unavailable, while the
 * caret inside it and right after it worked: availability was decided by Obsidian's
 * `Editor.getClickableTokenAt`, which reports nothing at the column before the link. It is now decided by the
 * same `@mnaoumov/obsidian-lib` link-at-position lookup the edit itself uses, so every position the edit can act
 * on also makes the command available.
 *
 * Named `*.cross-platform.integration.test.ts`, so the desktop AND android projects both collect it.
 */

import type { TFile } from 'obsidian';

import {
  ContextId,
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'edit-link-alias';
const SOURCE_PATH = 'cursor-on-link-source.md';
const COMMAND_IDS = [`${PLUGIN_ID}:edit-link-alias`, `${PLUGIN_ID}:edit-link`] as const;

/**
 * Each line holds one link starting at column 4, with text on both sides of it.
 */
const LINK_LINES = [
  'ab, [alias](https://example.com) cd',
  'ab, [[note|alias]] cd',
  'ab, [[note]] cd',
  'ab, ![[image.png]] cd'
] as const;

const LINK_START_CH = 4;
const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;

/**
 * Node-side budget for the whole suite setup; the shared config's 30s desktop / 60s android `testTimeout`
 * would expire before the wait does on a cold phone.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

interface CursorSuiteContext {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Assigned during setup and removed during cleanup.
  sourceFile?: TFile;
}

const contextId = new ContextId<CursorSuiteContext>();

describe('Command availability by caret position', () => {
  beforeAll(async () => {
    await pollInObsidian({
      contextId,
      input: { content: LINK_LINES.join('\n'), sourcePath: SOURCE_PATH },
      poll({ app, obsidianModule, sourcePath }): boolean {
        const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
        return view?.file?.path === sourcePath && view.getMode() === 'source';
      },
      async start({ app, content, context, lib: { createNote }, sourcePath }): Promise<void> {
        const existing = app.vault.getAbstractFileByPath(sourcePath);
        if (existing) {
          await app.fileManager.trashFile(existing);
        }
        context.sourceFile = await createNote({ content, path: sourcePath });
        await app.workspace.getLeaf(true).openFile(context.sourceFile, { state: { mode: 'source', source: true } });
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the source note did not become the active view in Source mode',
      until: (isActive: boolean): boolean => isActive,
      vaultPath: getTemporaryVault().path
    });
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  afterAll(async () => {
    await evalInObsidian({
      async callback({ app, context }): Promise<void> {
        if (context.sourceFile) {
          await app.fileManager.trashFile(context.sourceFile);
        }
      },
      contextId,
      vaultPath: getTemporaryVault().path
    });
    await contextId.dispose(getTemporaryVault().path);
  });

  for (const [line, lineText] of LINK_LINES.entries()) {
    const linkEndCh = lineText.indexOf(' cd');
    const link = lineText.slice(LINK_START_CH, linkEndCh);

    it(`offers both commands right before, inside and right after ${link}, and neither beside it`, async () => {
      const availability = await evalInObsidian({
        callback({ app, chs, commandIds, line: lineIndex, obsidianModule }): boolean[][] {
          const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
          if (!view) {
            throw new Error('The source note is no longer the active view');
          }
          return chs.map((ch) => {
            view.editor.setCursor({ ch, line: lineIndex });
            return commandIds.map((commandId) => app.commands.findCommand(commandId)?.checkCallback?.(true) === true);
          });
        },
        input: {
          chs: [LINK_START_CH, LINK_START_CH + 1, linkEndCh - 1, linkEndCh, LINK_START_CH - 2, linkEndCh + 2],
          commandIds: [...COMMAND_IDS],
          line
        },
        vaultPath: getTemporaryVault().path
      });

      expect(availability).toEqual([
        [true, true],
        [true, true],
        [true, true],
        [true, true],
        [false, false],
        [false, false]
      ]);
    }, TEST_TIMEOUT_IN_MILLISECONDS);
  }
});
