/**
 * @file
 *
 * Produces the five mobile screenshots the community-store listing needs
 * (T461-P21), driving a staged note in Obsidian Mobile on a real Android
 * emulator and writing `images/screenshots/screenshot-mobile-N.png`.
 *
 * The mobile counterpart of the desktop capture suite. The first four frames
 * tell the same story — the problem, the alias prompt, the result, the two-field
 * editor — because that story is the plugin. The fifth differs on purpose: the
 * desktop set shows Alt-clicking a link, and a phone has no Alt key, so this one
 * shows the gesture a phone actually has, the link's own long-press menu.
 *
 * There is no mobile equivalent of the desktop viewport override, so the capture
 * is always the device's own framebuffer. The fix is to make the DEVICE the
 * right size: this runs on a dedicated `obsidian_screenshots` AVD built at
 * exactly 900x1600, so the frame already IS the store's size — no crop, no
 * rescale, no letterbox, no post-processing at all. That AVD needs ONE-TIME
 * provisioning, and both steps are non-obvious — see [[T461-P21]].
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
 * `App`, reduced to the font-size applier that `obsidian-typings` does not
 * declare. Setting `baseFontSize` alone changes nothing on screen.
 */
interface FontSizeApp {
  updateFontSize(this: void): void;
}

/**
 * `App`, reduced to the inline-title applier, likewise undeclared.
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

const PLUGIN_ID = 'edit-link-alias';
const WIDTH_IN_PIXELS = 900;
const HEIGHT_IN_PIXELS = 1600;

/**
 * The staged note every shot operates on — the same one the desktop suite uses.
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

/**
 * Base font size for the mobile shots.
 *
 * Below Obsidian's own 16px default: the screenshot AVD is a 450x800 dp screen,
 * on which a bare `https://help.obsidian.md` wraps mid-URL and the "links that
 * read like raw URLs" frame stops reading as one line of prose.
 */
const MOBILE_FONT_SIZE_IN_PIXELS = 13;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

/**
 * Diagnostics from the setup closure, surfaced by the first test so a failed
 * mobile layout is readable instead of silent.
 */
let setupDiagnostics: unknown;

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate({
    'Screenshots/First target.md': '# First target\n\nThe note the reading list opens with.\n',
    'Screenshots/Second target.md': '# Second target\n\nThe note that follows it.\n',
    [SUBJECT_NOTE_PATH]: buildSubjectNote()
  });
  await vault.syncToDevice();

  setupDiagnostics = await evalInObsidian({
    async callback({ app, fontSizeInPixels, lib: { waitUntil }, subjectNotePath }) {
      // A closure runs inside ONE Appium `execute/sync` call, which WebDriver
      // Caps around 30s. A longer wait in here dies as an opaque `script
      // Timeout` rather than a readable failure, so keep every wait under it.
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

      app.changeTheme('obsidian');

      await waitUntil({
        message: 'the staged note to appear in the vault',
        predicate: () => Boolean(app.vault.getFileByPath(subjectNotePath)),
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      app.vault.setConfig('baseFontSize', fontSizeInPixels);
      const fontApp: unknown = app;
      (fontApp as FontSizeApp).updateFontSize();

      // The note opens with its own `# H1`, so the inline title doubles it.
      app.vault.setConfig('showInlineTitle', false);
      (fontApp as InlineTitleApp).updateInlineTitleDisplay();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return { isNoteStaged: Boolean(app.vault.getFileByPath(subjectNotePath)) };
    },
    input: { fontSizeInPixels: MOBILE_FONT_SIZE_IN_PIXELS, subjectNotePath: SUBJECT_NOTE_PATH },
    vaultPath: vaultPath()
  });
});

describe('mobile store screenshots', () => {
  it('stages the note the shots are framed on', () => {
    // Surfaced as an assertion because vitest swallows console output from an
    // Integration worker, and a silently-wrong layout produces five bad images
    // Without a single failure.
    expect(setupDiagnostics).toMatchObject({ isNoteStaged: true });
  });

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
    await openLinkPopover(URL_LINK_POSITION);
    await shoot(4, 'Or edit the target and the label together');
  });

  it('5 - the link\'s own long-press menu', async () => {
    await dismissPopover();
    await openNote('preview');
    await openLinkMenu();
    await shoot(5, 'Long-press a link to reach it from the menu');
  });
});

/**
 * Builds the note the shots operate on.
 *
 * Deliberately three links a real note would have and a reader would resent:
 * two wikilinks displaying their file names, and an external link displaying
 * its own URL.
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
      // Close button to click. It closes on an interaction OUTSIDE itself.
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
 * Opens the link's own context menu, which on a phone is what a long press
 * produces, and which carries the plugin's entries.
 */
async function openLinkMenu(): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, obsidianModule }) {
      const MENU_TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 900;
      const HALF = 2;

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);

      await waitUntil({
        message: 'the rendered link to appear',
        predicate: () => Boolean(view?.containerEl.querySelector('a.internal-link')),
        timeoutInMilliseconds: MENU_TIMEOUT_IN_MILLISECONDS
      });

      const linkEl = view?.containerEl.querySelector('a.internal-link');
      if (!(linkEl instanceof HTMLElement)) {
        throw new TypeError('The rendered link is missing.');
      }

      // Obsidian raises the link menu from a `contextmenu` event, which is what
      // A long press produces on a touch screen. The coordinates matter for the
      // Same reason they do for a click: they are how the link is located.
      const rect = linkEl.getBoundingClientRect();
      linkEl.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / HALF,
          clientY: rect.top + rect.height / HALF
        })
      );

      await waitUntil({
        message: 'the link menu to open',
        predicate: () => Boolean(document.body.querySelector('.menu')),
        timeoutInMilliseconds: MENU_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
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
 * Captures the device screen, captions it, and writes it as
 * `images/screenshot-mobile-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const captured = await captureObsidianScreenshot({ vaultPath: vaultPath() });

  // The AVD is 900x1600, so the device frame IS the store's size. Asserting it
  // Here is what keeps that true: run this against any other AVD and it fails
  // Loudly instead of quietly shipping an off-spec image.
  expect(readPngDimensions(captured)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  // Captioned AFTER capture, so the frame stays an untouched device screenshot
  // And rewording a label needs no re-shoot.
  const labeled = await labelScreenshot(captured, { text: caption });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
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
