/**
 * @file
 *
 * A two-field modal that edits both a link's URL (target) and its alias (display text) at once.
 *
 * Built on the `obsidian-dev-utils` {@link ModalBase} / {@link showModal} primitives (the same base the
 * single-field `prompt` uses), so it participates in the shared modal lifecycle. It complements the
 * alias-only prompt reused by {@link editParsedLinkAlias}: this one exposes the URL as a second editable
 * field.
 */

import type { App } from 'obsidian';
import type { ModalBaseConstructorParams } from 'obsidian-dev-utils/obsidian/modals/modal';

import {
  Setting,
  TextComponent
} from 'obsidian';
import {
  ModalBase,
  showModal
} from 'obsidian-dev-utils/obsidian/modals/modal';

const ALIAS_INPUT_CSS_CLASS = 'link-editor-alias-input';
const CANCEL_BUTTON_CSS_CLASS = 'link-editor-cancel-button';
const MODAL_CSS_CLASS = 'link-editor-modal';
const OK_BUTTON_CSS_CLASS = 'link-editor-ok-button';
const URL_INPUT_CSS_CLASS = 'link-editor-url-input';

/**
 * Parameters for {@link editLinkUrlAndAlias}.
 */
export interface EditLinkUrlAndAliasParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * The alias to pre-fill the alias field with.
   */
  readonly defaultAlias: string;

  /**
   * The URL to pre-fill the URL field with.
   */
  readonly defaultUrl: string;
}

/**
 * The URL (target) and alias (display text) captured by {@link editLinkUrlAndAlias}.
 */
export interface LinkUrlAndAlias {
  /**
   * The alias (display text) of the link. Empty when the link has no alias.
   */
  readonly alias: string;

  /**
   * The URL (target) of the link.
   */
  readonly url: string;
}

interface LinkEditorModalConstructorParams extends ModalBaseConstructorParams<LinkUrlAndAlias | null> {
  readonly defaultAlias: string;
  readonly defaultUrl: string;
}

class LinkEditorModal extends ModalBase<LinkUrlAndAlias | null> {
  private readonly defaultAlias: string;
  private readonly defaultUrl: string;
  private result: LinkUrlAndAlias | null = null;

  public constructor(params: LinkEditorModalConstructorParams) {
    super(params);
    this.defaultUrl = params.defaultUrl;
    this.defaultAlias = params.defaultAlias;
  }

  public override onClose(): void {
    this.promiseResolve(this.result);
  }

  public override onOpen(): void {
    this.setTitle('Edit link');

    const urlText = this.addField('URL', this.defaultUrl, URL_INPUT_CSS_CLASS);
    const aliasText = this.addField('Alias', this.defaultAlias, ALIAS_INPUT_CSS_CLASS);

    const handleOk = (): void => {
      this.result = {
        alias: aliasText.getValue(),
        url: urlText.getValue()
      };
      this.close();
    };

    for (const inputEl of [urlText.inputEl, aliasText.inputEl]) {
      inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleOk();
        }
      });
    }

    const buttonsSetting = new Setting(this.contentEl);
    buttonsSetting.addButton((button) => {
      button
        .setButtonText('OK')
        .setCta()
        .setClass(OK_BUTTON_CSS_CLASS)
        .onClick(handleOk);
    });
    buttonsSetting.addButton((button) => {
      button
        .setButtonText('Cancel')
        .setClass(CANCEL_BUTTON_CSS_CLASS)
        .onClick(() => {
          this.close();
        });
    });
  }

  private addField(name: string, value: string, cssClass: string): TextComponent {
    const setting = new Setting(this.contentEl).setName(name);
    const textComponent = new TextComponent(setting.controlEl);
    textComponent.setValue(value);
    textComponent.inputEl.addClass(cssClass);
    return textComponent;
  }
}

/**
 * Displays the two-field link editor modal and resolves with the edited URL and alias, or `null` if the
 * modal was cancelled.
 *
 * @param params - The parameters for the link editor modal.
 * @returns A {@link Promise} that resolves with the edited {@link LinkUrlAndAlias}, or `null` if cancelled.
 */
export async function editLinkUrlAndAlias(params: EditLinkUrlAndAliasParams): Promise<LinkUrlAndAlias | null> {
  return await showModal<LinkUrlAndAlias | null>((promiseResolve) =>
    new LinkEditorModal({
      app: params.app,
      cssClasses: [MODAL_CSS_CLASS],
      defaultAlias: params.defaultAlias,
      defaultUrl: params.defaultUrl,
      promiseResolve
    })
  );
}
