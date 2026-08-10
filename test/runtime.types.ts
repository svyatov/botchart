import type {
  CoreInput,
  CoreError,
  CoreResult,
  CoreRunner,
  CoreRunnerRequest,
  Intent,
  JsonValue,
  SemanticSessionSnapshot,
  Session,
  BotchartSpec,
} from "botchart";

const telegramInput = {
  origin: "telegram",
  source: "command",
  name: "start",
  payload: { remainder: "catalog" },
} satisfies CoreInput;

const effectInput = {
  origin: "effect",
  source: "outcome",
  name: "loaded",
  payload: { products: [] },
} satisfies CoreInput;

const schedulerInput = {
  origin: "scheduler",
  source: "timer",
  name: "refresh",
  payload: { timerId: "chat:main:1:refresh" },
} satisfies CoreInput;

const adapterInput = {
  origin: "adapter",
  source: "lifecycle",
  name: "blocked",
  payload: { chainId: "failure:1" },
} satisfies CoreInput;

const inputs: readonly JsonValue[] = [
  telegramInput,
  effectInput,
  schedulerInput,
  adapterInput,
];

void inputs;

const invalidOrigin = {
  // @ts-expect-error core inputs have four origins
  origin: "host",
  source: "lifecycle",
  name: "blocked",
  payload: {},
} satisfies CoreInput;

void invalidOrigin;

const openInput = {
  origin: "telegram",
  source: "text",
  name: "message",
  payload: { text: "hello" },
  // @ts-expect-error core input objects are closed
  updateId: 42,
} satisfies CoreInput;

void openInput;

const session = {
  position: "catalog.list",
  context: { page: 2 },
  history: { catalog: "catalog.list" },
  callStack: [
    {
      unit: "lookup",
      input: { query: "all" },
      caller: { stateId: "main", entryIndex: 1 },
    },
  ],
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
} satisfies Session;

const snapshot: SemanticSessionSnapshot = session;

void snapshot;

const openTarget = {
  kind: "chat",
  chatId: 42,
  // @ts-expect-error chat targets are closed
  username: "botchart",
} satisfies Session["viewSlots"][string]["target"];

void openTarget;

const token = {
  sessionKey: "chat:42",
  stateId: "catalog.list",
  seq: 3,
} as const;

const intents = [
  {
    kind: "view",
    operation: "send",
    slot: "main",
    target: { kind: "chat", chatId: 42 },
    view: { kind: "text", text: "Products", parseMode: "plain" },
  },
  {
    kind: "effect",
    id: "effect:1",
    effect: "loadProducts",
    input: { query: "all" },
    token,
  },
  {
    kind: "timer",
    operation: "schedule",
    id: "chat:42:catalog.list:3:refresh",
    timer: "refresh",
    fireAt: "2026-08-10T14:01:00Z",
    token,
  },
  {
    kind: "timer",
    operation: "cancel",
    id: "chat:42:catalog.list:3:refresh",
  },
  {
    kind: "pressAnswer",
    callbackQueryId: "telegram:7",
    answer: { kind: "toast", text: "Selected" },
  },
] satisfies readonly Intent[];

void intents;

const invalidViewIntent = {
  kind: "view",
  // @ts-expect-error view intents use four semantic operations
  operation: "upsert",
  slot: "main",
  target: { kind: "chat", chatId: 42 },
  view: { kind: "text", text: "Products", parseMode: "plain" },
} satisfies Intent;

void invalidViewIntent;

const okResult = {
  kind: "ok",
  session,
  intents,
} satisfies CoreResult;

const finalResult = {
  kind: "ok",
  session: null,
  intents: [],
} satisfies CoreResult;

const errorResult = {
  kind: "error",
  session,
  intents: [],
  error: {
    code: "projection_limit",
    path: "$.states.catalog.view.keyboard[0]",
    message: "Reduce the projected items to 20 or fewer.",
  },
} satisfies CoreResult;

void okResult;
void finalResult;
void errorResult;

const openError = {
  code: "projection_limit",
  path: "$.states.catalog.view.keyboard[0]",
  message: "Reduce the projected items to 20 or fewer.",
  // @ts-expect-error core errors have exactly code, path, and message
  cause: "too many products",
} satisfies CoreError;

void openError;

const nonAtomicError = {
  kind: "error",
  session,
  // @ts-expect-error failed results contain no intents
  intents: [intents[0]],
  error: {
    code: "projection_limit",
    path: "$.states.catalog.view.keyboard[0]",
    message: "Reduce the projected items to 20 or fewer.",
  },
} satisfies CoreResult;

void nonAtomicError;

declare const spec: BotchartSpec;

const request = {
  spec,
  session,
  input: telegramInput,
  now: "2026-08-10T14:00:00Z",
} satisfies CoreRunnerRequest;

const runner: CoreRunner = ({ session: currentSession }) => ({
  kind: "ok",
  session: currentSession,
  intents: [],
});

void request;
void runner;
