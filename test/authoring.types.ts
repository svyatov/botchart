import { createBot, guardRefs, ids } from "../packages/botchart/src/index.js";

const context = {
  "~standard": {
    version: 1 as const,
    vendor: "test",
    validate: (_value: unknown) => ({
      value: {
        count: 0,
        title: "",
        products: [] as readonly {
          readonly id: string;
          readonly enabled: boolean;
        }[],
      },
    }),
    types: undefined as unknown as {
      readonly input: unknown;
      readonly output: {
        readonly count: number;
        readonly optionalCount?: number;
        readonly title: string;
        readonly optionalTitle?: string;
        readonly products: readonly {
          readonly id: string;
          readonly enabled: boolean;
        }[];
      };
    },
    jsonSchema: {
      input: (_options: { readonly target: string }) => ({}),
      output: (_options: { readonly target: string }) => ({}),
    },
  },
};

const S = ids("home", "done", "group", "group.child");
const G = guardRefs("allowed");
const bot = createBot({
  ids: S,
  guards: G,
  context,
  parameters: { limit: { type: "number", default: 10 } },
  effects: {
    load: {
      input: { query: { type: "string" } },
      progress: { loaded: { type: "number" } },
      outcomes: {
        done: { count: { type: "number" } },
        failed: { message: { type: "string" } },
        timeout: {},
      },
      timeout: "5s",
    },
    save: {
      input: {},
      outcomes: { saved: {} },
    },
  },
  presses: { pick: { payload: { id: { type: "string" } } }, empty: {} },
  units: {
    lookup: {
      input: { query: { type: "string" } },
      output: { result: { type: "string", optional: true } },
    },
  },
});

const { btn, call, cmd, define, project, raw, returnState, run, state, text, view } = bot;

const loading = run({
  effect: "load",
  input: { query: { context: "title" } },
  onProgress: { assign: { count: { from: "loaded" } } },
  outcomes: {
    done: { assign: { count: { from: "count" } }, do: { target: S.done } },
    failed: { assign: { title: { from: "message" } }, do: {} },
    timeout: { do: { target: S.home } },
  },
});

const lookup = call({
  unit: "lookup",
  input: { query: { context: "title" } },
  onReturn: {
    assign: { optionalTitle: { from: "result" } },
    do: { target: S.done },
  },
});

const home = state({
  view: view({
    text: ["Count: ", { context: "count" }],
    keyboard: [[btn({ label: "Pick", press: "pick", payload: { id: "one" } })]],
  }),
  entry: [loading, lookup],
  on: {
    press: {
      pick: { assign: { title: { from: "id" } }, answer: { text: "Picked" } },
    },
    command: { start: cmd({ do: { target: S.home } }) },
    text: [text({ pattern: "^(?<name>.+)$", do: { assign: { title: { from: "name" } } } })],
    message: { photo: { target: S.done } },
    after: { refresh: { delay: "5s", do: { target: S.home } } },
    lifecycle: { unhandled: {} },
    raw: [raw({ when: { guard: G.allowed }, do: {} })],
  },
});

const spec = define({
  initial: S.home,
  states: {
    home,
    done: state({ final: true, view: view({ text: "Done" }) }),
    group: state({ initial: "child", states: { child: state({}) } }),
  },
  units: {
    lookup: {
      initial: "done",
      states: {
        done: returnState({ unit: "lookup", output: { result: { input: "query" } } }),
      },
    },
  },
});

spec satisfies {
  readonly $schema: "https://svyatov.github.io/botchart/schema/0.1.0.json";
  readonly version: 1;
  readonly schemaRevision: "0.1.0";
};

// @ts-expect-error ask was deleted from the kernel
const removedAsk = bot.ask;
// @ts-expect-error flow was deleted from the kernel
const removedFlow = bot.flow;

// @ts-expect-error a context reference must name a declared field
const missingContext = view({ text: [{ context: "missing" }] });

// @ts-expect-error a parameter reference must name a declared parameter
const missingParameter = view({ text: [{ parameter: "missing" }] });

// @ts-expect-error an item reference is available only inside a projection
const itemOutsideProjection = btn({ label: [{ item: "id" }], press: "pick", payload: { id: "x" } });

// @ts-expect-error a projection source must be an array context field
const nonArrayProjection = project({ source: { context: "title" }, maxItems: 10, rows: () => [[btn({ label: "x", press: "empty" })]] });

// @ts-expect-error every projection has a positive maximum item count
const missingProjectionLimit = project({ source: { context: "products" }, rows: () => [[btn({ label: "x", press: "empty" })]] });

const nestedProjection = project({
  source: { context: "products" },
  maxItems: 10,
  // @ts-expect-error a projection row can contain buttons only
  rows: () => [[project({ source: { context: "products" }, maxItems: 2, rows: () => [[btn({ label: "x", press: "empty" })]] })]],
});

// @ts-expect-error a button cannot use a named guard
const buttonGuard = btn({ label: "Pick", press: "pick", payload: { id: "x" }, when: { guard: G.allowed } });

// @ts-expect-error comparison operands must have compatible scalar types
const wrongComparison = state({
  on: {
    press: {
      pick: { when: { compare: { left: { context: "count" }, op: "eq", right: "one" } } },
    },
  },
});

// @ts-expect-error bounded arithmetic accepts required number fields only
const wrongArithmeticType = state({
  on: {
    press: {
      pick: { assign: { title: { increment: 1 } } },
    },
  },
});

// @ts-expect-error bounded arithmetic rejects optional number fields
const wrongArithmeticOptional = state({
  on: {
    press: {
      pick: { assign: { optionalCount: { decrement: 1 } } },
    },
  },
});

// @ts-expect-error bounded arithmetic requires a positive amount
const zeroArithmetic = state({ on: { press: { pick: { assign: { count: { increment: 0 } } } } } });

const wrongProjectedPayload = project({
  source: { context: "products" },
  maxItems: 10,
  rows: (item, itemBtn) => [[
    // @ts-expect-error the projected item field must match the payload field type
    itemBtn({ label: "Pick", press: "pick", payload: { id: item("enabled") } }),
  ]],
});

// @ts-expect-error every declared effect input must be mapped
const missingEffectInput = run({
  effect: "load",
  onProgress: { assign: { count: { from: "loaded" } } },
  outcomes: {
    done: { assign: { count: { from: "count" } }, do: {} },
    failed: { assign: { title: { from: "message" } }, do: {} },
    timeout: { do: {} },
  },
});

// @ts-expect-error every declared progress field must be mapped
const missingProgressMapping = run({
  effect: "load",
  input: { query: { context: "title" } },
  outcomes: {
    done: { assign: { count: { from: "count" } }, do: {} },
    failed: { assign: { title: { from: "message" } }, do: {} },
    timeout: { do: {} },
  },
});

// @ts-expect-error every declared outcome must be handled
const missingOutcome = run({
  effect: "load",
  input: { query: { context: "title" } },
  onProgress: { assign: { count: { from: "loaded" } } },
  outcomes: {
    done: { assign: { count: { from: "count" } }, do: {} },
    timeout: { do: {} },
  },
});

// @ts-expect-error every declared outcome field must be mapped
const missingOutcomeMapping = run({
  effect: "load",
  input: { query: { context: "title" } },
  onProgress: { assign: { count: { from: "loaded" } } },
  outcomes: {
    done: { do: {} },
    failed: { assign: { title: { from: "message" } }, do: {} },
    timeout: { do: {} },
  },
});

// @ts-expect-error effect feedback must map to a context field of the same type
const wrongEffectMappingType = run({
  effect: "load",
  input: { query: { context: "title" } },
  onProgress: { assign: { count: { from: "loaded" } } },
  outcomes: {
    done: { assign: { title: { from: "count" } }, do: {} },
    failed: { assign: { title: { from: "message" } }, do: {} },
    timeout: { do: {} },
  },
});

const sharedOn = { press: { missing: {} } };
// @ts-expect-error a hoisted event block still checks declared press names
const hoistedUnknownPress = state({ on: sharedOn });

// @ts-expect-error a final state cannot run an entry pipeline
const finalWithEntry = state({ final: true, view: view({ text: "Done" }), entry: loading });

// @ts-expect-error a delay must be one positive integer and one unit
const invalidDelay = state({ on: { after: { bad: { delay: "1h30m", do: {} } } } });

// @ts-expect-error a lookbehind is not a named capture
const lookbehindCapture = text({ pattern: "(?<=prefix)value", do: { assign: { title: { from: "=prefix" } } } });

const rootAfterSpec = define({
  initial: S.home,
  // @ts-expect-error root-level after has no meaning
  on: { after: { invalid: { delay: "1s", do: {} } } },
  states: { home, done: state({}), group: state({ initial: "child", states: { child: state({}) } }) },
  units: { lookup: { initial: "done", states: { done: returnState({ unit: "lookup", output: { result: { input: "query" } } }) } } },
});

const overridingSpec = define({
  initial: S.home,
  states: { home, done: state({}), group: state({ initial: "child", states: { child: state({}) } }) },
  units: { lookup: { initial: "done", states: { done: returnState({ unit: "lookup", output: { result: { input: "query" } } }) } } },
  // @ts-expect-error setup-owned fields cannot override define output
  version: 2,
});

// @ts-expect-error a raw string cannot target a state
const rawTarget = state({ on: { press: { empty: { target: "done" } } } });

// @ts-expect-error a registry typo is a local error
const missingStateId = S.hmoe;

// @ts-expect-error an effect name must be declared
const missingEffect = run({ effect: "missing", outcomes: {} });

// @ts-expect-error run selects the input contract from its literal effect name
const wrongSelectedEffectInput = run({
  effect: "save",
  input: { query: { context: "title" } },
  outcomes: { saved: { do: {} } },
});

// @ts-expect-error an assignment must name a context field
const missingAssignmentKey = state({ on: { press: { empty: { assign: { missing: 1 } } } } });

const missingRootState = define({
  initial: S.home,
  // @ts-expect-error define requires every root state key
  states: { home, done: state({}) },
  units: { lookup: { initial: "done", states: { done: returnState({ unit: "lookup", output: { result: { input: "query" } } }) } } },
});

// @ts-expect-error define rejects an extra root state key
const extraRootState = define({
  initial: S.home,
  states: { home, done: state({}), group: state({ initial: "child", states: { child: state({}) } }), extra: state({}) },
  units: { lookup: { initial: "done", states: { done: returnState({ unit: "lookup", output: { result: { input: "query" } } }) } } },
});

// @ts-expect-error a press answer rejects unknown fields
const unknownPressAnswerField = state({ on: { press: { empty: { answer: { text: "Done", url: "https://example.com" } } } } });

// @ts-expect-error a context output must be a flat object
const nestedContext = createBot({
  ids: S,
  guards: G,
  context: {
    ...context,
    "~standard": {
      ...context["~standard"],
      types: undefined as unknown as { readonly input: unknown; readonly output: { readonly nested: { readonly value: string } } },
    },
  },
  parameters: {},
  effects: {},
  presses: {},
  units: {},
});

// @ts-expect-error an effect must declare at least one outcome
const zeroOutcomeEffect = createBot({
  ids: S,
  guards: G,
  context,
  parameters: {},
  effects: { stuck: { outcomes: {} } },
  presses: {},
  units: {},
});

// @ts-expect-error an effect timeout uses the single-unit duration grammar
const invalidTimeout = createBot({
  ids: S,
  guards: G,
  context,
  parameters: {},
  effects: { wait: { outcomes: { timeout: {} }, timeout: "0s" } },
  presses: {},
  units: {},
});

// @ts-expect-error validation alone does not satisfy the Standard JSON Schema contract
const missingJsonSchemaContract = createBot({ ids: S, guards: G, context: { "~standard": { version: 1, vendor: "test", validate: (_value: unknown) => ({ value: {} }) } }, parameters: {}, effects: {}, presses: {}, units: {} });

export {
  buttonGuard,
  extraRootState,
  finalWithEntry,
  hoistedUnknownPress,
  invalidDelay,
  invalidTimeout,
  itemOutsideProjection,
  lookbehindCapture,
  missingAssignmentKey,
  missingContext,
  missingEffect,
  missingEffectInput,
  missingJsonSchemaContract,
  missingOutcome,
  missingOutcomeMapping,
  missingParameter,
  missingProgressMapping,
  missingProjectionLimit,
  missingRootState,
  missingStateId,
  nestedContext,
  nestedProjection,
  nonArrayProjection,
  overridingSpec,
  rawTarget,
  removedAsk,
  removedFlow,
  rootAfterSpec,
  spec,
  unknownPressAnswerField,
  wrongArithmeticOptional,
  wrongArithmeticType,
  wrongComparison,
  wrongEffectMappingType,
  wrongProjectedPayload,
  wrongSelectedEffectInput,
  zeroArithmetic,
  zeroOutcomeEffect,
};
