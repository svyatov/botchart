# Contributing to botchart

## Open an issue first

botchart is pre-release. The document model is still being frozen, so a pull
request written against today's shape can be invalidated next week. Open an issue
and agree on the change before you write code. This protects your time, not the
maintainer's.

## Set up a checkout

The toolchain is [bun](https://bun.com). Install it, then run:

```sh
git clone https://github.com/svyatov/botchart.git
cd botchart
bun install
```

## Run the checks

```sh
bun run build   # type-checks and emits both packages
bun test        # runs the test suite
```

CI runs the same two commands. It also builds under the oldest supported
TypeScript version, 5.9, and under the current 7.x release. Run `bun run build`
before you push.

## Submit a change

1. Fork the repository and create a branch off `main`.
2. Make the change. Add a test for any behavior you add or fix.
3. Run `bun run build` and `bun test`.
4. Open a pull request against `main` and link the issue it resolves.

Pull requests are squash merged, so the pull request title becomes the commit
message on `main`. Write it as a sentence that says what the change does.

## What an acceptable change satisfies

Read [CONTEXT.md](CONTEXT.md) first. It is the project glossary, and the terms it
defines carry exact meanings in the source. Use them.

Four rules apply to every change:

- A change that adds functionality arrives with a test.
- Option bags are the single form for an API that takes arguments. No fluent chains.
- Every error message names the fix. Large language models author specs with this
  library, so an error that only reports a problem is an incomplete error.
- Write no em dash and no en dash in any file. Use a comma, a colon, or two
  sentences.

The core package `botchart` has no runtime dependencies and keeps none. A change
that needs a dependency in that package needs an issue first.

## Governance

Leonid Svyatov ([@svyatov](https://github.com/svyatov)) reviews, merges, and
releases. No succession is arranged.
