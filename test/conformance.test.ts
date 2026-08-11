import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import {
  compareTranscriptValues,
  createTranscriptIdCounters,
  digestSpec,
  replayTranscript,
  stringifyTranscript,
  transcriptSchemaId,
  updateTranscript,
  validateTranscript,
  verifyCoverage,
  verifyTranscript,
} from "botchart/simulator";
import type { BotchartSpec, CoreRunner } from "botchart";
import type { GoldenTranscript } from "botchart/simulator";
import schema from "botchart/conformance/schema.json" with { type: "json" };

const session = {
  position: "main",
  context: {},
  history: {},
  callStack: [],
  seq: 0,
  viewSlots: {},
  callbacks: {},
} as const;

const transcript = {
  $schema: "https://svyatov.github.io/botchart/conformance/0.1.0/transcript.schema.json",
  transcriptVersion: 1,
  schemaRevision: "0.1.0",
  name: "minimal final scenario",
  spec: {
    path: "../specs/minimal.json",
    sha256: "a".repeat(64),
  },
  initial: {
    session,
    now: "2026-08-10T14:00:00Z",
  },
  steps: [
    {
      name: "start finishes the session",
      input: {
        origin: "telegram",
        source: "command",
        name: "start",
        payload: {},
      },
      covers: ["runtime.session.final"],
      result: {
        kind: "ok",
        session: null,
        intents: [],
      },
    },
  ],
} as const;

const transcriptAjv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = transcriptAjv.compile(schema);

test("the published transcript schema accepts the complete format", () => {
  expect(validateSchema(transcript), JSON.stringify(validateSchema.errors)).toBe(true);
  expect(schema.$id).toBe(transcriptSchemaId);
  expect(validateTranscript(transcript)).toEqual({ ok: true, value: transcript });
});

test.each([
  ["an unknown root field", { ...transcript, note: "remove me" }],
  ["an unknown nested field", {
    ...transcript,
    spec: { ...transcript.spec, algorithm: "sha256" },
  }],
  ["an absolute spec path", {
    ...transcript,
    spec: { ...transcript.spec, path: "/tmp/spec.json" },
  }],
  ["a non-UTC initial time", {
    ...transcript,
    initial: { ...transcript.initial, now: "2026-08-10T17:00:00+03:00" },
  }],
  ["a zero delay", {
    ...transcript,
    steps: [{ ...transcript.steps[0], advance: "0s" }],
  }],
  ["an unknown input origin", {
    ...transcript,
    steps: [{
      ...transcript.steps[0],
      input: { ...transcript.steps[0].input, origin: "host" },
    }],
  }],
  ["a duplicate coverage claim", {
    ...transcript,
    steps: [{
      ...transcript.steps[0],
      covers: ["runtime.session.final", "runtime.session.final"],
    }],
  }],
  ["intents on an error result", {
    ...transcript,
    steps: [{
      ...transcript.steps[0],
      result: {
        kind: "error",
        session,
        intents: [{ kind: "pressAnswer", callbackQueryId: "query:1" }],
        error: { code: "invalid", path: "$.input", message: "Use a valid input." },
      },
    }],
  }],
])("the published schema rejects %s", (_name, value) => {
  expect(validateSchema(value)).toBe(false);
});

test("validation rejects open objects and duplicate step names", () => {
  expect(validateTranscript({ ...transcript, note: "remove me" })).toEqual({
    ok: false,
    issues: [{
      code: "unknown_field",
      path: "$.note",
      message: "Remove the note field.",
    }],
  });
  expect(validateTranscript({
    ...transcript,
    steps: [transcript.steps[0], transcript.steps[0]],
  })).toEqual({
    ok: false,
    issues: [{
      code: "duplicate_step_name",
      path: "$.steps[1].name",
      message: "Use a unique step name.",
    }],
  });
});

test("validation enforces the published format rules", () => {
  const invalid = [
    { ...transcript, spec: { ...transcript.spec, path: "/tmp/spec.json" } },
    { ...transcript, initial: { ...transcript.initial, now: "2026-08-10T17:00:00+03:00" } },
    { ...transcript, steps: [{ ...transcript.steps[0], advance: "0s" }] },
    {
      ...transcript,
      steps: [{
        ...transcript.steps[0],
        input: { ...transcript.steps[0].input, origin: "host" },
      }],
    },
    {
      ...transcript,
      steps: [{
        ...transcript.steps[0],
        covers: ["runtime.session.final", "runtime.session.final"],
      }],
    },
  ];

  for (const value of invalid) expect(validateTranscript(value).ok).toBe(false);

  const failedSession = { ...session, seq: 1 };
  const errorStep = {
    ...transcript.steps[0],
    result: {
      kind: "error",
      session: failedSession,
      intents: [],
      error: { code: "invalid", path: "$.input", message: "Use a valid input." },
    },
  } as const;
  expect(validateTranscript({ ...transcript, steps: [errorStep] })).toEqual({
    ok: false,
    issues: [{
      code: "non_atomic_failure",
      path: "$.steps[0].result.session",
      message: "Copy the prior session into the failed result.",
    }],
  });
});

test("the format supports all input origins and semantic intent kinds", () => {
  const token = { sessionKey: "chat:42", stateId: "main", seq: 0 } as const;
  const target = { kind: "chat", chatId: 42 } as const;
  const handle = { kind: "chat", chatId: 42, messageId: 7 } as const;
  const view = { kind: "text", text: ["Hello"], parseMode: "plain" } as const;
  const origins = ["telegram", "effect", "scheduler", "adapter"] as const;
  const results = [
    {
      kind: "ok",
      session,
      intents: [
        { kind: "view", operation: "send", slot: "main", target, view },
        { kind: "effect", id: "effect:1", effect: "load", input: {}, token },
      ],
    },
    {
      kind: "ok",
      session,
      intents: [
        { kind: "view", operation: "edit", slot: "main", handle, view },
        {
          kind: "timer",
          operation: "schedule",
          id: "timer:1",
          timer: "refresh",
          fireAt: "2026-08-10T14:01:00Z",
          token,
        },
      ],
    },
    {
      kind: "ok",
      session,
      intents: [
        { kind: "view", operation: "delete", slot: "main", handle },
        { kind: "view", operation: "replace", slot: "main", target, handle, view },
        { kind: "timer", operation: "cancel", id: "timer:1" },
      ],
    },
    {
      kind: "ok",
      session: null,
      intents: [
        {
          kind: "pressAnswer",
          callbackQueryId: "query:1",
          answer: { kind: "toast", text: "Done" },
        },
        { kind: "pressAnswer", callbackQueryId: "query:2" },
      ],
    },
  ] as const;
  const complete = {
    ...transcript,
    steps: origins.map((origin, index) => ({
      name: `process ${origin}`,
      input: { origin, source: "event", name: origin, payload: {} },
      covers: [`runtime.input.${origin}`],
      result: results[index],
    })),
  };

  expect(validateSchema(complete), JSON.stringify(validateSchema.errors)).toBe(true);
  expect(validateTranscript(complete).ok).toBe(true);
});

test("the writer uses stable keys, two spaces, and a final newline", () => {
  expect(stringifyTranscript({ z: 1, nested: { z: 2, a: 1 }, a: 2 })).toBe(
    "{\n  \"a\": 2,\n  \"nested\": {\n    \"a\": 1,\n    \"z\": 2\n  },\n  \"z\": 1\n}\n",
  );
});

test("spec digests and comparisons ignore object key order", async () => {
  const first = { states: { main: { render: "keep", kind: "state" } }, version: 1 };
  const second = { version: 1, states: { main: { kind: "state", render: "keep" } } };

  expect(await digestSpec(first)).toBe(await digestSpec(second));
  expect(compareTranscriptValues(first, second)).toEqual([]);
  expect(compareTranscriptValues(["first", "second"], ["second", "first"])).toEqual([
    {
      code: "value_mismatch",
      path: "$[0]",
      message: "Set the value to \"first\".",
    },
  ]);
});

test("typed identifier counters are stable and reset for each scenario", () => {
  const first = createTranscriptIdCounters();
  const second = createTranscriptIdCounters();
  const reserved = createTranscriptIdCounters();

  expect(first.stable("effect", "runtime-id-9")).toBe("effect:1");
  expect(first.stable("effect", "runtime-id-9")).toBe("effect:1");
  expect(first.stable("effect", "runtime-id-10")).toBe("effect:2");
  expect(first.stable("timer", "runtime-id-9")).toBe("timer:1");
  expect(second.stable("effect", "runtime-id-10")).toBe("effect:1");
  expect(reserved.stable("effect", "effect:7")).toBe("effect:7");
  expect(reserved.stable("effect", "runtime-id-9")).toBe("effect:8");
});

test("replay uses virtual time and preserves atomic failures", () => {
  const afterFirstStep = { ...session, seq: 1 };
  const scenario = {
    ...transcript,
    steps: [
      {
        name: "start an effect",
        advance: "30s",
        input: transcript.steps[0].input,
        covers: ["runtime.effect.start"],
        result: {
          kind: "ok",
          session: afterFirstStep,
          intents: [
            {
              kind: "effect",
              id: "effect:1",
              effect: "load",
              input: {},
              token: { sessionKey: "chat:42", stateId: "main", seq: 1 },
            },
          ],
        },
      },
      {
        name: "reject invalid feedback",
        advance: "1m",
        input: {
          origin: "effect",
          source: "outcome",
          name: "invalid",
          payload: {},
        },
        covers: ["runtime.error.atomic"],
        result: {
          kind: "error",
          session: afterFirstStep,
          intents: [],
          error: {
            code: "invalid_feedback",
            path: "$.input.name",
            message: "Use a declared effect outcome.",
          },
        },
      },
    ],
  } satisfies GoldenTranscript;
  const times: string[] = [];
  const runner: CoreRunner = (request) => {
    times.push(request.now);
    if (request.input.origin === "telegram") {
      return {
        kind: "ok",
        session: afterFirstStep,
        intents: [
          {
            kind: "effect",
            id: "runtime-id-9",
            effect: "load",
            input: {},
            token: { sessionKey: "chat:42", stateId: "main", seq: 1 },
          },
        ],
      };
    }

    return {
      kind: "error",
      session: request.session,
      intents: [],
      error: {
        code: "invalid_feedback",
        path: "$.input.name",
        message: "Use a declared effect outcome.",
      },
    };
  };

  const replay = replayTranscript({
    transcript: scenario,
    spec: {} as BotchartSpec,
    runner,
  });

  expect(replay.issues).toEqual([]);
  expect(replay.transcript).toEqual(scenario);
  expect(times).toEqual(["2026-08-10T14:00:30.000Z", "2026-08-10T14:01:30.000Z"]);
});

test("replay maps stable effect feedback ids to runtime ids", () => {
  const active = { ...session, position: "loading", seq: 1 } as const;
  const token = { sessionKey: "chat:42", stateId: "loading", seq: 1 } as const;
  const scenario = {
    ...transcript,
    steps: [
      {
        name: "start the effect",
        input: {
          origin: "telegram",
          source: "message",
          name: "photo",
          payload: { sessionKey: "chat:42" },
        },
        covers: ["runtime.effect.start"],
        result: {
          kind: "ok",
          session: active,
          intents: [{
            kind: "effect",
            id: "effect:1",
            effect: "load",
            input: {},
            token,
          }],
        },
      },
      {
        name: "complete the effect",
        input: {
          origin: "effect",
          source: "outcome",
          name: "done",
          payload: { id: "effect:1", token, output: {} },
        },
        covers: ["runtime.effect.outcome"],
        result: { kind: "ok", session: active, intents: [] },
      },
    ],
  } satisfies GoldenTranscript;
  const feedbackIds: string[] = [];
  const runner: CoreRunner = (request) => {
    if (request.input.origin === "effect") {
      const payload = request.input.payload as { id: string };
      feedbackIds.push(payload.id);
      return { kind: "ok", session: request.session, intents: [] };
    }
    return {
      kind: "ok",
      session: active,
      intents: [{
        kind: "effect",
        id: "chat:42:loading:1:0",
        effect: "load",
        input: {},
        token,
      }],
    };
  };

  expect(replayTranscript({
    transcript: scenario,
    spec: {} as BotchartSpec,
    runner,
  }).issues).toEqual([]);
  expect(feedbackIds).toEqual(["chat:42:loading:1:0"]);
});

test("replay maps stable callback ids across views, sessions, and press inputs", () => {
  const record = {
    sessionKey: "chat:42",
    stateId: "main" as const,
    seq: 0,
    viewSlot: "main",
    viewRevision: 1,
    press: "pick",
    payload: { id: "first" },
    durable: false,
  };
  const stableSession = { ...session, callbacks: { "callback:1": record } };
  const runtimeSession = { ...session, callbacks: { "c0.1.0": record } };
  const stableView = {
    kind: "text",
    text: "Menu",
    parseMode: "plain",
    keyboard: [{
      kind: "row",
      buttons: [{ kind: "button", label: "Pick", callbackId: "callback:1" }],
    }],
  } as const;
  const scenario = {
    ...transcript,
    steps: [
      {
        name: "render a callback",
        input: {
          origin: "telegram",
          source: "message",
          name: "photo",
          payload: { sessionKey: "chat:42" },
        },
        covers: ["runtime.callback.identifier"],
        result: {
          kind: "ok",
          session: stableSession,
          intents: [{
            kind: "view",
            operation: "send",
            slot: "main",
            target: { kind: "chat", chatId: 42 },
            view: stableView,
          }],
        },
      },
      {
        name: "use the callback",
        input: {
          origin: "telegram",
          source: "press",
          name: "callback:1",
          payload: { sessionKey: "chat:42", callbackQueryId: "query:1" },
        },
        covers: ["runtime.callback.recovery"],
        result: { kind: "ok", session: stableSession, intents: [] },
      },
    ],
  } satisfies GoldenTranscript;
  const pressIds: string[] = [];
  const runner: CoreRunner = (request) => {
    if (request.input.source === "press") pressIds.push(request.input.name);
    return request.input.source === "press"
      ? { kind: "ok", session: runtimeSession, intents: [] }
      : {
          kind: "ok",
          session: runtimeSession,
          intents: [{
            kind: "view",
            operation: "send",
            slot: "main",
            target: { kind: "chat", chatId: 42 },
            view: {
              ...stableView,
              keyboard: [{
                kind: "row",
                buttons: [{ kind: "button", label: "Pick", callbackId: "c0.1.0" }],
              }],
            },
          }],
        };
  };

  expect(replayTranscript({
    transcript: scenario,
    spec: {} as BotchartSpec,
    runner,
  }).issues).toEqual([]);
  expect(pressIds).toEqual(["c0.1.0"]);
});

test("coverage rejects missing, duplicate, and unknown claims", () => {
  const manifest = {
    schemaRevision: "0.1.0",
    rules: ["runtime.session.final", "runtime.error.atomic"],
  } as const;

  expect(verifyCoverage({ manifest, transcripts: [transcript] })).toEqual([
    {
      code: "missing_coverage",
      path: "$.rules[1]",
      message: "Add one transcript claim for runtime.error.atomic.",
    },
  ]);
  expect(verifyCoverage({ manifest, transcripts: [transcript, transcript] })).toEqual([
    {
      code: "duplicate_coverage",
      path: "$.transcripts[1].steps[0].covers[0]",
      message: "Keep one transcript claim for runtime.session.final.",
    },
    {
      code: "missing_coverage",
      path: "$.rules[1]",
      message: "Add one transcript claim for runtime.error.atomic.",
    },
  ]);
  expect(verifyCoverage({
    manifest: { schemaRevision: "0.1.0", rules: ["runtime.error.atomic"] },
    transcripts: [transcript],
  })).toEqual([
    {
      code: "unknown_coverage",
      path: "$.transcripts[0].steps[0].covers[0]",
      message: "Add runtime.session.final to coverage.json or remove this claim.",
    },
    {
      code: "missing_coverage",
      path: "$.rules[0]",
      message: "Add one transcript claim for runtime.error.atomic.",
    },
  ]);
});

test("verification checks the spec digest and recorded results", async () => {
  const specJson = { version: 1 } as const;
  const spec = specJson as unknown as BotchartSpec;
  const digest = await digestSpec(specJson);
  const scenario = {
    ...transcript,
    spec: { ...transcript.spec, sha256: digest },
  } satisfies GoldenTranscript;
  const runner: CoreRunner = () => ({ kind: "ok", session: null, intents: [] });

  expect(await verifyTranscript({ transcript: scenario, spec, runner })).toEqual({
    ok: true,
    issues: [],
  });

  expect(await verifyTranscript({
    transcript: { ...scenario, spec: { ...scenario.spec, sha256: "0".repeat(64) } },
    spec,
    runner,
  })).toEqual({
    ok: false,
    issues: [{
      code: "spec_digest_mismatch",
      path: "$.spec.sha256",
      message: `Set the spec digest to ${digest}.`,
    }],
  });

  const staleResult = {
    ...scenario,
    steps: [{
      ...scenario.steps[0],
      result: { kind: "ok", session, intents: [] },
    }],
  } satisfies GoldenTranscript;
  const staleReport = await verifyTranscript({ transcript: staleResult, spec, runner });
  expect(staleReport.ok).toBe(false);
  expect(staleReport.issues[0]?.path).toBe("$.steps[0].result.session");
});

test("updates replace generated fields without writing files", async () => {
  const specJson = { version: 1 } as const;
  const spec = specJson as unknown as BotchartSpec;
  const source = {
    ...transcript,
    steps: [{
      ...transcript.steps[0],
      result: { kind: "ok", session, intents: [] },
    }],
  } satisfies GoldenTranscript;

  const updated = await updateTranscript({
    transcript: source,
    spec,
    runner: () => ({ kind: "ok", session: null, intents: [] }),
  });

  expect(updated.issues).toEqual([]);
  expect(updated.transcript.spec.sha256).toBe(await digestSpec(specJson));
  expect(updated.transcript.steps[0]?.result).toEqual({
    kind: "ok",
    session: null,
    intents: [],
  });
});
