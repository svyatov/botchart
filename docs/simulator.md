# Simulator

The `botchart/simulator` module runs authored inputs through a pure core runner.
It returns a golden transcript with stable identifiers and a digest of the canonical spec.

## Generate a transcript

Call `simulateConversation(options)` with these values:

- `name`: the scenario name.
- `spec`: the canonical spec.
- `specPath`: the relative JSON path that the transcript records.
- `runner`: the pure core runner.
- `initial`: the semantic session snapshot and the initial UTC time.
- `steps`: named portable inputs, optional time advances, and coverage rules.

The result is a tagged union. An `ok` result contains a valid `GoldenTranscript`.
A failed result contains `TranscriptIssue` values with paths and direct fixes.
Core errors are valid transcript steps when they preserve the prior session and emit no intents.

Build the packages, then run the complete example:

```bash
bun run examples/simulator.ts
```

The command writes the generated transcript to standard output.
The source is in [`examples/simulator.ts`](../examples/simulator.ts).

## Replay a transcript

Call `replayTranscript({ transcript, spec, runner })` to replay all steps.
Set `startAt` to a step name to replay from that step through the end.

Random access uses the session snapshot from the prior step.
It also restores recorded callback, effect, and timer identifiers.
The runner does not process earlier steps.

The replay result contains the updated transcript and all differences as `TranscriptIssue` values.
An empty `issues` list means that the recorded and replayed results match.

## Time and output rules

The initial time and all `advance` values form the virtual clock.
Each step receives one RFC 3339 UTC time.
Object keys and generated identifiers have stable output order and values.
Use `stringifyTranscript()` to write two-space JSON with a final newline.
