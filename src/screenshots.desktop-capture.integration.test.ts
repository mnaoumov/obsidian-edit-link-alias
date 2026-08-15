/**
 * @file
 *
 * Produces the desktop screenshots the community-store listing needs
 * (T461-P21), driving a staged note in a real Obsidian and writing
 * `images/screenshots/screenshot-desktop-N.png`.
 *
 * Each shot shows a DIFFERENT capability, and each is CAPTIONED by
 * `labelScreenshot` after capture — a listing carousel shows screenshots one at
 * a time with no caption of its own, so an image has to say what it is showing.
 *
 * The storyboard opens on the PROBLEM rather than on the plugin: a note whose
 * links read like file paths and raw URLs. Shots 1 and 3 are the same note in
 * READING view, before and after, because reading view is where a link's
 * display text is the only thing a reader sees — which is exactly what this
 * plugin edits. The middle and last shots are the three ways in: the alias-only
 * prompt, the two-field URL + alias popover, and Alt-clicking the link itself.
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  captureObsidianScreenshot,
  evalInObsidian,
  labelScreenshot,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/**
 * `App`, reduced to the inline-title toggle that `obsidian-typings` does not
 * declare. Setting the config alone changes nothing on screen.
 */
interface InlineTitleApp {
  updateInlineTitleDisplay(this: void): void;
}

/**
 * Where a link sits in the staged note, as a zero-based cursor position.
 */
interface LinkPosition {
  readonly characterIndex: number;
  readonly line: number;
}

/**
 * The desktop side dock, reduced to the resize call.
 */
interface ResizableSideDock {
  setSize(this: void, size: number): void;
}

const PLUGIN_ID = 'edit-link-alias';
const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

/**
 * The staged note every shot operates on.
 */
const SUBJECT_NOTE_PATH = 'Screenshots/Reading list.md';

/**
 * Where the external link lives in {@link buildSubjectNote}, counting from zero.
 * The commands act on the link under the CURSOR, so a cursor that lands outside
 * a link makes them no-op and the shot becomes an ordinary editor.
 */
const URL_LINK_POSITION = { characterIndex: 15, line: 4 };

const OLD_URL_TEXT = 'https://help.obsidian.md';
const NEW_URL_ALIAS = 'Obsidian Help';

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate({
    'Screenshots/First target.md': '# First target\n\nThe note the reading list opens with.\n',
    'Screenshots/Second target.md': '# Second target\n\nThe note that follows it.\n',
    [SUBJECT_NOTE_PATH]: buildSubjectNote()
  });
  await vault.syncToDevice();

  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, subjectNotePath }) {
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 30_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      app.changeTheme('obsidian');

      await waitUntil({
        message: 'the staged note to appear in the vault',
        predicate: () => Boolean(app.vault.getFileByPath(subjectNotePath)),
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      // Nothing but the note matters in these shots: the file explorer and an
      // Empty right dock would otherwise take a third of a 1200x800 frame.
      app.workspace.leftSplit.collapse();
      const rightSplit: unknown = app.workspace.rightSplit;
      (rightSplit as ResizableSideDock).setSize(0);
      app.workspace.rightSplit.collapse();

      // The note opens with its own `# H1`, so the inline title doubles it.
      app.vault.setConfig('showInlineTitle', false);
      const inlineTitleApp: unknown = app;
      (inlineTitleApp as InlineTitleApp).updateInlineTitleDisplay();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { subjectNotePath: SUBJECT_NOTE_PATH },
    vaultPath: vaultPath()
  });
});

describe('desktop store screenshots', () => {
  it('1 - the links before, as a reader sees them', async () => {
    await openNote('preview');
    await shoot(1, 'Links that read like file names and raw URLs');
  });

  it('2 - the prompt that edits only the display text', async () => {
    await openNote('source');
    await openAliasPrompt(URL_LINK_POSITION);
    await shoot(2, 'Edit link alias: change what a link SAYS');
  });

  it('3 - the same note afterwards, still a reader\'s view', async () => {
    await submitAliasPrompt(NEW_URL_ALIAS);
    await openNote('preview');
    await shoot(3, `...and the target never moved: ${NEW_URL_ALIAS}`);
  });

  it('4 - the two-field editor for target and label together', async () => {
    await openNote('source');
    // The link shot 3 just aliased, so BOTH fields carry a value. Pointed at a
    // Bare wikilink instead, the popover opens with an empty alias box and is
    // Hard to tell from shot 5 at listing size — same control, same emptiness.
    await openLinkPopover(URL_LINK_POSITION);
    await shoot(4, 'Or edit the target and the label together');
  });

  it('5 - Alt-clicking a link opens the editor at it', async () => {
    await dismissPopover();
    await openNote('preview');
    await altClickRenderedLink();
    await shoot(5, 'Alt-click any link to edit it where it sits');
  });
});

/**
 * Alt-clicks the first rendered link in the note, which is what opens the
 * anchored editor without any command at all.
 */
async function altClickRenderedLink(): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, obsidianModule, pluginId }) {
      const POPOVER_TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 900;
      const POPOVER_FIELD_COUNT = 2;
      const HALF = 2;

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);

      await waitUntil({
        message: 'the rendered link to appear',
        predicate: () => Boolean(view?.containerEl.querySelector('a.internal-link')),
        timeoutInMilliseconds: POPOVER_TIMEOUT_IN_MILLISECONDS
      });

      const linkEl = view?.containerEl.querySelector('a.internal-link');
      if (!(linkEl instanceof HTMLElement)) {
        throw new TypeError('The rendered link is missing.');
      }

      // The coordinates are what identifies the link in an editing view
      // (`Editor.posAtMouse`), so a click dispatched without them resolves to
      // The very start of the document. The element's own centre is the point
      // The user would have hit.
      const rect = linkEl.getBoundingClientRect();
      linkEl.dispatchEvent(
        new MouseEvent('click', {
          altKey: true,
          bubbles: true,
          button: 0,
          cancelable: true,
          clientX: rect.left + rect.width / HALF,
          clientY: rect.top + rect.height / HALF
        })
      );

      await waitUntil({
        message: 'the link editor popover to open',
        predicate: () =>
          (document.body.querySelector(`.obsidian-dev-utils.${pluginId}.popover`)?.querySelectorAll('input').length ?? 0)
            === POPOVER_FIELD_COUNT,
        timeoutInMilliseconds: POPOVER_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { pluginId: PLUGIN_ID },
    vaultPath: vaultPath()
  });
}

/**
 * Builds the note the shots operate on.
 *
 * Deliberately three links a real note would have and a reader would resent:
 * two wikilinks displaying their file names, and an external link displaying
 * its own URL. Short enough that all three fit one frame at listing size.
 *
 * @returns The note's Markdown.
 */
function buildSubjectNote(): string {
  return '# Reading list\n\n'
    + 'Start with [[First target]], then read [[Second target]].\n\n'
    + `Reference: [${OLD_URL_TEXT}](${OLD_URL_TEXT})\n`;
}

/**
 * Closes the popover left open by the previous shot, so the next one does not
 * photograph it a second time.
 */
async function dismissPopover(): Promise<void> {
  await evalInObsidian({
    async callback({ lib: { waitUntil }, pluginId }) {
      const POPOVER_TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 600;

      // A popover is not a modal: Escape does not close it, and there is no
      // Close button to click. It closes on an interaction OUTSIDE itself, so
      // That is what this dispatches.
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.body.click();

      await waitUntil({
        message: 'the link editor popover to close',
        predicate: () => !document.body.querySelector(`.obsidian-dev-utils.${pluginId}.popover`),
        timeoutInMilliseconds: POPOVER_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { pluginId: PLUGIN_ID },
    vaultPath: vaultPath()
  });
}

/**
 * Opens the alias-only prompt on the link at the given position.
 *
 * @param position - Where to put the cursor before running the command.
 */
async function openAliasPrompt(position: LinkPosition): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, obsidianModule, pluginId, position: cursor }) {
      const PROMPT_TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 900;

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      view?.editor.setCursor(cursor.line, cursor.characterIndex);

      // Deliberately NOT awaited: the command opens a prompt and resolves only
      // Once it is answered, so awaiting here would hang the whole closure.
      app.commands.executeCommandById(`${pluginId}:edit-link-alias`);

      await waitUntil({
        message: 'the alias prompt to appear',
        predicate: () => Boolean(document.querySelector('.modal input')),
        timeoutInMilliseconds: PROMPT_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { pluginId: PLUGIN_ID, position },
    vaultPath: vaultPath()
  });
}

/**
 * Opens the two-field URL + alias popover on the link at the given position.
 *
 * @param position - Where to put the cursor before running the command.
 */
async function openLinkPopover(position: LinkPosition): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, obsidianModule, pluginId, position: cursor }) {
      const POPOVER_TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 900;
      const POPOVER_FIELD_COUNT = 2;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      // Let the previous shot's capture settle first. `captureObsidianScreenshot`
      // Overrides the device metrics and clears them again, and the re-layout
      // That lands afterwards tears down anything opened too soon after it.
      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      view?.editor.setCursor(cursor.line, cursor.characterIndex);

      app.commands.executeCommandById(`${pluginId}:edit-link`);

      await waitUntil({
        message: 'the link editor popover to open',
        predicate: () =>
          (document.body.querySelector(`.obsidian-dev-utils.${pluginId}.popover`)?.querySelectorAll('input').length ?? 0)
            === POPOVER_FIELD_COUNT,
        timeoutInMilliseconds: POPOVER_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { pluginId: PLUGIN_ID, position },
    vaultPath: vaultPath()
  });
}

/**
 * Opens the staged note in the given editor mode.
 *
 * @param mode - `source` to show the Markdown, `preview` to show it rendered.
 */
async function openNote(mode: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, mode: viewMode, subjectNotePath }) {
      const SETTLE_DELAY_IN_MILLISECONDS = 900;

      const file = app.vault.getFileByPath(subjectNotePath);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${subjectNotePath}`);
      }

      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);
      // `source: true` forces RAW Markdown rather than live preview, which is
      // What makes the link syntax visible at all.
      await leaf.setViewState({
        state: { file: subjectNotePath, mode: viewMode, source: viewMode === 'source' },
        type: 'markdown'
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { mode, subjectNotePath: SUBJECT_NOTE_PATH },
    vaultPath: vaultPath()
  });
}

/**
 * Captures the window, captions it, and writes it as
 * `images/screenshot-desktop-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({
    heightInPixels: HEIGHT_IN_PIXELS,
    vaultPath: vaultPath(),
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
}

/**
 * Types a new alias into the open prompt and confirms it.
 *
 * @param newAlias - The alias to give the link.
 */
async function submitAliasPrompt(newAlias: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, newAlias: alias, subjectNotePath }) {
      const REWRITE_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1200;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      // See `openLinkPopover`: the previous shot's capture closes a dialog
      // Opened too soon after it, and this one has to fill in the dialog that
      // Shot photographed.
      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      const input = document.querySelector('.modal input');
      if (!(input instanceof HTMLInputElement)) {
        throw new TypeError('The alias prompt has no text input.');
      }

      input.value = alias;
      // The modal tracks the value through its own `input` handler, so setting
      // `value` alone would submit an empty alias.
      input.dispatchEvent(new Event('input'));

      const confirmButton = document.querySelector('.modal button.mod-cta');
      if (!(confirmButton instanceof HTMLElement)) {
        throw new TypeError('The alias prompt has no confirm button.');
      }

      confirmButton.click();

      await waitUntil({
        message: 'the note to be rewritten with the new alias',
        predicate: async () => {
          const file = app.vault.getFileByPath(subjectNotePath);
          if (!file) {
            return false;
          }
          const content = await app.vault.read(file);
          return content.includes(alias);
        },
        timeoutInMilliseconds: REWRITE_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { newAlias, subjectNotePath: SUBJECT_NOTE_PATH },
    vaultPath: vaultPath()
  });
}

function vaultPath(): string {
  return getTemporaryVault().path;
}
