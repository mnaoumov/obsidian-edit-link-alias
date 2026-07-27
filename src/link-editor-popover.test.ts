import type {
  ButtonComponent as ButtonComponentType,
  TextComponent as TextComponentType
} from 'obsidian';

import {
  ButtonComponent,
  TextComponent
} from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { EMPTY } from 'obsidian-dev-utils/string';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { LinkUrlAndAlias } from './link-editor-modal.ts';

import { editLinkUrlAndAliasInPopover } from './link-editor-popover.ts';

const ANCHOR_RECT_BOTTOM = 100;
const ANCHOR_RECT_LEFT = 40;
const POPOVER_SELECTOR = '.link-editor-popover';

interface ButtonComponentPseudoConstructor {
  constructor2__(this: ButtonComponentType): void;
}

interface Captured {
  readonly buttons: ButtonComponentType[];
  readonly textComponents: TextComponentType[];
}

interface TextComponentPseudoConstructor {
  constructor4__(this: TextComponentType): void;
}

let anchorEl: HTMLElement;

function capture(): Captured {
  const textComponents: TextComponentType[] = [];
  const buttons: ButtonComponentType[] = [];

  vi.spyOn(castTo<TextComponentPseudoConstructor>(TextComponent.prototype), 'constructor4__').mockImplementation(function captureText(this: TextComponentType): void {
    textComponents.push(this);
  });
  vi.spyOn(castTo<ButtonComponentPseudoConstructor>(ButtonComponent.prototype), 'constructor2__').mockImplementation(function captureButton(this: ButtonComponentType): void {
    buttons.push(this);
  });

  return {
    buttons,
    textComponents
  };
}

function getPopoverEl(): HTMLElement {
  const popoverEl = document.querySelector<HTMLElement>(POPOVER_SELECTOR);
  if (!popoverEl) {
    throw new Error('The popover was not rendered');
  }
  return popoverEl;
}

function openPopover(): Promise<LinkUrlAndAlias | null> {
  return editLinkUrlAndAliasInPopover({
    anchorEl,
    defaultAlias: 'old alias',
    defaultUrl: 'target'
  });
}

beforeEach(() => {
  document.body.empty();
  anchorEl = document.body.createEl('a', { text: `${EMPTY}old alias` });
  anchorEl.getBoundingClientRect = (): DOMRect =>
    castTo<DOMRect>({
      bottom: ANCHOR_RECT_BOTTOM,
      left: ANCHOR_RECT_LEFT
    });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.empty();
});

describe('editLinkUrlAndAliasInPopover', () => {
  it('should render anchored at the link with the fields pre-filled', async () => {
    const { textComponents } = capture();

    const promise = openPopover();

    const popoverEl = getPopoverEl();
    expect(popoverEl.hasClass('menu')).toBe(true);
    expect(popoverEl.style.left).toBe('40px');
    expect(popoverEl.style.top).toBe('104px');

    const [urlText, aliasText] = textComponents;
    expect(urlText?.getValue()).toBe('target');
    expect(aliasText?.getValue()).toBe('old alias');
    expect(urlText?.inputEl.hasClass('link-editor-popover-url-input')).toBe(true);
    expect(aliasText?.inputEl.hasClass('link-editor-popover-alias-input')).toBe(true);

    popoverEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await promise;
  });

  it('should keep the popover inside the window when the link sits at the edge', async () => {
    capture();
    anchorEl.getBoundingClientRect = (): DOMRect =>
      castTo<DOMRect>({
        bottom: window.innerHeight + 500,
        left: window.innerWidth + 500
      });

    const promise = openPopover();

    const popoverEl = getPopoverEl();
    expect(Number.parseInt(popoverEl.style.left, 10)).toBeLessThanOrEqual(window.innerWidth);
    expect(Number.parseInt(popoverEl.style.top, 10)).toBeLessThanOrEqual(window.innerHeight);

    popoverEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await promise;
  });

  it('should resolve with the edited url and alias when OK is clicked', async () => {
    const { buttons, textComponents } = capture();

    const promise = openPopover();

    const [urlText, aliasText] = textComponents;
    urlText?.setValue('new-target');
    aliasText?.setValue('new alias');
    const [okButton] = buttons;
    castToTestable(okButton).simulateClick__();

    await expect(promise).resolves.toStrictEqual({ alias: 'new alias', url: 'new-target' });
    expect(document.querySelector(POPOVER_SELECTOR)).toBeNull();
  });

  it('should resolve with null when Cancel is clicked', async () => {
    const { buttons } = capture();

    const promise = openPopover();

    const [, cancelButton] = buttons;
    castToTestable(cancelButton).simulateClick__();

    await expect(promise).resolves.toBeNull();
    expect(document.querySelector(POPOVER_SELECTOR)).toBeNull();
  });

  it('should submit on Enter and ignore other keys', async () => {
    const { textComponents } = capture();

    const promise = openPopover();

    const [urlText] = textComponents;
    urlText?.setValue('typed-target');
    const popoverEl = getPopoverEl();
    popoverEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    popoverEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    await expect(promise).resolves.toStrictEqual({ alias: 'old alias', url: 'typed-target' });
  });

  it('should dismiss on Escape', async () => {
    capture();

    const promise = openPopover();

    getPopoverEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(promise).resolves.toBeNull();
  });

  it('should dismiss when the next gesture starts outside it', async () => {
    capture();

    const promise = openPopover();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    await expect(promise).resolves.toBeNull();
    expect(document.querySelector(POPOVER_SELECTOR)).toBeNull();
  });

  it('should stay open when the gesture starts inside it', async () => {
    const { buttons } = capture();

    const promise = openPopover();

    getPopoverEl().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(document.querySelector(POPOVER_SELECTOR)).not.toBeNull();

    const [, cancelButton] = buttons;
    castToTestable(cancelButton).simulateClick__();
    await expect(promise).resolves.toBeNull();
  });

  it('should resolve only once when dismissed twice', async () => {
    const { buttons } = capture();

    const promise = openPopover();

    const [, cancelButton] = buttons;
    castToTestable(cancelButton).simulateClick__();
    castToTestable(cancelButton).simulateClick__();

    await expect(promise).resolves.toBeNull();
  });
});

interface TestableButtonComponent {
  simulateClick__(): void;
}

function castToTestable(button: ButtonComponentType | undefined): TestableButtonComponent {
  return castTo<TestableButtonComponent>(button);
}
