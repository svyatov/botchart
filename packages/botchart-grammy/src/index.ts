import { createSession, step } from "botchart";
import type {
  BotchartSpec,
  CoreError,
  CoreInput,
  CoreRunner,
  EffectIntent,
  Intent,
  JsonObject,
  Scheduler,
  SemanticSessionSnapshot,
  TimerPayload,
  ViewIntent,
} from "botchart";
import type { Api, Context, MiddlewareFn } from "grammy";

export interface SessionStorage {
  read(key: string): string | undefined | Promise<string | undefined>;
  write(key: string, value: string): void | Promise<void>;
  delete(key: string): void | Promise<void>;
}

export type EffectBindingOptions = {
  readonly input: Readonly<JsonObject>;
  readonly progress: (output: JsonObject) => Promise<void>;
};

export type EffectBindingResult = {
  readonly outcome: string;
  readonly output: JsonObject;
};

export type EffectBinding = (
  options: EffectBindingOptions,
) => EffectBindingResult | Promise<EffectBindingResult>;

export type CreateBotchartMiddlewareOptions<
  SessionContext extends JsonObject = JsonObject,
> = {
  readonly spec: BotchartSpec;
  readonly storage: SessionStorage;
  readonly api?: Api;
  readonly runner?: CoreRunner<SessionContext>;
  readonly effects?: Readonly<Record<string, EffectBinding>>;
  readonly scheduler?: Scheduler;
  readonly now?: () => string;
  readonly albumDebounceMs?: number;
};

export class SessionKeyError extends Error {
  readonly scope: BotchartSpec["scope"];
  readonly updateId: number;

  constructor(scope: BotchartSpec["scope"], updateId: number, missing: string) {
    super(
      `Update ${updateId} has no ${missing}. Use a scope that this update can identify.`,
    );
    this.name = "SessionKeyError";
    this.scope = scope;
    this.updateId = updateId;
  }
}

export class SessionStorageError extends Error {
  readonly key: string;

  constructor(key: string, cause: Error) {
    super(`Session ${key} is corrupt. Repair or delete its stored value.`, { cause });
    this.name = "SessionStorageError";
    this.key = key;
  }
}

export class CoreRunnerError extends Error {
  readonly sessionKey: string;
  readonly coreError: CoreError;

  constructor(sessionKey: string, coreError: CoreError) {
    super(`Core input failed at ${coreError.path}: ${coreError.message}`);
    this.name = "CoreRunnerError";
    this.sessionKey = sessionKey;
    this.coreError = coreError;
  }
}

export class EffectBindingError extends Error {
  readonly effect: string;

  constructor(effect: string) {
    super(`Effect ${effect} has no binding. Add it to the effects option.`);
    this.name = "EffectBindingError";
    this.effect = effect;
  }
}

export class SchedulerBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchedulerBindingError";
  }
}

export function memoryStorage(): SessionStorage {
  const records = new Map<string, string>();
  return {
    read: (key) => records.get(key),
    write: (key, value) => {
      records.set(key, value);
    },
    delete: (key) => {
      records.delete(key);
    },
  };
}

export function memoryScheduler(): Scheduler {
  console.warn(
    "memoryScheduler() is non-durable. Use a durable Scheduler for production timers.",
  );
  let handler: ((payload: TimerPayload) => Promise<void>) | undefined;
  const timers = new Map<string, MemoryTimer>();
  const arm = (id: string, payload: TimerPayload, delay: number): void => {
    const timer: MemoryTimer = {
      payload,
      timeout: setTimeout(() => {
        void deliver(id, timer);
      }, delay),
    };
    timers.set(id, timer);
  };
  const deliver = async (id: string, timer: MemoryTimer): Promise<void> => {
    if (timers.get(id) !== timer) return;
    if (handler === undefined) {
      arm(id, timer.payload, 1_000);
      return;
    }
    try {
      await handler(timer.payload);
      if (timers.get(id) === timer) timers.delete(id);
    } catch {
      if (timers.get(id) === timer) arm(id, timer.payload, 1_000);
    }
  };
  return {
    schedule: async (id, fireAt, payload) => {
      const existing = timers.get(id);
      if (existing !== undefined) clearTimeout(existing.timeout);
      arm(id, payload, Math.max(0, fireAt.getTime() - Date.now()));
    },
    cancel: async (id) => {
      const existing = timers.get(id);
      if (existing === undefined) return;
      clearTimeout(existing.timeout);
      timers.delete(id);
    },
    onFire: (nextHandler) => {
      handler = nextHandler;
    },
  };
}

type MemoryTimer = {
  readonly payload: TimerPayload;
  timeout: ReturnType<typeof setTimeout>;
};

export function createBotchartMiddleware<
  BotContext extends Context = Context,
  SessionContext extends JsonObject = JsonObject,
>(
  options: CreateBotchartMiddlewareOptions<SessionContext>,
): MiddlewareFn<BotContext> {
  const runner = options.runner ?? step;
  const now = options.now ?? (() => new Date().toISOString());
  const albumDebounceMs = options.albumDebounceMs ?? 100;
  if (!isNonNegativeInteger(albumDebounceMs)) {
    throw new RangeError("Set albumDebounceMs to a non-negative integer.");
  }
  const missingEffect = Object.keys(options.spec.effects ?? {}).find((name) =>
    options.effects?.[name] === undefined
  );
  if (missingEffect !== undefined) throw new EffectBindingError(missingEffect);
  if (specUsesTimers(options.spec) && options.scheduler === undefined) {
    throw new SchedulerBindingError(
      "This spec uses state timers. Add a durable Scheduler or memoryScheduler() to the scheduler option.",
    );
  }
  const queues = new Map<string, Promise<void>>();
  const albums = new Map<string, PendingAlbum>();
  const processInput = async (
    execution: AdapterExecution,
    sessionKey: string,
    input: CoreInput,
  ): Promise<void> => {
    const pendingEffects: PendingEffect[] = [];
    await serialize(queues, sessionKey, async () => {
      const stored = await options.storage.read(sessionKey);
      const session = stored === undefined
        ? createSession<SessionContext>({
            spec: options.spec,
            target: execution.target,
          })
        : decodeSession<SessionContext>(stored, sessionKey);
      const result = runner({
        spec: options.spec,
        session,
        input,
        now: now(),
      });
      if (result.kind === "error") {
        throw new CoreRunnerError(sessionKey, result.error);
      }
      const nextSession = await executeIntents({
        api: execution.api,
        effectBindings: options.effects ?? {},
        intents: result.intents,
        now,
        pendingEffects,
        runner,
        session: result.session,
        sessionKey,
        scheduler: options.scheduler,
        spec: options.spec,
      });
      if (nextSession === null) await options.storage.delete(sessionKey);
      else {
        await options.storage.write(sessionKey, JSON.stringify({
          formatVersion: 1,
          session: nextSession,
        }));
      }
    });
    for (const pending of pendingEffects) {
      await executeEffect(
        pending,
        (feedback) => processInput(execution, sessionKey, feedback),
      );
    }
  };
  if (options.scheduler !== undefined) {
    if (options.api === undefined) {
      throw new SchedulerBindingError(
        "A scheduler needs a grammY API. Pass bot.api in the api option.",
      );
    }
    options.scheduler.onFire((payload) => processInput(
      { api: options.api! },
      payload.sessionKey,
      {
        origin: "scheduler",
        source: "timer",
        name: payload.timer,
        payload: {
          id: timerId(payload),
          token: {
            sessionKey: payload.sessionKey,
            stateId: payload.stateId,
            seq: payload.seq,
          },
        },
      },
    ));
  }
  return async (context, next) => {
    const album = await collectAlbum(albums, context, albumDebounceMs);
    if (album === albumFollower) {
      await next();
      return;
    }
    const sessionKey = deriveSessionKey(options.spec.scope, context);
    const input = album === undefined
      ? normalizeInput(context, sessionKey)
      : normalizeAlbum(album, sessionKey);
    await processInput({
      api: context.api,
      target: context.chat === undefined
        ? undefined
        : { kind: "chat", chatId: context.chat.id },
    }, sessionKey, input);
    await next();
  };
}

type AdapterExecution = {
  readonly api: Api;
  readonly target?: {
    readonly kind: "chat";
    readonly chatId: number;
  };
};

function timerId(payload: TimerPayload): string {
  return `${payload.sessionKey}:${payload.stateId}:${payload.seq}:${payload.timer}`;
}

function specUsesTimers(spec: BotchartSpec): boolean {
  const nodeUsesTimers = (value: unknown): boolean => {
    if (!isRecord(value)) return false;
    const on = value.on;
    if (
      isRecord(on)
      && isRecord(on.after)
      && Object.keys(on.after).length > 0
    ) return true;
    const states = value.states;
    return isRecord(states) && Object.values(states).some(nodeUsesTimers);
  };
  return Object.values(spec.states).some(nodeUsesTimers)
    || Object.values(spec.units ?? {}).some(nodeUsesTimers);
}

type PendingEffect = {
  readonly binding: EffectBinding;
  readonly intent: EffectIntent;
};

async function executeEffect(
  pending: PendingEffect,
  feedback: (input: CoreInput) => Promise<void>,
): Promise<void> {
  const { binding, intent } = pending;
  const result = await binding({
    input: intent.input,
    progress: (output) => feedback({
      origin: "effect",
      source: "progress",
      name: intent.effect,
      payload: { id: intent.id, token: intent.token, output },
    }),
  });
  await feedback({
    origin: "effect",
    source: "outcome",
    name: result.outcome,
    payload: { id: intent.id, token: intent.token, output: result.output },
  });
}

type ExecuteIntentsOptions<SessionContext extends JsonObject> = {
  readonly api: Api;
  readonly effectBindings: Readonly<Record<string, EffectBinding>>;
  readonly intents: readonly Intent[];
  readonly now: () => string;
  readonly pendingEffects: PendingEffect[];
  readonly runner: CoreRunner<SessionContext>;
  readonly session: SemanticSessionSnapshot<SessionContext> | null;
  readonly sessionKey: string;
  readonly scheduler?: Scheduler;
  readonly spec: BotchartSpec;
};

async function executeIntents<SessionContext extends JsonObject>(
  options: ExecuteIntentsOptions<SessionContext>,
): Promise<SemanticSessionSnapshot<SessionContext> | null> {
  let session = options.session;
  for (const intent of options.intents) {
    if (intent.kind === "pressAnswer") {
      await options.api.answerCallbackQuery(
        intent.callbackQueryId,
        intent.answer === undefined
          ? undefined
          : { text: intent.answer.text, show_alert: intent.answer.kind === "alert" },
      );
      continue;
    }
    if (intent.kind === "timer") {
      if (options.scheduler === undefined) {
        throw new SchedulerBindingError(
          "A timer intent has no scheduler. Add a durable Scheduler or memoryScheduler() to the scheduler option.",
        );
      }
      if (intent.operation === "cancel") {
        await options.scheduler.cancel(intent.id);
      } else {
        await options.scheduler.schedule(intent.id, new Date(intent.fireAt), {
          ...intent.token,
          timer: intent.timer,
        });
      }
      continue;
    }
    if (intent.kind === "effect") {
      const binding = options.effectBindings[intent.effect];
      if (binding === undefined) throw new EffectBindingError(intent.effect);
      options.pendingEffects.push({ binding, intent });
      continue;
    }
    const input = await executeViewIntent(options.api, intent);
    if (session === null) continue;
    const result = options.runner({
      spec: options.spec,
      session,
      input,
      now: options.now(),
    });
    if (result.kind === "error") {
      throw new CoreRunnerError(options.sessionKey, result.error);
    }
    session = await executeIntents({ ...options, ...result });
  }
  return session;
}

type RenderedTextView = {
  readonly kind: "text";
  readonly text: string;
  readonly parseMode: "plain" | "HTML" | "MarkdownV2";
  readonly keyboard?: readonly {
    readonly kind: "row";
    readonly buttons: readonly {
      readonly kind: "button";
      readonly label: string;
      readonly callbackId: string;
    }[];
  }[];
};

async function executeViewIntent(api: Api, intent: ViewIntent): Promise<CoreInput> {
  if (intent.operation === "delete") {
    await api.deleteMessage(intent.handle.chatId, intent.handle.messageId);
    return {
      origin: "adapter",
      source: "view",
      name: "delete",
      payload: { slot: intent.slot },
    };
  }
  const view = intent.view as unknown as RenderedTextView;
  const replyMarkup = view.keyboard === undefined || view.keyboard.length === 0
    ? undefined
    : {
        inline_keyboard: view.keyboard.map((row) => row.buttons.map((button) => ({
          text: button.label,
          callback_data: button.callbackId,
        }))),
      };
  const other = {
    ...(view.parseMode === "plain" ? {} : { parse_mode: view.parseMode }),
    ...(replyMarkup === undefined ? {} : { reply_markup: replyMarkup }),
  };
  let handle = intent.operation === "edit" ? intent.handle : undefined;
  if (intent.operation === "edit") {
    await api.editMessageText(
      intent.handle.chatId,
      intent.handle.messageId,
      view.text,
      other,
    );
  } else {
    if (intent.operation === "replace") {
      await api.deleteMessage(intent.handle.chatId, intent.handle.messageId);
    }
    const message = await api.sendMessage(intent.target.chatId, view.text, other);
    handle = { kind: "chat", chatId: message.chat.id, messageId: message.message_id };
  }
  return {
    origin: "adapter",
    source: "view",
    name: intent.operation,
    payload: {
      slot: intent.slot,
      ...(intent.operation === "edit" ? {} : { handle }),
      viewKind: view.kind,
      interactive: replyMarkup !== undefined,
    },
  };
}

type AlbumBatch = {
  readonly mediaGroupId: string;
  readonly updates: readonly JsonObject[];
};

type PendingAlbum = {
  readonly updates: JsonObject[];
  readonly flushed: Promise<readonly JsonObject[]>;
};

const albumFollower = Symbol("albumFollower");

async function collectAlbum(
  albums: Map<string, PendingAlbum>,
  context: Context,
  debounceMs: number,
): Promise<AlbumBatch | typeof albumFollower | undefined> {
  const message = context.callbackQuery === undefined ? context.msg : undefined;
  const mediaGroupId = message?.media_group_id;
  if (message === undefined || mediaGroupId === undefined) return undefined;
  const key = JSON.stringify([message.chat.id, mediaGroupId]);
  const existing = albums.get(key);
  if (existing !== undefined) {
    existing.updates.push(context.update as unknown as JsonObject);
    await existing.flushed;
    return albumFollower;
  }
  let flush: (updates: readonly JsonObject[]) => void = () => {};
  const updates = [context.update as unknown as JsonObject];
  const flushed = new Promise<readonly JsonObject[]>((resolve) => {
    flush = resolve;
  });
  const pending = { updates, flushed };
  albums.set(key, pending);
  setTimeout(() => {
    albums.delete(key);
    flush(updates);
  }, debounceMs);
  return { mediaGroupId, updates: await flushed };
}

function normalizeAlbum(album: AlbumBatch, sessionKey: string): CoreInput {
  return {
    origin: "telegram",
    source: "raw",
    name: "album",
    payload: {
      sessionKey,
      mediaGroupId: album.mediaGroupId,
      updates: album.updates,
    },
  };
}

async function serialize(
  queues: Map<string, Promise<void>>,
  key: string,
  task: () => Promise<void>,
): Promise<void> {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  queues.set(key, current);
  try {
    await current;
  } finally {
    if (queues.get(key) === current) queues.delete(key);
  }
}

function deriveSessionKey(scope: BotchartSpec["scope"], context: Context): string {
  if (scope === "global") return "global";
  const userId = context.from?.id;
  const chatId = context.chat?.id;
  if (scope === "user") {
    if (userId === undefined) {
      throw new SessionKeyError(scope, context.update.update_id, "user id");
    }
    return `user:${userId}`;
  }
  if (scope === "chat") {
    if (chatId === undefined) {
      throw new SessionKeyError(scope, context.update.update_id, "chat id");
    }
    return `chat:${chatId}`;
  }
  if (chatId === undefined || userId === undefined) {
    const missing = chatId === undefined && userId === undefined
      ? "chat or user id"
      : chatId === undefined ? "chat id" : "user id";
    throw new SessionKeyError(scope, context.update.update_id, missing);
  }
  return `chat:${chatId}:user:${userId}`;
}

function normalizeInput(context: Context, sessionKey: string): CoreInput {
  const callbackQuery = context.callbackQuery;
  if (callbackQuery !== undefined && typeof callbackQuery.data === "string") {
    return {
      origin: "telegram",
      source: "press",
      name: callbackQuery.data,
      payload: { sessionKey, callbackQueryId: callbackQuery.id },
    };
  }
  const message = context.msg;
  const text = message?.text;
  if (text !== undefined) {
    const command = parseCommand(text, context.me.username);
    if (command !== undefined) {
      return {
        origin: "telegram",
        source: "command",
        name: command.name,
        payload: {
          sessionKey,
          remainder: command.remainder,
          update: context.update as unknown as JsonObject,
        },
      };
    }
    return {
      origin: "telegram",
      source: "text",
      name: "message",
      payload: {
        sessionKey,
        text,
        update: context.update as unknown as JsonObject,
      },
    };
  }
  const kind = messageKind(message as unknown as JsonObject | undefined);
  if (kind !== undefined) {
    return {
      origin: "telegram",
      source: "message",
      name: kind,
      payload: {
        sessionKey,
        update: context.update as unknown as JsonObject,
      },
    };
  }
  return {
    origin: "telegram",
    source: "raw",
    name: "update",
    payload: {
      sessionKey,
      update: context.update as unknown as JsonObject,
    },
  };
}

const messageKinds = [
  ["animation", "animation"],
  ["audio", "audio"],
  ["contact", "contact"],
  ["dice", "dice"],
  ["document", "document"],
  ["location", "location"],
  ["photo", "photo"],
  ["poll", "poll"],
  ["sticker", "sticker"],
  ["venue", "venue"],
  ["video", "video"],
  ["video_note", "videoNote"],
  ["voice", "voice"],
] as const;

function messageKind(message: JsonObject | undefined): string | undefined {
  if (message === undefined) return undefined;
  return messageKinds.find(([field]) => field in message)?.[1];
}

function parseCommand(
  text: string,
  botUsername: string,
): { readonly name: string; readonly remainder: string } | undefined {
  const commandPattern = /^\/([A-Za-z][A-Za-z0-9_]{0,31})(?:@([A-Za-z0-9_]{3,32}))?(?:[ \t]+(.*))?$/;
  const match = commandPattern.exec(text);
  if (match === null) return undefined;
  const name = match[1]!;
  const addressed = match[2];
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(name)) return undefined;
  if (addressed !== undefined && addressed.toLowerCase() !== botUsername.toLowerCase()) {
    return undefined;
  }
  return { name, remainder: match[3] ?? "" };
}

function decodeSession<SessionContext extends JsonObject>(
  value: string,
  key: string,
): SemanticSessionSnapshot<SessionContext> {
  let record: unknown;
  try {
    record = JSON.parse(value);
  } catch (cause) {
    throw new SessionStorageError(key, asError(cause));
  }
  if (
    !isRecord(record)
    || !hasOnlyKeys(record, ["formatVersion", "session"])
    || record.formatVersion !== 1
    || !isSession(record.session)
  ) {
    throw new SessionStorageError(
      key,
      new TypeError("Expected a closed formatVersion 1 session record."),
    );
  }
  return record.session as SemanticSessionSnapshot<SessionContext>;
}

function isSession(value: unknown): value is SemanticSessionSnapshot {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "position",
    "context",
    "history",
    "callStack",
    "seq",
    "viewSlots",
    "callbacks",
  ])) return false;
  return isNonEmptyString(value.position)
    && isJsonObject(value.context)
    && isStringRecord(value.history)
    && Array.isArray(value.callStack)
    && value.callStack.every(isCallFrame)
    && isNonNegativeInteger(value.seq)
    && isRecord(value.viewSlots)
    && Object.values(value.viewSlots).every(isViewSlot)
    && isRecord(value.callbacks)
    && Object.values(value.callbacks).every(isCallbackRecord);
}

function isCallFrame(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["unit", "input", "caller"])
    && isNonEmptyString(value.unit)
    && isJsonObject(value.input)
    && isRecord(value.caller)
    && hasOnlyKeys(value.caller, ["stateId", "entryIndex"])
    && isNonEmptyString(value.caller.stateId)
    && isNonNegativeInteger(value.caller.entryIndex);
}

function isViewSlot(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["target", "revision"], ["current"])
    && isChatTarget(value.target)
    && isNonNegativeInteger(value.revision)
    && (value.current === undefined || (
      isRecord(value.current)
      && hasOnlyKeys(value.current, ["handle", "viewKind"])
      && isChatHandle(value.current.handle)
      && isNonEmptyString(value.current.viewKind)
    ));
}

function isCallbackRecord(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, [
      "sessionKey",
      "stateId",
      "seq",
      "viewSlot",
      "viewRevision",
      "press",
      "payload",
      "durable",
    ], ["handle"])
    && isNonEmptyString(value.sessionKey)
    && isNonEmptyString(value.stateId)
    && isNonNegativeInteger(value.seq)
    && isNonEmptyString(value.viewSlot)
    && isNonNegativeInteger(value.viewRevision)
    && (value.handle === undefined || isChatHandle(value.handle))
    && isNonEmptyString(value.press)
    && isJsonObject(value.payload)
    && typeof value.durable === "boolean";
}

function isChatTarget(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["kind", "chatId"])
    && value.kind === "chat"
    && isInteger(value.chatId);
}

function isChatHandle(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["kind", "chatId", "messageId"])
    && value.kind === "chat"
    && isInteger(value.chatId)
    && isInteger(value.messageId);
}

function isStringRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isNonEmptyString);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): boolean {
  return value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
    || (Array.isArray(value) && value.every(isJsonValue))
    || isJsonObject(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return required.every((key) => key in value)
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
