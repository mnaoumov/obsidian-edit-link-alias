# CHANGELOG

## 1.5.2

- chore: update libs and adopt obsidian-integration-testing 10

## 1.5.1

- chore: update libs
- test: adopt the createNote helper in the cross-platform suites
- refactor(test): collapse the shared integration suites per G47
- chore: update libs
- chore(vitest): adopt the shared Obsidian plugin vitest configuration

## 1.5.0

- test: update
- fix: make the link editor reachable and open it on the alias
- chore: update libs

## 1.4.0

- refactor(settings): move the settings tab onto the declarative settings API
- chore: update libs and clear the npm audit

## 1.3.2

- feat: edit links in the frontmatter, writing valid YAML

## 1.3.1

- fix: open the link editor on Alt+click in Live Preview and Source mode (#4)

## 1.3.0

- docs: fix the demo vault download instructions
- refactor(popover): consume the obsidian-dev-utils popover
- chore: update libs

## 1.2.0

- refactor: drop the obsidian-test-mocks workarounds
- chore: update libs
- build: bump postcss to 8.5.23 for GHSA-r28c-9q8g-f849
- build: patch the vulnerable brace-expansion behind a callable override
- chore: update libs

## 1.1.0

- refactor: narrow the link menu handlers to private, per find-overexposed
- refactor: narrow handleClick to private, per find-overexposed
- test: use strictProxy for the collaborator doubles, per G43
- feat: edit a link by Alt + clicking it, and drop the modal
- chore: renumber the TODO task references after an id collision
- test: add the demo-vault coverage suite, now that the plugin has settings
- feat: re #2
- feat: re #2
- chore: update libs

## 1.0.14

- feat: re #3
- chore: update libs

## 1.0.13

- chore: update libs

## 1.0.12

- chore: update libs
- chore(demo-vault): drop committed Invocables placeholder
- fix(demo-vault): export invoke() from startup script; add Invocables folder

## 1.0.11

- docs: standardize demo-vault README
- docs: drop per-plugin demo-vault setup notes (bootstrap covered by ODU harness)
- docs: unnumber demo-vault setup notes
- Merge branch 'T106-renumber': number Edit Link Alias demo vault example notes (S2)
- Merge branch 'T106': create the Edit Link Alias demo vault (S2)
- chore: update libs
- docs: migrate to AGENTS.md

## 1.0.10

- chore: update libs
- chore: update obsidian-dev-utils to 85.0.0
- build: lock typescript to 6.0.3
- test: wire integration-testing vitest-setup into integration projects
- chore: update libs
- chore: clean up tsconfig

## 1.0.9

- refactor: new template

## 1.0.8

- chore: keep skipLibCheck true
- build: restore skipLibCheck to false after upstream type conflict resolved
- test: reuse real PluginBase and EditorCommandHandler base in unit tests
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
