import { expect, test } from "bun:test";
import { step } from "botchart";
import type { BotchartSpec } from "botchart";
import specJson from "botchart/conformance/specs/visual-menu.json" with { type: "json" };
import transcriptJson from "botchart/conformance/transcripts/visual-menu.json" with { type: "json" };
import previewJson from "../examples/visual-menu.preview.json" with { type: "json" };
import { replayTranscript } from "botchart/simulator";
import type { GoldenTranscript } from "botchart/simulator";

const spec = specJson as BotchartSpec;
const transcript = transcriptJson as GoldenTranscript;
const packageRoot = new URL("../packages/botchart/", import.meta.url).pathname;

test("the visual menu traverses four compound levels and returns through each parent", () => {
  const replay = replayTranscript({ transcript, spec, runner: step });

  expect(replay.issues).toEqual([]);
  expect(replay.transcript.steps
    .filter((item) => item.input.origin === "telegram")
    .map((item) => item.result.session?.position)).toEqual([
    "home",
    "atlas.directory",
    "atlas.signals.directory",
    "atlas.signals.relays.directory",
    "atlas.signals.relays.polar.directory",
    "atlas.signals.relays.directory",
    "atlas.signals.directory",
    "atlas.directory",
  ]);
});

test("the visual menu preview supplies source credit and complete sample data", () => {
  expect(previewJson.source).toEqual({
    repository: "https://github.com/vladik4il/INCS2bot",
    commit: "e32fcfce3140a6d85da87ce649b6f8eb66e96bc0",
  });
  expect(previewJson.spec).toBe("../packages/botchart/conformance/specs/visual-menu.json");
  expect(previewJson.transcript)
    .toBe("../packages/botchart/conformance/transcripts/visual-menu.json");
  expect(Object.keys(previewJson.context).sort())
    .toEqual(Object.keys(spec.context.properties).sort());
});

test("the botchart package ships the visual menu assets and exact MIT notice", async () => {
  const exactNotice = `MIT License

Copyright (c) 2024 INCS2

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

  expect(notice).toContain(`\`\`\`text\n${exactNotice}\n\`\`\``);
  expect(pack.exitCode, pack.stderr.toString()).toBe(0);
  expect(output).toContain("THIRD-PARTY-NOTICES.md");
  expect(output).toContain("conformance/specs/visual-menu.json");
  expect(output).toContain("conformance/transcripts/visual-menu.json");
});
