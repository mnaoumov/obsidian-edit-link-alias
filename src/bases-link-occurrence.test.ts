import type {
  App,
  Component,
  TFile,
  WorkspaceLeaf
} from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import { getBasesLinkOccurrence } from './bases-link-occurrence.ts';

interface BasesTableDom {
  readonly linkEl: HTMLElement;
  readonly rowEl: HTMLElement;
}

interface FakeComponentParams {
  readonly children?: readonly Component[];
  readonly rows?: unknown;
}

const ROW_FILE = strictProxy<TFile>({ path: 'row.md' });

let containerEl: HTMLElement;
let leaves: WorkspaceLeaf[];
let app: App;

/**
 * Builds the markup a Bases table renders for one cell: `.bases-tr` > `.bases-td[data-property]` > the link.
 * Verified against Obsidian 1.13.7.
 *
 * @param propertyId - The cell's property id, such as `note.related`.
 * @param parentEl - Where to render the row.
 * @returns The link and row elements.
 */
function createBasesCell(propertyId: string, parentEl: HTMLElement = containerEl): BasesTableDom {
  const rowEl = parentEl.createDiv({ cls: 'bases-tr' });
  const cellEl = rowEl.createDiv({ attr: { 'data-property': propertyId }, cls: 'bases-td' });
  const linkEl = cellEl.createDiv({ attr: { 'data-href': 'target' }, cls: 'metadata-link-inner internal-link' });
  return {
    linkEl,
    rowEl
  };
}

function createComponent(params: FakeComponentParams = {}): Component {
  const component: Record<string, unknown> = { _children: params.children ?? [] };
  if (params.rows !== undefined) {
    component['rows'] = params.rows;
  }
  return castTo<Component>(component);
}

function createLeaf(viewContainerEl: HTMLElement, view: Component): WorkspaceLeaf {
  return castTo<WorkspaceLeaf>({ view: Object.assign(view, { containerEl: viewContainerEl }) });
}

beforeEach(() => {
  containerEl = document.body.createDiv();
  leaves = [];
  app = castTo<App>({
    workspace: {
      iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => void) => {
        for (const leaf of leaves) {
          callback(leaf);
        }
      }
    }
  });
});

afterEach(() => {
  document.body.empty();
});

describe('getBasesLinkOccurrence', () => {
  it('should name the row note and the property of a link in a note property cell', () => {
    const { linkEl, rowEl } = createBasesCell('note.Related');
    const tableView = createComponent({ rows: [{ el: rowEl, entry: { file: ROW_FILE } }] });
    leaves.push(createLeaf(containerEl, createComponent({ children: [tableView] })));

    expect(getBasesLinkOccurrence(app, linkEl)).toEqual({
      propertyKey: 'Related',
      sourceFile: ROW_FILE
    });
  });

  it('should find the table view of an embedded Base deeper in the component tree', () => {
    const embedEl = containerEl.createDiv();
    const { linkEl, rowEl } = createBasesCell('note.related', embedEl);
    const otherRowEl = containerEl.createDiv({ cls: 'bases-tr' });
    const otherTableView = createComponent({ rows: [{ el: otherRowEl, entry: { file: strictProxy<TFile>({ path: 'other.md' }) } }] });
    const tableView = createComponent({ rows: [{ el: rowEl, entry: { file: ROW_FILE } }] });
    const embedComponent = createComponent({ children: [createComponent({ rows: 'not rows' }), tableView] });
    leaves.push(createLeaf(containerEl, createComponent({ children: [otherTableView, embedComponent] })));

    expect(getBasesLinkOccurrence(app, linkEl)?.sourceFile).toBe(ROW_FILE);
  });

  it('should search only the leaf whose view contains the row, and stop at the first match', () => {
    const { linkEl, rowEl } = createBasesCell('note.related');
    const row = { el: rowEl, entry: { file: ROW_FILE } };
    leaves.push(
      createLeaf(document.body.createDiv(), createComponent({ rows: [{ el: rowEl, entry: { file: strictProxy<TFile>({ path: 'wrong.md' }) } }] })),
      createLeaf(containerEl, createComponent({ rows: [row] })),
      createLeaf(containerEl, createComponent({ rows: [{ el: rowEl, entry: { file: strictProxy<TFile>({ path: 'later.md' }) } }] }))
    );

    expect(getBasesLinkOccurrence(app, linkEl)?.sourceFile).toBe(ROW_FILE);
  });

  it('should ignore a component whose rows are not table rows', () => {
    const { linkEl } = createBasesCell('note.related');
    leaves.push(createLeaf(containerEl, createComponent({ rows: [{ el: 'not an element' }] })));

    expect(getBasesLinkOccurrence(app, linkEl)).toBeNull();
  });

  it('should ignore a link outside any Bases cell', () => {
    expect(getBasesLinkOccurrence(app, containerEl.createDiv())).toBeNull();
  });

  it('should ignore a cell that is not a note property, since only those live in the frontmatter', () => {
    const { linkEl, rowEl } = createBasesCell('formula.related');
    leaves.push(createLeaf(containerEl, createComponent({ rows: [{ el: rowEl, entry: { file: ROW_FILE } }] })));

    expect(getBasesLinkOccurrence(app, linkEl)).toBeNull();
  });

  it('should ignore a cell outside a row', () => {
    const cellEl = containerEl.createDiv({ attr: { 'data-property': 'note.related' }, cls: 'bases-td' });

    expect(getBasesLinkOccurrence(app, cellEl.createDiv())).toBeNull();
  });

  it('should give up when no table view rendered the row', () => {
    const { linkEl } = createBasesCell('note.related');
    leaves.push(createLeaf(containerEl, createComponent()));

    expect(getBasesLinkOccurrence(app, linkEl)).toBeNull();
  });
});
