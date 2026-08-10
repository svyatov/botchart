import {
  schemaId,
  schemaRevision,
  type JsonValue,
} from "./spec.js";
import type {
  BotchartSpec,
  Button,
  Call,
  CanonicalState,
  ContextJsonSchema,
  Effect,
  EntryNode,
  Field,
  FieldMap,
  FinalTextView,
  Pack,
  ParameterMap,
  PressAnswer,
  Projection,
  RequiredField,
  RequiredFieldMap,
  Row,
  Run,
  StalePress,
  StateNode,
  TextView,
} from "./spec.generated.js";

declare function structuredClone<Value>(value: Value): Value;

declare const idBrand: unique symbol;
export type Id<Name extends string = string> = Name & { readonly [idBrand]: true };

export function ids<const Names extends readonly string[]>(
  ...names: Names
): { readonly [Name in Names[number]]: Id<Name> } {
  return Object.fromEntries(names.map((name) => [name, name])) as {
    readonly [Name in Names[number]]: Id<Name>;
  };
}

declare const guardBrand: unique symbol;
export type GuardRef<Name extends string = string> = Name & { readonly [guardBrand]: true };

export function guardRefs<const Names extends readonly string[]>(
  ...names: Names
): { readonly [Name in Names[number]]: GuardRef<Name> } {
  return Object.fromEntries(names.map((name) => [name, name])) as {
    readonly [Name in Names[number]]: GuardRef<Name>;
  };
}

interface ValidationIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | Readonly<{ key: PropertyKey }>)[];
}

type ValidationResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: readonly ValidationIssue[] };

interface JsonSchemaOptions {
  readonly target: "draft-2020-12";
}

interface StandardJsonSchemaConverter {
  readonly input: (options: JsonSchemaOptions) => Record<string, unknown>;
  readonly output: (options: JsonSchemaOptions) => Record<string, unknown>;
}

export interface ContextSchema<Output = Record<string, unknown>> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => ValidationResult<Output> | Promise<ValidationResult<Output>>;
    readonly types?: {
      readonly input: unknown;
      readonly output: Output;
    };
    readonly jsonSchema: StandardJsonSchemaConverter;
  };
}

type InferContext<Schema extends ContextSchema> = NonNullable<
  Schema["~standard"]["types"]
>["output"];

type RootKey<Name extends string> = Name extends `${infer Root}.${string}` ? Root : Name;
type RootKeys<Registry extends Readonly<Record<string, Id>>> = RootKey<keyof Registry & string>;
type Defined<Value> = Exclude<Value, undefined>;

type ContextValue =
  | string
  | number
  | boolean
  | undefined
  | readonly (string | number | boolean)[]
  | readonly Readonly<Record<string, string | number | boolean | undefined>>[];

type ContextOutput = Readonly<Record<string, ContextValue>>;

type ScalarFieldValue<Spec extends Field | RequiredField> = Spec extends {
  readonly enum: readonly (infer EnumValue)[];
}
  ? EnumValue
  : Spec["type"] extends "string"
    ? string
    : Spec["type"] extends "number"
      ? number
      : Spec["type"] extends "boolean"
        ? boolean
        : never;

type RecordFieldValue<Spec extends { readonly fields: FieldMap }> = {
  readonly [Key in keyof Spec["fields"] as Spec["fields"][Key] extends {
    readonly optional: true;
  }
    ? never
    : Key]: RequiredFieldValue<Spec["fields"][Key]>;
} & {
  readonly [Key in keyof Spec["fields"] as Spec["fields"][Key] extends {
    readonly optional: true;
  }
    ? Key
    : never]?: RequiredFieldValue<Spec["fields"][Key]>;
};

type RequiredFieldValue<Spec extends Field | RequiredField> = Spec extends {
  readonly type: "array";
  readonly items: infer Item;
}
  ? readonly (Item extends Field | RequiredField
      ? RequiredFieldValue<Item>
      : Item extends { readonly type: "record"; readonly fields: FieldMap }
        ? RecordFieldValue<Item>
        : never)[]
  : ScalarFieldValue<Spec>;

type FieldValue<Spec extends Field> = RequiredFieldValue<Spec> | (Spec extends {
  readonly optional: true;
}
  ? undefined
  : never);

type ParameterValue<Spec extends ParameterMap[keyof ParameterMap]> = Spec extends Field
  ? RequiredFieldValue<Spec>
  : never;

type OutputKeysWithValue<Output extends ContextOutput, Value> = {
  [Key in keyof Output]-?: [Defined<Output[Key]>] extends [Value]
    ? [Value] extends [Defined<Output[Key]>]
      ? Key
      : never
    : never;
}[keyof Output] & string;

type FieldKeysWithValue<Fields extends FieldMap, Value> = {
  [Key in keyof Fields]-?: [RequiredFieldValue<Fields[Key]>] extends [Value]
    ? [Value] extends [RequiredFieldValue<Fields[Key]>]
      ? Key
      : never
    : never;
}[keyof Fields] & string;

type ParameterKeysWithValue<Parameters extends ParameterMap, Value> = {
  [Key in keyof Parameters]-?: [ParameterValue<Parameters[Key]>] extends [Value]
    ? [Value] extends [ParameterValue<Parameters[Key]>]
      ? Key
      : never
    : never;
}[keyof Parameters] & string;

type ContextRefFor<Output extends ContextOutput, Value> = {
  [Key in OutputKeysWithValue<Output, Value>]: { readonly context: Key };
}[OutputKeysWithValue<Output, Value>];

type ParameterRefFor<Parameters extends ParameterMap, Value> = {
  [Key in ParameterKeysWithValue<Parameters, Value>]: { readonly parameter: Key };
}[ParameterKeysWithValue<Parameters, Value>];

declare const itemBrand: unique symbol;
type ItemRef<Key extends string = string, Value = unknown> = {
  readonly item: Key;
  readonly [itemBrand]: Value;
};

type ItemRefFor<Items extends FieldMap, Value> = {
  [Key in FieldKeysWithValue<Items, Value>]: ItemRef<Key, Value>;
}[FieldKeysWithValue<Items, Value>];

type InputRefFor<Inputs extends FieldMap, Value> = {
  [Key in FieldKeysWithValue<Inputs, Value>]: { readonly input: Key };
}[FieldKeysWithValue<Inputs, Value>];

type ValueInput<
  Value,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Items extends FieldMap = {},
  Inputs extends FieldMap = {},
> =
  | Value
  | ContextRefFor<Output, Value>
  | ParameterRefFor<Parameters, Value>
  | ItemRefFor<Items, Value>
  | InputRefFor<Inputs, Value>;

type ViewBinding<
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Items extends FieldMap = {},
> = (
  | ContextRefFor<Output, string>
  | ContextRefFor<Output, number>
  | ContextRefFor<Output, boolean>
  | ParameterRefFor<Parameters, string>
  | ParameterRefFor<Parameters, number>
  | ParameterRefFor<Parameters, boolean>
  | ItemRefFor<Items, string>
  | ItemRefFor<Items, number>
  | ItemRefFor<Items, boolean>
) & { readonly escape?: "text" | "code" | "url" };

type ViewPart<
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Items extends FieldMap = {},
> = string | ViewBinding<Output, Parameters, Items>;

type NonEmptyList<Value> = readonly [Value, ...Value[]];
type FirstParameter<Function> = Function extends (first: infer First, ...rest: any[]) => unknown
  ? First
  : never;
type SecondParameter<Function> = Function extends (
  first: any,
  second: infer Second,
  ...rest: any[]
) => unknown
  ? Second
  : never;

type EqualityComparison<
  Value,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Items extends FieldMap = {},
> = {
  readonly left: ValueInput<Value, Output, Parameters, Items>;
  readonly op: "eq" | "neq";
  readonly right: ValueInput<Value, Output, Parameters, Items>;
};

type OrderedComparison<
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Items extends FieldMap = {},
> = {
  readonly left: ValueInput<number, Output, Parameters, Items>;
  readonly op: "lt" | "lte" | "gt" | "gte";
  readonly right: ValueInput<number, Output, Parameters, Items>;
};

type Comparison<
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Items extends FieldMap = {},
> =
  | EqualityComparison<string, Output, Parameters, Items>
  | EqualityComparison<number, Output, Parameters, Items>
  | EqualityComparison<boolean, Output, Parameters, Items>
  | OrderedComparison<Output, Parameters, Items>;

type Condition<
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
> =
  | { readonly guard: Guards[keyof Guards] }
  | { readonly compare: Comparison<Output, Parameters> };

type ContextAssignmentValue<
  Value,
  Optional extends boolean,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  From extends FieldMap,
> =
  | ValueInput<Value, Output, Parameters>
  | ([FieldKeysWithValue<From, Value>] extends [never]
      ? never
      : { readonly from: FieldKeysWithValue<From, Value> })
  | (Value extends number
      ? Optional extends true
        ? never
        : { readonly increment: number } | { readonly decrement: number }
      : never)
  | (Optional extends true ? { readonly unset: true } : never);

type Assignment<
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  From extends FieldMap = {},
> = {
  readonly [Key in keyof Output]?: ContextAssignmentValue<
    Defined<Output[Key]>,
    undefined extends Output[Key] ? true : false,
    Output,
    Parameters,
    From
  >;
};

type PressAnswerInput<
  Output extends ContextOutput,
  Parameters extends ParameterMap,
> = {
  readonly kind?: "toast" | "alert";
  readonly text: string | NonEmptyList<ViewPart<Output, Parameters>>;
};

type Transition<
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
  From extends FieldMap = {},
> = {
  readonly target?: StateId;
  readonly assign?: Assignment<Output, Parameters, From>;
  readonly when?: Condition<Output, Parameters, Guards>;
};

type PressTransition<
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
  From extends FieldMap,
> = Transition<StateId, Output, Parameters, Guards, From> & {
  readonly answer?: PressAnswerInput<Output, Parameters>;
};

type Transitions<Value> = Value | NonEmptyList<Value>;

type AuthorPressDecl = { readonly payload?: RequiredFieldMap };
type AuthorPressMap = Readonly<Record<string, AuthorPressDecl>>;

type PayloadFields<Declaration extends AuthorPressDecl> = Declaration extends {
  readonly payload: infer Payload extends RequiredFieldMap;
}
  ? Payload
  : {};

type Captures<Pattern extends string> = Pattern extends `${string}(?<${infer Tail}`
  ? Tail extends `${"=" | "!"}${infer Rest}`
    ? Captures<Rest>
    : Tail extends `${infer Name}>${infer Rest}`
      ? Name | Captures<Rest>
      : never
  : never;

type CaptureFields<Names extends string> = Readonly<Record<Names, { readonly type: "string" }>>;

type CommandEntry<
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
> = {
  readonly pattern?: string;
  readonly do: Transitions<Transition<StateId, Output, Parameters, Guards, any>>;
};

type TextEntry<
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
> = {
  readonly pattern: string;
  readonly do: Transitions<Transition<StateId, Output, Parameters, Guards, any>>;
};

type RawEntry<
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
> = {
  readonly when?: Condition<Output, Parameters, Guards>;
  readonly do: Transitions<Transition<StateId, Output, Parameters, Guards>>;
};

type MessageEvent =
  | "animation"
  | "audio"
  | "contact"
  | "dice"
  | "document"
  | "location"
  | "photo"
  | "poll"
  | "sticker"
  | "venue"
  | "video"
  | "videoNote"
  | "voice";

type LifecycleEvent = "blocked" | "error" | "unhandled";

type OnInput<
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
  Presses extends AuthorPressMap,
> = {
  readonly press?: {
    readonly [Key in keyof Presses]?: Transitions<
      PressTransition<StateId, Output, Parameters, Guards, PayloadFields<Presses[Key]>>
    >;
  };
  readonly command?: Readonly<Record<string, CommandEntry<StateId, Output, Parameters, Guards>>>;
  readonly text?: readonly TextEntry<StateId, Output, Parameters, Guards>[];
  readonly message?: {
    readonly [Key in MessageEvent]?: Transitions<Transition<StateId, Output, Parameters, Guards>>;
  };
  readonly after?: Readonly<
    Record<
      string,
      {
        readonly delay: string;
        readonly do: Transitions<Transition<StateId, Output, Parameters, Guards>>;
      }
    >
  >;
  readonly lifecycle?: {
    readonly [Key in LifecycleEvent]?: Transitions<Transition<StateId, Output, Parameters, Guards>>;
  };
  readonly raw?: readonly RawEntry<StateId, Output, Parameters, Guards>[];
};

declare const buttonBrand: unique symbol;
type ButtonDraft = Button & { readonly [buttonBrand]: true };

type ButtonOptions<
  Name extends string,
  Declaration extends AuthorPressDecl,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Items extends FieldMap = {},
> = {
  readonly label: string | NonEmptyList<ViewPart<Output, Parameters, Items>>;
  readonly press: Name;
  readonly durable?: boolean;
  readonly when?: { readonly compare: Comparison<Output, Parameters, Items> };
} & (keyof PayloadFields<Declaration> extends never
  ? { readonly payload?: never }
  : {
      readonly payload: {
        readonly [Key in keyof PayloadFields<Declaration>]: ValueInput<
          RequiredFieldValue<PayloadFields<Declaration>[Key] & RequiredField>,
          Output,
          Parameters,
          Items
        >;
      };
    });

type AuthorEffectDecl = {
  readonly input?: RequiredFieldMap;
  readonly progress?: FieldMap;
  readonly outcomes: Readonly<Record<string, FieldMap>>;
  readonly timeout?: string;
};

type AuthorEffectMap = Readonly<Record<string, AuthorEffectDecl>>;

type AuthorUnitDecl = {
  readonly input?: RequiredFieldMap;
  readonly output?: FieldMap;
};

type AuthorUnitMap = Readonly<Record<string, AuthorUnitDecl>>;

type InputMap<
  Fields extends RequiredFieldMap,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
> = {
  readonly [Key in keyof Fields]: ValueInput<
    RequiredFieldValue<Fields[Key]>,
    Output,
    Parameters
  >;
};

type FeedbackMap<From extends FieldMap, Output extends ContextOutput> = {
  readonly [Key in keyof Output]?: {
    readonly from: FieldKeysWithValue<From, Defined<Output[Key]>>;
  };
};

type FeedbackSources<Assignment> = Assignment extends Readonly<Record<string, unknown>>
  ? Assignment[keyof Assignment] extends { readonly from: infer From }
    ? From
    : never
  : never;

type ValidFeedback<From extends FieldMap, Output extends ContextOutput, Assignment> =
  keyof From extends never
    ? Assignment extends undefined
      ? unknown
      : keyof Assignment extends never
        ? unknown
        : never
    : Assignment extends FeedbackMap<From, Output>
      ? Exclude<keyof From, FeedbackSources<Assignment>> extends never
        ? unknown
        : never
      : never;

type SameKeys<Left, Right> = Exclude<keyof Left, keyof Right> extends never
  ? Exclude<keyof Right, keyof Left> extends never
    ? unknown
    : never
  : never;

type ValidInput<
  Fields extends RequiredFieldMap,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Input,
> = keyof Fields extends never
  ? Input extends undefined
    ? unknown
    : keyof Input extends never
      ? unknown
      : never
  : Input extends InputMap<Fields, Output, Parameters>
    ? SameKeys<Fields, Input>
    : never;

type OperationResultShape<
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
> = {
  readonly assign?: Readonly<Record<string, { readonly from: string }>>;
  readonly do: Transitions<Transition<StateId, Output, Parameters, Guards>>;
};

type RunShape<
  Name extends string,
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
> = {
  readonly effect: Name;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly onProgress?: { readonly assign?: Readonly<Record<string, { readonly from: string }>> };
  readonly outcomes: Readonly<
    Record<string, OperationResultShape<StateId, Output, Parameters, Guards>>
  >;
};

type ValidRun<
  Declaration extends AuthorEffectDecl,
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
  Shape extends RunShape<string, StateId, Output, Parameters, Guards>,
> = ValidInput<
  Declaration extends { readonly input: infer Input extends RequiredFieldMap } ? Input : {},
  Output,
  Parameters,
  Shape extends { readonly input: infer Input } ? Input : undefined
> &
  (Declaration extends { readonly progress: infer Progress extends FieldMap }
    ? Shape extends { readonly onProgress: { readonly assign?: infer Assign } }
      ? ValidFeedback<Progress, Output, Assign>
      : never
    : Shape extends { readonly onProgress: unknown }
      ? never
      : unknown) &
  SameKeys<Declaration["outcomes"], Shape["outcomes"]> &
  ({
    readonly [Key in keyof Shape["outcomes"]]: Key extends keyof Declaration["outcomes"]
      ? ValidFeedback<
          Declaration["outcomes"][Key],
          Output,
          Shape["outcomes"][Key] extends { readonly assign: infer Assign } ? Assign : undefined
        > extends never
        ? Key
        : never
      : Key;
  }[keyof Shape["outcomes"]] extends never
    ? unknown
    : never);

type CallShape<
  Name extends string,
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
> = {
  readonly unit: Name;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly onReturn: OperationResultShape<StateId, Output, Parameters, Guards>;
};

type StateInput<
  StateId extends Id,
  Output extends ContextOutput,
  Parameters extends ParameterMap,
  Guards extends Readonly<Record<string, GuardRef>>,
  Presses extends AuthorPressMap,
> =
  | {
      readonly view: TextView;
      readonly render?: "edit" | "append";
      readonly entry?: EntryNode | NonEmptyList<EntryNode>;
      readonly on?: OnInput<StateId, Output, Parameters, Guards, Presses>;
      readonly final?: false;
    }
  | {
      readonly view?: never;
      readonly render?: "keep" | "delete";
      readonly entry?: EntryNode | NonEmptyList<EntryNode>;
      readonly on?: OnInput<StateId, Output, Parameters, Guards, Presses>;
      readonly final?: false;
    }
  | {
      readonly initial: string;
      readonly states: Readonly<Record<string, StateNode>>;
      readonly history?: "shallow" | "deep";
      readonly entry?: EntryNode | NonEmptyList<EntryNode>;
      readonly on?: OnInput<StateId, Output, Parameters, Guards, Presses>;
      readonly view?: never;
      readonly render?: never;
      readonly final?: false;
    }
  | {
      readonly final: true;
      readonly view: TextView;
      readonly render?: "edit" | "append";
    }
  | {
      readonly final: true;
      readonly view?: never;
      readonly render?: "delete";
    };

type UnitImplementation = {
  readonly initial: string;
  readonly states: Readonly<Record<string, StateNode>>;
};

type StalePressInput<
  Output extends ContextOutput,
  Parameters extends ParameterMap,
> =
  | { readonly action: "ignore" }
  | { readonly action: "answer"; readonly answer: PressAnswerInput<Output, Parameters> }
  | {
      readonly action: "rerender";
      readonly answer?: PressAnswerInput<Output, Parameters>;
    };

interface SetupConfig<
  Registry extends Readonly<Record<string, Id>>,
  Schema extends ContextSchema,
  Effects extends AuthorEffectMap,
  Guards extends Readonly<Record<string, GuardRef>>,
  Parameters extends ParameterMap,
  Presses extends AuthorPressMap,
  Units extends AuthorUnitMap,
  Output extends ContextOutput,
> {
  readonly ids: Registry;
  readonly context: Schema;
  readonly effects: Effects;
  readonly guards: Guards;
  readonly parameters: Parameters;
  readonly presses: Presses;
  readonly units: Units;
  readonly packs?: readonly Pack[];
  readonly scope?: "user" | "chat" | "chat+user" | "global";
  readonly stalePress?: StalePressInput<Output, Parameters>;
}

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type NonZeroDigit = Exclude<Digit, "0">;
type AllDigits<Value extends string> = Value extends ""
  ? true
  : Value extends `${Digit}${infer Rest}`
    ? AllDigits<Rest>
    : false;

type ValidDuration<Value extends string> = Value extends `${infer Number}${"ms" | "s" | "m" | "h" | "d"}`
  ? Number extends `${NonZeroDigit}${infer Rest}`
    ? AllDigits<Rest> extends true
      ? Value
      : never
    : never
  : never;

type InvalidArithmetic<Value> = Value extends { readonly increment: infer Amount extends number }
  ? `${Amount}` extends `-${string}` | "0"
    ? "increment"
    : never
  : Value extends { readonly decrement: infer Amount extends number }
    ? `${Amount}` extends `-${string}` | "0"
      ? "decrement"
      : never
    : Value extends readonly (infer Item)[]
      ? InvalidArithmetic<Item>
      : Value extends object
        ? { readonly [Key in keyof Value]: InvalidArithmetic<Value[Key]> }[keyof Value]
        : never;

type ValidateArithmetic<Value> = [InvalidArithmetic<Value>] extends [never] ? unknown : never;

type InvalidAssignmentKey<Value, Allowed extends PropertyKey> = Value extends readonly (infer Item)[]
  ? InvalidAssignmentKey<Item, Allowed>
  : Value extends object
    ? (Value extends { readonly assign: infer Assign }
        ? Exclude<keyof Assign, Allowed>
        : never) |
        { readonly [Key in keyof Value]: InvalidAssignmentKey<Value[Key], Allowed> }[keyof Value]
    : never;

type InvalidAnswerKey<Value> = Value extends readonly (infer Item)[]
  ? InvalidAnswerKey<Item>
  : Value extends object
    ? (Value extends { readonly answer: infer Answer }
        ? Exclude<keyof Answer, "kind" | "text">
        : never) |
        { readonly [Key in keyof Value]: InvalidAnswerKey<Value[Key]> }[keyof Value]
    : never;

type ValidateOn<
  Value,
  Presses extends AuthorPressMap,
  Output extends ContextOutput,
  Root extends boolean = false,
> =
  (Value extends { readonly press: infer Press }
    ? Exclude<keyof Press, keyof Presses> extends never
      ? unknown
      : never
    : unknown) &
  (Value extends { readonly after: infer After }
    ? Root extends true
      ? never
      : {
          readonly [Key in keyof After]: After[Key] extends { readonly delay: infer Delay extends string }
            ? Delay extends ValidDuration<Delay>
              ? unknown
              : never
            : never;
        }[keyof After]
    : unknown) &
  (Value extends { readonly press: infer Press }
    ? ValidateArithmetic<Press> &
        ([InvalidAssignmentKey<Press, keyof Output>] extends [never] ? unknown : never) &
        ([InvalidAnswerKey<Press>] extends [never] ? unknown : never)
    : unknown);

type ValidateStateKeys<Value> = Value extends { readonly final: true }
  ? Record<Exclude<keyof Value, "final" | "view" | "render">, never>
  : Value extends { readonly states: unknown }
    ? Record<
        Exclude<keyof Value, "initial" | "states" | "history" | "entry" | "on" | "final">,
        never
      >
    : Record<Exclude<keyof Value, "view" | "render" | "entry" | "on" | "final">, never>;

type ValidateState<
  Value,
  Presses extends AuthorPressMap,
  Output extends ContextOutput,
> = ValidateStateKeys<Value> &
  (Value extends { readonly on: infer On } ? ValidateOn<On, Presses, Output> : unknown);

type ValidateEffects<Effects extends AuthorEffectMap> = keyof Effects extends never
  ? unknown
  : {
      readonly [Key in keyof Effects]: keyof Effects[Key]["outcomes"] extends never
        ? never
        : Effects[Key] extends { readonly timeout: infer Delay extends string }
          ? Delay extends ValidDuration<Delay>
            ? "timeout" extends keyof Effects[Key]["outcomes"]
              ? unknown
              : never
            : never
          : unknown;
    }[keyof Effects];

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof value === "object" && value !== null && "then" in value;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "code" in error) return String(error.code);
  return String(error);
}

function contextDocument(schema: ContextSchema): ContextJsonSchema {
  let exported: Record<string, unknown>;
  try {
    exported = schema["~standard"].jsonSchema.output({ target: "draft-2020-12" });
  } catch (error) {
    throw new Error(
      `The context schema cannot be exported to JSON Schema: ${errorText(error)}. Use a schema that supports draft 2020-12 output.`,
    );
  }

  const result = schema["~standard"].validate({});
  if (isPromise(result)) {
    throw new Error(
      "The context schema returned a Promise. Use synchronous validation so define() can create the initial context.",
    );
  }
  if ("issues" in result && result.issues !== undefined) {
    const detail = result.issues.map((issue) => issue.message).join("; ");
    throw new Error(
      `The context schema cannot create an initial context from {}: ${detail}. Add defaults for every required field.`,
    );
  }
  if (typeof result.value !== "object" || result.value === null || Array.isArray(result.value)) {
    throw new Error("The context schema output must be an object. Use an object schema for session context.");
  }

  const { $schema: _schema, default: _default, ...body } = exported;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...body,
    default: result.value,
  } as ContextJsonSchema;
}

function assertJson(value: unknown, path = "$", seen = new Set<object>()): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(`${path} contains a non-finite number. Use a finite JSON number.`);
  }
  if (typeof value !== "object") {
    throw new Error(`${path} contains ${typeof value}. Replace it with JSON data.`);
  }
  if (seen.has(value)) throw new Error(`${path} contains a cycle. Replace it with acyclic JSON data.`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJson(item, `${path}[${index}]`, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} contains a non-plain object. Replace it with plain JSON data.`);
    }
    for (const [key, item] of Object.entries(value)) assertJson(item, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

function parts(value: unknown): readonly unknown[] {
  const values = typeof value === "string" ? [value] : (value as readonly unknown[]);
  return values.map((part) => {
    if (typeof part !== "object" || part === null || "escape" in part) return part;
    if ("context" in part || "parameter" in part || "input" in part || "item" in part) {
      return { ...part, escape: "text" };
    }
    return part;
  });
}

function answer(value: { readonly kind?: "toast" | "alert"; readonly text: unknown }): PressAnswer {
  return { kind: value.kind ?? "toast", text: parts(value.text) } as PressAnswer;
}

function transition(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (value.target !== undefined) result.target = value.target;
  if (value.when !== undefined) result.when = value.when;
  if (value.assign !== undefined) result.assign = value.assign;
  if (value.answer !== undefined) result.answer = answer(value.answer as Parameters<typeof answer>[0]);
  return result;
}

function transitionList(value: unknown): readonly Record<string, unknown>[] {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => transition(item as Record<string, unknown>));
}

function onBlock(value: Record<string, unknown>, root: boolean): Record<string, unknown> {
  if (root && value.after !== undefined) {
    throw new Error("Root on.after is invalid. Move the timer to a state.");
  }
  const output: Record<string, unknown> = {};
  for (const name of ["press", "message", "lifecycle"] as const) {
    const handlers = value[name];
    if (handlers === undefined) continue;
    output[name] = Object.fromEntries(
      Object.entries(handlers as Record<string, unknown>).map(([key, item]) => [
        key,
        transitionList(item),
      ]),
    );
  }
  if (value.command !== undefined) {
    output.command = Object.fromEntries(
      Object.entries(value.command as Record<string, Record<string, unknown>>).map(([key, item]) => [
        key,
        {
          ...(item.pattern === undefined ? {} : { pattern: item.pattern }),
          do: transitionList(item.do),
        },
      ]),
    );
  }
  for (const name of ["text", "raw"] as const) {
    const handlers = value[name];
    if (handlers === undefined) continue;
    output[name] = (handlers as readonly Record<string, unknown>[]).map((item) => ({
      ...(item.pattern === undefined ? {} : { pattern: item.pattern }),
      ...(item.when === undefined ? {} : { when: item.when }),
      do: transitionList(item.do),
    }));
  }
  if (value.after !== undefined) {
    output.after = Object.fromEntries(
      Object.entries(value.after as Record<string, Record<string, unknown>>).map(([key, item]) => [
        key,
        { delay: item.delay, do: transitionList(item.do) },
      ]),
    );
  }
  return output;
}

function operationResult(value: Record<string, unknown>): Record<string, unknown> {
  return {
    assign: (value.assign ?? {}) as JsonValue,
    do: transitionList(value.do),
  };
}

function entryList(value: unknown): readonly EntryNode[] {
  return (Array.isArray(value) ? value : [value]) as readonly EntryNode[];
}

function stalePress(value: unknown): StalePress {
  const input = value as Record<string, unknown>;
  return {
    action: input.action,
    ...(input.answer === undefined
      ? {}
      : { answer: answer(input.answer as Parameters<typeof answer>[0]) }),
  } as StalePress;
}

export function createBot<
  const Registry extends Readonly<Record<string, Id>>,
  const Schema extends ContextSchema,
  const Effects extends AuthorEffectMap,
  const Guards extends Readonly<Record<string, GuardRef>>,
  const Parameters extends ParameterMap,
  const Presses extends AuthorPressMap,
  const Units extends AuthorUnitMap,
  StateId extends Id = Registry[keyof Registry],
  Output extends ContextOutput = InferContext<Schema> extends ContextOutput
    ? InferContext<Schema>
    : never,
  ContextKey extends keyof Output & string = keyof Output & string,
  Root extends string = RootKeys<Registry>,
>(
  setup: SetupConfig<Registry, Schema, Effects, Guards, Parameters, Presses, Units, Output> &
    ValidateEffects<Effects> &
    ([Output] extends [never] ? never : unknown),
) {
  function view(value: {
    readonly kind?: "text";
    readonly text: string | NonEmptyList<ViewPart<Pick<Output, ContextKey>, Parameters>>;
    readonly parseMode?: "plain" | "HTML" | "MarkdownV2";
    readonly keyboard?: NonEmptyList<NonEmptyList<ButtonDraft> | Projection>;
  }): TextView {
    return {
      kind: "text",
      text: parts(value.text),
      parseMode: value.parseMode ?? "plain",
      ...(value.keyboard === undefined
        ? {}
        : {
            keyboard: value.keyboard.map((node) =>
              Array.isArray(node) ? { kind: "row", buttons: node } : node,
            ),
          }),
    } as TextView;
  }

  function btn<
    const Name extends keyof Presses & string,
    const Items extends FieldMap = {},
  >(
    options: ButtonOptions<Name, Presses[Name], Pick<Output, ContextKey>, Parameters, Items>,
  ): ButtonDraft {
    return {
      kind: "button",
      label: parts(options.label),
      press: options.press,
      durable: options.durable ?? false,
      ...(options.payload === undefined ? {} : { payload: options.payload }),
      ...(options.when === undefined ? {} : { when: options.when }),
    } as unknown as ButtonDraft;
  }

  function project<
    const Key extends {
      [Name in keyof Pick<Output, ContextKey>]-?: Defined<Pick<Output, ContextKey>[Name]> extends readonly unknown[]
        ? Name
        : never;
    }[keyof Pick<Output, ContextKey>] & string,
    const Maximum extends number,
  >(options: {
    readonly source: { readonly context: Key };
    readonly maxItems: Maximum extends 0 ? never : `${Maximum}` extends `-${string}` ? never : Maximum;
    readonly rows: (
      item: <const ItemKey extends keyof (
        Defined<Pick<Output, ContextKey>[Key]> extends readonly (infer Item)[]
          ? Item extends Readonly<Record<string, unknown>>
            ? Item
            : {}
          : {}
      ) & string>(name: ItemKey) => ItemRef<
        ItemKey,
        Defined<Pick<Output, ContextKey>[Key]> extends readonly (infer Item)[]
          ? Item extends Readonly<Record<string, unknown>>
            ? Defined<Item[ItemKey]>
            : never
          : never
      >,
      button: <const Name extends keyof Presses & string>(
        value: ButtonOptions<
          Name,
          Presses[Name],
          Pick<Output, ContextKey>,
          Parameters,
          Defined<Pick<Output, ContextKey>[Key]> extends readonly (infer Item)[]
            ? Item extends Readonly<Record<string, unknown>>
              ? {
                  readonly [ItemKey in keyof Item]: Defined<Item[ItemKey]> extends string
                    ? { readonly type: "string" }
                    : Defined<Item[ItemKey]> extends number
                      ? { readonly type: "number" }
                      : { readonly type: "boolean" };
                }
              : {}
            : {}
        >,
      ) => ButtonDraft,
    ) => NonEmptyList<NonEmptyList<ButtonDraft>>;
  }): Projection {
    const item = ((name: string) => ({ item: name })) as FirstParameter<typeof options.rows>;
    const rows = options.rows(item, btn as SecondParameter<typeof options.rows>);
    return {
      kind: "project",
      source: options.source,
      maxItems: options.maxItems,
      rows: rows.map((buttons) => ({ kind: "row", buttons }) satisfies Row),
    } as Projection;
  }

  function text<const Pattern extends string>(options: {
    readonly pattern: Pattern;
    readonly do: Transitions<
      Transition<
        StateId,
        Pick<Output, ContextKey>,
        Parameters,
        Guards,
        CaptureFields<Captures<Pattern>>
      >
    >;
  }): TextEntry<StateId, Pick<Output, ContextKey>, Parameters, Guards> {
    return options;
  }

  function cmd<const Pattern extends string = never>(options: {
    readonly pattern?: Pattern;
    readonly do: Transitions<
      Transition<
        StateId,
        Pick<Output, ContextKey>,
        Parameters,
        Guards,
        [Pattern] extends [never] ? {} : CaptureFields<Captures<Pattern>>
      >
    >;
  }): CommandEntry<StateId, Pick<Output, ContextKey>, Parameters, Guards> {
    return options;
  }

  function raw(
    options: RawEntry<StateId, Pick<Output, ContextKey>, Parameters, Guards>,
  ): RawEntry<StateId, Pick<Output, ContextKey>, Parameters, Guards> {
    return options;
  }

  function run<
    const Shape extends RunShape<
      keyof Effects & string,
      StateId,
      Pick<Output, ContextKey>,
      Parameters,
      Guards
    >,
  >(
    options: Shape &
      ValidRun<
        Effects[Shape["effect"]],
        StateId,
        Pick<Output, ContextKey>,
        Parameters,
        Guards,
        Shape
      >,
  ): Run {
    return {
      kind: "run",
      effect: options.effect,
      input: (options.input ?? {}) as Run["input"],
      ...(options.onProgress === undefined
        ? {}
        : { onProgress: { assign: options.onProgress.assign ?? {} } }),
      outcomes: Object.fromEntries(
        Object.entries(options.outcomes).map(([name, result]) => [name, operationResult(result)]),
      ),
    } as unknown as Run;
  }

  function call<
    const Name extends keyof Units & string,
    const Shape extends CallShape<
      Name,
      StateId,
      Pick<Output, ContextKey>,
      Parameters,
      Guards
    >,
  >(
    options: Shape &
      ValidInput<
        Units[Name] extends { readonly input: infer Input extends RequiredFieldMap } ? Input : {},
        Pick<Output, ContextKey>,
        Parameters,
        Shape extends { readonly input: infer Input } ? Input : undefined
      > &
      ValidFeedback<
        Units[Name] extends { readonly output: infer UnitOutput extends FieldMap } ? UnitOutput : {},
        Pick<Output, ContextKey>,
        Shape["onReturn"] extends { readonly assign: infer Assign } ? Assign : undefined
      >,
  ): Call {
    return {
      kind: "call",
      unit: options.unit,
      input: (options.input ?? {}) as Call["input"],
      onReturn: operationResult(options.onReturn),
    } as unknown as Call;
  }

  function returnState<const Name extends keyof Units & string>(options: {
    readonly unit: Name;
    readonly output: {
      readonly [Key in keyof (Units[Name] extends {
        readonly output: infer UnitOutput extends FieldMap;
      }
        ? UnitOutput
        : {})]: ValueInput<
        RequiredFieldValue<
          (Units[Name] extends { readonly output: infer UnitOutput extends FieldMap }
            ? UnitOutput
            : {})[Key] & Field
        >,
        Pick<Output, ContextKey>,
        Parameters,
        {},
        Units[Name] extends { readonly input: infer Input extends RequiredFieldMap } ? Input : {}
      >;
    };
  }): StateNode {
    return { kind: "return", output: options.output } as StateNode;
  }

  function state<const Node>(
    node: Node &
      StateInput<StateId, Pick<Output, ContextKey>, Parameters, Guards, Presses> &
      ValidateState<Node, Presses, Pick<Output, ContextKey>>,
  ): StateNode {
    const value = node as Record<string, unknown>;
    if (value.final === true) {
      if (value.view !== undefined && "keyboard" in (value.view as object)) {
        throw new Error("A final state cannot contain a keyboard. Remove the keyboard from its view.");
      }
      return {
        kind: "final",
        ...(value.view === undefined ? {} : { view: value.view as FinalTextView }),
        render: value.view === undefined ? "delete" : (value.render ?? "append"),
      } as StateNode;
    }
    if (value.states !== undefined) {
      return {
        kind: "compound",
        initial: value.initial,
        states: value.states,
        ...(value.history === undefined ? {} : { history: value.history }),
        ...(value.entry === undefined ? {} : { entry: entryList(value.entry) }),
        ...(value.on === undefined
          ? {}
          : { on: onBlock(value.on as Record<string, unknown>, false) }),
      } as StateNode;
    }
    return {
      kind: "state",
      ...(value.view === undefined ? {} : { view: value.view }),
      render: value.view === undefined ? (value.render ?? "keep") : (value.render ?? "edit"),
      ...(value.entry === undefined ? {} : { entry: entryList(value.entry) }),
      ...(value.on === undefined
        ? {}
        : { on: onBlock(value.on as Record<string, unknown>, false) }),
    } as StateNode;
  }

  function define<const Config extends {
    readonly initial: StateId;
    readonly on?: Omit<
      OnInput<StateId, Pick<Output, ContextKey>, Parameters, Guards, Presses>,
      "after"
    >;
    readonly states: { readonly [Key in Root]: StateNode };
    readonly units: { readonly [Key in keyof Units]: UnitImplementation };
  }>(
    config: Config &
      (Config extends { readonly on: infer On }
        ? ValidateOn<On, Presses, Pick<Output, ContextKey>, true>
        : unknown) &
      SameKeys<Config["states"], Record<Root, StateNode>> &
      Record<Exclude<keyof Config, "initial" | "on" | "states" | "units">, never>,
  ): BotchartSpec {
    const canonicalUnits = Object.fromEntries(
      Object.entries(config.units).map(([name, implementation]) => [
        name,
        {
          input: setup.units[name]?.input ?? {},
          output: setup.units[name]?.output ?? {},
          initial: implementation.initial,
          states: implementation.states,
        },
      ]),
    );
    const canonicalEffects = Object.fromEntries(
      Object.entries(setup.effects).map(([name, declaration]) => [
        name,
        {
          input: declaration.input ?? {},
          ...(declaration.progress === undefined ? {} : { progress: declaration.progress }),
          outcomes: declaration.outcomes,
          ...(declaration.timeout === undefined ? {} : { timeout: declaration.timeout }),
        } satisfies Effect,
      ]),
    );
    const canonicalPresses = Object.fromEntries(
      Object.entries(setup.presses).map(([name, declaration]) => [
        name,
        { payload: declaration.payload ?? {} },
      ]),
    );
    const spec = {
      $schema: schemaId,
      version: 1,
      schemaRevision,
      packs: setup.packs ?? [],
      scope: setup.scope ?? "chat+user",
      context: contextDocument(setup.context),
      parameters: setup.parameters,
      guards: Object.fromEntries(Object.keys(setup.guards).map((name) => [name, {}])),
      effects: canonicalEffects,
      presses: canonicalPresses,
      units: canonicalUnits,
      stalePress: setup.stalePress === undefined
        ? { action: "ignore" }
        : stalePress(setup.stalePress),
      initial: config.initial,
      on: config.on === undefined ? {} : onBlock(config.on as Record<string, unknown>, true),
      states: config.states,
    };
    assertJson(spec);
    structuredClone(spec);
    return spec as unknown as BotchartSpec;
  }

  return { btn, call, cmd, define, project, raw, returnState, run, state, text, view };
}
