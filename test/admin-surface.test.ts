import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { createRunner } from "botchart";
import type { BotchartSpec } from "botchart";
import metrics from "botchart/conformance/admin-surface.metrics.json" with { type: "json" };
import specJson from "botchart/conformance/specs/admin-surface.json" with { type: "json" };
import transcriptJson from "botchart/conformance/transcripts/admin-surface.json" with { type: "json" };
import { replayTranscript } from "botchart/simulator";
import type { GoldenTranscript } from "botchart/simulator";

const spec = specJson as BotchartSpec;
const transcript = transcriptJson as GoldenTranscript;
const packageRoot = new URL("../packages/botchart/", import.meta.url).pathname;
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(spec.context);
const runner = createRunner({ validateContext: ({ context }) => validate(context) });

type JsonObject = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function countKeyValue(value: unknown, key: string, expected: string): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countKeyValue(item, key, expected), 0);
  }
  if (!isRecord(value)) return 0;

  return Object.entries(value).reduce((total, [entryKey, item]) => (
    total + Number(entryKey === key && item === expected) + countKeyValue(item, key, expected)
  ), 0);
}

function collectTargets(value: unknown, targets = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectTargets(item, targets);
    return targets;
  }
  if (!isRecord(value)) return targets;

  for (const [key, item] of Object.entries(value)) {
    if (key === "target" && typeof item === "string") targets.add(item);
    collectTargets(item, targets);
  }
  return targets;
}

function unreachableStateNames(
  states: JsonObject,
  initial: string,
  rootOn: unknown,
  namespace?: string,
): string[] {
  const prefix = namespace === undefined ? "" : `${namespace}.`;
  const localName = (name: string) => name.startsWith(prefix) ? name.slice(prefix.length) : name;
  const reachable = new Set<string>([localName(initial)]);
  for (const target of collectTargets(rootOn)) {
    const local = localName(target);
    if (local in states) reachable.add(local);
  }

  const pending = [...reachable];
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined) break;
    for (const target of collectTargets(states[name])) {
      const local = localName(target);
      if (local in states && !reachable.has(local)) {
        reachable.add(local);
        pending.push(local);
      }
    }
  }
  return Object.keys(states).filter((name) => !reachable.has(name));
}

function collectViewContextReads(
  value: unknown,
  reads = new Set<string>(),
  inView = false,
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectViewContextReads(item, reads, inView);
    return reads;
  }
  if (!isRecord(value)) return reads;

  for (const [key, item] of Object.entries(value)) {
    if (key === "view") collectViewContextReads(item, reads, true);
    else if (key === "context" && inView && typeof item === "string") reads.add(item);
    else collectViewContextReads(item, reads, inView);
  }
  return reads;
}

function collectAssignmentKeys(value: unknown, writes = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectAssignmentKeys(item, writes);
    return writes;
  }
  if (!isRecord(value)) return writes;

  for (const [key, item] of Object.entries(value)) {
    if (key === "assign" && isRecord(item)) {
      for (const name of Object.keys(item)) writes.add(name);
    }
    collectAssignmentKeys(item, writes);
  }
  return writes;
}

test("the admin boundary fixture replays through the public simulator", () => {
  const replay = replayTranscript({ transcript, spec, runner });

  expect(replay.issues).toEqual([]);
  expect(replay.transcript.steps.at(-1)?.result.session?.position).toBe("roleDetail");
});

test("the admin fixture preserves every measured boundary cost", () => {
  const rootStates = specJson.states as JsonObject;
  const earningUnit = specJson.units.earningBrowser;
  const unitStates = earningUnit.states as JsonObject;
  const allStates = [...Object.values(rootStates), ...Object.values(unitStates)];
  const entryStates = allStates.filter((state) => isRecord(state) && state.entry !== undefined);
  const viewReads = collectViewContextReads(specJson);
  const writes = collectAssignmentKeys(specJson);
  const crossSessionEffects = [
    "notifyRoleAssigned",
    "notifyToppedUp",
    "notifyDeducted",
    "notifyRestock",
    "runBroadcast",
  ];
  const parameterizedChecks = [specJson.effects.loadRoles, specJson.effects.togglePermBit];
  const costs = {
    states: allStates.length,
    buttons: countKeyValue(specJson, "kind", "button"),
    projections: countKeyValue(specJson, "kind", "project"),
    effects: Object.keys(specJson.effects).length,
    guardRefs: Object.keys(specJson.guards).length,
    guardUses: Object.keys(specJson.guards).reduce(
      (total, guard) => total + countKeyValue(specJson.on, "guard", guard),
      0,
    ),
    gateCopies: Object.keys(specJson.presses).length,
    entryLists: entryStates.filter((state) => isRecord(state) && (state.entry as unknown[]).length > 1).length,
    entryStates: entryStates.length,
    blindEntryStates: entryStates.filter((state) => isRecord(state) && state.view === undefined).length,
    unwrittenViewKeys: [...viewReads].filter((name) => !writes.has(name)).length,
    unreachableStates: [
      ...unreachableStateNames(rootStates, specJson.initial, specJson.on),
      ...unreachableStateNames(unitStates, earningUnit.initial, specJson.on, "earningsCaller"),
    ].length,
    parameterizedChecks: parameterizedChecks.filter((effect) => "callerPerms" in effect.input).length,
    crossSessionEffects: crossSessionEffects.filter((name) => name in specJson.effects).length,
  };

  expect(costs).toEqual(metrics.costs);
  expect(metrics.source).toEqual({
    repository: "https://github.com/interlumpen/Telegram-shop",
    commit: "3b354f924edfdea547d2f4e1c6234a391024130f",
    rewrite: "https://github.com/svyatov/botchart-docs/commit/4d069eb",
    emittedBytes: 51564,
    typeInstantiations: 260623,
  });
});

test("the admin fixture keeps the five accepted limits visible", () => {
  const gateOrder = ["isBlocked", "maintenanceBlocks", "adminPrefixWithoutRole"];
  for (const name of Object.keys(specJson.presses)) {
    const handlers = specJson.on.press[name as keyof typeof specJson.on.press];
    expect(handlers.slice(0, 3).map((transition) => transition.when?.guard)).toEqual(gateOrder);
  }

  expect(specJson.context.properties).toHaveProperty("maintenanceSnapshot");
  expect(specJson.guards).toHaveProperty("maintenanceBlocks");
  expect(specJson.effects.loadRoles.input).toHaveProperty("callerPerms");
  expect(specJson.effects.togglePermBit.input).toHaveProperty("callerPerms");
  expect(specJson.states).toHaveProperty("roleDetail");
  expect(Object.keys(specJson.states).some((name) => /^roleDetail(?:User|Admin|Owner|Custom)/.test(name)))
    .toBe(false);

  const serialized = JSON.stringify(specJson);
  for (const sourceText of [
    "Вам назначена роль",
    "Ваш баланс пополнен",
    "С вашего баланса списано",
    "снова в наличии",
  ]) {
    expect(serialized).not.toContain(sourceText);
  }
});

test("the package ships the admin fixture and exact upstream MIT notice", async () => {
  const exactNotice = `MIT License

Copyright (c) [2023] [Galashev Sergei]

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
    "Source: https://github.com/interlumpen/Telegram-shop\n\n" +
      "Pinned commit: `3b354f924edfdea547d2f4e1c6234a391024130f`",
  );
  expect(notice).toContain(`\`\`\`text\n${exactNotice}\n\`\`\``);
  expect(pack.exitCode, pack.stderr.toString()).toBe(0);
  expect(output).toContain("conformance/admin-surface.metrics.json");
  expect(output).toContain("conformance/specs/admin-surface.json");
  expect(output).toContain("conformance/transcripts/admin-surface.json");
});
