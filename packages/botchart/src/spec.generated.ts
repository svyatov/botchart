// Generated from packages/botchart/schema.json by scripts/generate-schema-types.rb.
// Run the generator after each schema change.

export type Name = string;

export type StateId = string;

export type CommandName = string;

export type Delay = string;

export type Semver = string;

export type Pack = {
  readonly id: string;
  readonly version: Semver;
};

export type ContextLocalRef = {
  readonly $ref: string;
};

export type ContextScalarSchema = {
  readonly type: "string" | "number" | "integer" | "boolean";
  readonly $ref?: string;
};

export type ContextScalarOrRef = ContextScalarSchema | ContextLocalRef;

export type ContextRecordSchema = {
  readonly type: "object";
  readonly $ref?: string;
  readonly properties: Readonly<Record<string, ContextScalarOrRef>>;
  readonly required?: readonly Name[];
  readonly additionalProperties?: false;
  readonly unevaluatedProperties?: false;
};

export type ContextArraySchema = {
  readonly type: "array";
  readonly $ref?: string;
  readonly items: ContextScalarSchema | ContextRecordSchema | ContextLocalRef;
};

export type ContextFieldSchema = ContextScalarSchema | ContextArraySchema | ContextLocalRef;

export type ContextSchema = {
  readonly $schema: "https://json-schema.org/draft/2020-12/schema";
  readonly type: "object";
  readonly $ref?: string;
  readonly properties: Readonly<Record<string, ContextFieldSchema>>;
  readonly required?: readonly Name[];
  readonly additionalProperties?: false;
  readonly unevaluatedProperties?: false;
  readonly default: Readonly<Record<string, unknown>>;
  readonly $defs?: Readonly<Record<string, ContextFieldSchema>>;
};

export type StringField = {
  readonly type: "string";
  readonly optional?: true;
  readonly enum?: readonly string[];
};

export type NumberField = {
  readonly type: "number";
  readonly optional?: true;
  readonly enum?: readonly number[];
};

export type BooleanField = {
  readonly type: "boolean";
  readonly optional?: true;
};

export type RequiredStringField = {
  readonly type: "string";
  readonly enum?: readonly string[];
};

export type RequiredNumberField = {
  readonly type: "number";
  readonly enum?: readonly number[];
};

export type RequiredBooleanField = {
  readonly type: "boolean";
};

export type ScalarField = StringField | NumberField | BooleanField;

export type RequiredScalarField = RequiredStringField | RequiredNumberField | RequiredBooleanField;

export type RecordField = {
  readonly type: "record";
  readonly fields: Readonly<Record<string, ScalarField>>;
};

export type ArrayField = {
  readonly type: "array";
  readonly items: RequiredScalarField | RecordField;
  readonly optional?: true;
};

export type RequiredArrayField = {
  readonly type: "array";
  readonly items: RequiredScalarField | RecordField;
};

export type Field = ScalarField | ArrayField;

export type RequiredField = RequiredScalarField | RequiredArrayField;

export type FieldMap = Readonly<Record<string, Field>>;

export type RequiredFieldMap = Readonly<Record<string, RequiredField>>;

export type StringParameter = {
  readonly type: "string";
  readonly enum?: readonly string[];
  readonly default: string;
};

export type NumberParameter = {
  readonly type: "number";
  readonly enum?: readonly number[];
  readonly default: number;
};

export type BooleanParameter = {
  readonly type: "boolean";
  readonly default: boolean;
};

export type ArrayParameter = {
  readonly type: "array";
  readonly items: RequiredScalarField | RecordField;
  readonly default: readonly unknown[];
};

export type Parameter = StringParameter | NumberParameter | BooleanParameter | ArrayParameter;

export type ParameterMap = Readonly<Record<string, Parameter>>;

export type GuardMap = Readonly<Record<string, {}>>;

export type Effect = {
  readonly input: RequiredFieldMap;
  readonly progress?: unknown;
  readonly outcomes: Readonly<Record<string, FieldMap>>;
  readonly timeout?: Delay;
};

export type EffectMap = Readonly<Record<string, Effect>>;

export type Press = {
  readonly payload: RequiredFieldMap;
};

export type PressMap = Readonly<Record<string, Press>>;

export type ContextRef = {
  readonly context: Name;
};

export type ParameterRef = {
  readonly parameter: Name;
};

export type InputRef = {
  readonly input: Name;
};

export type ItemRef = {
  readonly item: Name;
};

export type ValueRef = ContextRef | ParameterRef | InputRef | ItemRef;

export type DirectValue = string | number | boolean | readonly unknown[];

export type Value = DirectValue | ValueRef;

export type From = {
  readonly from: Name;
};

export type Increment = {
  readonly increment: number;
};

export type Decrement = {
  readonly decrement: number;
};

export type Unset = {
  readonly unset: true;
};

export type AssignmentValue = Value | From | Increment | Decrement | Unset;

export type Assignment = Readonly<Record<string, AssignmentValue>>;

export type ScalarValue = string | number | boolean | ValueRef;

export type Comparison = {
  readonly left: ScalarValue;
  readonly op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
  readonly right: ScalarValue;
};

export type ComparisonCondition = {
  readonly compare: Comparison;
};

export type GuardCondition = {
  readonly guard: Name;
};

export type Condition = GuardCondition | ComparisonCondition;

export type ViewBinding = ({
  readonly context: Name;
  readonly escape: "text" | "code" | "url";
}) | ({
  readonly parameter: Name;
  readonly escape: "text" | "code" | "url";
}) | ({
  readonly input: Name;
  readonly escape: "text" | "code" | "url";
}) | ({
  readonly item: Name;
  readonly escape: "text" | "code" | "url";
});

export type ViewPart = string | ViewBinding;

export type ViewParts = readonly ViewPart[];

export type PressAnswer = {
  readonly kind: "toast" | "alert";
  readonly text: ViewParts;
};

export type Button = {
  readonly kind: "button";
  readonly label: ViewParts;
  readonly press: Name;
  readonly payload?: Readonly<Record<string, Value>>;
  readonly durable: boolean;
  readonly when?: ComparisonCondition;
  readonly appearance?: never;
};

export type Row = {
  readonly kind: "row";
  readonly buttons: readonly Button[];
};

export type Projection = {
  readonly kind: "project";
  readonly source: {
    readonly context: Name;
  };
  readonly maxItems: number;
  readonly rows: readonly Row[];
};

export type KeyboardNode = Row | Projection;

export type TextView = {
  readonly kind: "text";
  readonly text: ViewParts;
  readonly parseMode: "plain" | "HTML" | "MarkdownV2";
  readonly keyboard?: readonly KeyboardNode[];
};

export type FinalTextView = {
  readonly kind: "text";
  readonly text: ViewParts;
  readonly parseMode: "plain" | "HTML" | "MarkdownV2";
};

export type View = TextView;

export type Transition = {
  readonly target?: StateId;
  readonly when?: Condition;
  readonly assign?: Assignment;
};

export type PressTransition = {
  readonly target?: StateId;
  readonly when?: Condition;
  readonly assign?: Assignment;
  readonly answer?: PressAnswer;
};

export type TransitionList = readonly Transition[];

export type PressTransitionList = readonly PressTransition[];

export type PressHandlers = Readonly<Record<string, PressTransitionList>>;

export type CommandEntry = {
  readonly pattern?: string;
  readonly do: TransitionList;
};

export type CommandHandlers = Readonly<Record<string, CommandEntry>>;

export type TextEntry = {
  readonly pattern: string;
  readonly do: TransitionList;
};

export type TextHandlers = readonly TextEntry[];

export type MessageHandlers = {
  readonly animation?: TransitionList;
  readonly audio?: TransitionList;
  readonly contact?: TransitionList;
  readonly dice?: TransitionList;
  readonly document?: TransitionList;
  readonly location?: TransitionList;
  readonly photo?: TransitionList;
  readonly poll?: TransitionList;
  readonly sticker?: TransitionList;
  readonly venue?: TransitionList;
  readonly video?: TransitionList;
  readonly videoNote?: TransitionList;
  readonly voice?: TransitionList;
};

export type AfterEntry = {
  readonly delay: Delay;
  readonly do: TransitionList;
};

export type AfterHandlers = Readonly<Record<string, AfterEntry>>;

export type LifecycleHandlers = {
  readonly blocked?: TransitionList;
  readonly error?: TransitionList;
  readonly unhandled?: TransitionList;
};

export type RawEntry = {
  readonly when?: Condition;
  readonly do: TransitionList;
};

export type RawHandlers = readonly RawEntry[];

export type RootOn = {
  readonly press?: PressHandlers;
  readonly command?: CommandHandlers;
  readonly text?: TextHandlers;
  readonly message?: MessageHandlers;
  readonly lifecycle?: LifecycleHandlers;
  readonly raw?: RawHandlers;
};

export type StateOn = {
  readonly press?: PressHandlers;
  readonly command?: CommandHandlers;
  readonly text?: TextHandlers;
  readonly message?: MessageHandlers;
  readonly after?: AfterHandlers;
  readonly lifecycle?: LifecycleHandlers;
  readonly raw?: RawHandlers;
};

export type ProducedAssignment = Readonly<Record<string, From>>;

export type OperationResult = {
  readonly assign: ProducedAssignment;
  readonly do: TransitionList;
};

export type Run = {
  readonly kind: "run";
  readonly effect: Name;
  readonly input: Readonly<Record<string, Value>>;
  readonly onProgress?: {
    readonly assign: ProducedAssignment;
  };
  readonly outcomes: Readonly<Record<string, OperationResult>>;
};

export type Call = {
  readonly kind: "call";
  readonly unit: Name;
  readonly input: Readonly<Record<string, Value>>;
  readonly onReturn: OperationResult;
};

export type EntryNode = Run | Call;

export type Entry = readonly EntryNode[];

export type AtomicStateWithView = {
  readonly kind: "state";
  readonly view: View;
  readonly render: "edit" | "append";
  readonly entry?: Entry;
  readonly on?: StateOn;
};

export type AtomicStateWithoutView = {
  readonly kind: "state";
  readonly render: "keep" | "delete";
  readonly entry?: Entry;
  readonly on?: StateOn;
};

export type CompoundState = {
  readonly kind: "compound";
  readonly initial: Name;
  readonly states: StateMap;
  readonly history?: "shallow" | "deep";
  readonly entry?: Entry;
  readonly on?: StateOn;
};

export type FinalStateWithView = {
  readonly kind: "final";
  readonly view: FinalTextView;
  readonly render: "edit" | "append";
};

export type FinalStateWithoutView = {
  readonly kind: "final";
  readonly render: "delete";
};

export type ReturnState = {
  readonly kind: "return";
  readonly output: Readonly<Record<string, Value>>;
};

export type StateNode = AtomicStateWithView | AtomicStateWithoutView | CompoundState | FinalStateWithView | FinalStateWithoutView | ReturnState;

export type StateMap = Readonly<Record<string, StateNode>>;

export type Unit = {
  readonly input: RequiredFieldMap;
  readonly output: FieldMap;
  readonly initial: Name;
  readonly states: StateMap;
};

export type UnitMap = Readonly<Record<string, Unit>>;

export type StalePress = {
  readonly action: "ignore";
} | {
  readonly action: "answer";
  readonly answer: PressAnswer;
} | {
  readonly action: "rerender";
  readonly answer?: PressAnswer;
};

export type BotchartSpec = {
  readonly $schema: "https://svyatov.github.io/botchart/schema/0.1.0.json";
  readonly version: 1;
  readonly schemaRevision: "0.1.0";
  readonly packs: readonly Pack[];
  readonly scope: "user" | "chat" | "chat+user" | "global";
  readonly context: ContextSchema;
  readonly parameters: ParameterMap;
  readonly guards: GuardMap;
  readonly effects: EffectMap;
  readonly presses: PressMap;
  readonly units: UnitMap;
  readonly stalePress: StalePress;
  readonly initial: Name;
  readonly on: RootOn;
  readonly states: StateMap;
};
export type CanonicalState = StateNode;
export type ContextJsonSchema = ContextSchema;
