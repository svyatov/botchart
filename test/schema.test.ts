import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import guardSpec from "botchart/conformance/specs/guards-and-assignments.json" with { type: "json" };
import lifecycleSpec from "botchart/conformance/specs/session-lifecycle.json" with { type: "json" };
import schema from "botchart/schema" with { type: "json" };

const schemaId = "https://svyatov.github.io/botchart/schema/0.1.0.json";

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("regex", (value: string) => {
  try {
    new RegExp(value, "u");
    return true;
  } catch {
    return false;
  }
});
ajv.addFormat("uri", (value: string) => {
  try {
    return new URL(value).protocol.length > 1;
  } catch {
    return false;
  }
});

const validate = ajv.compile(schema);

const minimalSpec = {
  $schema: schemaId,
  version: 1,
  schemaRevision: "0.1.0",
  packs: [],
  scope: "chat+user",
  context: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
    default: {},
  },
  parameters: {},
  guards: {},
  effects: {},
  presses: {},
  units: {},
  stalePress: { action: "ignore" },
  initial: "main",
  on: {},
  states: {
    main: {
      kind: "state",
      render: "keep",
    },
  },
} as const;

test("published schema accepts a minimal canonical spec", () => {
  expect(validate(minimalSpec), JSON.stringify(validate.errors)).toBe(true);
});

test("published schema accepts the session lifecycle conformance spec", () => {
  expect(validate(lifecycleSpec), JSON.stringify(validate.errors)).toBe(true);
});

test("published schema accepts the guards and assignments conformance spec", () => {
  expect(validate(guardSpec), JSON.stringify(validate.errors)).toBe(true);
});

const completeSpec = {
  $schema: schemaId,
  version: 1,
  schemaRevision: "0.1.0",
  packs: [
    {
      id: "https://example.org/botchart/packs/payments",
      version: "1.0.0",
    },
  ],
  scope: "chat+user",
  context: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      selectedId: { type: "string" },
      result: { type: "string" },
      loadedCount: { type: "number", minimum: 0 },
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            enabled: { type: "boolean" },
          },
          required: ["id", "title"],
          additionalProperties: false,
        },
      },
    },
    required: ["loadedCount", "products"],
    additionalProperties: false,
    default: { loadedCount: 0, products: [] },
  },
  parameters: {
    pageSize: { type: "number", enum: [10, 20], default: 10 },
  },
  guards: {
    canRetry: {},
  },
  effects: {
    loadProducts: {
      input: {
        query: { type: "string" },
      },
      progress: {
        loaded: { type: "number" },
      },
      outcomes: {
        loaded: {
          products: {
            type: "array",
            items: {
              type: "record",
              fields: {
                id: { type: "string" },
                title: { type: "string" },
                enabled: { type: "boolean", optional: true },
              },
            },
          },
        },
        failed: {
          message: { type: "string", optional: true },
        },
        timeout: {},
      },
      timeout: "10s",
    },
  },
  presses: {
    pickProduct: {
      payload: {
        id: { type: "string" },
      },
    },
  },
  units: {
    lookup: {
      input: {
        query: { type: "string" },
      },
      output: {
        result: { type: "string", optional: true },
      },
      initial: "done",
      states: {
        done: {
          kind: "return",
          output: {
            result: { input: "query" },
          },
        },
      },
    },
  },
  stalePress: {
    action: "rerender",
    answer: {
      kind: "toast",
      text: ["This view expired."],
    },
  },
  initial: "main",
  on: {
    press: {
      pickProduct: [{ assign: { selectedId: { from: "id" } } }],
    },
    command: {
      cancel: { do: [{ target: "main" }] },
      start: {
        pattern: "^(?<ref>[a-z]+)$",
        do: [{ assign: { selectedId: { from: "ref" } } }],
      },
    },
    text: [{ pattern: "^help$", do: [{ target: "help" }] }],
    message: {
      photo: [{ target: "help" }],
    },
    lifecycle: {
      blocked: [{ target: "done" }],
      error: [{ when: { guard: "canRetry" }, target: "main" }],
      unhandled: [{}],
    },
    raw: [{ do: [{}] }],
  },
  states: {
    main: {
      kind: "state",
      view: {
        kind: "text",
        text: [
          "Loaded ",
          { context: "loadedCount", escape: "text" },
          " products.",
        ],
        parseMode: "MarkdownV2",
        keyboard: [
          {
            kind: "row",
            buttons: [
              {
                kind: "button",
                label: ["Help"],
                press: "pickProduct",
                payload: { id: "help" },
                durable: false,
                when: {
                  compare: {
                    left: { context: "loadedCount" },
                    op: "gte",
                    right: 0,
                  },
                },
              },
            ],
          },
          {
            kind: "project",
            source: { context: "products" },
            maxItems: 20,
            rows: [
              {
                kind: "row",
                buttons: [
                  {
                    kind: "button",
                    label: [{ item: "title", escape: "text" }],
                    press: "pickProduct",
                    payload: { id: { item: "id" } },
                    durable: true,
                    when: {
                      compare: {
                        left: { item: "enabled" },
                        op: "eq",
                        right: true,
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      render: "edit",
      entry: [
        {
          kind: "call",
          unit: "lookup",
          input: { query: "all" },
          onReturn: {
            assign: { result: { from: "result" } },
            do: [{}],
          },
        },
        {
          kind: "run",
          effect: "loadProducts",
          input: { query: { parameter: "pageSize" } },
          onProgress: {
            assign: { loadedCount: { from: "loaded" } },
          },
          outcomes: {
            loaded: {
              assign: { products: { from: "products" } },
              do: [{ target: "catalog.list" }],
            },
            failed: {
              assign: { result: { from: "message" } },
              do: [{ when: { guard: "canRetry" } }],
            },
            timeout: {
              assign: {},
              do: [{ target: "help" }],
            },
          },
        },
      ],
      on: {
        after: {
          remind: {
            delay: "30s",
            do: [{ target: "help" }],
          },
        },
      },
    },
    catalog: {
      kind: "compound",
      initial: "list",
      history: "deep",
      states: {
        list: {
          kind: "state",
          render: "keep",
          on: {
            press: {
              pickProduct: [
                {
                  when: {
                    compare: {
                      left: { context: "loadedCount" },
                      op: "gt",
                      right: 0,
                    },
                  },
                  target: "done",
                  answer: { kind: "alert", text: ["Selected"] },
                },
              ],
            },
          },
        },
      },
    },
    help: {
      kind: "state",
      render: "delete",
    },
    done: {
      kind: "final",
      view: {
        kind: "text",
        text: ["Done"],
        parseMode: "plain",
      },
      render: "append",
    },
  },
} as const;

test("published schema accepts every frozen kernel field", () => {
  expect(validate(completeSpec), JSON.stringify(validate.errors)).toBe(true);
});

test("published schema rejects an empty event-source map", () => {
  const spec = structuredClone(minimalSpec) as Record<string, any>;
  spec.on.command = {};

  expect(validate(spec)).toBe(false);
});

test("published schema rejects an empty button payload", () => {
  const spec = structuredClone(completeSpec) as Record<string, any>;
  spec.states.main.view.keyboard[0].buttons[0].payload = {};

  expect(validate(spec)).toBe(false);
});

test("published schema rejects a nested context object", () => {
  const spec = structuredClone(minimalSpec) as Record<string, any>;
  spec.context.properties.profile = {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  };
  spec.context.required = ["profile"];
  spec.context.default = { profile: { name: "Ada" } };

  expect(validate(spec)).toBe(false);
});

test("published schema accepts an omitted empty context required list", () => {
  const spec = structuredClone(minimalSpec) as Record<string, any>;
  delete spec.context.required;

  expect(validate(spec), JSON.stringify(validate.errors)).toBe(true);
});

test("published schema rejects an external context reference", () => {
  const spec = structuredClone(minimalSpec) as Record<string, any>;
  spec.context.properties.name = {
    type: "string",
    $ref: "https://example.org/common.json#/$defs/name",
  };

  expect(validate(spec)).toBe(false);
});
