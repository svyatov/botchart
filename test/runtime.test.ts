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

test("session creation follows compound initial states to an atomic leaf", () => {
  const spec = {
    initial: "menu",
    context: { default: {} },
    states: {
      menu: {
        kind: "compound",
        initial: "catalog",
        states: {
          catalog: {
            kind: "compound",
            initial: "list",
            states: { list: { kind: "state", render: "keep" } },
          },
        },
      },
    },
  } as unknown as BotchartSpec;

  expect(createSession({ spec }).position).toBe("menu.catalog.list");
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

test("an external transition follows a compound target to its initial leaf", () => {
  const spec = {
    initial: "start",
    context: { default: {} },
    parameters: {},
    states: {
      start: {
        kind: "state",
        render: "keep",
        on: { message: { photo: [{ target: "menu" }] } },
      },
      menu: {
        kind: "compound",
        initial: "list",
        states: { list: { kind: "state", render: "keep" } },
      },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });

  expect(step({
    spec,
    session: current,
    input: { origin: "telegram", source: "message", name: "photo", payload: {} },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "menu.list", seq: 1 },
    intents: [],
  });
});

test("shallow history restores the last active child", () => {
  const spec = {
    initial: "menu",
    context: { default: {} },
    parameters: {},
    on: {
      message: {
        photo: [{ target: "menu.second" }],
        document: [{ target: "outside" }],
        video: [{ target: "menu" }],
      },
    },
    states: {
      menu: {
        kind: "compound",
        initial: "first",
        history: "shallow",
        states: {
          first: { kind: "state", render: "keep" },
          second: { kind: "state", render: "keep" },
        },
      },
      outside: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const input = (name: string) => ({
    origin: "telegram" as const,
    source: "message",
    name,
    payload: {},
  });
  const first = step({
    spec,
    session: createSession({ spec }),
    input: input("photo"),
    now: "2026-08-10T14:00:00Z",
  });
  if (first.kind !== "ok" || first.session === null) throw new Error("Expected a session.");
  const outside = step({
    spec,
    session: first.session,
    input: input("document"),
    now: "2026-08-10T14:00:01Z",
  });
  if (outside.kind !== "ok" || outside.session === null) throw new Error("Expected a session.");

  expect(outside.session.history).toEqual({ menu: "menu.second" });
  expect(step({
    spec,
    session: outside.session,
    input: input("video"),
    now: "2026-08-10T14:00:02Z",
  })).toEqual({
    kind: "ok",
    session: { ...outside.session, position: "menu.second", seq: 3 },
    intents: [],
  });
});

test("deep history restores the last active leaf", () => {
  const spec = {
    initial: "menu",
    context: { default: {} },
    parameters: {},
    on: {
      message: {
        photo: [{ target: "menu.catalog.detail" }],
        document: [{ target: "outside" }],
        video: [{ target: "menu" }],
      },
    },
    states: {
      menu: {
        kind: "compound",
        initial: "catalog",
        history: "deep",
        states: {
          catalog: {
            kind: "compound",
            initial: "list",
            states: {
              list: { kind: "state", render: "keep" },
              detail: { kind: "state", render: "keep" },
            },
          },
        },
      },
      outside: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const run = (session: ReturnType<typeof createSession>, name: string) => step({
    spec,
    session,
    input: { origin: "telegram", source: "message", name, payload: {} },
    now: "2026-08-10T14:00:00Z",
  });
  const detail = run(createSession({ spec }), "photo");
  if (detail.kind !== "ok" || detail.session === null) throw new Error("Expected a session.");
  const outside = run(detail.session, "document");
  if (outside.kind !== "ok" || outside.session === null) throw new Error("Expected a session.");

  expect(outside.session.history).toEqual({ menu: "menu.catalog.detail" });
  expect(run(outside.session, "video")).toEqual({
    kind: "ok",
    session: { ...outside.session, position: "menu.catalog.detail", seq: 3 },
    intents: [],
  });
});

test("an effect receives one immutable snapshot and stops the entry pipeline", () => {
  const spec = {
    initial: "start",
    context: {
      default: { query: "Ada" },
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    parameters: {},
    effects: {
      first: { input: { query: { type: "string" } }, outcomes: { done: {} } },
      second: { input: {}, outcomes: { done: {} } },
    },
    states: {
      start: {
        kind: "state",
        render: "keep",
        on: { message: { photo: [{ target: "loading" }] } },
      },
      loading: {
        kind: "state",
        render: "keep",
        entry: [
          {
            kind: "run",
            effect: "first",
            input: { query: { context: "query" } },
            outcomes: { done: { assign: {}, do: [{}] } },
          },
          {
            kind: "run",
            effect: "second",
            input: {},
            outcomes: { done: { assign: {}, do: [{}] } },
          },
        ],
      },
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
      payload: { sessionKey: "chat:42" },
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "loading", seq: 1 },
    intents: [{
      kind: "effect",
      id: "chat:42:loading:1:0",
      effect: "first",
      input: { query: "Ada" },
      token: { sessionKey: "chat:42", stateId: "loading", seq: 1 },
    }],
  });
});

test("a non-moving effect outcome continues the entry pipeline", () => {
  const spec = {
    initial: "loading",
    context: { default: {} },
    parameters: {},
    effects: {
      first: { input: {}, outcomes: { done: {} } },
      second: { input: {}, outcomes: { done: {} } },
    },
    states: {
      loading: {
        kind: "state",
        render: "keep",
        entry: [
          {
            kind: "run",
            effect: "first",
            input: {},
            outcomes: { done: { assign: {}, do: [{}] } },
          },
          {
            kind: "run",
            effect: "second",
            input: {},
            outcomes: { done: { assign: {}, do: [{}] } },
          },
        ],
      },
    },
  } as unknown as BotchartSpec;
  const current = { ...createSession({ spec }), seq: 1 };
  const token = { sessionKey: "chat:42", stateId: "loading", seq: 1 } as const;

  expect(step({
    spec,
    session: current,
    input: {
      origin: "effect",
      source: "outcome",
      name: "done",
      payload: {
        id: "chat:42:loading:1:0",
        token,
        output: {},
      },
    },
    now: "2026-08-10T14:00:01Z",
  })).toEqual({
    kind: "ok",
    session: current,
    intents: [{
      kind: "effect",
      id: "chat:42:loading:1:1",
      effect: "second",
      input: {},
      token,
    }],
  });
});

test("a moving effect outcome maps output before it selects a transition", () => {
  const spec = {
    initial: "loading",
    context: {
      default: { status: "pending" },
      properties: { status: { type: "string" } },
      required: ["status"],
    },
    parameters: {},
    effects: {
      load: { input: {}, outcomes: { done: { status: { type: "string" } } } },
      skipped: { input: {}, outcomes: { done: {} } },
    },
    states: {
      loading: {
        kind: "state",
        render: "keep",
        entry: [
          {
            kind: "run",
            effect: "load",
            input: {},
            outcomes: {
              done: {
                assign: { status: { from: "status" } },
                do: [
                  {
                    when: {
                      compare: {
                        left: { context: "status" },
                        op: "eq",
                        right: "ok",
                      },
                    },
                    target: "success",
                  },
                  { target: "failure" },
                ],
              },
            },
          },
          {
            kind: "run",
            effect: "skipped",
            input: {},
            outcomes: { done: { assign: {}, do: [{}] } },
          },
        ],
      },
      success: { kind: "state", render: "keep" },
      failure: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = { ...createSession({ spec }), seq: 1 };
  const runner = createRunner({ validateContext: () => true });

  expect(runner({
    spec,
    session: current,
    input: {
      origin: "effect",
      source: "outcome",
      name: "done",
      payload: {
        id: "chat:42:loading:1:0",
        token: { sessionKey: "chat:42", stateId: "loading", seq: 1 },
        output: { status: "ok" },
      },
    },
    now: "2026-08-10T14:00:01Z",
  })).toEqual({
    kind: "ok",
    session: {
      ...current,
      context: { status: "ok" },
      position: "success",
      seq: 2,
    },
    intents: [],
  });
});

test("effect progress updates context and renders without moving", () => {
  const spec = {
    initial: "loading",
    context: {
      default: { loaded: 0 },
      properties: { loaded: { type: "number" } },
      required: ["loaded"],
    },
    parameters: {},
    effects: {
      load: {
        input: {},
        progress: { loaded: { type: "number" } },
        outcomes: { done: {} },
      },
    },
    states: {
      loading: {
        kind: "state",
        view: { kind: "text", text: ["Loading"], parseMode: "plain" },
        render: "edit",
        entry: [{
          kind: "run",
          effect: "load",
          input: {},
          onProgress: { assign: { loaded: { from: "loaded" } } },
          outcomes: { done: { assign: {}, do: [{}] } },
        }],
      },
    },
  } as unknown as BotchartSpec;
  const current = {
    ...createSession({ spec, target: { kind: "chat", chatId: 42 } }),
    seq: 1,
  };
  const runner = createRunner({ validateContext: () => true });

  expect(runner({
    spec,
    session: current,
    input: {
      origin: "effect",
      source: "progress",
      name: "load",
      payload: {
        id: "chat:42:loading:1:0",
        token: { sessionKey: "chat:42", stateId: "loading", seq: 1 },
        output: { loaded: 1 },
      },
    },
    now: "2026-08-10T14:00:01Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, context: { loaded: 1 } },
    intents: [{
      kind: "view",
      operation: "send",
      slot: "main",
      target: { kind: "chat", chatId: 42 },
      view: { kind: "text", text: ["Loading"], parseMode: "plain" },
    }],
  });
});

test("a missing optional effect output unsets its context field", () => {
  const spec = {
    initial: "loading",
    context: {
      default: { error: "old" },
      properties: { error: { type: "string" } },
      additionalProperties: false,
    },
    parameters: {},
    effects: {
      load: {
        input: {},
        outcomes: { done: { message: { type: "string", optional: true } } },
      },
    },
    states: {
      loading: {
        kind: "state",
        render: "keep",
        entry: [{
          kind: "run",
          effect: "load",
          input: {},
          outcomes: {
            done: {
              assign: { error: { from: "message" } },
              do: [{}],
            },
          },
        }],
      },
    },
  } as unknown as BotchartSpec;
  const current = { ...createSession({ spec }), seq: 1 };
  const runner = createRunner({ validateContext: () => true });

  expect(runner({
    spec,
    session: current,
    input: {
      origin: "effect",
      source: "outcome",
      name: "done",
      payload: {
        id: "chat:42:loading:1:0",
        token: { sessionKey: "chat:42", stateId: "loading", seq: 1 },
        output: {},
      },
    },
    now: "2026-08-10T14:00:01Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, context: {} },
    intents: [],
  });
});

test("effect feedback requires every declared output field", () => {
  const spec = {
    initial: "loading",
    context: {
      default: { error: "" },
      properties: { error: { type: "string" } },
      required: ["error"],
    },
    parameters: {},
    effects: {
      load: { input: {}, outcomes: { failed: { message: { type: "string" } } } },
    },
    states: {
      loading: {
        kind: "state",
        render: "keep",
        entry: [{
          kind: "run",
          effect: "load",
          input: {},
          outcomes: {
            failed: {
              assign: { error: { from: "message" } },
              do: [{}],
            },
          },
        }],
      },
    },
  } as unknown as BotchartSpec;
  const current = { ...createSession({ spec }), seq: 1 };
  const runner = createRunner({ validateContext: () => true });

  expect(runner({
    spec,
    session: current,
    input: {
      origin: "effect",
      source: "outcome",
      name: "failed",
      payload: {
        id: "chat:42:loading:1:0",
        token: { sessionKey: "chat:42", stateId: "loading", seq: 1 },
        output: {},
      },
    },
    now: "2026-08-10T14:00:01Z",
  })).toEqual({
    kind: "error",
    session: current,
    intents: [],
    error: {
      code: "invalid_feedback",
      path: "$.input.payload.output.message",
      message: "Provide the required message effect output.",
    },
  });
});

test("feedback from an exited state is stale", () => {
  const spec = {
    initial: "done",
    context: { default: {} },
    parameters: {},
    effects: { load: { input: {}, outcomes: { done: {} } } },
    states: {
      loading: {
        kind: "state",
        render: "keep",
        entry: [{
          kind: "run",
          effect: "load",
          input: {},
          outcomes: { done: { assign: {}, do: [{}] } },
        }],
      },
      done: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = { ...createSession({ spec }), seq: 2 };

  expect(step({
    spec,
    session: current,
    input: {
      origin: "effect",
      source: "outcome",
      name: "done",
      payload: {
        id: "chat:42:loading:1:0",
        token: { sessionKey: "chat:42", stateId: "loading", seq: 1 },
        output: {},
      },
    },
    now: "2026-08-10T14:00:01Z",
  })).toEqual({ kind: "ok", session: current, intents: [] });
});

test("effect feedback rejects an undeclared outcome", () => {
  const spec = {
    initial: "loading",
    context: { default: {} },
    parameters: {},
    effects: { load: { input: {}, outcomes: { done: {} } } },
    states: {
      loading: {
        kind: "state",
        render: "keep",
        entry: [{
          kind: "run",
          effect: "load",
          input: {},
          outcomes: { done: { assign: {}, do: [{}] } },
        }],
      },
    },
  } as unknown as BotchartSpec;
  const current = { ...createSession({ spec }), seq: 1 };

  expect(step({
    spec,
    session: current,
    input: {
      origin: "effect",
      source: "outcome",
      name: "failed",
      payload: {
        id: "chat:42:loading:1:0",
        token: { sessionKey: "chat:42", stateId: "loading", seq: 1 },
        output: {},
      },
    },
    now: "2026-08-10T14:00:01Z",
  })).toEqual({
    kind: "error",
    session: current,
    intents: [],
    error: {
      code: "invalid_feedback",
      path: "$.input.name",
      message: "Use a declared effect outcome.",
    },
  });
});

test("effect feedback rejects an unknown payload field", () => {
  const spec = {
    initial: "loading",
    context: { default: {} },
    parameters: {},
    effects: { load: { input: {}, outcomes: { done: {} } } },
    states: {
      loading: {
        kind: "state",
        render: "keep",
        entry: [{
          kind: "run",
          effect: "load",
          input: {},
          outcomes: { done: { assign: {}, do: [{}] } },
        }],
      },
    },
  } as unknown as BotchartSpec;
  const current = { ...createSession({ spec }), seq: 1 };

  expect(step({
    spec,
    session: current,
    input: {
      origin: "effect",
      source: "outcome",
      name: "done",
      payload: {
        id: "chat:42:loading:1:0",
        token: { sessionKey: "chat:42", stateId: "loading", seq: 1 },
        output: {},
        attempt: 1,
      },
    },
    now: "2026-08-10T14:00:01Z",
  })).toEqual({
    kind: "error",
    session: current,
    intents: [],
    error: {
      code: "invalid_feedback",
      path: "$.input.payload.attempt",
      message: "Remove the attempt effect feedback field.",
    },
  });
});

test("a unit call stores immutable input and suspends its caller", () => {
  const spec = {
    initial: "start",
    context: {
      default: { query: "Ada" },
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    parameters: {},
    units: {
      lookup: {
        input: { query: { type: "string" } },
        output: { result: { type: "string" } },
        initial: "waiting",
        states: { waiting: { kind: "state", render: "keep" } },
      },
    },
    states: {
      start: {
        kind: "state",
        render: "keep",
        on: { message: { photo: [{ target: "caller" }] } },
      },
      caller: {
        kind: "state",
        render: "keep",
        entry: [{
          kind: "call",
          unit: "lookup",
          input: { query: { context: "query" } },
          onReturn: { assign: { query: { from: "result" } }, do: [{}] },
        }],
      },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });

  expect(step({
    spec,
    session: current,
    input: { origin: "telegram", source: "message", name: "photo", payload: {} },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: {
      ...current,
      position: "waiting",
      callStack: [{
        unit: "lookup",
        input: { query: "Ada" },
        caller: { stateId: "caller", entryIndex: 0 },
      }],
      seq: 2,
    },
    intents: [],
  });
});

test("a unit return maps every output before it selects onReturn", () => {
  const spec = {
    initial: "start",
    context: {
      default: { query: "Ada", result: "" },
      properties: { query: { type: "string" }, result: { type: "string" } },
      required: ["query", "result"],
    },
    parameters: {},
    units: {
      lookup: {
        input: { query: { type: "string" } },
        output: { result: { type: "string" } },
        initial: "waiting",
        states: {
          waiting: {
            kind: "state",
            render: "keep",
            on: {
              message: {
                document: [{ assign: { query: "Grace" }, target: "done" }],
              },
            },
          },
          done: { kind: "return", output: { result: { input: "query" } } },
        },
      },
    },
    states: {
      start: {
        kind: "state",
        render: "keep",
        on: { message: { photo: [{ target: "caller" }] } },
      },
      caller: {
        kind: "state",
        render: "keep",
        entry: [{
          kind: "call",
          unit: "lookup",
          input: { query: { context: "query" } },
          onReturn: {
            assign: { result: { from: "result" } },
            do: [
              {
                when: { compare: { left: { context: "result" }, op: "eq", right: "Ada" } },
                target: "success",
              },
              { target: "failure" },
            ],
          },
        }],
      },
      success: { kind: "state", render: "keep" },
      failure: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const runner = createRunner({ validateContext: () => true });
  const called = runner({
    spec,
    session: createSession({ spec }),
    input: { origin: "telegram", source: "message", name: "photo", payload: {} },
    now: "2026-08-10T14:00:00Z",
  });
  if (called.kind !== "ok" || called.session === null) throw new Error("Expected a session.");

  expect(runner({
    spec,
    session: called.session,
    input: { origin: "telegram", source: "message", name: "document", payload: {} },
    now: "2026-08-10T14:00:01Z",
  })).toEqual({
    kind: "ok",
    session: {
      ...called.session,
      position: "success",
      context: { query: "Grace", result: "Ada" },
      callStack: [],
      seq: 4,
    },
    intents: [],
  });
});

test("nested unit calls share one call stack", () => {
  const unit = (states: Record<string, unknown>) => ({
    input: { value: { type: "string" } },
    output: { value: { type: "string" } },
    initial: "working",
    states,
  });
  const spec = {
    initial: "start",
    context: {
      default: { value: "Ada" },
      properties: { value: { type: "string" } },
      required: ["value"],
    },
    parameters: {},
    units: {
      outer: unit({
        working: {
          kind: "state",
          render: "keep",
          entry: [{
            kind: "call",
            unit: "inner",
            input: { value: { input: "value" } },
            onReturn: { assign: { value: { from: "value" } }, do: [{}] },
          }],
        },
      }),
      inner: {
        ...unit({ waiting: { kind: "state", render: "keep" } }),
        initial: "waiting",
      },
    },
    states: {
      start: {
        kind: "state",
        render: "keep",
        on: { message: { photo: [{ target: "caller" }] } },
      },
      caller: {
        kind: "state",
        render: "keep",
        entry: [{
          kind: "call",
          unit: "outer",
          input: { value: { context: "value" } },
          onReturn: { assign: { value: { from: "value" } }, do: [{}] },
        }],
      },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });

  expect(step({
    spec,
    session: current,
    input: { origin: "telegram", source: "message", name: "photo", payload: {} },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: {
      ...current,
      position: "waiting",
      callStack: [
        {
          unit: "outer",
          input: { value: "Ada" },
          caller: { stateId: "caller", entryIndex: 0 },
        },
        {
          unit: "inner",
          input: { value: "Ada" },
          caller: { stateId: "working", entryIndex: 0 },
        },
      ],
      seq: 3,
    },
    intents: [],
  });
});

test("a recursive unit call fails atomically", () => {
  const call = (unit: string) => ({
    kind: "call",
    unit,
    input: {},
    onReturn: { assign: {}, do: [{}] },
  });
  const spec = {
    initial: "start",
    context: { default: {} },
    parameters: {},
    units: {
      outer: {
        input: {},
        output: {},
        initial: "working",
        states: { working: { kind: "state", render: "keep", entry: [call("inner")] } },
      },
      inner: {
        input: {},
        output: {},
        initial: "waiting",
        states: { waiting: { kind: "state", render: "keep", entry: [call("outer")] } },
      },
    },
    states: {
      start: {
        kind: "state",
        render: "keep",
        on: { message: { photo: [{ target: "caller" }] } },
      },
      caller: { kind: "state", render: "keep", entry: [call("outer")] },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });

  expect(step({
    spec,
    session: current,
    input: { origin: "telegram", source: "message", name: "photo", payload: {} },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "error",
    session: current,
    intents: [],
    error: {
      code: "recursive_unit_call",
      path: "$.units.inner.states.waiting.entry[0].unit",
      message: "Remove the call cycle that re-enters the outer unit.",
    },
  });
});

test("a non-moving unit return continues the caller entry pipeline", () => {
  const spec = {
    initial: "start",
    context: {
      default: { seed: "Ada", first: "" },
      properties: { seed: { type: "string" }, first: { type: "string" } },
      required: ["seed", "first"],
    },
    parameters: {},
    units: {
      first: {
        input: { value: { type: "string" } },
        output: { value: { type: "string" } },
        initial: "done",
        states: { done: { kind: "return", output: { value: { input: "value" } } } },
      },
      second: {
        input: { value: { type: "string" } },
        output: {},
        initial: "waiting",
        states: { waiting: { kind: "state", render: "keep" } },
      },
    },
    states: {
      start: {
        kind: "state",
        render: "keep",
        on: { message: { photo: [{ target: "caller" }] } },
      },
      caller: {
        kind: "state",
        render: "keep",
        entry: [
          {
            kind: "call",
            unit: "first",
            input: { value: { context: "seed" } },
            onReturn: { assign: { first: { from: "value" } }, do: [{}] },
          },
          {
            kind: "call",
            unit: "second",
            input: { value: { context: "first" } },
            onReturn: { assign: {}, do: [{}] },
          },
        ],
      },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });
  const runner = createRunner({ validateContext: () => true });

  expect(runner({
    spec,
    session: current,
    input: { origin: "telegram", source: "message", name: "photo", payload: {} },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: {
      ...current,
      position: "waiting",
      context: { seed: "Ada", first: "Ada" },
      callStack: [{
        unit: "second",
        input: { value: "Ada" },
        caller: { stateId: "caller", entryIndex: 1 },
      }],
      seq: 3,
    },
    intents: [],
  });
});

test("a compound entry runs before its initial child enters", () => {
  const spec = {
    initial: "start",
    context: { default: {} },
    parameters: {},
    units: {
      probe: {
        input: {},
        output: {},
        initial: "waiting",
        states: {
          waiting: {
            kind: "state",
            render: "keep",
            on: { message: { document: [{ target: "done" }] } },
          },
          done: { kind: "return", output: {} },
        },
      },
    },
    states: {
      start: {
        kind: "state",
        render: "keep",
        on: { message: { photo: [{ target: "menu" }] } },
      },
      menu: {
        kind: "compound",
        initial: "list",
        entry: [{
          kind: "call",
          unit: "probe",
          input: {},
          onReturn: { assign: {}, do: [{}] },
        }],
        states: { list: { kind: "state", render: "keep" } },
      },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });
  const called = step({
    spec,
    session: current,
    input: { origin: "telegram", source: "message", name: "photo", payload: {} },
    now: "2026-08-10T14:00:00Z",
  });

  expect(called).toEqual({
    kind: "ok",
    session: {
      ...current,
      position: "waiting",
      callStack: [{
        unit: "probe",
        input: {},
        caller: { stateId: "menu", entryIndex: 0 },
      }],
      seq: 2,
    },
    intents: [],
  });
  if (called.kind !== "ok" || called.session === null) throw new Error("Expected a session.");
  expect(step({
    spec,
    session: called.session,
    input: { origin: "telegram", source: "message", name: "document", payload: {} },
    now: "2026-08-10T14:00:01Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "menu.list", seq: 3 },
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

test("an event bubbles from the active leaf to the root", () => {
  const spec = {
    initial: "menu",
    context: { default: {} },
    parameters: {},
    on: {
      message: { photo: [{ target: "done" }] },
    },
    states: {
      menu: {
        kind: "compound",
        initial: "list",
        states: {
          list: { kind: "state", render: "keep" },
        },
      },
      done: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = {
    ...createSession({ spec }),
    position: "menu.list",
  };

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
    session: { ...current, position: "done", seq: 1 },
    intents: [],
  });
});

test("a press selects the first matching transition", () => {
  const spec = {
    initial: "main",
    context: { default: {} },
    parameters: {},
    on: {},
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: {
          press: {
            pick: [
              { when: { compare: { left: 1, op: "eq", right: 2 } }, target: "wrong" },
              { target: "done" },
            ],
          },
        },
      },
      wrong: { kind: "state", render: "keep" },
      done: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });

  expect(step({
    spec,
    session: current,
    input: {
      origin: "telegram",
      source: "press",
      name: "pick",
      payload: {},
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "done", seq: 1 },
    intents: [],
  });
});

test("a normalized bare command name routes to its handler", () => {
  const spec = {
    initial: "main",
    context: { default: {} },
    parameters: {},
    on: {},
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: {
          command: {
            start: { do: [{ target: "done" }] },
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
      source: "command",
      name: "start",
      payload: { remainder: "catalog" },
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "done", seq: 1 },
    intents: [],
  });
});

test("ordered text patterns expose named captures to assignments", () => {
  const spec = {
    initial: "main",
    context: {
      default: { name: "" },
      properties: { name: { type: "string" } },
      required: ["name"],
    },
    parameters: {},
    on: {},
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: {
          text: [
            { pattern: "^skip$", do: [{ target: "wrong" }] },
            {
              pattern: "^hello (?<name>[A-Za-z]+)$",
              do: [{ assign: { name: { from: "name" } }, target: "done" }],
            },
          ],
        },
      },
      wrong: { kind: "state", render: "keep" },
      done: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });
  const runner = createRunner({ validateContext: () => true });

  expect(runner({
    spec,
    session: current,
    input: {
      origin: "telegram",
      source: "text",
      name: "message",
      payload: { text: "hello Ada" },
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: {
      ...current,
      context: { name: "Ada" },
      position: "done",
      seq: 1,
    },
    intents: [],
  });
});

test("the first matching text pattern stops later patterns at that state", () => {
  const spec = {
    initial: "main",
    context: { default: {} },
    parameters: {},
    on: {
      text: [{ pattern: "^hello$", do: [{ target: "done" }] }],
    },
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: {
          text: [
            {
              pattern: "^hello$",
              do: [{ when: { compare: { left: 1, op: "eq", right: 2 } } }],
            },
            { pattern: "^hello$", do: [{ target: "wrong" }] },
          ],
        },
      },
      wrong: { kind: "state", render: "keep" },
      done: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });

  expect(step({
    spec,
    session: current,
    input: {
      origin: "telegram",
      source: "text",
      name: "message",
      payload: { text: "hello" },
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "done", seq: 1 },
    intents: [],
  });
});

test("a command pattern matches its preserved remainder and exposes captures", () => {
  const spec = {
    initial: "main",
    context: {
      default: { referrer: "" },
      properties: { referrer: { type: "string" } },
      required: ["referrer"],
    },
    parameters: {},
    on: {},
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: {
          command: {
            start: {
              pattern: "^ref_(?<referrer>[a-z]+)$",
              do: [{ assign: { referrer: { from: "referrer" } }, target: "done" }],
            },
          },
        },
      },
      done: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });
  const runner = createRunner({ validateContext: () => true });

  expect(runner({
    spec,
    session: current,
    input: {
      origin: "telegram",
      source: "command",
      name: "start",
      payload: { remainder: "ref_alice" },
    },
    now: "2026-08-10T14:00:00Z",
  })).toEqual({
    kind: "ok",
    session: {
      ...current,
      context: { referrer: "alice" },
      position: "done",
      seq: 1,
    },
    intents: [],
  });
});

test("a timer routes through its named after handler", () => {
  const spec = {
    initial: "main",
    context: { default: {} },
    parameters: {},
    on: {},
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: {
          after: {
            remind: { delay: "1m", do: [{ target: "done" }] },
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
      origin: "scheduler",
      source: "timer",
      name: "remind",
      payload: { timerId: "timer:1" },
    },
    now: "2026-08-10T14:01:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "done", seq: 1 },
    intents: [],
  });
});

test("a lifecycle event routes through its distinct source", () => {
  const spec = {
    initial: "main",
    context: { default: {} },
    parameters: {},
    on: {
      lifecycle: { blocked: [{ target: "done" }] },
    },
    states: {
      main: { kind: "state", render: "keep" },
      done: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });

  expect(step({
    spec,
    session: current,
    input: {
      origin: "adapter",
      source: "lifecycle",
      name: "blocked",
      payload: { chainId: "failure:1" },
    },
    now: "2026-08-10T14:01:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "done", seq: 1 },
    intents: [],
  });
});

test("raw passthrough runs after a normal source has no match", () => {
  const spec = {
    initial: "main",
    context: { default: {} },
    parameters: {},
    guards: { isAlbum: {} },
    on: {},
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: {
          raw: [
            { when: { guard: "isAlbum" }, do: [{ target: "done" }] },
          ],
        },
      },
      done: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });
  const runner = createRunner({ guards: { isAlbum: () => true } });

  expect(runner({
    spec,
    session: current,
    input: {
      origin: "telegram",
      source: "message",
      name: "photo",
      payload: { mediaGroupId: "album:1" },
    },
    now: "2026-08-10T14:01:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "done", seq: 1 },
    intents: [],
  });
});

test("a registered feature source routes before raw passthrough", () => {
  const spec = {
    initial: "main",
    context: { default: {} },
    parameters: {},
    packs: [{ id: "https://example.com/web-app", version: "1.0.0" }],
    on: {},
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: {
          webApp: {
            submitted: [{ target: "done" }],
          },
          raw: [{ do: [{ target: "wrong" }] }],
        },
      },
      wrong: { kind: "state", render: "keep" },
      done: { kind: "state", render: "keep" },
    },
  } as unknown as BotchartSpec;
  const current = createSession({ spec });

  expect(step({
    spec,
    session: current,
    input: {
      origin: "telegram",
      source: "webApp",
      name: "submitted",
      payload: { data: "confirmed" },
    },
    now: "2026-08-10T14:01:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "done", seq: 1 },
    intents: [],
  });
});

test("an unmatched normal event emits one unhandled lifecycle event", () => {
  const spec = {
    initial: "main",
    context: { default: {} },
    parameters: {},
    on: {
      lifecycle: { unhandled: [{ target: "done" }] },
    },
    states: {
      main: { kind: "state", render: "keep" },
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
      payload: { fileId: "photo:1" },
    },
    now: "2026-08-10T14:01:00Z",
  })).toEqual({
    kind: "ok",
    session: { ...current, position: "done", seq: 1 },
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
