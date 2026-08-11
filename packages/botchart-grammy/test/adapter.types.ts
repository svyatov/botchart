import type { BotchartSpec, CoreRunner } from "botchart";
import type { MiddlewareFn, StorageAdapter } from "grammy";
import {
  createBotchartMiddleware,
  memoryStorage,
} from "../src/index.js";

declare const spec: BotchartSpec;

const storage: StorageAdapter<string> = memoryStorage();
const middleware: MiddlewareFn = createBotchartMiddleware({ spec, storage });
const runner: CoreRunner<{ count: number }> = (request) => ({
  kind: "ok",
  session: request.session,
  intents: [],
});
const typedMiddleware: MiddlewareFn = createBotchartMiddleware({
  spec,
  storage,
  runner,
});

void middleware;
void typedMiddleware;
