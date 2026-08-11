import type { BotchartSpec, CoreRunner, Scheduler } from "botchart";
import type { Api, MiddlewareFn, StorageAdapter } from "grammy";
import {
  createBotchartMiddleware,
  type EffectBinding,
  memoryScheduler,
  memoryStorage,
} from "../src/index.js";

declare const spec: BotchartSpec;
declare const api: Api;

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
const effect: EffectBinding = async ({ input, progress }) => {
  await progress(input);
  return { outcome: "done", output: {} };
};
const scheduler: Scheduler = memoryScheduler();
const intentMiddleware: MiddlewareFn = createBotchartMiddleware({
  api,
  spec,
  storage,
  effects: { load: effect },
  scheduler,
});

void middleware;
void typedMiddleware;
void intentMiddleware;
