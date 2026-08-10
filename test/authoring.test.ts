import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { createBot, guardRefs, ids } from "botchart";
import schema from "botchart/schema" with { type: "json" };

const context = {
  "~standard": {
    version: 1 as const,
    vendor: "test",
    validate: (_value: unknown) => ({ value: { count: 0 } }),
    types: undefined as unknown as {
      readonly input: unknown;
      readonly output: { readonly count: number };
    },
    jsonSchema: {
      input: (_options: { readonly target: string }) => ({}),
      output: (_options: { readonly target: string }) => ({
        type: "object",
        properties: { count: { type: "number" } },
        required: ["count"],
        additionalProperties: false,
      }),
    },
  },
};

test("define emits a minimal canonical spec", () => {
  const S = ids("main");
  const { define, state } = createBot({
    ids: S,
    context,
    effects: {},
    guards: {},
    parameters: {},
    presses: {},
    units: {},
  });

  const spec = define({
    initial: S.main,
    states: { main: state({}) },
    units: {},
  });

  const ajv = new Ajv2020({ strict: true });
  ajv.addFormat("regex", true);
  ajv.addFormat("uri", true);
  const validate = ajv.compile(schema);

  expect(validate(spec), JSON.stringify(validate.errors)).toBe(true);
  expect(spec.context.default).toEqual({ count: 0 });
});

test("authoring helpers emit every frozen canonical shape", () => {
  const S = ids("home", "done");
  const G = guardRefs("allowed");
  const richContext = {
    "~standard": {
      version: 1 as const,
      vendor: "test",
      validate: (_value: unknown) => ({
        value: { count: 0, title: "", products: [] },
      }),
      types: undefined as unknown as {
        readonly input: unknown;
        readonly output: {
          readonly count: number;
          readonly title: string;
          readonly products: readonly {
            readonly id: string;
            readonly enabled: boolean;
          }[];
        };
      },
      jsonSchema: {
        input: (_options: { readonly target: string }) => ({}),
        output: (_options: { readonly target: string }) => ({
          type: "object",
          properties: {
            count: { type: "number" },
            title: { type: "string" },
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  enabled: { type: "boolean" },
                },
                required: ["id", "enabled"],
                additionalProperties: false,
              },
            },
          },
          required: ["count", "title", "products"],
          additionalProperties: false,
        }),
      },
    },
  };
  const bot = createBot({
    ids: S,
    guards: G,
    context: richContext,
    parameters: { heading: { type: "string", default: "Catalog" } },
    effects: {
      load: {
        input: { query: { type: "string" } },
        progress: { loaded: { type: "number" } },
        outcomes: {
          done: { count: { type: "number" } },
          timeout: {},
        },
        timeout: "5s",
      },
    },
    presses: { pick: { payload: { id: { type: "string" } } } },
    units: {
      lookup: {
        input: { query: { type: "string" } },
        output: { result: { type: "string" } },
      },
    },
  });
  const { btn, call, define, project, returnState, run, state, view } = bot;
  const load = run({
    effect: "load",
    input: { query: { context: "title" } },
    onProgress: { assign: { count: { from: "loaded" } } },
    outcomes: {
      done: { assign: { count: { from: "count" } }, do: { target: S.done } },
      timeout: { do: { target: S.home } },
    },
  });
  const lookup = call({
    unit: "lookup",
    input: { query: { context: "title" } },
    onReturn: { assign: { title: { from: "result" } }, do: {} },
  });
  const spec = define({
    initial: S.home,
    states: {
      home: state({
        view: view({
          text: [{ parameter: "heading" }, ": ", { context: "count" }],
          keyboard: [
            [btn({ label: "First", press: "pick", payload: { id: "first" } })],
            project({
              source: { context: "products" },
              maxItems: 20,
              rows: (item, itemBtn) => [[
                itemBtn({
                  label: [item("id")],
                  press: "pick",
                  payload: { id: item("id") },
                  when: {
                    compare: { left: item("enabled"), op: "eq", right: true },
                  },
                }),
              ]],
            }),
          ],
        }),
        entry: [load, lookup],
        on: {
          press: {
            pick: {
              assign: { title: { from: "id" } },
              answer: { text: "Selected" },
            },
          },
        },
      }),
      done: state({ final: true, view: view({ text: "Done" }) }),
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

  const ajv = new Ajv2020({ strict: true });
  ajv.addFormat("regex", true);
  ajv.addFormat("uri", true);
  const validate = ajv.compile(schema);

  expect(validate(spec), JSON.stringify(validate.errors)).toBe(true);
  expect(spec.states.home).toMatchObject({
    kind: "state",
    render: "edit",
    view: {
      kind: "text",
      parseMode: "plain",
      text: [
        { parameter: "heading", escape: "text" },
        ": ",
        { context: "count", escape: "text" },
      ],
    },
  });
});

test("define rejects a closure in the spec", () => {
  const S = ids("main");
  const { define, state } = createBot({
    ids: S,
    context,
    effects: {},
    guards: {},
    parameters: {},
    presses: {},
    units: {},
    packs: [
      {
        id: "https://example.com/pack",
        version: "1.0.0",
        bind: () => undefined,
      } as never,
    ],
  });

  expect(() =>
    define({
      initial: S.main,
      states: { main: state({}) },
      units: {},
    }),
  ).toThrow("$.packs[0].bind contains function. Replace it with JSON data.");
});

test("define reports a context schema export failure", () => {
  const S = ids("main");
  const failingContext = {
    ...context,
    "~standard": {
      ...context["~standard"],
      jsonSchema: {
        ...context["~standard"].jsonSchema,
        output: (_options: { readonly target: string }): Record<string, unknown> => {
          throw new Error("Date cannot be represented in JSON Schema");
        },
      },
    },
  };
  const { define, state } = createBot({
    ids: S,
    context: failingContext,
    effects: {},
    guards: {},
    parameters: {},
    presses: {},
    units: {},
  });

  expect(() =>
    define({
      initial: S.main,
      states: { main: state({}) },
      units: {},
    }),
  ).toThrow(
    "The context schema cannot be exported to JSON Schema: Date cannot be represented in JSON Schema. Use a schema that supports draft 2020-12 output.",
  );
});
