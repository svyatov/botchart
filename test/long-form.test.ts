import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { createRunner } from "botchart";
import type { BotchartSpec } from "botchart";
import specJson from "botchart/conformance/specs/long-form.json" with { type: "json" };
import transcriptJson from "botchart/conformance/transcripts/long-form.json" with { type: "json" };
import { replayTranscript } from "botchart/simulator";
import type { GoldenTranscript } from "botchart/simulator";

const spec = specJson as BotchartSpec;
const transcript = transcriptJson as GoldenTranscript;
const packageRoot = new URL("../packages/botchart/", import.meta.url).pathname;
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(spec.context);
const runner = createRunner({ validateContext: ({ context }) => validate(context) });

test("the long form defines thirteen questions and replays photo and editing", () => {
  const questionStates = [
    "title",
    "location",
    "visitDate",
    "habitat",
    "subject",
    "count",
    "conditions",
    "behavior",
    "urgency",
    "contact",
    "equipment",
    "notes",
    "photo",
  ];
  const replay = replayTranscript({ transcript, spec, runner });
  const finalSession = replay.transcript.steps.at(-1)?.result.session;
  const positions = Object.fromEntries(replay.transcript.steps.map((step) => [
    step.name,
    step.result.session?.position,
  ]));
  const photoOutcomes = specJson.states.checkingPhoto.entry[0].outcomes;

  expect(replay.issues).toEqual([]);
  expect(questionStates.filter((name) => name in specJson.states)).toHaveLength(13);
  expect(specJson.states.title.on.text[1].do[0].target).toBe("titleError");
  expect(specJson.states.subject.on.press.back[0].target).toBe("habitat");
  expect(specJson.on.command.cancel.do[0].target).toBe("abandoned");
  expect(specJson.on.command.cancel.do[0].assign).toEqual(specJson.context.default);
  expect(photoOutcomes.accepted.do[0].target).toBe("summary");
  expect(photoOutcomes.unreadable.do[0].target).toBe("photoError");
  expect(JSON.stringify(photoOutcomes)).not.toContain('"target":"checkingPhoto"');
  expect(specJson.states.photoError.on.press.retryPhoto[0].target).toBe("photo");
  expect(positions["accept the clear photo"]).toBe("summary");
  expect(finalSession?.position).toBe("summary");
  expect(finalSession?.context.location).toBe("South marsh");
});

test("the package ships the independently authored fixture with source credit", async () => {
  const notice = await Bun.file(`${packageRoot}/THIRD-PARTY-NOTICES.md`).text();
  const pack = Bun.spawnSync(["bun", "pm", "pack", "--dry-run"], {
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = pack.stdout.toString();

  expect(notice).toContain(
    "Source: https://github.com/DEV-X-HUB/telegram-bot\n\n" +
      "Pinned commit: `3de7cce8f327d78dfb4b115a7aef50afecd83932`",
  );
  expect(notice).toContain(
    "The asset contains independently authored flow, text, errors, labels, and sample data.",
  );
  expect(pack.exitCode, pack.stderr.toString()).toBe(0);
  expect(output).toContain("conformance/specs/long-form.json");
  expect(output).toContain("conformance/transcripts/long-form.json");
});
