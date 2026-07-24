import type {
  App as AppOriginal,
  ButtonComponent as ButtonComponentType,
  TextComponent as TextComponentType
} from 'obsidian';

import {
  ButtonComponent,
  TextComponent
} from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { editLinkUrlAndAlias } from './link-editor-modal.ts';

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

let app: AppOriginal;

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

beforeEach(() => {
  app = App.createConfigured__().asOriginalType__();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('editLinkUrlAndAlias', () => {
  it('should pre-fill the fields with the provided url and alias', async () => {
    const { textComponents } = capture();

    const promise = editLinkUrlAndAlias({
      app,
      defaultAlias: 'old alias',
      defaultUrl: 'target'
    });

    const [urlText, aliasText] = textComponents;
    expect(urlText?.getValue()).toBe('target');
    expect(aliasText?.getValue()).toBe('old alias');
    expect(urlText?.inputEl.hasClass('link-editor-url-input')).toBe(true);
    expect(aliasText?.inputEl.hasClass('link-editor-alias-input')).toBe(true);

    await promise;
  });

  it('should resolve with the edited url and alias when OK is clicked', async () => {
    const { buttons, textComponents } = capture();

    const promise = editLinkUrlAndAlias({
      app,
      defaultAlias: 'old alias',
      defaultUrl: 'target'
    });

    const [urlText, aliasText] = textComponents;
    urlText?.setValue('new-target');
    aliasText?.setValue('new alias');
    const [okButton] = buttons;
    castToTestable(okButton).simulateClick__();

    await expect(promise).resolves.toStrictEqual({ alias: 'new alias', url: 'new-target' });
  });

  it('should resolve with null when Cancel is clicked', async () => {
    const { buttons } = capture();

    const promise = editLinkUrlAndAlias({
      app,
      defaultAlias: 'old alias',
      defaultUrl: 'target'
    });

    const [, cancelButton] = buttons;
    castToTestable(cancelButton).simulateClick__();

    await expect(promise).resolves.toBeNull();
  });

  it('should resolve with null when the modal is dismissed without a choice', async () => {
    capture();

    const result = await editLinkUrlAndAlias({
      app,
      defaultAlias: 'old alias',
      defaultUrl: 'target'
    });

    expect(result).toBeNull();
  });

  it('should submit on Enter and ignore other keys', async () => {
    const { textComponents } = capture();

    const promise = editLinkUrlAndAlias({
      app,
      defaultAlias: 'old alias',
      defaultUrl: 'target'
    });

    const [urlText] = textComponents;
    urlText?.setValue('typed-target');
    urlText?.inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    urlText?.inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    await expect(promise).resolves.toStrictEqual({ alias: 'old alias', url: 'typed-target' });
  });
});

interface TestableButtonComponent {
  simulateClick__(): void;
}

function castToTestable(button: ButtonComponentType | undefined): TestableButtonComponent {
  return castTo<TestableButtonComponent>(button);
}
