import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { createRunner } from "botchart";
import type { BotchartSpec } from "botchart";
import specJson from "botchart/conformance/specs/dynamic-list.json" with { type: "json" };
import transcriptJson from "botchart/conformance/transcripts/dynamic-list.json" with { type: "json" };
import previewJson from "../examples/dynamic-list.preview.json" with { type: "json" };
import { replayTranscript } from "botchart/simulator";
import type { GoldenTranscript } from "botchart/simulator";

type JsonObject = { readonly [key: string]: unknown };

const spec = specJson as BotchartSpec;
const transcript = transcriptJson as GoldenTranscript;
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(spec.context);
const runner = createRunner({ validateContext: ({ context }) => validate(context) });
const packageRoot = new URL("../packages/botchart/", import.meta.url).pathname;

function countKeyValue(value: unknown, key: string, expected: string): number {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countKeyValue(item, key, expected), 0);
  }
  if (typeof value !== "object" || value === null) return 0;

  return Object.entries(value).reduce((total, [entryKey, item]) => (
    total + Number(entryKey === key && item === expected) + countKeyValue(item, key, expected)
  ), 0);
}

test("the dynamic list asset keeps both paged surfaces and stable row identities", () => {
  const spec = specJson as JsonObject;

  expect(countKeyValue(spec, "kind", "project")).toBe(2);
  expect(specJson.states.journalsList.view.keyboard[0].rows[0].buttons[0].payload)
    .toEqual({ journalId: { item: "id" } });
  expect(specJson.states.entriesList.view.keyboard[0].rows[0].buttons[0].payload)
    .toEqual({ entryId: { item: "id" } });
  expect(specJson.on.press.journalNext[1].assign.journalPage).toEqual({ increment: 1 });
  expect(specJson.on.press.entryNext[1].assign.entryPage).toEqual({ increment: 1 });
  expect(specJson.states.entrySelecting.entry[0].outcomes.missing.do[0].target)
    .toBe("entryMissing");
  expect(specJson.states.entryDetail.on.press.entryBack[1].target).toBe("entriesPaging");
  expect(specJson.states.cancelled.render).toBe("delete");
});

test("the dynamic list replay covers paging, a removed row, detail, and back navigation", () => {
  const replay = replayTranscript({ transcript, spec, runner });
  const steps = new Map(replay.transcript.steps.map((step) => [step.name, step]));

  expect(replay.issues).toEqual([]);
  expect(steps.get("load the next note page")?.result.session?.context.entryPage).toBe(2);
  expect(steps.get("report a removed field note")?.result.session?.position).toBe("entryMissing");
  expect(steps.get("restore the current field-note page")?.result.session?.position).toBe("entriesList");
  expect(steps.get("open a field note")?.result.session?.position).toBe("entryDetail");
  expect(steps.get("open a field note")?.result.session?.context).not.toHaveProperty("missingReason");
});

test("the dynamic list preview supplies source credit and complete sample data", () => {
  expect(previewJson.source).toEqual({
    repository: "https://github.com/grinev/opencode-telegram-bot",
    commit: "12b6d582ed0dcf84415b3e0813fe337fa6fac917",
  });
  expect(previewJson.spec).toBe("../packages/botchart/conformance/specs/dynamic-list.json");
  expect(previewJson.transcript)
    .toBe("../packages/botchart/conformance/transcripts/dynamic-list.json");
  expect(Object.keys(previewJson.context).sort())
    .toEqual(Object.keys(spec.context.properties).sort());
  expect(previewJson.context.journalRows).toHaveLength(2);
  expect(previewJson.context.entryRows).toHaveLength(2);
});

test("the package ships the dynamic list assets and exact MIT notice", async () => {
  const exactNotice = `MIT License

Copyright (c) 2026 Ruslan Grinev

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
    "Source: https://github.com/grinev/opencode-telegram-bot\n\n" +
      "Pinned commit: `12b6d582ed0dcf84415b3e0813fe337fa6fac917`",
  );
  expect(notice).toContain(`\`\`\`text\n${exactNotice}\n\`\`\``);
  expect(pack.exitCode, pack.stderr.toString()).toBe(0);
  expect(output).toContain("THIRD-PARTY-NOTICES.md");
  expect(output).toContain("conformance/specs/dynamic-list.json");
  expect(output).toContain("conformance/transcripts/dynamic-list.json");
});
