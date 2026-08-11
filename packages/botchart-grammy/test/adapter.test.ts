import { expect, spyOn, test } from "bun:test";
import { createSession, step } from "botchart";
import type {
  BotchartSpec,
  CoreRunnerRequest,
  Scheduler,
  TimerPayload,
} from "botchart";
import {
  CoreRunnerError,
  createBotchartMiddleware,
  memoryScheduler,
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

function createTestBot(
  resultFor: (method: string, payload: unknown) => unknown = () => true,
) {
  const calls: Array<{ method: string; payload: unknown }> = [];
  const bot = new Bot("test", { botInfo });
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: resultFor(method, payload) } as never;
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

test("the grammY middleware requires every declared effect binding at boot", () => {
  const effectSpec = {
    ...spec,
    effects: { load: { input: {}, outcomes: { done: {} } } },
  } as BotchartSpec;

  expect(() => createBotchartMiddleware({
    spec: effectSpec,
    storage: memoryStorage(),
  })).toThrow("Effect load has no binding. Add it to the effects option.");
});

test("the grammY middleware requires a scheduler for state timers at boot", () => {
  const timerSpec = {
    ...spec,
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: { after: { remind: { delay: "1s", do: [{}] } } },
      },
    },
  } as unknown as BotchartSpec;

  expect(() => createBotchartMiddleware({
    spec: timerSpec,
    storage: memoryStorage(),
  })).toThrow(
    "This spec uses state timers. Add a durable Scheduler or memoryScheduler() to the scheduler option.",
  );
});

test("the grammY middleware requires an API for scheduler callbacks at boot", () => {
  const scheduler: Scheduler = {
    schedule: async () => {},
    cancel: async () => {},
    onFire: () => {},
  };

  expect(() => createBotchartMiddleware({
    spec,
    storage: memoryStorage(),
    scheduler,
  })).toThrow("A scheduler needs a grammY API. Pass bot.api in the api option.");
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

test("the grammY middleware answers a press before it stores the session", async () => {
  const storage = memoryStorage();
  const update = {
    update_id: 14,
    callback_query: {
      id: "query:2",
      chat_instance: "chat:2",
      from: { id: 7, is_bot: false, first_name: "Ada" },
      data: "callback:2",
      message: {
        message_id: 14,
        date: 1,
        chat: { id: 7, type: "private", first_name: "Ada" },
      },
    },
  } as Update;
  const { bot, calls } = createTestBot();
  bot.use(createBotchartMiddleware({
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
  }));

  await bot.handleUpdate(update);

  expect(calls).toEqual([{
    method: "answerCallbackQuery",
    payload: { callback_query_id: "query:2" },
  }]);
  expect(await storage.read("chat:7:user:7")).toBeDefined();
});

test("the grammY middleware ignores a failed press answer", async () => {
  const requests: CoreRunnerRequest[] = [];
  const bot = new Bot("test", { botInfo });
  bot.api.config.use(async () => ({
    ok: false,
    error_code: 400,
    description: "Bad Request: query is too old",
  }) as never);
  bot.use(createBotchartMiddleware({
    spec,
    storage: memoryStorage(),
    runner: (request) => {
      requests.push(request);
      return {
        kind: "ok",
        session: request.session,
        intents: request.input.origin === "telegram"
          ? [{ kind: "pressAnswer", callbackQueryId: "query:3" }]
          : [],
      };
    },
  }));

  await bot.handleUpdate({
    update_id: 26,
    callback_query: {
      id: "query:3",
      chat_instance: "chat:3",
      from: { id: 7, is_bot: false, first_name: "Ada" },
      data: "callback:3",
      message: {
        message_id: 26,
        date: 1,
        chat: { id: 7, type: "private", first_name: "Ada" },
      },
    },
  } as Update);

  expect(requests).toHaveLength(1);
});

test("the grammY middleware sends a text view and commits its message handle", async () => {
  const storage = memoryStorage();
  const requests: CoreRunnerRequest[] = [];
  const runner = (request: CoreRunnerRequest) => {
    requests.push(request);
    if (request.input.origin === "adapter") return step(request);
    return {
      kind: "ok" as const,
      session: request.session,
      intents: [{
        kind: "view" as const,
        operation: "send" as const,
        slot: "main",
        target: { kind: "chat" as const, chatId: 7 },
        view: {
          kind: "text",
          text: "Choose",
          parseMode: "HTML",
          keyboard: [{
            kind: "row",
            buttons: [{ kind: "button", label: "Open", callbackId: "c0.0.0" }],
          }],
        },
      }],
    };
  };
  const { bot, calls } = createTestBot((method) => method === "sendMessage"
    ? {
        message_id: 21,
        date: 1,
        chat: { id: 7, type: "private", first_name: "Ada" },
        text: "Choose",
      }
    : true);
  bot.use(createBotchartMiddleware({ spec, storage, runner }));

  await bot.handleUpdate({
    update_id: 16,
    message: {
      message_id: 16,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "menu",
    },
  } as Update);

  expect(calls).toEqual([{
    method: "sendMessage",
    payload: {
      chat_id: 7,
      text: "Choose",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "Open", callback_data: "c0.0.0" }]],
      },
    },
  }]);
  expect(requests[1]!.input).toEqual({
    origin: "adapter",
    source: "view",
    name: "send",
    payload: {
      slot: "main",
      handle: { kind: "chat", chatId: 7, messageId: 21 },
      viewKind: "text",
      interactive: true,
    },
  });
  expect(JSON.parse((await storage.read("chat:7:user:7"))!).session.viewSlots.main)
    .toEqual({
      target: { kind: "chat", chatId: 7 },
      revision: 1,
      current: {
        handle: { kind: "chat", chatId: 7, messageId: 21 },
        viewKind: "text",
      },
    });
});

test("the grammY middleware retries a Bot API response with retry_after", async () => {
  const storage = memoryStorage();
  const bot = new Bot("test", { botInfo });
  let attempts = 0;
  bot.api.config.use(async (_previous, method, payload) => {
    if (method !== "sendMessage") {
      return { ok: true, result: true } as never;
    }
    attempts += 1;
    if (attempts === 1) {
      return {
        ok: false,
        error_code: 429,
        description: "Too Many Requests: retry later",
        parameters: { retry_after: 0 },
      } as never;
    }
    return {
      ok: true,
      result: {
        message_id: 22,
        date: 1,
        chat: { id: payload.chat_id, type: "private", first_name: "Ada" },
        text: payload.text,
      },
    } as never;
  });
  bot.use(createBotchartMiddleware({
    spec,
    storage,
    runner: (request) => request.input.origin === "adapter"
      ? step(request)
      : {
          kind: "ok",
          session: request.session,
          intents: [{
            kind: "view",
            operation: "send",
            slot: "main",
            target: { kind: "chat", chatId: 7 },
            view: { kind: "text", text: "Retry", parseMode: "plain" },
          }],
        },
  }));

  await bot.handleUpdate({
    update_id: 22,
    message: {
      message_id: 22,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "retry",
    },
  } as Update);

  expect(attempts).toBe(2);
  expect(JSON.parse((await storage.read("chat:7:user:7"))!).session.viewSlots.main)
    .toHaveProperty("current.handle.messageId", 22);
});

test("the grammY middleware routes a blocked recipient failure back to core", async () => {
  const storage = memoryStorage();
  const requests: CoreRunnerRequest[] = [];
  const failedIntent = {
    kind: "view" as const,
    operation: "send" as const,
    slot: "main",
    target: { kind: "chat" as const, chatId: 7 },
    view: { kind: "text", text: "Hello", parseMode: "plain" },
  };
  const bot = new Bot("test", { botInfo });
  bot.api.config.use(async () => ({
    ok: false,
    error_code: 403,
    description: "Forbidden: bot was blocked by the user",
  }) as never);
  bot.use(createBotchartMiddleware({
    spec,
    storage,
    runner: (request) => {
      requests.push(request);
      if (request.input.origin === "telegram") {
        return {
          kind: "ok",
          session: { ...request.session, seq: 1 },
          intents: [failedIntent],
        };
      }
      return {
        kind: "ok",
        session: { ...request.session, seq: 2 },
        intents: [],
      };
    },
  }));

  await bot.handleUpdate({
    update_id: 23,
    message: {
      message_id: 23,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "hello",
    },
  } as Update);

  expect(requests[1]!.input).toEqual({
    origin: "adapter",
    source: "lifecycle",
    name: "blocked",
    payload: {
      chainId: "failure:1",
      failures: [{
        intent: failedIntent,
        code: "recipient_blocked",
        message: "Forbidden: bot was blocked by the user",
      }],
    },
  });
  expect(JSON.parse((await storage.read("chat:7:user:7"))!).session.seq).toBe(2);
});

test("the grammY middleware keeps other Bot API failures on lifecycle error", async () => {
  const requests: CoreRunnerRequest[] = [];
  const failedIntent = {
    kind: "view" as const,
    operation: "delete" as const,
    slot: "main",
    handle: { kind: "chat" as const, chatId: 7, messageId: 7 },
  };
  const bot = new Bot("test", { botInfo });
  bot.api.config.use(async () => ({
    ok: false,
    error_code: 403,
    description: "Forbidden: bot is not a member of the chat",
  }) as never);
  bot.use(createBotchartMiddleware({
    spec,
    storage: memoryStorage(),
    runner: (request) => {
      requests.push(request);
      return request.input.origin === "telegram"
        ? { kind: "ok", session: request.session, intents: [failedIntent] }
        : { kind: "ok", session: request.session, intents: [] };
    },
  }));

  await bot.handleUpdate({
    update_id: 24,
    message: {
      message_id: 24,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "delete",
    },
  } as Update);

  expect(requests[1]!.input).toEqual({
    origin: "adapter",
    source: "lifecycle",
    name: "error",
    payload: {
      chainId: "failure:1",
      failures: [{
        intent: failedIntent,
        code: "telegram_api_error",
        message: "Forbidden: bot is not a member of the chat",
      }],
    },
  });
});

test("the grammY middleware appends a failed recovery effect to the same chain", async () => {
  const inputs: CoreRunnerRequest["input"][] = [];
  const firstIntent = {
    kind: "view" as const,
    operation: "send" as const,
    slot: "main",
    target: { kind: "chat" as const, chatId: 7 },
    view: { kind: "text", text: "First", parseMode: "plain" },
  };
  const secondIntent = {
    kind: "effect" as const,
    id: "chat:7:user:7:main:1:0",
    effect: "recover",
    input: {},
    token: {
      sessionKey: "chat:7:user:7",
      stateId: "main" as const,
      seq: 1,
    },
  };
  const effectSpec = {
    ...spec,
    effects: { recover: { input: {}, outcomes: { done: {} } } },
  } as BotchartSpec;
  const bot = new Bot("test", { botInfo });
  bot.api.config.use(async () => ({
    ok: false,
    error_code: 400,
    description: "Bad Request: intent failed",
  }) as never);
  const middleware = createBotchartMiddleware({
    spec: effectSpec,
    storage: memoryStorage(),
    runner: (request) => {
      inputs.push(request.input);
      if (request.input.origin === "telegram") {
        return { kind: "ok", session: request.session, intents: [firstIntent] };
      }
      const failures = (request.input.payload as { failures: unknown[] }).failures;
      if (failures.length === 1) {
        return { kind: "ok", session: request.session, intents: [secondIntent] };
      }
      return {
        kind: "error",
        session: request.session,
        intents: [],
        error: {
          code: "terminal_intent_failure",
          path: "$.input.payload.failures[1]",
          message: "A second failed intent is terminal.",
        },
      };
    },
    effects: {
      recover: async () => {
        throw new Error("Recovery effect failed.");
      },
    },
  });
  const update = {
    update_id: 28,
    message: {
      message_id: 28,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "fail",
    },
  } as Update;
  const context = new Context(update, bot.api, botInfo);
  let thrown: unknown;

  try {
    await middleware(context, async () => {});
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(CoreRunnerError);
  expect(thrown).toHaveProperty("coreError.code", "terminal_intent_failure");
  expect(inputs[2]!.payload).toEqual({
    chainId: "failure:1",
    failures: [
      {
        intent: firstIntent,
        code: "telegram_api_error",
        message: "Bad Request: intent failed",
      },
      {
        intent: secondIntent,
        code: "effect_execution_error",
        message: "Recovery effect failed.",
      },
    ],
  });
});

test("the grammY middleware edits, replaces, and deletes one text view", async () => {
  const storage = memoryStorage();
  const key = "chat:7:user:7";
  const session = createSession({ spec, target: { kind: "chat", chatId: 7 } });
  await storage.write(key, JSON.stringify({
    formatVersion: 1,
    session: {
      ...session,
      viewSlots: {
        main: {
          ...session.viewSlots.main,
          current: {
            handle: { kind: "chat", chatId: 7, messageId: 7 },
            viewKind: "text",
          },
        },
      },
    },
  }));
  const runner = (request: CoreRunnerRequest) => {
    if (request.input.origin === "adapter") return step(request);
    const handle = request.session.viewSlots.main?.current?.handle;
    if (handle === undefined) throw new Error("Seed the current message handle.");
    const text = (request.input.payload as { text: string }).text;
    if (text === "delete") {
      return {
        kind: "ok" as const,
        session: request.session,
        intents: [{ kind: "view" as const, operation: "delete" as const, slot: "main", handle }],
      };
    }
    const view = { kind: "text", text, parseMode: "plain" };
    return {
      kind: "ok" as const,
      session: request.session,
      intents: [text === "Edited"
        ? { kind: "view" as const, operation: "edit" as const, slot: "main", handle, view }
        : {
            kind: "view" as const,
            operation: "replace" as const,
            slot: "main",
            handle,
            target: { kind: "chat" as const, chatId: 7 },
            view,
          }],
    };
  };
  const { bot, calls } = createTestBot((method) => method === "sendMessage"
    ? {
        message_id: 8,
        date: 1,
        chat: { id: 7, type: "private", first_name: "Ada" },
        text: "Replacement",
      }
    : true);
  bot.use(createBotchartMiddleware({ spec, storage, runner }));
  const update = (updateId: number, text: string) => ({
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text,
    },
  }) as Update;

  await bot.handleUpdate(update(19, "Edited"));
  await bot.handleUpdate(update(20, "Replacement"));
  await bot.handleUpdate(update(21, "delete"));

  expect(calls).toEqual([
    {
      method: "editMessageText",
      payload: { chat_id: 7, message_id: 7, text: "Edited" },
    },
    { method: "deleteMessage", payload: { chat_id: 7, message_id: 7 } },
    { method: "sendMessage", payload: { chat_id: 7, text: "Replacement" } },
    { method: "deleteMessage", payload: { chat_id: 7, message_id: 8 } },
  ]);
  expect(JSON.parse((await storage.read(key))!).session.viewSlots.main).toEqual({
    target: { kind: "chat", chatId: 7 },
    revision: 0,
  });
});

test("the grammY middleware queues effect progress and its outcome", async () => {
  const storage = memoryStorage();
  const seen: Array<{ input: CoreRunnerRequest["input"]; seq: number }> = [];
  let finishOutcome: () => void = () => {};
  const outcomeFinished = new Promise<void>((resolve) => {
    finishOutcome = resolve;
  });
  const runner = (request: CoreRunnerRequest) => {
    seen.push({ input: request.input, seq: request.session.seq });
    if (request.input.origin === "telegram") {
      return {
        kind: "ok" as const,
        session: { ...request.session, seq: 1 },
        intents: [{
          kind: "effect" as const,
          id: "chat:7:user:7:main:1:0",
          effect: "load",
          input: { query: "Ada" },
          token: {
            sessionKey: "chat:7:user:7",
            stateId: "main" as const,
            seq: 1,
          },
        }],
      };
    }
    if (request.input.source === "progress") {
      return {
        kind: "ok" as const,
        session: { ...request.session, seq: 2 },
        intents: [],
      };
    }
    finishOutcome();
    return {
      kind: "ok" as const,
      session: { ...request.session, seq: 3 },
      intents: [],
    };
  };
  const { bot } = createTestBot();
  bot.use(createBotchartMiddleware({
    spec,
    storage,
    runner,
    effects: {
      load: async ({ input, progress }) => {
        expect(input).toEqual({ query: "Ada" });
        await progress({ loaded: 1 });
        return { outcome: "done", output: { status: "ok" } };
      },
    },
  }));

  await bot.handleUpdate({
    update_id: 17,
    message: {
      message_id: 17,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "load",
    },
  } as Update);
  await outcomeFinished;

  expect(seen.map(({ input, seq }) => ({
    origin: input.origin,
    source: input.source,
    name: input.name,
    seq,
  }))).toEqual([
    { origin: "telegram", source: "text", name: "message", seq: 0 },
    { origin: "effect", source: "progress", name: "load", seq: 1 },
    { origin: "effect", source: "outcome", name: "done", seq: 2 },
  ]);
  expect(seen[1]!.input.payload).toEqual({
    id: "chat:7:user:7:main:1:0",
    token: { sessionKey: "chat:7:user:7", stateId: "main", seq: 1 },
    output: { loaded: 1 },
  });
  expect(JSON.parse((await storage.read("chat:7:user:7"))!).session.seq).toBe(3);
});

test("the grammY middleware routes an effect binding failure back to core", async () => {
  const storage = memoryStorage();
  const requests: CoreRunnerRequest[] = [];
  const failedIntent = {
    kind: "effect" as const,
    id: "chat:7:user:7:main:1:0",
    effect: "load",
    input: { query: "Ada" },
    token: {
      sessionKey: "chat:7:user:7",
      stateId: "main" as const,
      seq: 1,
    },
  };
  const effectSpec = {
    ...spec,
    effects: { load: { input: {}, outcomes: { done: {} } } },
  } as BotchartSpec;
  const { bot } = createTestBot();
  bot.use(createBotchartMiddleware({
    spec: effectSpec,
    storage,
    runner: (request) => {
      requests.push(request);
      return request.input.origin === "telegram"
        ? {
            kind: "ok",
            session: { ...request.session, seq: 1 },
            intents: [failedIntent],
          }
        : { kind: "ok", session: request.session, intents: [] };
    },
    effects: {
      load: async () => {
        throw new Error("Effect service is unavailable.");
      },
    },
  }));

  await bot.handleUpdate({
    update_id: 25,
    message: {
      message_id: 25,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "load",
    },
  } as Update);

  expect(requests[1]!.input).toEqual({
    origin: "adapter",
    source: "lifecycle",
    name: "error",
    payload: {
      chainId: "failure:1",
      failures: [{
        intent: failedIntent,
        code: "effect_execution_error",
        message: "Effect service is unavailable.",
      }],
    },
  });
});

test("the grammY middleware queues a scheduler firing and cancels its timer", async () => {
  const storage = memoryStorage();
  const scheduled: Array<{
    id: string;
    fireAt: Date;
    payload: TimerPayload;
  }> = [];
  const cancelled: string[] = [];
  let fire: (payload: TimerPayload) => Promise<void> = async () => {};
  const scheduler: Scheduler = {
    schedule: async (id, fireAt, payload) => {
      scheduled.push({ id, fireAt, payload });
    },
    cancel: async (id) => {
      cancelled.push(id);
    },
    onFire: (handler) => {
      fire = handler;
    },
  };
  const seen: Array<{ origin: string; seq: number }> = [];
  const runner = (request: CoreRunnerRequest) => {
    seen.push({ origin: request.input.origin, seq: request.session.seq });
    if (request.input.origin === "telegram") {
      return {
        kind: "ok" as const,
        session: { ...request.session, seq: 1 },
        intents: [{
          kind: "timer" as const,
          operation: "schedule" as const,
          id: "chat:7:user:7:main:1:remind",
          timer: "remind",
          fireAt: "2026-08-11T12:01:00.000Z",
          token: {
            sessionKey: "chat:7:user:7",
            stateId: "main" as const,
            seq: 1,
          },
        }],
      };
    }
    return {
      kind: "ok" as const,
      session: { ...request.session, seq: 2 },
      intents: [{
        kind: "timer" as const,
        operation: "cancel" as const,
        id: "chat:7:user:7:main:1:remind",
      }],
    };
  };
  const { bot } = createTestBot();
  bot.use(createBotchartMiddleware({
    api: bot.api,
    spec,
    storage,
    runner,
    scheduler,
  }));

  await bot.handleUpdate({
    update_id: 18,
    message: {
      message_id: 18,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "wait",
    },
  } as Update);
  await fire(scheduled[0]!.payload);

  expect(scheduled).toEqual([{
    id: "chat:7:user:7:main:1:remind",
    fireAt: new Date("2026-08-11T12:01:00.000Z"),
    payload: {
      sessionKey: "chat:7:user:7",
      stateId: "main",
      seq: 1,
      timer: "remind",
    },
  }]);
  expect(seen).toEqual([
    { origin: "telegram", seq: 0 },
    { origin: "scheduler", seq: 1 },
  ]);
  expect(cancelled).toEqual(["chat:7:user:7:main:1:remind"]);
  expect(JSON.parse((await storage.read("chat:7:user:7"))!).session.seq).toBe(2);
});

test("a scheduler firing shares the update queue for its session key", async () => {
  const records = memoryStorage();
  let releaseWrite: () => void = () => {};
  const writeReleased = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  let markWriteStarted: () => void = () => {};
  const writeStarted = new Promise<void>((resolve) => {
    markWriteStarted = resolve;
  });
  let writes = 0;
  const storage = {
    read: records.read,
    delete: records.delete,
    write: async (key: string, value: string) => {
      writes += 1;
      if (writes === 1) {
        markWriteStarted();
        await writeReleased;
      }
      await records.write(key, value);
    },
  };
  let fire: (payload: TimerPayload) => Promise<void> = async () => {};
  const scheduler: Scheduler = {
    schedule: async () => {},
    cancel: async () => {},
    onFire: (handler) => {
      fire = handler;
    },
  };
  const timerSpec = {
    ...spec,
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: { after: { remind: { delay: "1s", do: [{}] } } },
      },
    },
  } as unknown as BotchartSpec;
  const seenSequences: number[] = [];
  const { bot } = createTestBot();
  bot.use(createBotchartMiddleware({
    api: bot.api,
    spec: timerSpec,
    storage,
    scheduler,
    runner: (request) => {
      seenSequences.push(request.session.seq);
      return {
        kind: "ok",
        session: { ...request.session, seq: request.session.seq + 1 },
        intents: [],
      };
    },
  }));
  const update = bot.handleUpdate({
    update_id: 29,
    message: {
      message_id: 29,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "wait",
    },
  } as Update);
  await writeStarted;
  const firing = fire({
    sessionKey: "chat:7:user:7",
    stateId: "main",
    seq: 1,
    timer: "remind",
  });

  releaseWrite();
  await Promise.all([update, firing]);

  expect(seenSequences).toEqual([0, 1]);
  expect(JSON.parse((await records.read("chat:7:user:7"))!).session.seq).toBe(2);
});

test("the grammY middleware routes a scheduler failure back to core", async () => {
  const requests: CoreRunnerRequest[] = [];
  const failedIntent = {
    kind: "timer" as const,
    operation: "schedule" as const,
    id: "chat:7:user:7:main:1:remind",
    timer: "remind",
    fireAt: "2026-08-11T12:01:00.000Z",
    token: {
      sessionKey: "chat:7:user:7",
      stateId: "main" as const,
      seq: 1,
    },
  };
  const timerSpec = {
    ...spec,
    states: {
      main: {
        kind: "state",
        render: "keep",
        on: { after: { remind: { delay: "1s", do: [{}] } } },
      },
    },
  } as unknown as BotchartSpec;
  const scheduler: Scheduler = {
    schedule: async () => {
      throw new Error("Scheduler is unavailable.");
    },
    cancel: async () => {},
    onFire: () => {},
  };
  const { bot } = createTestBot();
  bot.use(createBotchartMiddleware({
    api: bot.api,
    spec: timerSpec,
    storage: memoryStorage(),
    scheduler,
    runner: (request) => {
      requests.push(request);
      return request.input.origin === "telegram"
        ? { kind: "ok", session: request.session, intents: [failedIntent] }
        : { kind: "ok", session: request.session, intents: [] };
    },
  }));

  await bot.handleUpdate({
    update_id: 27,
    message: {
      message_id: 27,
      date: 1,
      chat: { id: 7, type: "private", first_name: "Ada" },
      from: { id: 7, is_bot: false, first_name: "Ada" },
      text: "wait",
    },
  } as Update);

  expect(requests[1]!.input).toEqual({
    origin: "adapter",
    source: "lifecycle",
    name: "error",
    payload: {
      chainId: "failure:1",
      failures: [{
        intent: failedIntent,
        code: "scheduler_execution_error",
        message: "Scheduler is unavailable.",
      }],
    },
  });
});

test("memoryScheduler replaces one pending timer with the same id", async () => {
  const warning = spyOn(console, "warn").mockImplementation(() => {});
  const scheduler = memoryScheduler();
  let finish: (payload: TimerPayload) => void = () => {};
  const fired = new Promise<TimerPayload>((resolve) => {
    finish = resolve;
  });
  scheduler.onFire(async (payload) => {
    finish(payload);
  });
  const token = { sessionKey: "chat:7", stateId: "main", seq: 1 } as const;

  await scheduler.schedule("timer:1", new Date(0), { ...token, timer: "first" });
  await scheduler.schedule("timer:1", new Date(0), { ...token, timer: "second" });

  expect(await fired).toEqual({ ...token, timer: "second" });
  expect(warning).toHaveBeenCalledWith(
    "memoryScheduler() is non-durable. Use a durable Scheduler for production timers.",
  );
  warning.mockRestore();
});
