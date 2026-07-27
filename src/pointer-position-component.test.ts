import type { App as AppOriginal } from 'obsidian';

import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PointerPositionComponent } from './pointer-position-component.ts';

let app: AppOriginal;
let component: PointerPositionComponent;

function pointerDown(target: EventTarget, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: x,
      clientY: y
    })
  );
}

beforeEach(() => {
  document.body.empty();

  const appMock = App.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((cb: () => void) => {
    cb();
  });
  app = appMock.asOriginalType__();

  component = new PointerPositionComponent(app);
  component.load();
});

afterEach(() => {
  component.unload();
  vi.restoreAllMocks();
  document.body.empty();
});

describe('PointerPositionComponent', () => {
  it('should report no anchor before any pointer gesture', () => {
    expect(component.getLastPointerAnchor()).toBeNull();
  });

  it('should record the position of a pointer gesture', () => {
    pointerDown(document.body.createDiv(), 120, 340);

    expect(component.getLastPointerAnchor()).toStrictEqual({
      bottom: 340,
      doc: document,
      left: 120
    });
  });

  it('should keep only the most recent gesture', () => {
    const el = document.body.createDiv();
    pointerDown(el, 1, 2);
    pointerDown(el, 30, 40);

    expect(component.getLastPointerAnchor()).toStrictEqual({
      bottom: 40,
      doc: document,
      left: 30
    });
  });

  it('should stop recording once unloaded', () => {
    component.unload();

    pointerDown(document.body.createDiv(), 7, 8);

    expect(component.getLastPointerAnchor()).toBeNull();
  });
});
