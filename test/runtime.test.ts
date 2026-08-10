import { expect, test } from "bun:test";
import type { CoreResult } from "botchart";

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
