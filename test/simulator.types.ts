import type { BotchartSpec, CoreRunner } from "botchart";
import type {
  CoverageManifest,
  GoldenTranscript,
  ReplayTranscriptOptions,
  TranscriptStep,
} from "botchart/simulator";
import { digestSpec, stringifyTranscript } from "botchart/simulator";

declare const spec: BotchartSpec;
declare const runner: CoreRunner;
declare const transcript: GoldenTranscript;

const replay = {
  transcript,
  spec,
  runner,
} satisfies ReplayTranscriptOptions;

void replay;
void digestSpec(spec);
void stringifyTranscript(transcript);

const manifest = {
  schemaRevision: "0.1.0",
  rules: ["runtime.session.final"],
} satisfies CoverageManifest;

void manifest;

const failedStep = {
  name: "reject invalid input",
  input: {
    origin: "adapter",
    source: "lifecycle",
    name: "error",
    payload: {},
  },
  covers: ["runtime.error.atomic"],
  result: {
    kind: "error",
    session: transcript.initial.session,
    intents: [],
    error: {
      code: "invalid_input",
      path: "$.input",
      message: "Use a declared input.",
    },
  },
} satisfies TranscriptStep;

void failedStep;

const nonAtomicStep = {
  ...failedStep,
  // @ts-expect-error failed transcript steps contain no intents
  result: {
    ...failedStep.result,
    intents: [{ kind: "pressAnswer", callbackQueryId: "query:1" }],
  },
} satisfies TranscriptStep;

void nonAtomicStep;

const openTranscript = {
  ...transcript,
  // @ts-expect-error transcript root objects are closed
  note: "remove me",
} satisfies GoldenTranscript;

void openTranscript;
