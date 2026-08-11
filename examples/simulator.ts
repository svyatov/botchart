import { createSession, step } from "botchart";
import type { BotchartSpec } from "botchart";
import {
  simulateConversation,
  stringifyTranscript,
} from "botchart/simulator";
import specJson from "../packages/botchart/conformance/specs/session-lifecycle.json" with {
  type: "json",
};

const spec = specJson as BotchartSpec;
const input = (name: "photo" | "document") => ({
  origin: "telegram" as const,
  source: "message",
  name,
  payload: {},
});
const result = await simulateConversation({
  name: "session lifecycle",
  spec,
  specPath: "../specs/session-lifecycle.json",
  runner: step,
  initial: {
    session: createSession({
      spec,
      target: { kind: "chat", chatId: 42 },
    }),
    now: "2026-08-10T14:00:00Z",
  },
  steps: [
    {
      name: "consume without moving",
      input: input("photo"),
      covers: ["runtime.session.initial", "runtime.transition.nonMoving"],
    },
    {
      name: "move to a nested state",
      input: input("document"),
      covers: ["runtime.transition.external", "runtime.transition.seq"],
    },
    {
      name: "exit and re-enter the active state",
      input: input("photo"),
      covers: ["runtime.transition.selfExternal"],
    },
    {
      name: "cross compound state paths",
      input: input("document"),
      covers: ["runtime.state.exit", "runtime.state.entry"],
    },
    {
      name: "emit the final view and remove the session",
      input: input("photo"),
      covers: ["runtime.session.final", "runtime.view.final"],
    },
  ],
});

if (!result.ok) {
  throw new Error(result.issues.map((issue) => issue.message).join("\n"));
}

process.stdout.write(stringifyTranscript(result.transcript));
