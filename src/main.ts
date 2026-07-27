// eslint-disable-next-line import-x/no-unassigned-import, import-x/no-empty-named-blocks -- Need empty import block.
import type {} from '@obsidian-typings/obsidian-public-latest';

// The stylesheet is emitted as the plugin's styles.css by the build.
import './styles/main.scss';
import { Plugin } from './plugin.ts';

export default Plugin;
