export const schemaId = "https://svyatov.github.io/botchart/schema/0.1.0.json" as const;
export const schemaRevision = "0.1.0" as const;
export type JsonScalar = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonScalar | readonly JsonValue[] | JsonObject;

export type {
  BotchartSpec,
  CanonicalState,
  ContextJsonSchema,
} from "./spec.generated.js";
