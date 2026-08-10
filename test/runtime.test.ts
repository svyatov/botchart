import { expect, test } from "bun:test";
import { createSession, step } from "botchart";
import type { BotchartSpec, CoreResult } from "botchart";
import lifecycleSpec from "botchart/conformance/specs/session-lifecycle.json" with { type: "json" };
import lifecycleTranscript from "botchart/conformance/transcripts/session-lifecycle.json" with { type: "json" };

const runtimeSpec = lifecycleSpec as BotchartSpec;

const minimalSpec = {
  initial: "main",
  context: { default: { count: 0 } },
  states: { main: { kind: "state", render: "keep" } },
} as unknown as BotchartSpec;

test("session creation enters the initial state with default context", () => {
  expect(createSession({ spec: minimalSpec })).toEqual({
    position: "main",
    context: { count: 0 },
    history: {},
    callStack: [],
    seq: 0,
    viewSlots: {},
    callbacks: {},
  });
});

test("session creation records an initial message target", () => {
  expect(createSession({
    spec: minimalSpec,
    target: { kind: "chat", chatId: 42 },
  }).viewSlots).toEqual({
    main: {
      target: { kind: "chat", chatId: 42 },
      revision: 0,
    },
  });
});

test("the lifecycle transcript starts from a created session", () => {
  expect(createSession({
    spec: runtimeSpec,
    target: { kind: "chat", chatId: 42 },
  })).toEqual(lifecycleTranscript.initial.session);
});

test("an external transition changes state and bumps the sequence", () => {
  const current = createSession({ spec: runtimeSpec });

  expect(step({
    spec: runtimeSpec,
    session: current,
    input: {
      origin: "telegram",
      source: "message",
      name: "document",
      payload: {},
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "left.child", seq: 1 },
    intents: [],
  });
});

test("a final state emits its view operation before session removal", () => {
  const current = {
    ...createSession({
      spec: runtimeSpec,
      target: { kind: "chat", chatId: 42 },
    }),
    position: "right.child",
    seq: 3,
  };

  expect(step({
    spec: runtimeSpec,
    session: current,
    input: {
      origin: "telegram",
      source: "message",
      name: "photo",
      payload: {},
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: null,
    intents: [{
      kind: "view",
      operation: "send",
      slot: "main",
      target: { kind: "chat", chatId: 42 },
      view: { kind: "text", text: ["Done"], parseMode: "plain" },
    }],
  });
});

test("an external transition exits and enters the target state path", () => {
  const current = {
    ...createSession({ spec: runtimeSpec }),
    position: "left.child",
  };

  expect(step({
    spec: runtimeSpec,
    session: current,
    input: {
      origin: "telegram",
      source: "message",
      name: "document",
      payload: {},
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "right.child", seq: 1 },
    intents: [],
  });
});

const session = {
  position: "catalog.list",
  context: { page: 2 },
  history: { catalog: "catalog.list" },
  callStack: [],
  seq: 3,
  viewSlots: {
    main: {
      target: { kind: "chat", chatId: 42 },
      revision: 2,
      current: {
        handle: { kind: "chat", chatId: 42, messageId: 7 },
        viewKind: "text",
      },
    },
  },
  callbacks: {
    "callback:1": {
      sessionKey: "chat:42",
      stateId: "catalog.list",
      seq: 3,
      viewSlot: "main",
      viewRevision: 2,
      press: "pick",
      payload: { id: "first" },
      durable: false,
    },
  },
} as const;

test("public runtime data survives a JSON round trip", () => {
  const result = {
    kind: "ok",
    session,
    intents: [
      {
        kind: "effect",
        id: "effect:1",
        effect: "loadProducts",
        input: { query: "all" },
        token: {
          sessionKey: "chat:42",
          stateId: "catalog.list",
          seq: 3,
        },
      },
    ],
  } satisfies CoreResult;

  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});

test("a failed result preserves the session and has no intents", () => {
  const result = {
    kind: "error",
    session,
    intents: [],
    error: {
      code: "projection_limit",
      path: "$.states.catalog.view.keyboard[0]",
      message: "Reduce the projected items to 20 or fewer.",
    },
  } satisfies CoreResult;

  expect(result.session).toBe(session);
  expect(result.intents).toEqual([]);
  expect(result.error).toEqual({
    message: "Reduce the projected items to 20 or fewer.",
    code: "projection_limit",
    path: "$.states.catalog.view.keyboard[0]",
  });
});
