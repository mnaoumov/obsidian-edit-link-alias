# CHANGELOG

## 1.6.0

This release has 1 new feature and 4 documentation changes. 7 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- add a Report a bug command

### Documentation

- **readme:** point bug reports at the Report a bug command
- add issue-filing instructions for AI agents
- **readme:** combine related resources and plugin comparisons
- **readme:** add Similar plugins section

## 1.5.9

This release has 1 fix and 8 documentation changes. 10 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **demo-vault:** load the demo setup helpers from @mnaoumov/obsidian-lib

### Documentation

- name `obsidian-lib` where comments said dev-utils
- shorten the debugging section
- **changelog:** escape the issue-title tags so `markdownlint` and `cspell` pass
- **changelog:** name the issue each released entry resolved
- **readme:** lead the Debugging section with `Advanced Debug Mode`
- mark plugin names as code
- **demo-vault:** prepare the Alt + click Try it from a button
- merge marking plugin names as code in comments and markdown

## 1.5.8

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- merge editing a link written without a scheme (re #11 - \[BUG\] Bare links that don't have http or https are not recognized)

## 1.5.7

This release has 1 fix.

### Fixed

- merge editing a link shown in a Bases table cell (re #10 - \[BUG\] Can't `Edit Link Alias` in a Base)

## 1.5.6

This release has 4 fixes and 7 documentation changes. 16 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **test:** merge the headless demo-vault toolkit install
- **deps:** restore the lockfile's missing resolved and integrity fields
- **deps:** float devalue to 5.9.4, clearing GHSA-9rgm-9g3h-6x36
- **build:** wire build:compile to buildCompile and drop the duplicate leaf script

### Documentation

- **link-click:** merge the pointed again LinkClickAction links
- **agents:** merge the corrected raiseSoftKeyboard reasoning
- replace the private rule-id citations with what they assert
- **changelog:** name `obsidian-dev-utils` by its package name
- replace the private tracker references with what they pointed at
- record why the mobile frames do not raise the soft keyboard
- name the unversioned demo-vault asset and the folder it unzips into

## 1.5.5

This release has 2 fixes. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **deps:** move to `obsidian-integration-testing` 11 and `obsidian-dev-utils` 96.5.2
- **deps:** drop the brace-expansion file: override that breaks a clean install

## 1.5.4

This release has 1 fix and 4 documentation changes. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- override deepmerge-ts to clear GHSA-ggr8-5vv4-36mx

### Documentation

- **demo-vault:** unwrap the notes so Obsidian stops rendering a break per line
- **readme:** render the same in Obsidian's plugin page as on `GitHub`
- **demo-vault:** give the demo vault its code buttons
- capture the community-store screenshot set

## 1.5.3

This release has 1 new feature and 1 documentation change.

### New

- **demo-vault:** migrate to `obsidian-dev-utils` 93.3.1 and adopt the authoring convention

### Documentation

- make the demo vault the documentation, in the standard layout

## 1.5.2

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.5.1

This release has maintenance changes only. 5 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 1.5.0

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- make the link editor reachable and open it on the alias

## 1.4.0

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 1.3.2

This release has 1 new feature.

### New

- edit links in the frontmatter, writing valid YAML

## 1.3.1

This release has 1 fix.

### Fixed

- open the link editor on Alt+click in Live Preview and Source mode (#4)

## 1.3.0

This release has 1 documentation change. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- fix the demo vault download instructions

## 1.2.0

This release has maintenance changes only. 5 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 1.1.0

This release has 2 new features. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- edit a link by Alt + clicking it, and drop the modal
- \[FR\] Visual Editing Popover For Links (#2)

## 1.0.14

This release has 1 new feature. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- \[FR\] \[Mobile\] edit link alias command in file menu (#3)

## 1.0.13

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.0.12

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **demo-vault:** export invoke() from startup script; add Invocables folder

## 1.0.11

This release has 6 documentation changes. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Documentation

- standardize demo-vault README
- drop per-plugin demo-vault setup notes (bootstrap covered by the `obsidian-dev-utils` harness)
- unnumber demo-vault setup notes
- **demo-vault:** number `Edit Link Alias` demo vault example notes
- **demo-vault:** create the `Edit Link Alias` demo vault
- migrate to AGENTS.md

## 1.0.10

This release has maintenance changes only. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 1.0.9

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.0.8

This release has maintenance changes only. 5 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 1.0.7

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.0.6

This release has maintenance changes only. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 1.0.5

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.0.4

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.0.3

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.0.2

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.0.1

This release has maintenance changes only. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 1.0.0

This release has 1 new feature.

### New

- initial implementation
