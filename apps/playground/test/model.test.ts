import { expect, test } from "bun:test";
import type { BotchartSpec } from "botchart";
import type { GoldenTranscript } from "botchart/simulator";
import specJson from "../../../packages/botchart/conformance/specs/visual-menu.json" with {
  type: "json",
};
import transcriptJson from "../../../packages/botchart/conformance/transcripts/visual-menu.json" with {
  type: "json",
};
import previewJson from "../../../examples/visual-menu.preview.json" with { type: "json" };
import dynamicSpecJson from "../../../packages/botchart/conformance/specs/dynamic-list.json" with {
  type: "json",
};
import dynamicTranscriptJson from "../../../packages/botchart/conformance/transcripts/dynamic-list.json" with {
  type: "json",
};
import dynamicPreviewJson from "../../../examples/dynamic-list.preview.json" with { type: "json" };
import {
  deriveStatechart,
  layoutStatechart,
  renderViewPreview,
  transcriptFrame,
  transcriptPreviewSidecar,
  type ElkGraph,
} from "../src/model.js";

const spec = specJson as BotchartSpec;
const transcript = transcriptJson as GoldenTranscript;
const dynamicTranscript = dynamicTranscriptJson as GoldenTranscript;

test("transcript replay exposes the initial session and each completed step", () => {
  expect(transcriptFrame(transcript, 0)).toMatchObject({
    cursor: 0,
    total: transcript.steps.length,
    stepName: "Initial session",
    session: {
      position: "home",
      seq: 0,
    },
  });

  expect(transcriptFrame(transcript, 3)).toMatchObject({
    cursor: 3,
    total: transcript.steps.length,
    stepName: "enter the atlas",
    session: {
      position: "atlas.directory",
      seq: 2,
    },
  });

  expect(transcriptFrame(transcript, -1).cursor).toBe(0);
  expect(transcriptFrame(transcript, transcript.steps.length + 1).cursor)
    .toBe(transcript.steps.length);
});

test("the visual menu becomes one nested statechart", () => {
  const graph = deriveStatechart(spec);

  expect(graph.nodes).toHaveLength(20);
  expect(graph.nodes.filter((node) => node.kind === "compound")).toHaveLength(4);
  expect(graph.nodes.find((node) => node.id === "atlas.signals.relays.polar.aurora"))
    .toMatchObject({
      kind: "state",
      parentId: "atlas.signals.relays.polar",
    });
  expect(graph.edges).toHaveLength(23);
  expect(graph.edges).toContainEqual({
    id: "atlas.signals.relays.directory:press:openPolar:0",
    source: "atlas.signals.relays.directory",
    target: "atlas.signals.relays.polar",
    label: "press:openPolar",
  });
  expect(graph.edges).toContainEqual({
    id: "$root:command:start:0",
    source: "$root",
    target: "home",
    label: "command:start",
  });
});

test("a preview sidecar resolves view bindings", () => {
  const home = spec.states.home;
  if (!home || !("view" in home)) throw new Error("The visual menu home state needs a view.");

  expect(renderViewPreview(home.view, previewJson)).toEqual({
    text: "Field Signal Atlas\nNorthern field edition\n\nWelcome, Northstar. " +
      "Last logged signal: Beacon 12.",
    rows: [
      [{ label: "Open signal atlas", press: "openAtlas", durable: false }],
      [
        { label: "Recent notes", press: "openNotes", durable: false },
        { label: "About", press: "openAbout", durable: false },
      ],
    ],
    usesSampleData: true,
  });
});

test("a preview sidecar expands projections and filters conditional buttons", () => {
  const dynamicSpec = dynamicSpecJson as BotchartSpec;
  const journals = dynamicSpec.states.journalsList;
  if (!journals || !("view" in journals)) {
    throw new Error("The dynamic-list journals state needs a view.");
  }

  const preview = renderViewPreview(journals.view, dynamicPreviewJson);

  expect(preview.rows.map((row) => row.map((button) => button.label))).toEqual([
    ["Ridge survey, August 2026"],
    ["Marsh survey, July 2026"],
    ["Next page"],
    ["Close"],
  ]);
  expect(preview.usesSampleData).toBe(true);
});

test("a replay frame renders the preview from its recorded session context", () => {
  const dynamicSpec = dynamicSpecJson as BotchartSpec;
  const entries = dynamicSpec.states.entriesList;
  if (!entries || !("view" in entries)) {
    throw new Error("The dynamic-list entries state needs a view.");
  }

  const sidecar = transcriptPreviewSidecar(dynamicTranscript, 2, dynamicPreviewJson);
  const preview = renderViewPreview(entries.view, sidecar);

  expect(preview.text).toBe("Coastal weather log\nField notes\nPage 2 of 2");
  expect(preview.rows.map((row) => row.map((button) => button.label))).toEqual([
    ["Shelf cloud"],
    ["Gull movement"],
    ["Prior page"],
    ["Close"],
  ]);
});

test("layout sends measured nodes and nested groups to ELK", async () => {
  const graph = deriveStatechart(spec);
  let request: ElkGraph | undefined;
  const layout = await layoutStatechart({
    graph,
    sizes: { home: { width: 284, height: 164 } },
    engine: {
      layout: async (input) => {
        request = input;
        return {
          ...input,
          width: 960,
          height: 720,
          children: input.children?.map((child) => ({
            ...child,
            x: child.id === "home" ? 24 : 0,
            y: 32,
            width: child.width ?? 280,
            height: child.height ?? 160,
          })),
        };
      },
    },
  });

  expect(request?.layoutOptions).toMatchObject({
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "org.eclipse.elk.json.shapeCoords": "ROOT",
    "org.eclipse.elk.json.edgeCoords": "ROOT",
  });
  expect(request?.edges?.find((edge) => edge.id === "$root:command:start:0")?.labels)
    .toEqual([{ id: "$root:command:start:0:label", text: "command:start", width: 91, height: 16 }]);
  const home = request?.children?.find((node) => node.id === "home");
  expect(home).toMatchObject({ width: 284, height: 164 });
  const atlas = request?.children?.find((node) => node.id === "atlas");
  expect(atlas?.children?.some((node) => node.id === "atlas.directory")).toBe(true);
  expect(layout).toMatchObject({ width: 332, height: 220 });
  expect(layout.nodes.find((node) => node.id === "home")).toMatchObject({ x: 24, y: 32 });
});
