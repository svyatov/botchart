# Issue tracker: GitHub

Issues for botchart live in GitHub Issues in `svyatov/botchart-docs`.
Always pass `-R svyatov/botchart-docs` to `gh` commands.

## Operations

- Create an issue with `gh issue create -R svyatov/botchart-docs`.
- Read an issue with `gh issue view -R svyatov/botchart-docs <number> --comments`.
- List issues with `gh issue list -R svyatov/botchart-docs`.
- Edit labels with `gh issue edit -R svyatov/botchart-docs`.
- Add comments with `gh issue comment -R svyatov/botchart-docs`.
- Close issues with `gh issue close -R svyatov/botchart-docs`.

Use absolute GitHub links for supporting files in `botchart-docs`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Publish an issue

Create the issue in `svyatov/botchart-docs`. Apply its type and triage labels. Set its milestone.

## Fetch an issue

Run `gh issue view -R svyatov/botchart-docs <number> --comments`.

## Wayfinding

- The map is one issue with the `wayfinder:map` label.
- Child tickets use GitHub native sub-issue links.
- Child tickets use one `wayfinder:<type>` label.
- Types are `research`, `prototype`, `grilling`, and `task`.
- Blocking uses GitHub native issue dependencies.
- The `0.1.0` milestone groups this release effort.
- Assign an issue to claim it.
- Add the answer and close the issue to resolve it.
