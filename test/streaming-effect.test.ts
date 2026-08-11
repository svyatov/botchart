import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { createRunner } from "botchart";
import type { BotchartSpec } from "botchart";
import specJson from "botchart/conformance/specs/streaming-effect.json" with { type: "json" };
import transcriptJson from "botchart/conformance/transcripts/streaming-effect.json" with { type: "json" };
import { replayTranscript } from "botchart/simulator";
import type { GoldenTranscript } from "botchart/simulator";

const spec = specJson as BotchartSpec;
const transcript = transcriptJson as GoldenTranscript;
const packageRoot = new URL("../packages/botchart/", import.meta.url).pathname;
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(spec.context);
const runner = createRunner({ validateContext: ({ context }) => validate(context) });

test("the streaming effect covers its complete feedback contract", () => {
  const replay = replayTranscript({ transcript, spec, runner });
  const outcomeNames = transcript.steps
    .filter((item) => item.input.origin === "effect" && item.input.source === "outcome")
    .map((item) => item.input.name);

  expect(replay.issues).toEqual([]);
  expect(specJson.effects.streamReply.input).toEqual({
    prompt: { type: "string" },
    source: { type: "string" },
  });
  expect(specJson.effects.streamReply.progress).toEqual({
    draft: { type: "string" },
    tokenCount: { type: "number" },
  });
  expect(specJson.effects.streamReply.timeout).toBe("1m");
  expect(Object.keys(specJson.effects.streamReply.outcomes).sort()).toEqual([
    "completed",
    "failed",
    "safetyRejected",
    "timeout",
    "tooLong",
  ]);
  expect(outcomeNames).toEqual([
    "completed",
    "tooLong",
    "timeout",
    "transcribed",
    "safetyRejected",
    "failed",
  ]);
});

test("the fixture routes each inbound kind from the source bot", () => {
  const positions = (["document", "photo", "video", "voice"] as const).map((name) => {
    const result = runner({
      spec,
      session: transcript.initial.session,
      input: {
        name,
        origin: "telegram",
        payload: { sessionKey: "chat:42" },
        source: "message",
      },
      now: transcript.initial.now,
    });

    expect(result.kind).toBe("ok");
    return result.session?.position;
  });

  expect(Object.keys(specJson.on.message).sort()).toEqual([
    "document",
    "photo",
    "video",
    "voice",
  ]);
  expect(specJson.on.text).toHaveLength(1);
  expect(positions).toEqual(["unsupported", "streaming", "unsupported", "transcribing"]);
});

test("effect cancellation remains an accepted 0.1.0 limit", () => {
  expect("command" in specJson.on).toBe(false);
  expect("cancel" in specJson.presses).toBe(false);
});

test("the package ships the fixture and exact upstream MIT notice", async () => {
  const exactNotice = `MIT License

Copyright (c) 2023 Karim Iskakov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
  const notice = await Bun.file(`${packageRoot}/THIRD-PARTY-NOTICES.md`).text();
  const pack = Bun.spawnSync(["bun", "pm", "pack", "--dry-run"], {
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = pack.stdout.toString();

  expect(notice).toContain(
    "Source: https://github.com/father-bot/chatgpt_telegram_bot\n\n" +
      "Pinned commit: `3631d6534f2c0d8b834d63c820b71aade52540e8`",
  );
  expect(notice).toContain(`\`\`\`text\n${exactNotice}\n\`\`\``);
  expect(pack.exitCode, pack.stderr.toString()).toBe(0);
  expect(output).toContain("conformance/specs/streaming-effect.json");
  expect(output).toContain("conformance/transcripts/streaming-effect.json");
});
