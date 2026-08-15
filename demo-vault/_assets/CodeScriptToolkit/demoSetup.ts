import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import { configureCommunityPlugin } from 'obsidian-dev-utils/obsidian/community-plugins';

const PLUGIN_ID = 'edit-link-alias';
const PLAYGROUND_FOLDER_PATH = 'Materials/01 Edit link alias';
const PLAYGROUND_NOTE_PATH = `${PLAYGROUND_FOLDER_PATH}/Link playground.md`;

// Every link form the plugin handles, in one scratch note.
// The walkthroughs used to have the reader rewrite links inside the documentation notes, which meant
// The vault degraded as it was read and could not be tried twice.
const PLAYGROUND_CONTENT = [
  '---',
  'related:',
  '  - "[[First target]]"',
  '---',
  '',
  '# Link playground',
  '',
  'A scratch note to try things on. Nothing here is documentation, so edit it freely - the',
  '**Reset the link playground** button in any walkthrough puts it back exactly as it started.',
  '',
  '## Internal wikilinks',
  '',
  '- No alias yet: [[First target]]',
  '- Already aliased: [[First target|the opening note]]',
  '- Another target: [[Second target|chapter two]]',
  '',
  '## Markdown links',
  '',
  '- No alias: [First target](<../../First target.md>)',
  '- Already aliased: [the second note](<../../Second target.md>)',
  '',
  '## External links',
  '',
  '- A labelled URL: [Obsidian Help](https://help.obsidian.md)',
  '- A bare URL, no markdown around it: https://obsidian.md',
  ''
].join('\n');

/**
 * Creates (or restores) the scratch note the walkthroughs operate on, then opens it.
 *
 * Manual equivalent: undo your edits, or delete `Materials/01 Edit link alias/Link playground.md` and
 * write the sample links out again.
 */
export async function resetLinkPlayground(app: App): Promise<void> {
  if (!app.vault.getFolderByPath(PLAYGROUND_FOLDER_PATH)) {
    await app.vault.createFolder(PLAYGROUND_FOLDER_PATH);
  }

  const existing = app.vault.getFileByPath(PLAYGROUND_NOTE_PATH);
  if (existing) {
    await app.vault.modify(existing, PLAYGROUND_CONTENT);
  } else {
    await app.vault.create(PLAYGROUND_NOTE_PATH, PLAYGROUND_CONTENT);
  }

  const note = app.vault.getFileByPath(PLAYGROUND_NOTE_PATH);
  if (note) {
    await app.workspace.getLeaf(false).openFile(note);
  }

  new Notice('Link playground restored and opened.');
}

/**
 * Opens the playground, puts the cursor inside the first link on a line containing `marker`, and runs
 * one of the plugin's commands — the fiddly part of every walkthrough, since the command acts on the
 * link under the cursor.
 *
 * Manual equivalent: click inside that link yourself, then run the command from the Command Palette.
 */
export async function editLinkOnLine(app: App, marker: string, commandId: string): Promise<void> {
  await resetLinkPlayground(app);

  const editor = app.workspace.activeEditor?.editor;
  if (!editor) {
    new Notice('Open the playground in an editor pane first.');
    return;
  }

  const lineCount = editor.lineCount();
  for (let line = 0; line < lineCount; line++) {
    const text = editor.getLine(line);
    const linkStart = text.indexOf('[');
    if (!text.includes(marker) || linkStart === -1) {
      continue;
    }

    // Anywhere inside the link works; one character past the opening bracket always is.
    editor.setCursor({ ch: linkStart + 1, line });
    app.commands.executeCommandById(`${PLUGIN_ID}:${commandId}`);
    return;
  }

  new Notice(`No link found on a line containing "${marker}".`);
}

/**
 * Turns `Alt` + click link editing on or off.
 *
 * Manual equivalent: toggle **Should open link editor on alt click** in **Settings -> Community
 * plugins -> Edit Link Alias**.
 */
export async function setAltClickEditing(app: App, shouldOpenLinkEditorOnAltClick: boolean): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: { shouldOpenLinkEditorOnAltClick } });
  new Notice(shouldOpenLinkEditorOnAltClick ? 'Alt + click now opens the link editor.' : 'Alt + click left alone again.');
}
