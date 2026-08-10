import { expect, test } from "bun:test";
import { createRunner, createSession, step } from "botchart";
import type { BotchartSpec, CoreResult } from "botchart";
import assignmentSpecJson from "botchart/conformance/specs/guards-and-assignments.json" with { type: "json" };
import lifecycleSpec from "botchart/conformance/specs/session-lifecycle.json" with { type: "json" };
import lifecycleTranscript from "botchart/conformance/transcripts/session-lifecycle.json" with { type: "json" };

const runtimeSpec = lifecycleSpec as BotchartSpec;
const assignmentSpec = assignmentSpecJson as BotchartSpec;

const minimalSpec = {
  initial: "main",
  context: { default: { count: 0 } },
  states: { main: { kind: "state", render: "keep" } },
} as unknown as BotchartSpec;

const namedGuardSpec = {
  initial: "main",
  context: { default: { allowed: true } },
  parameters: {},
  guards: { allowed: {} },
  states: {
    main: {
      kind: "state",
      render: "keep",
      on: {
        message: {
          photo: [
            { when: { guard: "allowed" }, target: "allowed" },
            { target: "blocked" },
          ],
        },
      },
    },
    allowed: { kind: "state", render: "keep" },
    blocked: { kind: "state", render: "keep" },
  },
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

test("a comparing guard selects the first matching transition", () => {
  const spec = {
    initial: "main",
    context: {
      default: { count: 1 },
      properties: { count: { type: "number" } },
      required: ["count"],
    },
    parameters: { limit: { type: "number", default: 2 } },
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: {
          message: {
            photo: [
              {
                when: {
                  compare: {
                    left: { context: "count" },
                    op: "lt",
                    right: { parameter: "limit" },
                  },
                },
                target: "allowed",
              },
              { target: "blocked" },
            ],
          },
        },
      },
      allowed: { kind: "state", render: "keep" },
      blocked: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });

  expect(step({
    spec,
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
    session: { ...current, position: "allowed", seq: 1 },
    intents: [],
  });
});

test("a named guard binding receives the current context and event", () => {
  const current = createSession({ spec: namedGuardSpec });
  const runner = createRunner({
    guards: {
      allowed: ({ context, event }) =>
        context.allowed === true && event.name === "photo",
    },
  });

  expect(runner({
    spec: namedGuardSpec,
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
    session: { ...current, position: "allowed", seq: 1 },
    intents: [],
  });
});

test("a false named guard tries the next transition", () => {
  const current = createSession({ spec: namedGuardSpec });
  const runner = createRunner({ guards: { allowed: () => false } });

  expect(runner({
    spec: namedGuardSpec,
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
    session: { ...current, position: "blocked", seq: 1 },
    intents: [],
  });
});

test("a missing guard binding returns an atomic error", () => {
  const current = createSession({ spec: namedGuardSpec });

  expect(step({
    spec: namedGuardSpec,
    session: current,
    input: {
      origin: "telegram",
      source: "message",
      name: "photo",
      payload: {},
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "error",
    session: current,
    intents: [],
    error: {
      code: "missing_guard_binding",
      path: "$.states.main.on.message.photo[0].when.guard",
      message: "Bind the allowed guard before you run the spec.",
    },
  });
});

test("a failed guard binding returns an atomic error", () => {
  const current = createSession({ spec: namedGuardSpec });
  const unchanged = structuredClone(current);
  const runner = createRunner({
    guards: {
      allowed: ({ context }) => {
        (context as { allowed: boolean }).allowed = false;
        throw new Error("failed");
      },
    },
  });

  expect(runner({
    spec: namedGuardSpec,
    session: current,
    input: {
      origin: "telegram",
      source: "message",
      name: "photo",
      payload: {},
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "error",
    session: unchanged,
    intents: [],
    error: {
      code: "guard_binding_failed",
      path: "$.states.main.on.message.photo[0].when",
      message: "Make the allowed guard return true or false without throwing.",
    },
  });
});

test("a missing comparing guard value returns an atomic error", () => {
  const spec = {
    initial: "main",
    context: {
      default: {},
      properties: { optionalCount: { type: "number" } },
    },
    parameters: {},
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: {
          message: {
            photo: [{
              when: {
                compare: {
                  left: { context: "optionalCount" },
                  op: "eq",
                  right: 1,
                },
              },
              target: "done",
            }],
          },
        },
      },
      done: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });

  expect(step({
    spec,
    session: current,
    input: {
      origin: "telegram",
      source: "message",
      name: "photo",
      payload: {},
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "error",
    session: current,
    intents: [],
    error: {
      code: "missing_guard_value",
      path: "$.states.main.on.message.photo[0].when.compare.left",
      message: "Provide the optionalCount value before this guard runs.",
    },
  });
});

test("complete context validation rejects an assignment batch atomically", () => {
  const current = createSession({ spec: assignmentSpec });
  const runner = createRunner({ validateContext: () => false });

  expect(runner({
    spec: assignmentSpec,
    session: current,
    input: {
      origin: "telegram",
      source: "message",
      name: "document",
      payload: {},
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "error",
    session: current,
    intents: [],
    error: {
      code: "context_validation_failed",
      path: "$.states.main.on.message.document[0].assign",
      message: "Change this assignment batch so the complete context matches $.context.",
    },
  });
});

test("an assignment requires a complete context validator", () => {
  const current = createSession({ spec: assignmentSpec });

  expect(step({
    spec: assignmentSpec,
    session: current,
    input: {
      origin: "telegram",
      source: "message",
      name: "photo",
      payload: { label: "new", products: [] },
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "error",
    session: current,
    intents: [],
    error: {
      code: "missing_context_validator",
      path: "$.states.main.on.message.photo[0].assign",
      message: "Provide validateContext when you create a runner that applies assignments.",
    },
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
