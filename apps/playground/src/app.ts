import type { BotchartSpec } from "botchart";
import type { GoldenTranscript } from "botchart/simulator";
import {
  deriveStatechart,
  layoutStatechart,
  renderViewPreview,
  transcriptFrame,
  transcriptPreviewSidecar,
  type ElkGraph,
  type PreviewSidecar,
  type PreviewView,
  type StatechartGraph,
  type StatechartNode,
} from "./model.js";

type StateNode = BotchartSpec["states"][string];

type Mode = "canvas" | "inspector";

type Starter = {
  readonly id: string;
  readonly path: string;
};

type StarterSidecar = PreviewSidecar & {
  readonly name: string;
  readonly source: {
    readonly repository: string;
    readonly commit: string;
  };
};

type ElkConstructor = new () => {
  readonly layout: (graph: ElkGraph) => Promise<ElkGraph>;
};

declare global {
  interface Window {
    ELK?: ElkConstructor;
  }
}

const STARTERS: readonly Starter[] = [
  { id: "visual-menu", path: "./starters/visual-menu" },
  { id: "dynamic-list", path: "./starters/dynamic-list" },
];

const SVG_NS = "http://www.w3.org/2000/svg";
const body = document.body;
const mobileMedia = matchMedia("(max-width: 940px)");
const workbench = required<HTMLElement>("workbench");
const specPane = required<HTMLElement>("spec-pane");
const diagramPane = required<HTMLElement>("diagram-pane");
const inspectorPane = required<HTMLElement>("inspector-pane");
const starterSelect = required<HTMLSelectElement>("starter-select");
const specJson = required<HTMLElement>("spec-json");
const starterSummary = required<HTMLElement>("starter-summary");
const graphCounts = required<HTMLOutputElement>("graph-counts");
const viewport = required<HTMLElement>("diagram-viewport");
const loading = required<HTMLElement>("diagram-loading");
const measurementLayer = required<HTMLElement>("measurement-layer");
const canvas = required<HTMLElement>("diagram-canvas");
const selectedKind = required<HTMLElement>("selected-kind");
const inspector = required<HTMLElement>("inspector-content");
const transitionList = required<HTMLUListElement>("transition-list");
const sourceCredit = required<HTMLElement>("source-credit");
const replayPrevious = required<HTMLButtonElement>("replay-previous");
const replayNext = required<HTMLButtonElement>("replay-next");
const replayReset = required<HTMLButtonElement>("replay-reset");
const replayStep = required<HTMLOutputElement>("replay-step");
const replaySession = required<HTMLElement>("replay-session");
const replayStatus = required<HTMLOutputElement>("replay-status");

let mode = initialMode();
let spec: BotchartSpec;
let sidecar: StarterSidecar;
let transcript: GoldenTranscript;
let graph: StatechartGraph;
let selectedId = "";
let initialId = "";
let activeId = "";
let replayCursor = 0;
let loadGeneration = 0;
let renderGeneration = 0;

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The playground is missing #${id}. Restore it in index.html.`);
  return element as T;
}

function initialMode(): Mode {
  return new URLSearchParams(location.search).get("mode") === "inspector"
    ? "inspector"
    : "canvas";
}

function currentStarter(): Starter {
  const requested = new URLSearchParams(location.search).get("starter");
  return STARTERS.find((starter) => starter.id === requested) ?? STARTERS[0]!;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url}. Reload the page, then check the deployed starter files.`);
  }
  return await response.json() as T;
}

function setQuery(name: string, value: string): void {
  const url = new URL(location.href);
  url.searchParams.set(name, value);
  history.replaceState(null, "", url);
}

function firstLeaf(value: BotchartSpec): string {
  let id = value.initial;
  let state = value.states[id];
  while (state?.kind === "compound") {
    id = `${id}.${state.initial}`;
    state = state.states[state.initial];
  }
  return id;
}

function createPreview(view: PreviewView): HTMLElement {
  const preview = renderViewPreview(
    view,
    transcriptPreviewSidecar(transcript, replayCursor, sidecar),
  );
  const wrapper = document.createElement("div");
  wrapper.className = "telegram-preview";

  const bubble = document.createElement("div");
  bubble.className = "telegram-bubble";
  bubble.textContent = preview.text;
  wrapper.append(bubble);

  if (preview.rows.length > 0) {
    const keyboard = document.createElement("div");
    keyboard.className = "preview-keyboard";
    for (const row of preview.rows) {
      const rowElement = document.createElement("div");
      rowElement.className = "preview-row";
      for (const button of row) {
        const buttonElement = document.createElement("span");
        buttonElement.className = "preview-button";
        buttonElement.textContent = button.label;
        buttonElement.title = button.durable
          ? `${button.press}, durable press`
          : button.press;
        rowElement.append(buttonElement);
      }
      keyboard.append(rowElement);
    }
    wrapper.append(keyboard);
  }

  if (preview.usesSampleData) {
    const badge = document.createElement("div");
    badge.className = "sample-badge";
    badge.textContent = "Rendered with sample data";
    wrapper.append(badge);
  }
  return wrapper;
}

function stateDetail(state: StateNode): HTMLElement {
  const detail = document.createElement("div");
  detail.className = "node-detail";
  if (state.kind === "compound") {
    detail.textContent = `Compound state. Initial child: ${state.initial}.`;
    return detail;
  }
  if (state.kind === "return") {
    detail.textContent = "Return state. It resumes the suspended caller.";
    return detail;
  }
  if ("entry" in state && state.entry?.length) {
    detail.textContent = state.entry.map((entry) => entry.kind === "run"
      ? `Effect: ${entry.effect}`
      : `Unit: ${entry.unit}`).join("\n");
    return detail;
  }
  detail.textContent = "No view. This state keeps or deletes the current message.";
  return detail;
}

function createNodeContent(node: StatechartNode, density: Mode): HTMLElement {
  const fragment = document.createElement("div");
  const title = document.createElement("div");
  title.className = "node-title";
  title.textContent = node.id;
  fragment.append(title);
  if (density === "inspector") return fragment;

  const content = document.createElement("div");
  content.className = "node-body";
  if ("view" in node.state && node.state.view) {
    content.append(createPreview(node.state.view));
  } else {
    content.append(stateDetail(node.state));
  }
  fragment.append(content);
  return fragment;
}

function createNode(
  node: StatechartNode | undefined,
  id: string,
  density: Mode,
  interactive = true,
): HTMLElement {
  const element = document.createElement(interactive ? "button" : "div");
  if (element instanceof HTMLButtonElement) {
    element.type = "button";
    element.setAttribute("aria-pressed", "false");
    element.setAttribute("aria-controls", "inspector-content");
  }
  element.className = "diagram-node";
  if (interactive) element.dataset.nodeId = id;
  if (node) {
    element.append(createNodeContent(node, density));
  } else {
    const title = document.createElement("div");
    title.className = "node-title";
    title.textContent = "root handlers";
    element.append(title);
  }
  return element;
}

function measureNodes(): Record<string, { readonly width: number; readonly height: number }> {
  measurementLayer.replaceChildren();
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const node of graph.nodes) {
    if (node.kind === "compound") continue;
    const element = createNode(node, node.id, mode, false);
    element.style.width = mode === "canvas" ? "292px" : "210px";
    measurementLayer.append(element);
    const rect = element.getBoundingClientRect();
    sizes[node.id] = { width: rect.width, height: rect.height };
  }
  measurementLayer.replaceChildren();
  return sizes;
}

function makeSvgElement<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function renderEdges(layout: Awaited<ReturnType<typeof layoutStatechart>>): SVGSVGElement {
  const svg = makeSvgElement("svg");
  svg.setAttribute("width", String(layout.width));
  svg.setAttribute("height", String(layout.height));
  svg.setAttribute("aria-hidden", "true");

  const defs = makeSvgElement("defs");
  const marker = makeSvgElement("marker");
  marker.setAttribute("id", "edge-arrow");
  marker.setAttribute("markerWidth", "8");
  marker.setAttribute("markerHeight", "8");
  marker.setAttribute("refX", "7");
  marker.setAttribute("refY", "4");
  marker.setAttribute("orient", "auto");
  const arrow = makeSvgElement("path");
  arrow.setAttribute("d", "M0,0 L8,4 L0,8 Z");
  arrow.setAttribute("fill", "#5d7690");
  marker.append(arrow);
  defs.append(marker);
  svg.append(defs);

  for (const edge of layout.edges) {
    for (const section of edge.sections) {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      const path = makeSvgElement("path");
      path.classList.add("diagram-edge");
      path.setAttribute("d", points.map((point, index) => (
        `${index === 0 ? "M" : "L"}${point.x},${point.y}`
      )).join(" "));
      path.setAttribute("marker-end", "url(#edge-arrow)");
      svg.append(path);

      const middle = points[Math.floor(points.length / 2)]!;
      const label = makeSvgElement("text");
      label.classList.add("diagram-edge-label");
      label.setAttribute("x", String(edge.labelPosition?.x ?? middle.x + 6));
      label.setAttribute("y", String(edge.labelPosition ? edge.labelPosition.y + 12 : middle.y - 6));
      label.textContent = edge.label;
      svg.append(label);
    }
  }
  return svg;
}

function selectNode(id: string): void {
  selectedId = id;
  canvas.querySelectorAll<HTMLButtonElement>("[data-node-id]").forEach((element) => {
    const selected = element.dataset.nodeId === id;
    element.classList.toggle("is-selected", selected);
    element.setAttribute("aria-pressed", String(selected));
  });
  canvas.querySelectorAll<HTMLElement>("[data-group-id]").forEach((element) => {
    element.classList.toggle("is-selected", element.dataset.groupId === id);
  });
  renderInspector();
}

function renderTransitionSummary(): void {
  transitionList.replaceChildren(...graph.edges.map((edge) => {
    const item = document.createElement("li");
    item.textContent = `${edge.source}, ${edge.label}, target ${edge.target}`;
    return item;
  }));
}

function renderInspector(): void {
  const node = graph.nodes.find((candidate) => candidate.id === selectedId);
  selectedKind.textContent = node?.kind ?? "Root";
  inspector.replaceChildren();

  const path = document.createElement("p");
  path.className = "inspector-path";
  path.textContent = node?.id ?? "root handlers";
  inspector.append(path);

  if (!node) {
    const note = document.createElement("p");
    note.className = "inspector-note";
    note.textContent = "Root handlers apply after state-level event resolution reaches the document root.";
    inspector.append(note);
    return;
  }
  if ("view" in node.state && node.state.view) {
    inspector.append(createPreview(node.state.view));
  } else {
    inspector.append(stateDetail(node.state));
  }
}

async function renderDiagram(): Promise<void> {
  const generation = ++renderGeneration;
  loading.className = "diagram-message";
  loading.textContent = "Measuring views and laying out the statechart...";
  loading.hidden = false;
  canvas.replaceChildren();
  if (!window.ELK) {
    throw new Error("ELK did not load. Reload the page, then verify vendor/elk.bundled.js.");
  }

  const engine = new window.ELK();
  const layout = await layoutStatechart({ graph, sizes: measureNodes(), engine });
  if (generation !== renderGeneration) return;
  canvas.style.width = `${Math.max(layout.width, viewport.clientWidth)}px`;
  canvas.style.height = `${Math.max(layout.height, viewport.clientHeight)}px`;
  canvas.append(renderEdges(layout));

  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const position of layout.nodes) {
    const node = nodes.get(position.id);
    if (position.kind === "compound" && node) {
      const group = document.createElement("div");
      group.className = "diagram-group";
      group.dataset.groupId = position.id;
      Object.assign(group.style, {
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
      });
      const title = document.createElement("button");
      title.type = "button";
      title.className = "group-title";
      title.dataset.nodeId = position.id;
      title.setAttribute("aria-pressed", "false");
      title.setAttribute("aria-controls", "inspector-content");
      title.textContent = position.id;
      title.addEventListener("click", () => selectNode(position.id));
      group.append(title);
      group.classList.toggle("is-active", position.id === activeId);
      canvas.append(group);
      continue;
    }

    const element = createNode(node, position.id, mode);
    Object.assign(element.style, {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${position.width}px`,
      height: `${position.height}px`,
    });
    element.classList.toggle("is-initial", position.id === initialId);
    element.classList.toggle("is-active", position.id === activeId);
    element.addEventListener("click", () => selectNode(position.id));
    canvas.append(element);
  }
  loading.hidden = true;
  selectNode(selectedId);
  const selected = Array.from(canvas.querySelectorAll<HTMLElement>("[data-node-id]"))
    .find((element) => element.dataset.nodeId === selectedId);
  if (selected) {
    viewport.scrollLeft = Math.max(
      0,
      selected.offsetLeft + selected.offsetWidth / 2 - viewport.clientWidth / 2,
    );
    viewport.scrollTop = Math.max(
      0,
      selected.offsetTop + selected.offsetHeight / 2 - viewport.clientHeight / 2,
    );
  }
}

function updateModeControls(): void {
  body.dataset.mode = mode;
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  syncPaneOrder();
}

function syncPaneOrder(): void {
  if (mobileMedia.matches && mode === "inspector") {
    workbench.append(inspectorPane, diagramPane, specPane);
    return;
  }
  workbench.append(specPane, diagramPane, inspectorPane);
}

function showError(error: unknown): void {
  loading.hidden = false;
  loading.className = "diagram-message is-error";
  loading.textContent = error instanceof Error
    ? error.message
    : "The playground failed. Reload the page and try again.";
}

function applyReplayFrame(cursor: number): void {
  const frame = transcriptFrame(transcript, cursor);
  replayCursor = frame.cursor;
  activeId = frame.session?.position ?? "";
  if (activeId !== "") selectedId = activeId;

  replayPrevious.disabled = frame.cursor === 0;
  replayNext.disabled = frame.cursor === frame.total;
  replayReset.disabled = frame.cursor === 0;
  replayStep.textContent = frame.stepName;
  replayStatus.textContent = `Step ${frame.cursor} of ${frame.total}`;
  replaySession.textContent = frame.session === null
    ? "Session ended"
    : `session: ${frame.session.position}, seq ${frame.session.seq}`;
}

async function moveReplay(cursor: number): Promise<void> {
  applyReplayFrame(cursor);
  await renderDiagram();
}

async function loadStarter(starter: Starter): Promise<void> {
  const generation = ++loadGeneration;
  starterSelect.value = starter.id;
  loading.hidden = false;
  try {
    const loaded = await Promise.all([
      getJson<BotchartSpec>(`${starter.path}/spec.json`),
      getJson<StarterSidecar>(`${starter.path}/preview.json`),
      getJson<GoldenTranscript>(`${starter.path}/transcript.json`),
    ]);
    if (generation !== loadGeneration) return;
    [spec, sidecar, transcript] = loaded;
    graph = deriveStatechart(spec);
    renderTransitionSummary();
    initialId = firstLeaf(spec);
    selectedId = initialId;
    applyReplayFrame(0);
    specJson.textContent = JSON.stringify(spec, null, 2);
    starterSummary.textContent = sidecar.name;
    graphCounts.textContent = `${graph.nodes.length} states, ${graph.edges.length} transitions`;
    sourceCredit.replaceChildren("Adapted from ");
    const source = document.createElement("a");
    source.href = `${sidecar.source.repository}/tree/${sidecar.source.commit}`;
    source.textContent = new URL(sidecar.source.repository).pathname.slice(1);
    sourceCredit.append(source);
    await renderDiagram();
  } catch (error) {
    showError(error);
  }
}

document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    mode = button.dataset.mode === "inspector" ? "inspector" : "canvas";
    setQuery("mode", mode);
    updateModeControls();
    void renderDiagram().catch(showError);
  });
});

starterSelect.addEventListener("change", () => {
  const starter = STARTERS.find((candidate) => candidate.id === starterSelect.value);
  if (!starter) return;
  setQuery("starter", starter.id);
  void loadStarter(starter);
});

replayPrevious.addEventListener("click", () => {
  void moveReplay(replayCursor - 1).catch(showError);
});

replayNext.addEventListener("click", () => {
  void moveReplay(replayCursor + 1).catch(showError);
});

replayReset.addEventListener("click", () => {
  void moveReplay(0).catch(showError);
});

mobileMedia.addEventListener("change", syncPaneOrder);

updateModeControls();
void loadStarter(currentStarter());
