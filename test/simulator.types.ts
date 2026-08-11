import type { BotchartSpec, CoreRunner } from "botchart";
import type {
  CoverageManifest,
  GoldenTranscript,
  ReplayTranscriptOptions,
  SimulateConversationOptions,
  SimulationStep,
  TranscriptStep,
} from "botchart/simulator";
import {
  digestSpec,
  simulateConversation,
  stringifyTranscript,
} from "botchart/simulator";

declare const spec: BotchartSpec;
declare const runner: CoreRunner;
declare const transcript: GoldenTranscript;

const replay = {
  transcript,
  spec,
  runner,
  startAt: "finish",
} satisfies ReplayTranscriptOptions;

void replay;
void digestSpec(spec);
void stringifyTranscript(transcript);

const simulationStep = {
  name: "finish",
  input: {
    origin: "telegram",
    source: "message",
    name: "photo",
    payload: {},
  },
  covers: ["simulator.session.final"],
} satisfies SimulationStep;

const simulation = {
  name: "finish",
  spec,
  specPath: "../specs/final.json",
  runner,
  initial: transcript.initial,
  steps: [simulationStep],
} satisfies SimulateConversationOptions;

void simulateConversation(simulation);

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
