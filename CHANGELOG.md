# CHANGELOG

## 1.0.8

- chore: keep skipLibCheck true
- build: restore skipLibCheck to false after upstream type conflict resolved The @types/css-font-loading-module TS2403 conflict is gone in the current obsidian-typings, so the skipLibCheck workaround no longer suppresses any upstream diagnostics (tsc --skipLibCheck false reports 0 errors). Restore the canonical skipLibCheck: false and drop the stale Known Issue note. Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
- test: reuse real PluginBase and EditorCommandHandler base in unit tests Replace the PluginBase shadow mock (PluginBase: Component) with the real dev-utils base driven through the real onload() lifecycle, and swap the manual EditorCommandHandler.prototype save/overwrite/restore for a vi.spyOn return-value stub. Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
- refactor: update template
- chore: update version script

## 1.0.7

- chore: update libs

## 1.0.6

- chore: update libs
- chore: upgrade dependencies and green up all checks
- chore: update libs
- refactor: migrate to @obsidian-typings/obsidian-public-latest - Replace obsidian-typings with @obsidian-typings/obsidian-public-latest - Update vitest config: replace ssr.noExternal with server.deps.inline - Add DOM.Iterable to tsconfig lib - Remove obsolete overrides (@antfu/utils, boolean, dompurify) - Upgrade dependencies via npm-check-updates
- build: replace commitizen with czg
- chore: release 1.0.5

## 1.0.5

- refactor: new template

## 1.0.4

- chore: update template

## 1.0.3

- chore: update libs

## 1.0.2

- chore: update libs

## 1.0.1

- chore: update libs
- chore: cleanup
- chore: add funding

## 1.0.0

- feat: initial implementation
