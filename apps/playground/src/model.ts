import type { BotchartSpec } from "botchart";
import type { GoldenTranscript } from "botchart/simulator";

type StateNode = BotchartSpec["states"][string];
type ValueRef =
  | { readonly context: string }
  | { readonly parameter: string }
  | { readonly input: string }
  | { readonly item: string };
type ScalarValue = string | number | boolean | ValueRef;
type ComparisonCondition = {
  readonly compare: {
    readonly left: ScalarValue;
    readonly op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
    readonly right: ScalarValue;
  };
};
type ViewPart = string | (ValueRef & { readonly escape: "text" | "code" | "url" });
type ViewParts = readonly ViewPart[];
type PreviewButton = {
  readonly kind: "button";
  readonly label: ViewParts;
  readonly press: string;
  readonly durable: boolean;
  readonly when?: ComparisonCondition;
};
type PreviewRow = {
  readonly kind: "row";
  readonly buttons: readonly PreviewButton[];
};
type PreviewProjection = {
  readonly kind: "project";
  readonly source: { readonly context: string };
  readonly maxItems: number;
  readonly rows: readonly PreviewRow[];
};
export type PreviewView = {
  readonly text: ViewParts;
  readonly keyboard?: readonly (PreviewRow | PreviewProjection)[];
};

export type StatechartNode = {
  readonly id: string;
  readonly parentId?: string;
  readonly kind: StateNode["kind"];
  readonly state: StateNode;
};

export type StatechartEdge = {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
};

export type StatechartGraph = {
  readonly nodes: readonly StatechartNode[];
  readonly edges: readonly StatechartEdge[];
};

export type PreviewSidecar = {
  readonly context?: Readonly<Record<string, unknown>>;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly input?: Readonly<Record<string, unknown>>;
};

export type ViewPreview = {
  readonly text: string;
  readonly rows: readonly (readonly {
    readonly label: string;
    readonly press: string;
    readonly durable: boolean;
  }[])[];
  readonly usesSampleData: boolean;
};

export type TranscriptFrame = {
  readonly cursor: number;
  readonly total: number;
  readonly stepName: string;
  readonly session: GoldenTranscript["initial"]["session"] | null;
};

export function transcriptFrame(
  transcript: GoldenTranscript,
  cursor: number,
): TranscriptFrame {
  const total = transcript.steps.length;
  const integer = Number.isFinite(cursor) ? Math.trunc(cursor) : 0;
  const bounded = Math.min(total, Math.max(0, integer));
  const step = transcript.steps[bounded - 1];

  return {
    cursor: bounded,
    total,
    stepName: step?.name ?? "Initial session",
    session: step === undefined ? transcript.initial.session : step.result.session,
  };
}

export function transcriptPreviewSidecar(
  transcript: GoldenTranscript,
  cursor: number,
  sidecar: PreviewSidecar,
): PreviewSidecar {
  const session = transcriptFrame(transcript, cursor).session;
  return session === null ? sidecar : { ...sidecar, context: session.context };
}

export type ElkPoint = {
  readonly x: number;
  readonly y: number;
};

export type ElkSection = {
  readonly startPoint: ElkPoint;
  readonly bendPoints?: readonly ElkPoint[];
  readonly endPoint: ElkPoint;
};

export type ElkLabel = {
  readonly id: string;
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly x?: number;
  readonly y?: number;
};

export type ElkEdge = {
  readonly id: string;
  readonly sources: readonly string[];
  readonly targets: readonly string[];
  readonly sections?: readonly ElkSection[];
  readonly labels?: readonly ElkLabel[];
};

export type ElkGraph = {
  readonly id: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly children?: readonly ElkGraph[];
  readonly edges?: readonly ElkEdge[];
  readonly layoutOptions?: Readonly<Record<string, string>>;
};

export type StatechartLayout = {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly {
    readonly id: string;
    readonly kind: StateNode["kind"] | "root";
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
  readonly edges: readonly (StatechartEdge & {
    readonly sections: readonly ElkSection[];
    readonly labelPosition?: ElkPoint;
  })[];
};

type Transition = {
  readonly target?: string;
};

type TransitionList = readonly Transition[];

type HandlerSet = {
  readonly press?: Readonly<Record<string, TransitionList>>;
  readonly command?: Readonly<Record<string, { readonly do: TransitionList }>>;
  readonly text?: readonly { readonly pattern: string; readonly do: TransitionList }[];
  readonly message?: Readonly<Record<string, TransitionList | undefined>>;
  readonly after?: Readonly<Record<string, { readonly do: TransitionList }>>;
  readonly lifecycle?: Readonly<Record<string, TransitionList | undefined>>;
  readonly raw?: readonly { readonly do: TransitionList }[];
};

function printable(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function renderParts(
  parts: ViewParts,
  sidecar: PreviewSidecar,
  item?: Readonly<Record<string, unknown>>,
): { readonly text: string; readonly usedSampleData: boolean } {
  let usedSampleData = false;
  const text = parts.map((part) => {
    if (typeof part === "string") return part;
    const [source, name, values] = "context" in part
      ? ["context", part.context, sidecar.context]
      : "parameter" in part
        ? ["parameter", part.parameter, sidecar.parameters]
        : "input" in part
          ? ["input", part.input, sidecar.input]
          : ["item", part.item, item];
    if (values && Object.hasOwn(values, name)) {
      usedSampleData = true;
      return printable(values[name]);
    }
    return source === "item" ? `{item.${name}}` : `{${name}}`;
  }).join("");
  return { text, usedSampleData };
}

function resolveScalar(
  value: ComparisonCondition["compare"]["left"],
  sidecar: PreviewSidecar,
  item?: Readonly<Record<string, unknown>>,
): unknown {
  if (typeof value !== "object" || value === null) return value;
  if ("context" in value) return sidecar.context?.[value.context];
  if ("parameter" in value) return sidecar.parameters?.[value.parameter];
  if ("input" in value) return sidecar.input?.[value.input];
  return item?.[value.item];
}

function matches(
  condition: ComparisonCondition | undefined,
  sidecar: PreviewSidecar,
  item?: Readonly<Record<string, unknown>>,
): boolean {
  if (!condition) return true;
  const left = resolveScalar(condition.compare.left, sidecar, item);
  const right = resolveScalar(condition.compare.right, sidecar, item);
  switch (condition.compare.op) {
    case "eq": return left === right;
    case "neq": return left !== right;
    case "lt": return comparable(left, right, (a, b) => a < b);
    case "lte": return comparable(left, right, (a, b) => a <= b);
    case "gt": return comparable(left, right, (a, b) => a > b);
    case "gte": return comparable(left, right, (a, b) => a >= b);
  }
  return false;
}

function comparable(
  left: unknown,
  right: unknown,
  compare: (left: string | number, right: string | number) => boolean,
): boolean {
  if (typeof left === "number" && typeof right === "number") return compare(left, right);
  if (typeof left === "string" && typeof right === "string") return compare(left, right);
  return false;
}

export function renderViewPreview(view: PreviewView, sidecar: PreviewSidecar = {}): ViewPreview {
  const text = renderParts(view.text, sidecar);
  let usesSampleData = text.usedSampleData;
  function renderRow(row: PreviewRow, item?: Readonly<Record<string, unknown>>) {
    return row.buttons.filter((button) => matches(button.when, sidecar, item)).map((button) => {
      const label = renderParts(button.label, sidecar);
      const itemLabel = item ? renderParts(button.label, sidecar, item) : label;
      usesSampleData ||= label.usedSampleData;
      usesSampleData ||= itemLabel.usedSampleData;
      return { label: itemLabel.text, press: button.press, durable: button.durable };
    });
  }
  const rows = (view.keyboard ?? []).flatMap((node) => {
    if (node.kind === "row") {
      const row = renderRow(node);
      return row.length > 0 ? [row] : [];
    }
    const source = sidecar.context?.[node.source.context];
    if (!Array.isArray(source)) return node.rows.map((row) => renderRow(row));
    usesSampleData = true;
    return source.slice(0, node.maxItems).flatMap((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
      return node.rows.map((row) => renderRow(row, value as Readonly<Record<string, unknown>>));
    });
  });
  return { text: text.text, rows, usesSampleData };
}

export async function layoutStatechart(options: {
  readonly graph: StatechartGraph;
  readonly sizes: Readonly<Record<string, { readonly width: number; readonly height: number }>>;
  readonly engine: { readonly layout: (graph: ElkGraph) => Promise<ElkGraph> };
}): Promise<StatechartLayout> {
  const childrenByParent = new Map<string | undefined, StatechartNode[]>();
  for (const node of options.graph.nodes) {
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  function toElkNode(node: StatechartNode): ElkGraph {
    if (node.kind === "compound") {
      return {
        id: node.id,
        children: (childrenByParent.get(node.id) ?? []).map(toElkNode),
        layoutOptions: {
          "elk.direction": "DOWN",
          "elk.padding": "[top=52,left=18,bottom=18,right=18]",
          "elk.spacing.nodeNode": "28",
        },
      };
    }
    const size = options.sizes[node.id] ?? { width: 240, height: 72 };
    return { id: node.id, width: size.width, height: size.height };
  }

  const hasRootHandlers = options.graph.edges.some((edge) => edge.source === "$root");
  const request: ElkGraph = {
    id: "$diagram",
    children: [
      ...(hasRootHandlers ? [{ id: "$root", width: 176, height: 48 }] : []),
      ...(childrenByParent.get(undefined) ?? []).map(toElkNode),
    ],
    edges: options.graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
      labels: [{
        id: `${edge.id}:label`,
        text: edge.label,
        width: Math.ceil(edge.label.length * 6.4 + 7),
        height: 16,
      }],
    })),
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "SPLINES",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
      "elk.spacing.nodeNode": "36",
      "elk.layered.spacing.nodeNodeBetweenLayers": "72",
      "org.eclipse.elk.json.shapeCoords": "ROOT",
      "org.eclipse.elk.json.edgeCoords": "ROOT",
    },
  };
  const result = await options.engine.layout(request);
  const kinds = new Map(options.graph.nodes.map((node) => [node.id, node.kind]));
  const nodes: StatechartLayout["nodes"][number][] = [];

  function flatten(node: ElkGraph): void {
    if (node.id !== "$diagram") {
      nodes.push({
        id: node.id,
        kind: node.id === "$root" ? "root" : kinds.get(node.id) ?? "state",
        x: node.x ?? 0,
        y: node.y ?? 0,
        width: node.width ?? 0,
        height: node.height ?? 0,
      });
    }
    node.children?.forEach(flatten);
  }

  flatten(result);
  const edgesById = new Map(options.graph.edges.map((edge) => [edge.id, edge]));
  const edges = (result.edges ?? []).flatMap((edge) => {
    const source = edgesById.get(edge.id);
    const label = edge.labels?.[0];
    return source ? [{
      ...source,
      sections: edge.sections ?? [],
      ...(label?.x === undefined || label.y === undefined
        ? {}
        : { labelPosition: { x: label.x, y: label.y } }),
    }] : [];
  });
  const points = edges.flatMap((edge) => edge.sections.flatMap((section) => [
    section.startPoint,
    ...(section.bendPoints ?? []),
    section.endPoint,
  ]));
  const contentWidth = Math.max(
    0,
    ...nodes.map((node) => node.x + node.width),
    ...points.map((point) => point.x),
  );
  const contentHeight = Math.max(
    0,
    ...nodes.map((node) => node.y + node.height),
    ...points.map((point) => point.y),
  );
  return {
    width: Math.ceil(contentWidth + 24),
    height: Math.ceil(contentHeight + 24),
    nodes,
    edges,
  };
}

function addTransitions(
  edges: StatechartEdge[],
  source: string,
  label: string,
  transitions: TransitionList,
): void {
  transitions.forEach((transition, index) => {
    if (!transition.target) return;
    edges.push({
      id: `${source}:${label}:${index}`,
      source,
      target: transition.target,
      label,
    });
  });
}

function addHandlers(edges: StatechartEdge[], source: string, handlers: HandlerSet): void {
  for (const [name, transitions] of Object.entries(handlers.press ?? {})) {
    addTransitions(edges, source, `press:${name}`, transitions);
  }
  for (const [name, entry] of Object.entries(handlers.command ?? {})) {
    addTransitions(edges, source, `command:${name}`, entry.do);
  }
  handlers.text?.forEach((entry) => {
    addTransitions(edges, source, `text:${entry.pattern}`, entry.do);
  });
  for (const [name, transitions] of Object.entries(handlers.message ?? {})) {
    if (transitions) addTransitions(edges, source, `message:${name}`, transitions);
  }
  for (const [name, entry] of Object.entries(handlers.after ?? {})) {
    addTransitions(edges, source, `after:${name}`, entry.do);
  }
  for (const [name, transitions] of Object.entries(handlers.lifecycle ?? {})) {
    if (transitions) addTransitions(edges, source, `lifecycle:${name}`, transitions);
  }
  handlers.raw?.forEach((entry, index) => {
    addTransitions(edges, source, `raw:${index + 1}`, entry.do);
  });
}

function addEntryEdges(edges: StatechartEdge[], source: string, state: StateNode): void {
  if (!("entry" in state) || !state.entry) return;
  state.entry.forEach((entry, entryIndex) => {
    if (entry.kind === "run") {
      for (const [outcome, result] of Object.entries(entry.outcomes)) {
        addTransitions(edges, source, `effect:${entry.effect}:${outcome}:${entryIndex}`, result.do);
      }
      return;
    }
    addTransitions(edges, source, `unit:${entry.unit}:return:${entryIndex}`, entry.onReturn.do);
  });
}

export function deriveStatechart(spec: BotchartSpec): StatechartGraph {
  const nodes: StatechartNode[] = [];
  const edges: StatechartEdge[] = [];

  function visit(states: BotchartSpec["states"], parentId?: string): void {
    for (const [name, state] of Object.entries(states)) {
      const id = parentId ? `${parentId}.${name}` : name;
      nodes.push({ id, parentId, kind: state.kind, state });
      if ("on" in state && state.on) addHandlers(edges, id, state.on as HandlerSet);
      addEntryEdges(edges, id, state);
      if (state.kind === "compound") visit(state.states, id);
    }
  }

  addHandlers(edges, "$root", spec.on as HandlerSet);
  visit(spec.states);

  return { nodes, edges };
}
