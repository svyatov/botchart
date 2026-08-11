import { expect, test } from "bun:test";
import { createSession } from "botchart";
import type { BotchartSpec, CoreRunnerRequest } from "botchart";
import {
  CoreRunnerError,
  createBotchartMiddleware,
  IntentExecutionError,
  memoryStorage,
  SessionKeyError,
  SessionStorageError,
} from "../src/index.js";
import { Bot, Context } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";

const botInfo = {
  id: 9001,
  is_bot: true,
  first_name: "Botchart",
  username: "botchart_test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe;

const spec = {
  scope: "chat+user",
  initial: "main",
  context: { default: {} },
  states: { main: { kind: "state", render: "keep" } },
} as unknown as BotchartSpec;

function createTestBot() {
  const calls: Array<{ method: string; payload: unknown }> = [];
  const bot = new Bot("test", { botInfo });
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: true } as never;
  });
  return { bot, calls };
}

test("the grammY middleware requires a non-negative album debounce", () => {
  expect(() => createBotchartMiddleware({
    spec,
    storage: memoryStorage(),
    albumDebounceMs: -1,
  })).toThrow("Set albumDebounceMs to a non-negative integer.");
});

test("the grammY middleware runs a normalized command in its stored session", async () => {
  const storage = memoryStorage();
  const requests: CoreRunnerRequest[] = [];
  const runner = (request: CoreRunnerRequest) => {
    requests.push(request);
    return {
      kind: "ok" as const,
      session: { ...request.session, seq: 1 },
      intents: [],
    };
  };
  const { bot, calls } = createTestBot();
  bot.use(createBotchartMiddleware({
    spec,
    storage,
    runner,
    now: () => "2026-08-11T12:00:00.000Z",
  }));
  const update = {
    update_id: 1,
    message: {
      message_id: 2,
      date: 1,
      chat: { id: -100, type: "supergroup", title: "Test" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "/start@botchart_test_bot catalog",
    },
  } as Update;

  await bot.handleUpdate(update);

  expect(requests).toHaveLength(1);
  expect(requests[0]).toEqual({
    spec,
    session: {
      position: "main",
      context: {},
      history: {},
      callStack: [],
      seq: 0,
      viewSlots: {
        main: {
          target: { kind: "chat", chatId: -100 },
          revision: 0,
        },
      },
      callbacks: {},
    },
    input: {
      origin: "telegram",
      source: "command",
      name: "start",
      payload: {
        sessionKey: "chat:-100:user:7",
        remainder: "catalog",
        update,
      },
    },
    now: "2026-08-11T12:00:00.000Z",
  });
  expect(JSON.parse((await storage.read("chat:-100:user:7"))!)).toEqual({
    formatVersion: 1,
    session: { ...requests[0]!.session, seq: 1 },
  });
  expect(calls).toEqual([]);
});

test("the grammY middleware normalizes each kernel Telegram event source", async () => {
  const globalSpec = { ...spec, scope: "global" } as BotchartSpec;
  const storage = memoryStorage();
  const inputs: CoreRunnerRequest["input"][] = [];
  const { bot } = createTestBot();
  bot.use(createBotchartMiddleware({
    spec: globalSpec,
    storage,
    runner: (request) => {
      inputs.push(request.input);
      return { kind: "ok", session: request.session, intents: [] };
    },
  }));
  const text = {
    update_id: 2,
    message: {
      message_id: 3,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "/start@some_other_bot",
    },
  } as Update;
  const photo = {
    update_id: 3,
    message: {
      message_id: 4,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      photo: [{ file_id: "photo", file_unique_id: "unique", width: 1, height: 1 }],
    },
  } as Update;
  const press = {
    update_id: 4,
    callback_query: {
      id: "query:1",
      chat_instance: "chat:1",
      from: { id: 7, is_bot: false, first_name: "Ada" },
      data: "c1.0.0",
      message: {
        message_id: 5,
        date: 1,
        chat: { id: 7, type: "private", first_name: "Ada" },
      },
    },
  } as Update;
  const raw = {
    update_id: 5,
    poll: {
      id: "poll:1",
      question: "Ready?",
      options: [],
      total_voter_count: 0,
      is_closed: false,
      is_anonymous: true,
      type: "regular",
      allows_multiple_answers: false,
    },
  } as Update;

  await bot.handleUpdate(text);
  await bot.handleUpdate(photo);
  await bot.handleUpdate(press);
  await bot.handleUpdate(raw);

  expect(inputs).toEqual([
    {
      origin: "telegram",
      source: "text",
      name: "message",
      payload: { sessionKey: "global", text: text.message.text, update: text },
    },
    {
      origin: "telegram",
      source: "message",
      name: "photo",
      payload: { sessionKey: "global", update: photo },
    },
    {
      origin: "telegram",
      source: "press",
      name: "c1.0.0",
      payload: { sessionKey: "global", callbackQueryId: "query:1" },
    },
    {
      origin: "telegram",
      source: "raw",
      name: "update",
      payload: { sessionKey: "global", update: raw },
    },
  ]);
});

test("the grammY middleware rejects an update that cannot satisfy the session scope", async () => {
  const update = {
    update_id: 6,
    poll: {
      id: "poll:2",
      question: "Ready?",
      options: [],
      total_voter_count: 0,
      is_closed: false,
      is_anonymous: true,
      type: "regular",
      allows_multiple_answers: false,
    },
  } as Update;
  const context = new Context(update, {} as never, botInfo);
  const middleware = createBotchartMiddleware({ spec, storage: memoryStorage() });

  const result = middleware(context, async () => {});

  await expect(result).rejects.toBeInstanceOf(SessionKeyError);
  await expect(result).rejects.toHaveProperty(
    "message",
    "Update 6 has no chat or user id. Use a scope that this update can identify.",
  );
});

test.each([
  ["user", "user:7"],
  ["chat", "chat:7"],
  ["global", "global"],
] as const)("the %s scope derives the %s session key", async (scope, expectedKey) => {
  const readKeys: string[] = [];
  const storage = {
    read: (key: string) => {
      readKeys.push(key);
      return undefined;
    },
    write: () => {},
    delete: () => {},
  };
  const { bot } = createTestBot();
  bot.use(createBotchartMiddleware({
    spec: { ...spec, scope } as BotchartSpec,
    storage,
    runner: () => ({ kind: "ok", session: null, intents: [] }),
  }));

  await bot.handleUpdate({
    update_id: 15,
    message: {
      message_id: 15,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "hello",
    },
  } as Update);

  expect(readKeys).toEqual([expectedKey]);
});

test("the grammY middleware preserves and rejects corrupt session records", async () => {
  const storage = memoryStorage();
  const update = {
    update_id: 7,
    message: {
      message_id: 8,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "hello",
    },
  } as Update;
  const context = new Context(update, {} as never, botInfo);
  let runnerCalls = 0;
  const middleware = createBotchartMiddleware({
    spec,
    storage,
    runner: (request) => {
      runnerCalls += 1;
      return { kind: "ok", session: request.session, intents: [] };
    },
  });
  const corruptValues = [
    "not JSON",
    JSON.stringify({ formatVersion: 2, session: {} }),
    JSON.stringify({ formatVersion: 1, session: {} }),
  ];

  for (const value of corruptValues) {
    await storage.write("chat:7:user:7", value);
    let thrown: unknown;
    try {
      await middleware(context, async () => {});
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SessionStorageError);
    expect(thrown).toHaveProperty("key", "chat:7:user:7");
    expect(thrown).toHaveProperty(
      "message",
      "Session chat:7:user:7 is corrupt. Repair or delete its stored value.",
    );
    expect((thrown as Error).cause).toBeInstanceOf(Error);
    expect(await storage.read("chat:7:user:7")).toBe(value);
  }
  expect(runnerCalls).toBe(0);
});

test("the grammY middleware serializes concurrent updates for one session key", async () => {
  const storage = memoryStorage();
  const seenSequences: number[] = [];
  const { bot } = createTestBot();
  bot.use(createBotchartMiddleware({
    spec,
    storage,
    runner: (request) => {
      seenSequences.push(request.session.seq);
      return {
        kind: "ok",
        session: { ...request.session, seq: request.session.seq + 1 },
        intents: [],
      };
    },
  }));
  const update = (updateId: number) => ({
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "hello",
    },
  }) as Update;

  await Promise.all([
    bot.handleUpdate(update(8)),
    bot.handleUpdate(update(9)),
  ]);

  expect(seenSequences).toEqual([0, 1]);
  expect(JSON.parse((await storage.read("chat:7:user:7"))!).session.seq).toBe(2);
});

test("the grammY middleware coalesces one Telegram album into one raw input", async () => {
  const inputs: CoreRunnerRequest["input"][] = [];
  let downstreamCalls = 0;
  const { bot } = createTestBot();
  bot.use(createBotchartMiddleware({
    spec,
    storage: memoryStorage(),
    albumDebounceMs: 1,
    runner: (request) => {
      inputs.push(request.input);
      return { kind: "ok", session: request.session, intents: [] };
    },
  }));
  bot.use(() => {
    downstreamCalls += 1;
  });
  const first = {
    update_id: 10,
    message: {
      message_id: 10,
      media_group_id: "album:1",
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      photo: [{ file_id: "photo", file_unique_id: "unique", width: 1, height: 1 }],
    },
  } as Update;
  const second = {
    update_id: 11,
    message: {
      message_id: 11,
      media_group_id: "album:1",
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      video: {
        file_id: "video",
        file_unique_id: "unique-video",
        width: 1,
        height: 1,
        duration: 1,
      },
    },
  } as Update;

  await Promise.all([bot.handleUpdate(first), bot.handleUpdate(second)]);

  expect(inputs).toEqual([{
    origin: "telegram",
    source: "raw",
    name: "album",
    payload: {
      sessionKey: "chat:7:user:7",
      mediaGroupId: "album:1",
      updates: [first, second],
    },
  }]);
  expect(downstreamCalls).toBe(2);
});

test("the grammY middleware exposes an atomic core failure", async () => {
  const storage = memoryStorage();
  let downstreamCalls = 0;
  const update = {
    update_id: 12,
    message: {
      message_id: 12,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "hello",
    },
  } as Update;
  const context = new Context(update, {} as never, botInfo);
  const middleware = createBotchartMiddleware({
    spec,
    storage,
    runner: (request) => ({
      kind: "error",
      session: request.session,
      intents: [],
      error: {
        code: "invalid_input",
        path: "$.input",
        message: "Use a supported Telegram input.",
      },
    }),
  });
  let thrown: unknown;

  try {
    await middleware(context, async () => {
      downstreamCalls += 1;
    });
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(CoreRunnerError);
  expect(thrown).toHaveProperty("sessionKey", "chat:7:user:7");
  expect(thrown).toHaveProperty(
    "message",
    "Core input failed at $.input: Use a supported Telegram input.",
  );
  expect(await storage.read("chat:7:user:7")).toBeUndefined();
  expect(downstreamCalls).toBe(0);
});

test("the grammY middleware deletes a final session", async () => {
  const storage = memoryStorage();
  const key = "chat:7:user:7";
  await storage.write(key, JSON.stringify({
    formatVersion: 1,
    session: createSession({ spec, target: { kind: "chat", chatId: 7 } }),
  }));
  const update = {
    update_id: 13,
    message: {
      message_id: 13,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "done",
    },
  } as Update;
  const context = new Context(update, {} as never, botInfo);
  const middleware = createBotchartMiddleware({
    spec,
    storage,
    runner: () => ({ kind: "ok", session: null, intents: [] }),
  });

  await middleware(context, async () => {});

  expect(await storage.read(key)).toBeUndefined();
});

test("the grammY middleware does not store a session before intents execute", async () => {
  const storage = memoryStorage();
  const update = {
    update_id: 14,
    message: {
      message_id: 14,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "hello",
    },
  } as Update;
  const context = new Context(update, {} as never, botInfo);
  const middleware = createBotchartMiddleware({
    spec,
    storage,
    runner: (request) => ({
      kind: "ok",
      session: request.session,
      intents: [{
        kind: "pressAnswer",
        callbackQueryId: "query:2",
      }],
    }),
  });
  let thrown: unknown;

  try {
    await middleware(context, async () => {});
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(IntentExecutionError);
  expect(thrown).toHaveProperty(
    "message",
    "Core emitted 1 intent. Execute every intent before this session is stored.",
  );
  expect(await storage.read("chat:7:user:7")).toBeUndefined();
});
