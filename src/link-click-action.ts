/**
 * @file
 *
 * What clicking a link in a note should do.
 *
 * Obsidian's own behavior — click opens the link — is left untouched by {@link LinkClickAction.Disabled},
 * which is the default. The other two values swap the roles of a plain click and a `Mod` (`Ctrl` on
 * Windows/Linux, `Cmd` on macOS) click: one gesture opens the link editor, the other keeps Obsidian's
 * native meaning.
 */

/**
 * What clicking a link in a note should do.
 */
export enum LinkClickAction {
  /**
   * Do nothing — clicking a link opens it, exactly as Obsidian does by default.
   */
  Disabled = 'Disabled',

  /**
   * A plain click opens the link editor; a `Mod` click keeps Obsidian's native behavior.
   */
  OpenEditorOnClick = 'OpenEditorOnClick',

  /**
   * A `Mod` click opens the link editor; a plain click keeps Obsidian's native behavior.
   */
  OpenEditorOnModClick = 'OpenEditorOnModClick'
}
