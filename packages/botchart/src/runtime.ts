import type {
  AssignmentValue,
  BotchartSpec,
  Condition,
  ContextJsonSchema,
  ScalarValue,
  StateId,
  StateNode,
  Transition,
  View,
} from "./spec.generated.js";
import type { JsonObject, JsonValue } from "./spec.js";

export type CoreInputOrigin = "telegram" | "effect" | "scheduler" | "adapter";

export type CoreInput = {
  readonly origin: CoreInputOrigin;
  readonly source: string;
  readonly name: string;
  readonly payload: JsonValue;
};

export type ChatTarget = {
  readonly kind: "chat";
  readonly chatId: number;
};

export type MessageTarget = ChatTarget;

export type ChatHandle = {
  readonly kind: "chat";
  readonly chatId: number;
  readonly messageId: number;
};

export type MessageHandle = ChatHandle;
export type ViewKind = View["kind"];

export type ViewSlot = {
  readonly target: MessageTarget;
  readonly revision: number;
  readonly current?: {
    readonly handle: MessageHandle;
    readonly viewKind: ViewKind;
  };
};

export type CallbackRecord = {
  readonly sessionKey: string;
  readonly stateId: StateId;
  readonly seq: number;
  readonly viewSlot: string;
  readonly viewRevision: number;
  readonly press: string;
  readonly payload: JsonObject;
  readonly durable: boolean;
};

export type CallFrame = {
  readonly unit: string;
  readonly input: JsonObject;
  readonly caller: {
    readonly stateId: StateId;
    readonly entryIndex: number;
  };
};

export type Session<Context extends JsonObject = JsonObject> = {
  readonly position: StateId;
  readonly context: Context;
  readonly history: Readonly<Record<StateId, StateId>>;
  readonly callStack: readonly CallFrame[];
  readonly seq: number;
  readonly viewSlots: Readonly<Record<string, ViewSlot>>;
  readonly callbacks: Readonly<Record<string, CallbackRecord>>;
};

export type SemanticSessionSnapshot<Context extends JsonObject = JsonObject> = Session<Context>;

export type StalenessToken = {
  readonly sessionKey: string;
  readonly stateId: StateId;
  readonly seq: number;
};

export type ViewIntent = {
  readonly kind: "view";
  readonly slot: string;
} & ({
  readonly operation: "send";
  readonly target: MessageTarget;
  readonly view: JsonObject;
} | {
  readonly operation: "edit";
  readonly handle: MessageHandle;
  readonly view: JsonObject;
} | {
  readonly operation: "delete";
  readonly handle: MessageHandle;
} | {
  readonly operation: "replace";
  readonly target: MessageTarget;
  readonly handle: MessageHandle;
  readonly view: JsonObject;
});

export type EffectIntent = {
  readonly kind: "effect";
  readonly id: string;
  readonly effect: string;
  readonly input: JsonObject;
  readonly token: StalenessToken;
};

export type TimerIntent = {
  readonly kind: "timer";
} & ({
  readonly operation: "schedule";
  readonly id: string;
  readonly timer: string;
  readonly fireAt: string;
  readonly token: StalenessToken;
} | {
  readonly operation: "cancel";
  readonly id: string;
});

export type PressAnswerIntent = {
  readonly kind: "pressAnswer";
  readonly callbackQueryId: string;
  readonly answer?: {
    readonly kind: "toast" | "alert";
    readonly text: string;
  };
};

export type Intent = ViewIntent | EffectIntent | TimerIntent | PressAnswerIntent;

export type CoreError = {
  readonly code: string;
  readonly path: string;
  readonly message: string;
};

export type CoreSuccess<Context extends JsonObject = JsonObject> = {
  readonly kind: "ok";
  readonly session: SemanticSessionSnapshot<Context> | null;
  readonly intents: readonly Intent[];
};

export type CoreFailure<Context extends JsonObject = JsonObject> = {
  readonly kind: "error";
  readonly session: SemanticSessionSnapshot<Context>;
  readonly intents: readonly [];
  readonly error: CoreError;
};

export type CoreResult<Context extends JsonObject = JsonObject> =
  | CoreSuccess<Context>
  | CoreFailure<Context>;

export type CoreRunnerRequest<Context extends JsonObject = JsonObject> = {
  readonly spec: BotchartSpec;
  readonly session: Session<Context>;
  readonly input: CoreInput;
  readonly now: string;
};

export type CoreRunner<Context extends JsonObject = JsonObject> = (
  request: CoreRunnerRequest<Context>,
) => CoreResult<Context>;

export type GuardBindingOptions<Context extends JsonObject = JsonObject> = {
  readonly context: Readonly<Context>;
  readonly event: CoreInput;
};

export type GuardBinding<Context extends JsonObject = JsonObject> = (
  options: GuardBindingOptions<Context>,
) => boolean;

export type ContextValidationOptions<Context extends JsonObject = JsonObject> = {
  readonly context: Readonly<Context>;
  readonly schema: ContextJsonSchema;
};

export type ContextValidator<Context extends JsonObject = JsonObject> = (
  options: ContextValidationOptions<Context>,
) => boolean;

export type CreateRunnerOptions<Context extends JsonObject = JsonObject> = {
  readonly guards?: Readonly<Record<string, GuardBinding<Context>>>;
  readonly validateContext?: ContextValidator<Context>;
};

export type CreateSessionOptions = {
  readonly spec: BotchartSpec;
  readonly target?: MessageTarget;
};

type Evaluation<Value> =
  | { readonly kind: "ok"; readonly value: Value }
  | { readonly kind: "error"; readonly error: CoreError };

function evaluationError(code: string, path: string, message: string): Evaluation<never> {
  return { kind: "error", error: { code, path, message } };
}

type SelectedTransition = {
  readonly transition: Transition;
  readonly path: string;
  readonly input: CoreInput;
};

export function createSession<Context extends JsonObject = JsonObject>(
  options: CreateSessionOptions,
): Session<Context> {
  return {
    position: options.spec.initial,
    context: JSON.parse(JSON.stringify(options.spec.context.default)) as Context,
    history: {},
    callStack: [],
    seq: 0,
    viewSlots: options.target === undefined
      ? {}
      : { main: { target: options.target, revision: 0 } },
    callbacks: {},
  };
}

export function step<Context extends JsonObject = JsonObject>(
  request: CoreRunnerRequest<Context>,
): CoreResult<Context> {
  return runStep(request, {});
}

export function createRunner<Context extends JsonObject = JsonObject>(
  options: CreateRunnerOptions<Context>,
): CoreRunner<Context> {
  return (request) => runStep(request, options);
}

function runStep<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): CoreResult<Context> {
  const selection = selectEventTransition(request, options);
  if (selection.kind === "error") {
    return {
      kind: "error",
      session: request.session,
      intents: [],
      error: selection.error,
    };
  }
  const selected = selection.value;
  const transition = selected?.transition;
  const selectedRequest = selected === undefined
    ? request
    : { ...request, input: selected.input };

  const assignment = transition?.assign === undefined
    ? { kind: "ok", value: request.session.context } as const
    : applyAssignments(
        transition.assign,
        `${selected!.path}.assign`,
        selectedRequest,
        options,
      );
  if (assignment.kind === "error") {
    return {
      kind: "error",
      session: request.session,
      intents: [],
      error: assignment.error,
    };
  }
  const nextSession = assignment.value === request.session.context
    ? request.session
    : { ...request.session, context: assignment.value };

  if (transition?.target === undefined) {
    return { kind: "ok", session: nextSession, intents: [] };
  }

  const targetState = stateAt(request.spec, transition.target);
  if (targetState === undefined) {
    return {
      kind: "error",
      session: request.session,
      intents: [],
      error: {
        code: "invalid_transition_target",
        path: "$.input",
        message: `Declare the ${transition.target} state before you target it.`,
      },
    };
  }

  if (targetState.kind === "final") {
    const result = enterFinalState(nextSession, targetState);
    return result.kind === "error" ? { ...result, session: request.session } : result;
  }

  return {
    kind: "ok",
    session: {
      ...nextSession,
      position: transition.target,
      seq: nextSession.seq + 1,
    },
    intents: [],
  };
}

function selectEventTransition<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<SelectedTransition | undefined> {
  const featureSource = isFeatureSource(request);
  if (
    request.input.source !== "press"
    && request.input.source !== "command"
    && request.input.source !== "text"
    && request.input.source !== "message"
    && request.input.source !== "timer"
    && request.input.source !== "lifecycle"
    && request.input.source !== "raw"
    && !featureSource
  ) {
    return { kind: "ok", value: undefined };
  }

  const selection = request.input.source === "raw"
    ? selectRawTransitionInHierarchy(request, options)
    : selectSourceTransitionInHierarchy(request, options);
  if (selection.kind === "error" || selection.value !== undefined) return selection;

  if (
    request.input.source === "command"
    || request.input.source === "text"
    || request.input.source === "message"
    || featureSource
  ) {
    const rawSelection = selectRawTransitionInHierarchy(request, options);
    if (rawSelection.kind === "error" || rawSelection.value !== undefined) {
      return rawSelection;
    }
  }
  return request.input.source === "lifecycle"
    ? selection
    : selectUnhandledTransition(request, options);
}

function isFeatureSource<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
): boolean {
  return request.input.origin === "telegram"
    && request.spec.packs?.length > 0
    && ![
      "press",
      "command",
      "text",
      "message",
      "timer",
      "lifecycle",
      "raw",
      "after",
    ].includes(request.input.source);
}

function selectUnhandledTransition<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<SelectedTransition | undefined> {
  return selectSourceTransitionInHierarchy(
    {
      ...request,
      input: {
        ...request.input,
        source: "lifecycle",
        name: "unhandled",
      },
    },
    options,
  );
}

function selectSourceTransitionInHierarchy<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<SelectedTransition | undefined> {
  for (const scope of handlerScopes(request.spec, request.session.position)) {
    const selection = selectOwnerTransition(
      scope.owner,
      scope.path,
      request,
      options,
    );
    if (selection.kind === "error" || selection.value !== undefined) return selection;
  }
  return { kind: "ok", value: undefined };
}

function selectOwnerTransition<Context extends JsonObject>(
  owner: StateNode | BotchartSpec | undefined,
  ownerPath: string,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<SelectedTransition | undefined> {
  const source = request.input.source;
  if (source === "text") {
    return selectTextTransition(owner, ownerPath, request, options);
  }
  if (source === "command") {
    return selectCommandTransition(owner, ownerPath, request, options);
  }
  if (source === "timer") {
    return selectAfterTransition(owner, ownerPath, request, options);
  }
  return selectTransition(
    directTransitions(owner, source, request.input.name),
    `${ownerPath}.on.${source}.${request.input.name}`,
    request,
    options,
  );
}

function selectTransition<Context extends JsonObject>(
  transitions: readonly Transition[] | undefined,
  path: string,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<SelectedTransition | undefined> {
  if (transitions === undefined) return { kind: "ok", value: undefined };

  for (const [index, transition] of transitions.entries()) {
    const transitionPath = `${path}[${index}]`;
    if (transition.when === undefined) {
      return {
        kind: "ok",
        value: { transition, path: transitionPath, input: request.input },
      };
    }
    const condition = evaluateCondition(
      transition.when,
      `${transitionPath}.when`,
      request,
      options,
    );
    if (condition.kind === "error") return condition;
    if (condition.value) {
      return {
        kind: "ok",
        value: { transition, path: transitionPath, input: request.input },
      };
    }
  }

  return { kind: "ok", value: undefined };
}

function evaluateCondition<Context extends JsonObject>(
  condition: Condition,
  path: string,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<boolean> {
  if ("guard" in condition) {
    const binding = options.guards?.[condition.guard];
    if (binding === undefined) {
      return evaluationError(
        "missing_guard_binding",
        `${path}.guard`,
        `Bind the ${condition.guard} guard before you run the spec.`,
      );
    }
    try {
      const value = binding({
        context: cloneData(request.session.context),
        event: cloneData(request.input),
      });
      if (typeof value === "boolean") return { kind: "ok", value };
    } catch {
      // The error below keeps host exceptions out of the portable result.
    }
    return evaluationError(
      "guard_binding_failed",
      path,
      `Make the ${condition.guard} guard return true or false without throwing.`,
    );
  }

  const left = scalarValue(
    condition.compare.left,
    `${path}.compare.left`,
    request,
  );
  if (left.kind === "error") return left;
  const right = scalarValue(
    condition.compare.right,
    `${path}.compare.right`,
    request,
  );
  if (right.kind === "error") return right;
  if (condition.compare.op === "eq" || condition.compare.op === "neq") {
    if (typeof left.value !== typeof right.value) {
      return evaluationError(
        "invalid_guard_comparison",
        `${path}.compare`,
        "Compare values with the same scalar type.",
      );
    }
  } else if (typeof left.value !== "number" || typeof right.value !== "number") {
    return evaluationError(
      "invalid_guard_comparison",
      `${path}.compare`,
      "Use number values with an ordered comparison.",
    );
  }
  switch (condition.compare.op) {
    case "eq": return { kind: "ok", value: left.value === right.value };
    case "neq": return { kind: "ok", value: left.value !== right.value };
    case "lt": return { kind: "ok", value: left.value < right.value };
    case "lte": return { kind: "ok", value: left.value <= right.value };
    case "gt": return { kind: "ok", value: left.value > right.value };
    case "gte": return { kind: "ok", value: left.value >= right.value };
  }
}

function scalarValue<Context extends JsonObject>(
  value: ScalarValue,
  path: string,
  request: CoreRunnerRequest<Context>,
): Evaluation<string | number | boolean> {
  if (typeof value !== "object") return { kind: "ok", value };
  if ("context" in value) {
    return guardValue(request.session.context[value.context], value.context, path);
  }
  if ("parameter" in value) {
    return guardValue(
      request.spec.parameters[value.parameter]?.default,
      value.parameter,
      path,
    );
  }
  const source = "input" in value ? "input" : "item";
  return evaluationError(
    "invalid_guard_value",
    path,
    `Use ${source} only where a ${source} value is in scope.`,
  );
}

function guardValue(
  value: unknown,
  name: string,
  path: string,
): Evaluation<string | number | boolean> {
  if (value === undefined) {
    return evaluationError(
      "missing_guard_value",
      path,
      `Provide the ${name} value before this guard runs.`,
    );
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return { kind: "ok", value };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "ok", value };
  }
  return evaluationError(
    "invalid_guard_value",
    path,
    `Set ${name} to a scalar value before this guard runs.`,
  );
}

const unset = Symbol("unset");

function applyAssignments<Context extends JsonObject>(
  assignments: Readonly<Record<string, AssignmentValue>>,
  path: string,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<Context> {
  const context: Record<string, JsonValue> = { ...request.session.context };

  for (const [destination, assignment] of Object.entries(assignments)) {
    const assignmentPath = `${path}.${destination}`;
    const schema = request.spec.context.properties[destination];
    if (schema === undefined) {
      return assignmentError(
        assignmentPath,
        `Declare the ${destination} context field before you assign it.`,
      );
    }

    const value = resolveAssignmentValue(
      assignment,
      destination,
      assignmentPath,
      request,
    );
    if (value.kind === "error") return value;
    if (value.value === unset) {
      if (request.spec.context.required?.includes(destination) === true) {
        return assignmentError(
          assignmentPath,
          `Make the ${destination} context field optional before you unset it.`,
        );
      }
      delete context[destination];
    } else {
      context[destination] = value.value;
    }
  }

  if (options.validateContext === undefined) {
    return evaluationError(
      "missing_context_validator",
      path,
      "Provide validateContext when you create a runner that applies assignments.",
    );
  }

  try {
    if (options.validateContext({
      context: cloneData(context as Context),
      schema: request.spec.context,
    })) {
      return { kind: "ok", value: context as Context };
    }
  } catch {
    // The error below keeps validator exceptions out of the portable result.
  }
  return evaluationError(
    "context_validation_failed",
    path,
    "Change this assignment batch so the complete context matches $.context.",
  );
}

function resolveAssignmentValue<Context extends JsonObject>(
  assignment: AssignmentValue,
  destination: string,
  path: string,
  request: CoreRunnerRequest<Context>,
): Evaluation<JsonValue | typeof unset> {
  if (typeof assignment !== "object" || assignment === null || Array.isArray(assignment)) {
    return isJsonValue(assignment)
      ? { kind: "ok", value: assignment }
      : assignmentError(path, `Assign JSON data to the ${destination} context field.`);
  }
  if ("context" in assignment) {
    return sourceValue(request.session.context[assignment.context], path, assignment.context);
  }
  if ("parameter" in assignment) {
    return sourceValue(
      request.spec.parameters[assignment.parameter]?.default,
      path,
      assignment.parameter,
    );
  }
  if ("from" in assignment) {
    const payload = request.input.payload;
    return sourceValue(
      isJsonObject(payload) ? payload[assignment.from] : undefined,
      path,
      assignment.from,
    );
  }
  if ("increment" in assignment || "decrement" in assignment) {
    const current = request.session.context[destination];
    if (typeof current !== "number" || !Number.isFinite(current)) {
      return assignmentError(
        path,
        `Set ${destination} to a required number before you use bounded arithmetic.`,
      );
    }
    const amount = "increment" in assignment ? assignment.increment : -assignment.decrement;
    return { kind: "ok", value: current + amount };
  }
  if ("unset" in assignment) return { kind: "ok", value: unset };
  if ("input" in assignment || "item" in assignment) {
    const source = "input" in assignment ? "input" : "item";
    return assignmentError(
      path,
      `Use ${source} only where a ${source} value is in scope.`,
    );
  }
  return assignmentError(path, `Use one closed assignment value for ${destination}.`);
}

function sourceValue(
  value: unknown,
  path: string,
  source: string,
): Evaluation<JsonValue> {
  if (value === undefined) {
    return evaluationError(
      "missing_assignment_source",
      path,
      `Provide the ${source} value before this assignment runs.`,
    );
  }
  return isJsonValue(value)
    ? { kind: "ok", value }
    : assignmentError(path, `Provide JSON data in the ${source} value.`);
}

function assignmentError(path: string, message: string): Evaluation<never> {
  return evaluationError("invalid_assignment", path, message);
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

function cloneData<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function enterFinalState<Context extends JsonObject>(
  session: Session<Context>,
  state: Extract<StateNode, { readonly kind: "final" }>,
): CoreResult<Context> {
  const slot = session.viewSlots.main;
  if (state.render === "delete") {
    return {
      kind: "ok",
      session: null,
      intents: slot?.current === undefined
        ? []
        : [{
            kind: "view",
            operation: "delete",
            slot: "main",
            handle: slot.current.handle,
          }],
    };
  }

  if (state.render === "edit" && slot?.current !== undefined) {
    return {
      kind: "ok",
      session: null,
      intents: [{
        kind: "view",
        operation: "edit",
        slot: "main",
        handle: slot.current.handle,
        view: state.view as unknown as JsonObject,
      }],
    };
  }

  if (slot === undefined) {
    return {
      kind: "error",
      session,
      intents: [],
      error: {
        code: "missing_view_target",
        path: "$.session.viewSlots.main",
        message: "Add the main view slot before you enter a final state with a view.",
      },
    };
  }

  return {
    kind: "ok",
    session: null,
    intents: [{
      kind: "view",
      operation: "send",
      slot: "main",
      target: slot.target,
      view: state.view as unknown as JsonObject,
    }],
  };
}

function stateAt(spec: BotchartSpec, stateId: StateId): StateNode | undefined {
  let states = spec.states;
  let state: StateNode | undefined;
  const segments = stateId.split(".");

  for (const [index, segment] of segments.entries()) {
    state = states[segment];
    if (state === undefined) return undefined;
    if (index < segments.length - 1) {
      if (state.kind !== "compound") return undefined;
      states = state.states;
    }
  }

  return state;
}

type HandlerOwner = StateNode | BotchartSpec;

function handlerScopes(
  spec: BotchartSpec,
  position: StateId,
): readonly { readonly owner: HandlerOwner; readonly path: string }[] {
  const scopes: { owner: HandlerOwner; path: string }[] = [];
  const segments = position.split(".");
  for (let length = segments.length; length > 0; length -= 1) {
    const stateId = segments.slice(0, length).join(".");
    const state = stateAt(spec, stateId);
    if (state !== undefined) scopes.push({ owner: state, path: statePath(stateId) });
  }
  scopes.push({ owner: spec, path: "$" });
  return scopes;
}

function ownerOn(owner: HandlerOwner | undefined): Readonly<Record<string, unknown>> | undefined {
  if (owner === undefined) return undefined;
  if ("kind" in owner && (owner.kind === "final" || owner.kind === "return")) {
    return undefined;
  }
  return owner.on as Readonly<Record<string, unknown>> | undefined;
}

function directTransitions(
  owner: HandlerOwner | undefined,
  source: string,
  name: string,
): readonly Transition[] | undefined {
  const handlers = ownerOn(owner)?.[source] as
    | Readonly<Record<string, readonly Transition[]>>
    | undefined;
  return handlers?.[name];
}

function selectCommandTransition<Context extends JsonObject>(
  owner: HandlerOwner | undefined,
  ownerPath: string,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<SelectedTransition | undefined> {
  const handlers = ownerOn(owner)?.command as
    | Readonly<Record<string, { readonly pattern?: string; readonly do: readonly Transition[] }>>
    | undefined;
  const entry = handlers?.[request.input.name];
  if (entry === undefined) return { kind: "ok", value: undefined };

  const input = entry.pattern === undefined
    ? request.input
    : matchPatternInput(request.input, entry.pattern, payloadString(request.input, "remainder"));
  if (input === undefined) return { kind: "ok", value: undefined };

  return selectTransition(
    entry.do,
    `${ownerPath}.on.command.${request.input.name}.do`,
    { ...request, input },
    options,
  );
}

function selectTextTransition<Context extends JsonObject>(
  owner: HandlerOwner | undefined,
  ownerPath: string,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<SelectedTransition | undefined> {
  const entries = ownerOn(owner)?.text as
    | readonly { readonly pattern: string; readonly do: readonly Transition[] }[]
    | undefined;
  const text = payloadString(request.input, "text");
  if (entries === undefined || text === undefined) return { kind: "ok", value: undefined };

  for (const [index, entry] of entries.entries()) {
    const input = matchPatternInput(request.input, entry.pattern, text);
    if (input === undefined) continue;
    const selection = selectTransition(
      entry.do,
      `${ownerPath}.on.text[${index}].do`,
      { ...request, input },
      options,
    );
    if (selection.kind === "error" || selection.value !== undefined) return selection;
  }

  return { kind: "ok", value: undefined };
}

function payloadString(input: CoreInput, name: string): string | undefined {
  const payload = isJsonObject(input.payload) ? input.payload : undefined;
  const value = payload?.[name];
  return typeof value === "string" ? value : undefined;
}

function matchPatternInput(
  input: CoreInput,
  pattern: string,
  value: string | undefined,
): CoreInput | undefined {
  if (value === undefined) return undefined;
  const match = new RegExp(pattern, "u").exec(value);
  if (match === null) return undefined;
  const captures = Object.fromEntries(
    Object.entries(match.groups ?? {}).filter((entry): entry is [string, string] =>
      entry[1] !== undefined
    ),
  );
  const payload = isJsonObject(input.payload) ? input.payload : {};
  return { ...input, payload: { ...payload, ...captures } };
}

function selectAfterTransition<Context extends JsonObject>(
  owner: HandlerOwner | undefined,
  ownerPath: string,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<SelectedTransition | undefined> {
  const handlers = ownerOn(owner)?.after as
    | Readonly<Record<string, { readonly do: readonly Transition[] }>>
    | undefined;
  return selectTransition(
    handlers?.[request.input.name]?.do,
    `${ownerPath}.on.after.${request.input.name}.do`,
    request,
    options,
  );
}

function selectRawTransitionInHierarchy<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<SelectedTransition | undefined> {
  for (const scope of handlerScopes(request.spec, request.session.position)) {
    const selection = selectRawTransition(
      scope.owner,
      scope.path,
      request,
      options,
    );
    if (selection.kind === "error" || selection.value !== undefined) return selection;
  }
  return { kind: "ok", value: undefined };
}

function selectRawTransition<Context extends JsonObject>(
  owner: HandlerOwner | undefined,
  ownerPath: string,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<SelectedTransition | undefined> {
  const entries = ownerOn(owner)?.raw as
    | readonly {
        readonly when?: Condition;
        readonly do: readonly Transition[];
      }[]
    | undefined;
  if (entries === undefined) return { kind: "ok", value: undefined };

  for (const [index, entry] of entries.entries()) {
    if (entry.when !== undefined) {
      const condition = evaluateCondition(
        entry.when,
        `${ownerPath}.on.raw[${index}].when`,
        request,
        options,
      );
      if (condition.kind === "error") return condition;
      if (!condition.value) continue;
    }
    const selection = selectTransition(
      entry.do,
      `${ownerPath}.on.raw[${index}].do`,
      request,
      options,
    );
    if (selection.kind === "error" || selection.value !== undefined) return selection;
  }

  return { kind: "ok", value: undefined };
}

function statePath(stateId: StateId): string {
  return `$.states.${stateId.split(".").join(".states.")}`;
}
