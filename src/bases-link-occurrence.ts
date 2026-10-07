/**
 * @file
 *
 * Identifies the note and property behind a link rendered in a Bases table cell.
 *
 * A Base renders a note's property in a cell of its own row, so neither the view the link sits in nor the
 * note open in it is the note that holds the link: a `.base` file has no note at all, and a Base embedded
 * in a note shows other notes' properties. The cell names the property (`data-property="note.<key>"`), and
 * the table view pairs each row element with the entry it renders, whose file is the note to edit.
 */

import type {
  App,
  BasesEntry,
  Component,
  TFile
} from 'obsidian';

const BASES_CELL_SELECTOR = '.bases-td[data-property]';
const BASES_ROW_SELECTOR = '.bases-tr';
const NOTE_PROPERTY_PREFIX = 'note.';
const PROPERTY_ATTRIBUTE = 'data-property';

/**
 * Where a link rendered in a Bases table cell is stored.
 */
export interface BasesLinkOccurrence {
  /**
   * The frontmatter property the cell renders.
   */
  readonly propertyKey: string;

  /**
   * The note the cell's row renders.
   */
  readonly sourceFile: TFile;
}

/**
 * One rendered row of a Bases table view.
 */
interface BasesTableRow {
  readonly el: HTMLElement;
  readonly entry: BasesEntry;
}

/**
 * The part of the Bases table view this module reads.
 */
interface BasesTableView {
  readonly rows: readonly BasesTableRow[];
}

/**
 * Finds the note and property behind a link rendered in a Bases table cell.
 *
 * Only a `note.*` property is stored in a note's frontmatter, so a link in a `file.*` or `formula.*` cell is
 * not one this plugin can edit.
 *
 * @param app - The Obsidian app instance.
 * @param el - An element inside the cell, typically the link itself.
 * @returns The occurrence, or `null` when the element is not inside a note property cell of a Bases table.
 */
export function getBasesLinkOccurrence(app: App, el: Element): BasesLinkOccurrence | null {
  const cellEl = el.closest(BASES_CELL_SELECTOR);
  const propertyId = cellEl?.getAttribute(PROPERTY_ATTRIBUTE);
  if (!propertyId?.startsWith(NOTE_PROPERTY_PREFIX)) {
    return null;
  }

  const rowEl = cellEl?.closest(BASES_ROW_SELECTOR);
  if (!rowEl) {
    return null;
  }

  const sourceFile = findRowFile(app, rowEl);
  return sourceFile
    ? {
      propertyKey: propertyId.slice(NOTE_PROPERTY_PREFIX.length),
      sourceFile
    }
    : null;
}

function findRowFile(app: App, rowEl: Element): null | TFile {
  let rowFile: null | TFile = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (rowFile || !leaf.view.containerEl.contains(rowEl)) {
      return;
    }
    rowFile = findRowFileInComponent(leaf.view, rowEl);
  });
  return rowFile;
}

/**
 * Walks a component tree for the Bases table view that rendered the row. A `.base` file's view and a note
 * embedding a ```` ```base ```` block both own the table view as a descendant component.
 *
 * @param component - The component to search from.
 * @param rowEl - The row element.
 * @returns The file of the row's entry, or `null` when no table view in the tree rendered the row.
 */
function findRowFileInComponent(component: Component, rowEl: Element): null | TFile {
  if (isBasesTableView(component)) {
    const row = component.rows.find((candidate) => candidate.el === rowEl);
    if (row) {
      return row.entry.file;
    }
  }

  for (const child of component._children) {
    const rowFile = findRowFileInComponent(child, rowEl);
    if (rowFile) {
      return rowFile;
    }
  }
  return null;
}

// TODO: Replace with the typed Bases table view once obsidian-typings models its `rows`.
function isBasesTableView(component: Component): component is BasesTableView & Component {
  const rows: unknown = Reflect.get(component, 'rows');
  return Array.isArray(rows) && rows.every((row: unknown) => row instanceof Object && Reflect.get(row, 'el') instanceof HTMLElement);
}
