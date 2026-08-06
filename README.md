# botchart

Describe a Telegram bot as one portable, serializable statechart document. A pure
interpreter runs that document. Every diagram and every preview is derived from it.

## Status

Pre-release. The repository holds the package scaffold and no working code yet.
Nothing is published to npm. The API is not stable.

## Packages

| Package | Contents |
| --- | --- |
| `botchart` | Spec types, authoring layer, pure interpreter, simulator. No runtime dependencies. |
| `botchart-grammy` | The grammY adapter. Executes the intents the interpreter emits. |

## Documentation

`CONTEXT.md` holds the project glossary. Read it before the source: the terms it
defines carry exact meanings here.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, read
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE), copyright 2026 Leonid Svyatov.
