import { expect, test } from "bun:test";
import { createSession, step } from "botchart";
import type { BotchartSpec, CoreRunner } from "botchart";
import { replayTranscript, simulateConversation } from "botchart/simulator";
import type { GoldenTranscript } from "botchart/simulator";

const finalSpec = {
  initial: "main",
  context: { default: {} },
  states: {
    main: {
      kind: "state",
      render: "keep",
      on: { message: { photo: [{ target: "done" }] } },
    },
    done: { kind: "final", render: "delete" },
  },
} as unknown as BotchartSpec;

const timerSpec = {
  initial: "main",
  context: { default: {} },
  states: {
    main: {
      kind: "state",
      render: "keep",
      on: { message: { photo: [{ target: "waiting" }] } },
    },
    waiting: {
      kind: "state",
      render: "keep",
      on: {
        after: {
          remind: { delay: "1m", do: [{ target: "done" }] },
        },
      },
    },
    done: { kind: "final", render: "delete" },
  },
} as unknown as BotchartSpec;

const effectSpec = {
  initial: "main",
  context: { default: {} },
  effects: { load: { input: {}, outcomes: { done: {} } } },
  states: {
    main: {
      kind: "state",
      render: "keep",
      on: { message: { photo: [{ target: "loading" }] } },
    },
    loading: {
      kind: "state",
      render: "keep",
      entry: [{
        kind: "run",
        effect: "load",
        input: {},
        outcomes: { done: { assign: {}, do: [{ target: "done" }] } },
      }],
    },
    done: { kind: "final", render: "delete" },
  },
} as unknown as BotchartSpec;

test("conversation simulation generates a valid golden transcript", async () => {
  const result = await simulateConversation({
    name: "finish from a photo",
    spec: finalSpec,
    specPath: "../specs/final.json",
    runner: step,
    initial: {
      session: createSession({ spec: finalSpec }),
      now: "2026-08-11T12:00:00Z",
    },
    steps: [{
      name: "receive a photo",
      input: {
        origin: "telegram",
        source: "message",
        name: "photo",
        payload: {},
      },
      covers: ["simulator.generation.final"],
    }],
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.transcript.steps[0]?.result).toEqual({
    kind: "ok",
    session: null,
    intents: [],
  });
  expect(result.transcript.spec.sha256).toHaveLength(64);
});

test("conversation simulation advances time and records atomic core errors", async () => {
  const initial = createSession({ spec: finalSpec });
  const times: string[] = [];
  const runner: CoreRunner = (request) => {
    times.push(request.now);
    return times.length === 1
      ? {
          kind: "error",
          session: request.session,
          intents: [],
          error: {
            code: "invalid_input",
            path: "$.input",
            message: "Use a supported input.",
          },
        }
      : { kind: "ok", session: null, intents: [] };
  };
  const result = await simulateConversation({
    name: "recover from invalid input",
    spec: finalSpec,
    specPath: "../specs/final.json",
    runner,
    initial: { session: initial, now: "2026-08-11T12:00:00Z" },
    steps: [
      {
        name: "reject input",
        input: {
          origin: "adapter",
          source: "lifecycle",
          name: "error",
          payload: {},
        },
        advance: "30s",
        covers: ["simulator.error.atomic"],
      },
      {
        name: "finish session",
        input: {
          origin: "telegram",
          source: "message",
          name: "photo",
          payload: {},
        },
        advance: "1m",
        covers: ["simulator.session.final"],
      },
    ],
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.transcript.steps[0]?.result).toEqual({
    kind: "error",
    session: initial,
    intents: [],
    error: {
      code: "invalid_input",
      path: "$.input",
      message: "Use a supported input.",
    },
  });
  expect(result.transcript.steps[1]?.result.session).toBeNull();
  expect(times).toEqual([
    "2026-08-11T12:00:30.000Z",
    "2026-08-11T12:01:30.000Z",
  ]);
});

test("conversation simulation rejects an invalid plan before it runs", async () => {
  let ran = false;
  const result = await simulateConversation({
    name: "invalid time",
    spec: finalSpec,
    specPath: "../specs/final.json",
    runner: () => {
      ran = true;
      return { kind: "ok", session: null, intents: [] };
    },
    initial: {
      session: createSession({ spec: finalSpec }),
      now: "2026-08-11T15:00:00+03:00",
    },
    steps: [{
      name: "finish",
      input: {
        origin: "telegram",
        source: "message",
        name: "photo",
        payload: {},
      },
      covers: ["simulator.plan.time"],
    }],
  });

  expect(result).toEqual({
    ok: false,
    issues: [{
      code: "invalid_value",
      path: "$.initial.now",
      message: "Set now to an RFC 3339 UTC time.",
    }],
  });
  expect(ran).toBe(false);
});

test("transcript replay starts from a named step snapshot", () => {
  const initial = createSession({ spec: finalSpec });
  const afterFirst = { ...initial, position: "second" as const, seq: 1 };
  const afterSecond = { ...initial, position: "third" as const, seq: 2 };
  const input = {
    origin: "telegram",
    source: "message",
    name: "photo",
    payload: {},
  } as const;
  const transcript = {
    $schema: "https://svyatov.github.io/botchart/conformance/0.1.0/transcript.schema.json",
    transcriptVersion: 1,
    schemaRevision: "0.1.0",
    name: "random access",
    spec: { path: "../specs/final.json", sha256: "a".repeat(64) },
    initial: { session: initial, now: "2026-08-11T12:00:00Z" },
    steps: [
      {
        name: "first",
        input,
        advance: "10s",
        covers: ["simulator.random.first"],
        result: { kind: "ok", session: afterFirst, intents: [] },
      },
      {
        name: "second",
        input,
        advance: "20s",
        covers: ["simulator.random.second"],
        result: { kind: "ok", session: afterSecond, intents: [] },
      },
      {
        name: "third",
        input,
        advance: "30s",
        covers: ["simulator.random.third"],
        result: { kind: "ok", session: null, intents: [] },
      },
    ],
  } satisfies GoldenTranscript;
  const requests: Parameters<CoreRunner>[0][] = [];
  const runner: CoreRunner = (request) => {
    requests.push(request);
    return request.session.position === "second"
      ? { kind: "ok", session: afterSecond, intents: [] }
      : { kind: "ok", session: null, intents: [] };
  };

  const replay = replayTranscript({
    transcript,
    spec: finalSpec,
    runner,
    startAt: "second",
  });

  expect(replay.issues).toEqual([]);
  expect(requests.map(({ session, now }) => [session.position, now])).toEqual([
    ["second", "2026-08-11T12:00:30.000Z"],
    ["third", "2026-08-11T12:01:00.000Z"],
  ]);
});

test("random access restores a stable timer id from the recorded prefix", async () => {
  const token = { sessionKey: "chat:42", stateId: "waiting" as const, seq: 1 };
  const generated = await simulateConversation({
    name: "fire a timer",
    spec: timerSpec,
    specPath: "../specs/timer.json",
    runner: step,
    initial: {
      session: createSession({ spec: timerSpec }),
      now: "2026-08-11T12:00:00Z",
    },
    steps: [
      {
        name: "schedule timer",
        input: {
          origin: "telegram",
          source: "message",
          name: "photo",
          payload: { sessionKey: "chat:42" },
        },
        covers: ["simulator.random.timerSchedule"],
      },
      {
        name: "fire timer",
        input: {
          origin: "scheduler",
          source: "timer",
          name: "remind",
          payload: { id: "timer:1", token },
        },
        advance: "1m",
        covers: ["simulator.random.timerFire"],
      },
    ],
  });
  expect(generated.ok).toBe(true);
  if (!generated.ok) return;

  const replay = replayTranscript({
    transcript: generated.transcript,
    spec: timerSpec,
    runner: step,
    startAt: "fire timer",
  });

  expect(replay.issues).toEqual([]);
  expect(replay.transcript.steps[1]?.result.session).toBeNull();
});

test("random access restores a stable effect id from the recorded prefix", async () => {
  const token = { sessionKey: "chat:42", stateId: "loading" as const, seq: 1 };
  const generated = await simulateConversation({
    name: "finish an effect",
    spec: effectSpec,
    specPath: "../specs/effect.json",
    runner: step,
    initial: {
      session: createSession({ spec: effectSpec }),
      now: "2026-08-11T12:00:00Z",
    },
    steps: [
      {
        name: "start effect",
        input: {
          origin: "telegram",
          source: "message",
          name: "photo",
          payload: { sessionKey: "chat:42" },
        },
        covers: ["simulator.random.effectStart"],
      },
      {
        name: "finish effect",
        input: {
          origin: "effect",
          source: "outcome",
          name: "done",
          payload: { id: "effect:1", token, output: {} },
        },
        covers: ["simulator.random.effectFinish"],
      },
    ],
  });
  expect(generated.ok).toBe(true);
  if (!generated.ok) return;

  const replay = replayTranscript({
    transcript: generated.transcript,
    spec: effectSpec,
    runner: step,
    startAt: "finish effect",
  });

  expect(replay.issues).toEqual([]);
  expect(replay.transcript.steps[1]?.result.session).toBeNull();
});

test("random access preserves callback numbering after retired callbacks", () => {
  const initial = createSession({ spec: finalSpec });
  const callback = (stateId: "main" | "second") => ({
    sessionKey: "chat:42",
    stateId,
    seq: stateId === "main" ? 0 : 2,
    viewSlot: "main",
    viewRevision: 1,
    press: "next",
    payload: {},
    durable: false,
  });
  const withFirst = {
    ...initial,
    callbacks: { "callback:1": callback("main") },
  };
  const retired = { ...initial, position: "between" as const, seq: 1 };
  const withSecond = {
    ...initial,
    position: "second" as const,
    seq: 2,
    callbacks: { "callback:2": callback("second") },
  };
  const input = {
    origin: "telegram",
    source: "message",
    name: "photo",
    payload: {},
  } as const;
  const transcript = {
    $schema: "https://svyatov.github.io/botchart/conformance/0.1.0/transcript.schema.json",
    transcriptVersion: 1,
    schemaRevision: "0.1.0",
    name: "callback counter random access",
    spec: { path: "../specs/callbacks.json", sha256: "a".repeat(64) },
    initial: { session: initial, now: "2026-08-11T12:00:00Z" },
    steps: [
      {
        name: "render first callback",
        input,
        covers: ["simulator.random.callbackFirst"],
        result: { kind: "ok", session: withFirst, intents: [] },
      },
      {
        name: "retire first callback",
        input,
        covers: ["simulator.random.callbackRetire"],
        result: { kind: "ok", session: retired, intents: [] },
      },
      {
        name: "render second callback",
        input,
        covers: ["simulator.random.callbackSecond"],
        result: { kind: "ok", session: withSecond, intents: [] },
      },
    ],
  } satisfies GoldenTranscript;
  const runner: CoreRunner = () => ({
    kind: "ok",
    session: {
      ...withSecond,
      callbacks: { "c2.1.0": callback("second") },
    },
    intents: [],
  });

  const replay = replayTranscript({
    transcript,
    spec: finalSpec,
    runner,
    startAt: "render second callback",
  });

  expect(replay.issues).toEqual([]);
});
