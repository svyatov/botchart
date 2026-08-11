import type {
  AssignmentValue,
  BotchartSpec,
  Button,
  Comparison,
  Condition,
  ContextJsonSchema,
  FieldMap,
  KeyboardNode,
  PressAnswer,
  ProducedAssignment,
  Run,
  ScalarValue,
  StateId,
  StateNode,
  Transition,
  Value,
  View,
  ViewPart,
} from "./spec.generated.js";
import type { JsonObject, JsonValue } from "./spec.js";

export type CoreInputOrigin = "telegram" | "effect" | "scheduler" | "adapter";

export type CoreInput = {
  readonly origin: CoreInputOrigin;
  readonly source: string;
  readonly name: string;
  readonly payload: JsonValue;
};

const runtimeSessionKey = Symbol("runtimeSessionKey");

type RuntimeCoreInput = CoreInput & {
  readonly [runtimeSessionKey]?: string;
};

export type EffectFeedbackPayload = {
  readonly id: string;
  readonly token: StalenessToken;
  readonly output: JsonObject;
};

export type EffectProgressInput = {
  readonly origin: "effect";
  readonly source: "progress";
  readonly name: string;
  readonly payload: EffectFeedbackPayload;
};

export type EffectOutcomeInput = {
  readonly origin: "effect";
  readonly source: "outcome";
  readonly name: string;
  readonly payload: EffectFeedbackPayload;
};

export type EffectFeedbackInput = EffectProgressInput | EffectOutcomeInput;

export type TimerFiringPayload = {
  readonly id: string;
  readonly token: StalenessToken;
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
  readonly handle?: MessageHandle;
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

export type EditCompatibility = "edit" | "replace" | "unsupported";

export type EditCompatibilityMatrix = Readonly<Record<
  string,
  Readonly<Record<string, Readonly<Record<string, EditCompatibility>>>>
>>;

export type CreateRunnerOptions<Context extends JsonObject = JsonObject> = {
  readonly guards?: Readonly<Record<string, GuardBinding<Context>>>;
  readonly validateContext?: ContextValidator<Context>;
  readonly viewCompatibility?: EditCompatibilityMatrix;
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
  readonly transition: RuntimeTransition;
  readonly path: string;
  readonly input: CoreInput;
};

type RuntimeTransition = Transition & {
  readonly answer?: PressAnswer;
};

type AcceptedPress = {
  readonly callbackQueryId: string;
};

type PreparedPress<Context extends JsonObject> = {
  readonly kind: "accepted";
  readonly request: CoreRunnerRequest<Context>;
  readonly press: AcceptedPress;
} | {
  readonly kind: "stale";
  readonly callbackQueryId: string;
};

export function createSession<Context extends JsonObject = JsonObject>(
  options: CreateSessionOptions,
): Session<Context> {
  return {
    position: initialStateId(options.spec.states, options.spec.initial),
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

function initialStateId(
  states: Readonly<Record<string, StateNode>>,
  initial: string,
  prefix = "",
): StateId {
  const stateId = (prefix === "" ? initial : `${prefix}.${initial}`) as StateId;
  const state = states[initial];
  return state?.kind === "compound"
    ? initialStateId(state.states, state.initial, stateId)
    : stateId;
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
  return removeObsoleteCallbacks(executeStep(request, options));
}

function executeStep<Context extends JsonObject>(
  originalRequest: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): CoreResult<Context> {
  let request = originalRequest;
  if (request.input.origin === "adapter" && request.input.source === "view") {
    return commitViewResult(request);
  }
  if (request.input.origin === "effect") {
    return runEffectFeedback(request, options);
  }
  if (request.input.origin === "scheduler" && request.input.source === "timer") {
    const prepared = prepareTimerFiring(request);
    if (prepared.kind === "error") {
      return {
        kind: "error",
        session: request.session,
        intents: [],
        error: prepared.error,
      };
    }
    if (prepared.value === "stale") {
      return { kind: "ok", session: request.session, intents: [] };
    }
  }
  let acceptedPress: AcceptedPress | undefined;
  if (request.input.origin === "telegram" && request.input.source === "press") {
    const prepared = preparePress(request);
    if (prepared.kind === "error") {
      return {
        kind: "error",
        session: request.session,
        intents: [],
        error: prepared.error,
      };
    }
    if (prepared.value.kind === "stale") {
      return handleStalePress(request, prepared.value.callbackQueryId, options);
    }
    request = prepared.value.request;
    acceptedPress = prepared.value.press;
  }
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
  const answer = acceptedPress === undefined
    ? { kind: "ok", value: undefined } as const
    : renderAcceptedPressAnswer(
        acceptedPress,
        transition?.answer,
        transition === undefined ? "$.input" : `${selected!.path}.answer`,
        { ...selectedRequest, session: nextSession },
      );
  if (answer.kind === "error") {
    return {
      kind: "error",
      session: originalRequest.session,
      intents: [],
      error: answer.error,
    };
  }

  if (transition?.target === undefined) {
    return withPressAnswer(
      { kind: "ok", session: nextSession, intents: [] },
      answer.value,
    );
  }

  const targetState = activeStateAt(request.spec, nextSession, transition.target);
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

  const cancelled = cancelExitedStateTimers(
    nextSession,
    transition.target,
    request,
  );
  if (cancelled.kind === "error") {
    return {
      kind: "error",
      session: originalRequest.session,
      intents: [],
      error: cancelled.error,
    };
  }

  if (targetState.kind === "final") {
    const result = enterFinalState(
      nextSession,
      targetState,
      transition.target,
      request,
      options,
    );
    return result.kind === "error"
      ? { ...result, session: originalRequest.session }
      : withPressAnswer(prependIntents(result, cancelled.value), answer.value);
  }

  if (targetState.kind === "return") {
    const returned = completeUnitReturn(
      { ...nextSession, position: transition.target, seq: nextSession.seq + 1 },
      targetState,
      request,
      options,
    );
    return returned.kind === "error"
      ? { kind: "error", session: originalRequest.session, intents: [], error: returned.error }
      : withPressAnswer(prependIntents(returned.value, cancelled.value), answer.value);
  }

  const history = recordExitedHistory(
    request.spec,
    nextSession,
    transition.target,
  );
  const target = transition.target;

  const entered = {
    kind: "ok",
    session: {
      ...nextSession,
      history,
      position: target,
      seq: nextSession.seq + 1,
    },
    intents: [],
  } as const;
  const settled = settleStateEntry(entered.session, target, 0, request, options);
  return settled.kind === "error"
    ? { kind: "error", session: originalRequest.session, intents: [], error: settled.error }
    : withPressAnswer(prependIntents(settled.value, cancelled.value), answer.value);
}

function removeObsoleteCallbacks<Context extends JsonObject>(
  result: CoreResult<Context>,
): CoreResult<Context> {
  if (result.kind === "error" || result.session === null) return result;
  const callbacks = Object.fromEntries(
    Object.entries(result.session.callbacks).filter(([, callback]) =>
      callback.durable
      || (callback.stateId === result.session!.position && callback.seq === result.session!.seq)
    ),
  );
  return Object.keys(callbacks).length === Object.keys(result.session.callbacks).length
    ? result
    : { ...result, session: { ...result.session, callbacks } };
}

function preparePress<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
): Evaluation<PreparedPress<Context>> {
  if (!isJsonObject(request.input.payload)) {
    return evaluationError(
      "invalid_press_input",
      "$.input.payload",
      "Use a press payload with sessionKey and callbackQueryId.",
    );
  }
  const payload = request.input.payload;
  const unknown = Object.keys(payload).find((name) =>
    name !== "sessionKey" && name !== "callbackQueryId"
  );
  if (unknown !== undefined) {
    return evaluationError(
      "invalid_press_input",
      `$.input.payload.${unknown}`,
      `Remove the ${unknown} press input field.`,
    );
  }
  if (typeof payload.sessionKey !== "string" || payload.sessionKey.length === 0) {
    return evaluationError(
      "invalid_press_input",
      "$.input.payload.sessionKey",
      "Set sessionKey to the current session key.",
    );
  }
  if (typeof payload.callbackQueryId !== "string" || payload.callbackQueryId.length === 0) {
    return evaluationError(
      "invalid_press_input",
      "$.input.payload.callbackQueryId",
      "Set callbackQueryId to the Telegram callback query id.",
    );
  }
  const record = request.session.callbacks[request.input.name];
  const slot = record === undefined ? undefined : request.session.viewSlots[record.viewSlot];
  const fresh = record !== undefined
    && record.sessionKey === payload.sessionKey
    && (record.durable || (
      record.stateId === request.session.position
      && record.seq === request.session.seq
      && record.viewRevision === slot?.revision
    ));
  if (!fresh || record === undefined) {
    return {
      kind: "ok",
      value: { kind: "stale", callbackQueryId: payload.callbackQueryId },
    };
  }
  return {
    kind: "ok",
    value: {
      kind: "accepted",
      request: {
        ...request,
        input: {
          ...request.input,
          name: record.press,
          payload: cloneData(record.payload),
          [runtimeSessionKey]: payload.sessionKey,
        } as RuntimeCoreInput,
      },
      press: { callbackQueryId: payload.callbackQueryId },
    },
  };
}

function renderAcceptedPressAnswer<Context extends JsonObject>(
  press: AcceptedPress,
  answer: PressAnswer | undefined,
  path: string,
  request: CoreRunnerRequest<Context>,
): Evaluation<PressAnswerIntent> {
  if (answer === undefined) {
    return {
      kind: "ok",
      value: { kind: "pressAnswer", callbackQueryId: press.callbackQueryId },
    };
  }
  const text = renderViewParts(answer.text, `${path}.text`, {
    request,
    parseMode: "plain",
  });
  return text.kind === "error"
    ? text
    : {
        kind: "ok",
        value: {
          kind: "pressAnswer",
          callbackQueryId: press.callbackQueryId,
          answer: { kind: answer.kind, text: text.value },
        },
      };
}

function handleStalePress<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
  callbackQueryId: string,
  options: CreateRunnerOptions<Context>,
): CoreResult<Context> {
  const policy = request.spec.stalePress;
  const answer = policy.action === "ignore" ? undefined : policy.answer;
  const rendered = renderAcceptedPressAnswer(
    { callbackQueryId },
    answer,
    "$.stalePress.answer",
    request,
  );
  if (rendered.kind === "error") {
    return {
      kind: "error",
      session: request.session,
      intents: [],
      error: rendered.error,
    };
  }
  if (policy.action !== "rerender") {
    return {
      kind: "ok",
      session: request.session,
      intents: [rendered.value],
    };
  }
  const state = activeStateAt(request.spec, request.session, request.session.position);
  const rerendered = renderActiveState(request.session, state, request, options, "edit");
  return rerendered.kind === "error"
    ? {
        kind: "error",
        session: request.session,
        intents: [],
        error: rerendered.error,
      }
    : {
        kind: "ok",
        session: rerendered.value.session,
        intents: [rendered.value, ...rerendered.value.intents],
      };
}

function withPressAnswer<Context extends JsonObject>(
  result: CoreResult<Context>,
  answer: PressAnswerIntent | undefined,
): CoreResult<Context> {
  return result.kind === "error" || answer === undefined
    ? result
    : { ...result, intents: [answer, ...result.intents] };
}

function commitViewResult<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
): CoreResult<Context> {
  const committed = applyViewResult(request.session, request.input);
  return committed.kind === "error"
    ? { kind: "error", session: request.session, intents: [], error: committed.error }
    : { kind: "ok", session: committed.value, intents: [] };
}

function applyViewResult<Context extends JsonObject>(
  session: Session<Context>,
  input: CoreInput,
): Evaluation<Session<Context>> {
  const payload = input.payload;
  if (!isJsonObject(payload)) {
    return evaluationError(
      "invalid_view_result",
      "$.input.payload",
      "Use a view result object from the adapter.",
    );
  }
  const operation = input.name;
  if (
    operation !== "send"
    && operation !== "edit"
    && operation !== "delete"
    && operation !== "replace"
  ) {
    return evaluationError(
      "invalid_view_result",
      "$.input.name",
      "Use send, edit, delete, or replace for an adapter view result.",
    );
  }
  const allowed = operation === "delete"
    ? ["slot"]
    : operation === "edit"
      ? ["slot", "viewKind", "interactive"]
      : ["slot", "handle", "viewKind", "interactive"];
  const unknown = Object.keys(payload).find((name) => !allowed.includes(name));
  if (unknown !== undefined) {
    return evaluationError(
      "invalid_view_result",
      `$.input.payload.${unknown}`,
      `Remove the ${unknown} view result field.`,
    );
  }
  if (typeof payload.slot !== "string" || payload.slot.length === 0) {
    return evaluationError(
      "invalid_view_result",
      "$.input.payload.slot",
      "Set slot to the view intent slot.",
    );
  }
  const slot = session.viewSlots[payload.slot];
  if (slot === undefined) {
    return evaluationError(
      "invalid_view_result",
      `$.session.viewSlots.${payload.slot}`,
      `Add the ${payload.slot} view slot before you commit its result.`,
    );
  }
  if (operation === "delete") {
    const { current: _current, ...cleared } = slot;
    return {
      kind: "ok",
      value: {
        ...session,
        viewSlots: { ...session.viewSlots, [payload.slot]: cleared },
        callbacks: retireViewCallbacks(
          session.callbacks,
          payload.slot,
          slot.revision,
          slot.current?.handle,
          true,
        ),
      },
    };
  }
  if (typeof payload.viewKind !== "string" || payload.viewKind.length === 0) {
    return evaluationError(
      "invalid_view_result",
      "$.input.payload.viewKind",
      "Set viewKind to the rendered view kind.",
    );
  }
  if (typeof payload.interactive !== "boolean") {
    return evaluationError(
      "invalid_view_result",
      "$.input.payload.interactive",
      "Set interactive to true when the rendered view contains controls.",
    );
  }
  const handle = operation === "edit"
    ? slot.current?.handle
    : chatHandle(payload.handle);
  if (handle === undefined) {
    return evaluationError(
      "invalid_view_result",
      operation === "edit" ? `$.session.viewSlots.${payload.slot}.current` : "$.input.payload.handle",
      operation === "edit"
        ? "Commit an edit only after the view slot has a current message."
        : "Set handle to the message handle returned by the adapter.",
    );
  }
  const nextRevision = slot.revision + (payload.interactive ? 1 : 0);
  return {
    kind: "ok",
    value: {
      ...session,
      viewSlots: {
        ...session.viewSlots,
        [payload.slot]: {
          ...slot,
          revision: nextRevision,
          current: { handle, viewKind: payload.viewKind as ViewKind },
        },
      },
      callbacks: operation === "edit"
        ? commitEditedCallbacks(
            session.callbacks,
            payload.slot,
            slot.revision,
            nextRevision,
            handle,
          )
        : assignCallbackHandle(
            retireViewCallbacks(
              session.callbacks,
              payload.slot,
              slot.revision,
              slot.current?.handle,
              operation === "replace",
            ),
            payload.slot,
            nextRevision,
            handle,
          ),
    },
  };
}

function commitEditedCallbacks(
  callbacks: Readonly<Record<string, CallbackRecord>>,
  viewSlot: string,
  previousRevision: number,
  nextRevision: number,
  handle: MessageHandle,
): Readonly<Record<string, CallbackRecord>> {
  return Object.fromEntries(
    Object.entries(callbacks).flatMap(([id, callback]) => {
      if (!callbackBelongsToMessage(callback, viewSlot, previousRevision, handle)) {
        if (
          callback.handle === undefined
          && callback.viewSlot === viewSlot
          && callback.viewRevision === nextRevision
        ) return [[id, { ...callback, handle }]];
        return [[id, callback]];
      }
      return callback.durable
        ? [[id, { ...callback, viewRevision: nextRevision, handle }]]
        : [];
    }),
  );
}

function assignCallbackHandle(
  callbacks: Readonly<Record<string, CallbackRecord>>,
  viewSlot: string,
  viewRevision: number,
  handle: MessageHandle,
): Readonly<Record<string, CallbackRecord>> {
  return Object.fromEntries(
    Object.entries(callbacks).map(([id, callback]) => [
      id,
      callback.handle === undefined
        && callback.viewSlot === viewSlot
        && callback.viewRevision === viewRevision
        ? { ...callback, handle }
        : callback,
    ]),
  );
}

function retireViewCallbacks(
  callbacks: Readonly<Record<string, CallbackRecord>>,
  viewSlot: string,
  viewRevision: number,
  handle: MessageHandle | undefined,
  includeDurable: boolean,
): Readonly<Record<string, CallbackRecord>> {
  return Object.fromEntries(
    Object.entries(callbacks).filter(([, callback]) =>
      !callbackBelongsToMessage(callback, viewSlot, viewRevision, handle)
      || (callback.durable && !includeDurable)
    ),
  );
}

function callbackBelongsToMessage(
  callback: CallbackRecord,
  viewSlot: string,
  viewRevision: number,
  handle: MessageHandle | undefined,
): boolean {
  if (callback.viewSlot !== viewSlot) return false;
  if (callback.handle === undefined || handle === undefined) {
    return callback.viewRevision === viewRevision;
  }
  return callback.handle.kind === handle.kind
    && callback.handle.chatId === handle.chatId
    && callback.handle.messageId === handle.messageId;
}

function chatHandle(value: JsonValue | undefined): ChatHandle | undefined {
  if (
    !isJsonObject(value)
    || Object.keys(value).some((name) =>
      name !== "kind" && name !== "chatId" && name !== "messageId"
    )
    || value.kind !== "chat"
    || typeof value.chatId !== "number"
    || !Number.isFinite(value.chatId)
    || typeof value.messageId !== "number"
    || !Number.isFinite(value.messageId)
  ) return undefined;
  return { kind: "chat", chatId: value.chatId, messageId: value.messageId };
}

function settleStateEntry<Context extends JsonObject>(
  session: Session<Context>,
  stateId: StateId,
  entryIndex: number,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<CoreResult<Context>> {
  const scheduled = entryIndex === 0
    ? scheduleStateTimers(session, stateId, request)
    : { kind: "ok", value: [] } as const;
  if (scheduled.kind === "error") return scheduled;

  const settled = continueStateEntry(session, stateId, entryIndex, request, options);
  if (
    settled.kind === "error"
    || settled.value.kind === "error"
    || scheduled.value.length === 0
  ) return settled;
  return {
    kind: "ok",
    value: {
      ...settled.value,
      intents: [...scheduled.value, ...settled.value.intents],
    },
  };
}

function continueStateEntry<Context extends JsonObject>(
  session: Session<Context>,
  stateId: StateId,
  entryIndex: number,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<CoreResult<Context>> {
  const state = activeStateAt(request.spec, session, stateId);
  if (state?.kind === "return") {
    return completeUnitReturn(session, state, request, options);
  }
  const entry = state !== undefined && state.kind !== "final" ? state.entry : undefined;
  const node = entry?.[entryIndex];
  if (node === undefined && state?.kind === "compound") {
    const stored = session.history[stateId];
    const child = stored === undefined
      ? `${stateId}.${state.initial}` as StateId
      : stored;
    const descended = { ...session, position: child };
    return settleStateEntry(descended, child, 0, request, options);
  }
  if (node?.kind === "run") {
    return startEffect(session, stateId, entryIndex, node, request);
  }
  if (node?.kind !== "call") {
    const rendered = renderActiveState(session, state, request, options);
    return rendered.kind === "error"
      ? rendered
      : { kind: "ok", value: { kind: "ok", ...rendered.value } };
  }
  const called = enterCall(session, stateId, entryIndex, request);
  return called.kind === "error"
    ? called
    : settleStateEntry(called.value, called.value.position, 0, request, options);
}

function scheduleStateTimers<Context extends JsonObject>(
  session: Session<Context>,
  stateId: StateId,
  request: CoreRunnerRequest<Context>,
): Evaluation<readonly TimerIntent[]> {
  const state = activeStateAt(request.spec, session, stateId);
  const after = ownerOn(state)?.after as
    | Readonly<Record<string, { readonly delay: string }>>
    | undefined;
  if (after === undefined) return { kind: "ok", value: [] };

  const sessionKey = inputSessionKey(request.input);
  if (sessionKey === undefined) {
    return evaluationError(
      "missing_session_key",
      "$.input.payload.sessionKey",
      "Add the sessionKey value before this state schedules a timer.",
    );
  }
  const now = Date.parse(request.now);
  if (!Number.isFinite(now)) {
    return evaluationError(
      "invalid_time",
      "$.now",
      "Set now to an RFC 3339 UTC time before this state schedules a timer.",
    );
  }

  const token = { sessionKey, stateId, seq: session.seq };
  const intents: TimerIntent[] = [];
  for (const [timer, entry] of Object.entries(after)) {
    const delay = timerDelayMilliseconds(entry.delay);
    if (delay === undefined) {
      return evaluationError(
        "invalid_timer_delay",
        `${activeStatePath(request.spec, session, stateId)}.on.after.${timer}.delay`,
        "Use one positive delay with an ms, s, m, h, or d unit.",
      );
    }
    const fireAt = new Date(now + delay);
    if (Number.isNaN(fireAt.valueOf())) {
      return evaluationError(
        "invalid_timer_delay",
        `${activeStatePath(request.spec, session, stateId)}.on.after.${timer}.delay`,
        "Use a delay that produces a valid future time.",
      );
    }
    intents.push({
      kind: "timer",
      operation: "schedule",
      id: timerId(token, timer),
      timer,
      fireAt: fireAt.toISOString(),
      token,
    });
  }
  return { kind: "ok", value: intents };
}

function cancelExitedStateTimers<Context extends JsonObject>(
  session: Session<Context>,
  target: StateId,
  request: CoreRunnerRequest<Context>,
): Evaluation<readonly TimerIntent[]> {
  const sourceSegments = session.position.split(".");
  const targetSegments = target.split(".");
  let retained = 0;
  while (
    retained < sourceSegments.length
    && retained < targetSegments.length
    && sourceSegments[retained] === targetSegments[retained]
  ) retained += 1;
  if (
    retained === sourceSegments.length
    && retained === targetSegments.length
  ) retained -= 1;
  if (
    retained === targetSegments.length
    && retained < sourceSegments.length
    && activeStateAt(request.spec, session, target)?.kind === "compound"
  ) retained -= 1;

  const exited: StateId[] = [];
  for (let length = sourceSegments.length; length > retained; length -= 1) {
    exited.push(sourceSegments.slice(0, length).join(".") as StateId);
  }
  const hasTimers = exited.some((stateId) =>
    ownerOn(activeStateAt(request.spec, session, stateId))?.after !== undefined
  );
  if (!hasTimers) return { kind: "ok", value: [] };

  const sessionKey = inputSessionKey(request.input);
  if (sessionKey === undefined) {
    return evaluationError(
      "missing_session_key",
      "$.input.payload.sessionKey",
      "Add the sessionKey value before this transition cancels a timer.",
    );
  }
  const intents: TimerIntent[] = [];
  for (const stateId of exited) {
    const after = ownerOn(activeStateAt(request.spec, session, stateId))?.after as
      | Readonly<Record<string, unknown>>
      | undefined;
    if (after === undefined) continue;
    const token = { sessionKey, stateId, seq: session.seq };
    for (const timer of Object.keys(after)) {
      intents.push({
        kind: "timer",
        operation: "cancel",
        id: timerId(token, timer),
      });
    }
  }
  return { kind: "ok", value: intents };
}

function prependIntents<Context extends JsonObject>(
  result: CoreResult<Context>,
  intents: readonly Intent[],
): CoreResult<Context> {
  return result.kind === "error" || intents.length === 0
    ? result
    : { ...result, intents: [...intents, ...result.intents] };
}

function timerDelayMilliseconds(delay: string): number | undefined {
  const match = /^(?<amount>[1-9][0-9]*)(?<unit>ms|s|m|h|d)$/.exec(delay);
  if (match?.groups === undefined) return undefined;
  const units: Readonly<Record<string, number>> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  const milliseconds = Number(match.groups.amount) * (units[match.groups.unit ?? ""] ?? 0);
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}

function timerId(token: StalenessToken, timer: string): string {
  return `${token.sessionKey}:${token.stateId}:${token.seq}:${timer}`;
}

function prepareTimerFiring<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
): Evaluation<"fresh" | "stale"> {
  const parsed = timerFiringPayload(request.input);
  if (parsed.kind === "error") return parsed;
  const { id, token } = parsed.value;
  if (
    token.seq !== request.session.seq
    || (
      request.session.position !== token.stateId
      && !request.session.position.startsWith(`${token.stateId}.`)
    )
  ) return { kind: "ok", value: "stale" };
  if (id !== timerId(token, request.input.name)) {
    return evaluationError(
      "invalid_timer_input",
      "$.input.payload.id",
      "Use the id from the active timer intent.",
    );
  }
  return { kind: "ok", value: "fresh" };
}

function timerFiringPayload(input: CoreInput): Evaluation<TimerFiringPayload> {
  const payload = input.payload;
  if (!isJsonObject(payload)) {
    return evaluationError(
      "invalid_timer_input",
      "$.input.payload",
      "Use a timer input object with id and token fields.",
    );
  }
  const unknownField = Object.keys(payload).find((name) =>
    name !== "id" && name !== "token"
  );
  if (unknownField !== undefined) {
    return evaluationError(
      "invalid_timer_input",
      `$.input.payload.${unknownField}`,
      `Remove the ${unknownField} timer input field.`,
    );
  }
  const id = payload.id;
  const token = payload.token;
  if (typeof id !== "string" || id.length === 0) {
    return evaluationError(
      "invalid_timer_input",
      "$.input.payload.id",
      "Use the id from the timer intent.",
    );
  }
  if (
    !isJsonObject(token)
    || typeof token.sessionKey !== "string"
    || token.sessionKey.length === 0
    || typeof token.stateId !== "string"
    || token.stateId.length === 0
    || !Number.isInteger(token.seq)
    || Number(token.seq) < 0
  ) {
    return evaluationError(
      "invalid_timer_input",
      "$.input.payload.token",
      "Use the token from the timer intent.",
    );
  }
  const unknownTokenField = Object.keys(token).find((name) =>
    name !== "sessionKey" && name !== "stateId" && name !== "seq"
  );
  if (unknownTokenField !== undefined) {
    return evaluationError(
      "invalid_timer_input",
      `$.input.payload.token.${unknownTokenField}`,
      `Remove the ${unknownTokenField} staleness token field.`,
    );
  }
  return {
    kind: "ok",
    value: { id, token: token as StalenessToken },
  };
}

function startEffect<Context extends JsonObject>(
  session: Session<Context>,
  stateId: StateId,
  entryIndex: number,
  run: Run,
  request: CoreRunnerRequest<Context>,
): Evaluation<CoreResult<Context>> {
  const sessionKey = inputSessionKey(request.input);
  if (sessionKey === undefined) {
    return evaluationError(
      "missing_session_key",
      "$.input.payload.sessionKey",
      "Add the sessionKey value before this entry starts an effect.",
    );
  }

  const input: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(run.input)) {
    const resolved = resolveValue(
      value,
      `${activeStatePath(request.spec, session, stateId)}.entry[${entryIndex}].input.${name}`,
      { ...request, session },
    );
    if (resolved.kind === "error") return resolved;
    input[name] = resolved.value;
  }

  const token = { sessionKey, stateId, seq: session.seq };
  return {
    kind: "ok",
    value: {
      kind: "ok",
      session,
      intents: [{
        kind: "effect",
        id: effectId(token, entryIndex),
        effect: run.effect,
        input: cloneData(input),
        token,
      }],
    },
  };
}

function inputSessionKey(input: CoreInput): string | undefined {
  const runtime = (input as RuntimeCoreInput)[runtimeSessionKey];
  if (runtime !== undefined) return runtime;
  if (!isJsonObject(input.payload)) return undefined;
  const direct = input.payload.sessionKey;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const token = input.payload.token;
  if (!isJsonObject(token)) return undefined;
  return typeof token.sessionKey === "string" && token.sessionKey.length > 0
    ? token.sessionKey
    : undefined;
}

function effectId(token: StalenessToken, entryIndex: number): string {
  return `${token.sessionKey}:${token.stateId}:${token.seq}:${entryIndex}`;
}

function runEffectFeedback<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): CoreResult<Context> {
  const handled = handleEffectFeedback(request, options);
  return handled.kind === "error"
    ? { kind: "error", session: request.session, intents: [], error: handled.error }
    : handled.value;
}

function handleEffectFeedback<Context extends JsonObject>(
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<CoreResult<Context>> {
  const payload = effectFeedbackPayload(request.input);
  if (payload.kind === "error") return payload;
  const { id, token, output } = payload.value;
  if (
    token.stateId !== request.session.position
    || token.seq !== request.session.seq
  ) {
    return {
      kind: "ok",
      value: { kind: "ok", session: request.session, intents: [] },
    };
  }

  const state = activeStateAt(request.spec, request.session, token.stateId);
  const entry = state !== undefined && state.kind !== "final" && state.kind !== "return"
    ? state.entry
    : undefined;
  const entryIndex = entry?.findIndex((node, index) =>
    node.kind === "run" && effectId(token, index) === id
  ) ?? -1;
  const run = entry?.[entryIndex];
  if (run?.kind !== "run") {
    return evaluationError(
      "invalid_feedback",
      "$.input.payload.id",
      "Use the id from the active effect intent.",
    );
  }
  if (request.input.source === "progress") {
    if (request.input.name !== run.effect || run.onProgress === undefined) {
      return evaluationError(
        "invalid_feedback",
        "$.input.name",
        "Use the active effect name for declared progress feedback.",
      );
    }
    const path = `${activeStatePath(request.spec, request.session, token.stateId)}.entry[${entryIndex}].onProgress.assign`;
    const effect = request.spec.effects[run.effect];
    const fields = effect?.progress as FieldMap | undefined;
    const validation = validateFeedbackOutput(output, fields);
    if (validation.kind === "error") return validation;
    const mapped = applyFeedbackAssignments(
      run.onProgress.assign,
      fields,
      output,
      path,
      request,
      options,
    );
    if (mapped.kind === "error") return mapped;
    const session = { ...request.session, context: mapped.value };
    const rendered = renderActiveState(session, state, request, options);
    return rendered.kind === "error"
      ? rendered
      : {
          kind: "ok",
          value: { kind: "ok", ...rendered.value },
        };
  }
  if (request.input.source !== "outcome") {
    return evaluationError(
      "invalid_feedback",
      "$.input.source",
      "Use progress or outcome for effect feedback.",
    );
  }

  const outcome = run.outcomes[request.input.name];
  if (outcome === undefined) {
    return evaluationError(
      "invalid_feedback",
      "$.input.name",
      "Use a declared effect outcome.",
    );
  }
  const path = `${activeStatePath(request.spec, request.session, token.stateId)}.entry[${entryIndex}].outcomes.${request.input.name}`;
  const fields = request.spec.effects[run.effect]?.outcomes[request.input.name];
  const validation = validateFeedbackOutput(output, fields);
  if (validation.kind === "error") return validation;
  const feedbackRequest = {
    ...request,
    input: { ...request.input, payload: output },
  };
  const mapped = applyFeedbackAssignments(
    outcome.assign,
    fields,
    output,
    `${path}.assign`,
    request,
    options,
  );
  if (mapped.kind === "error") return mapped;
  const mappedSession = { ...request.session, context: mapped.value };
  const mappedRequest = { ...feedbackRequest, session: mappedSession };
  const selected = selectTransition(outcome.do, `${path}.do`, mappedRequest, options);
  if (selected.kind === "error") return selected;
  const transition = selected.value?.transition;
  const assigned = transition?.assign === undefined
    ? { kind: "ok", value: mappedSession.context } as const
    : applyAssignments(
        transition.assign,
        `${selected.value!.path}.assign`,
        { ...mappedRequest, input: selected.value!.input },
        options,
      );
  if (assigned.kind === "error") return assigned;
  const assignedSession = { ...mappedSession, context: assigned.value };
  if (transition?.target === undefined) {
    return settleStateEntry(
      assignedSession,
      token.stateId,
      entryIndex + 1,
      request,
      options,
    );
  }

  const targetState = activeStateAt(request.spec, assignedSession, transition.target);
  if (targetState === undefined) {
    return evaluationError(
      "invalid_transition_target",
      selected.value!.path,
      `Declare the ${transition.target} state before you target it.`,
    );
  }
  const cancelled = cancelExitedStateTimers(
    assignedSession,
    transition.target,
    request,
  );
  if (cancelled.kind === "error") return cancelled;
  if (targetState.kind === "final") {
    const result = enterFinalState(
      assignedSession,
      targetState,
      transition.target,
      request,
      options,
    );
    return result.kind === "error"
      ? { kind: "error", error: result.error }
      : { kind: "ok", value: prependIntents(result, cancelled.value) };
  }
  if (targetState.kind === "return") {
    const returned = completeUnitReturn(
      { ...assignedSession, position: transition.target, seq: assignedSession.seq + 1 },
      targetState,
      request,
      options,
    );
    return returned.kind === "error"
      ? returned
      : { kind: "ok", value: prependIntents(returned.value, cancelled.value) };
  }
  const history = recordExitedHistory(request.spec, assignedSession, transition.target);
  const entered: Session<Context> = {
    ...assignedSession,
    history,
    position: transition.target,
    seq: assignedSession.seq + 1,
  };
  const settled = settleStateEntry(entered, transition.target, 0, request, options);
  return settled.kind === "error"
    ? settled
    : { kind: "ok", value: prependIntents(settled.value, cancelled.value) };
}

function effectFeedbackPayload(input: CoreInput): Evaluation<EffectFeedbackPayload> {
  const payload = input.payload;
  if (!isJsonObject(payload)) {
    return evaluationError(
      "invalid_feedback",
      "$.input.payload",
      "Use an effect feedback object with id, token, and output fields.",
    );
  }
  const unknownField = Object.keys(payload).find((name) =>
    name !== "id" && name !== "token" && name !== "output"
  );
  if (unknownField !== undefined) {
    return evaluationError(
      "invalid_feedback",
      `$.input.payload.${unknownField}`,
      `Remove the ${unknownField} effect feedback field.`,
    );
  }
  const id = payload.id;
  const token = payload.token;
  const output = payload.output;
  if (typeof id !== "string" || id.length === 0) {
    return evaluationError(
      "invalid_feedback",
      "$.input.payload.id",
      "Use the id from the effect intent.",
    );
  }
  if (
    !isJsonObject(token)
    || typeof token.sessionKey !== "string"
    || token.sessionKey.length === 0
    || typeof token.stateId !== "string"
    || !Number.isInteger(token.seq)
    || Number(token.seq) < 0
  ) {
    return evaluationError(
      "invalid_feedback",
      "$.input.payload.token",
      "Use the token from the effect intent.",
    );
  }
  const unknownTokenField = Object.keys(token).find((name) =>
    name !== "sessionKey" && name !== "stateId" && name !== "seq"
  );
  if (unknownTokenField !== undefined) {
    return evaluationError(
      "invalid_feedback",
      `$.input.payload.token.${unknownTokenField}`,
      `Remove the ${unknownTokenField} staleness token field.`,
    );
  }
  if (!isJsonObject(output)) {
    return evaluationError(
      "invalid_feedback",
      "$.input.payload.output",
      "Set output to a JSON object.",
    );
  }
  return {
    kind: "ok",
    value: { id, token: token as StalenessToken, output },
  };
}

function validateFeedbackOutput(
  output: JsonObject,
  fields: FieldMap | undefined,
): Evaluation<undefined> {
  if (fields === undefined) {
    return evaluationError(
      "invalid_feedback",
      "$.input.payload.output",
      "Declare this feedback record on the active effect.",
    );
  }
  for (const name of Object.keys(output)) {
    if (fields[name] === undefined) {
      return evaluationError(
        "invalid_feedback",
        `$.input.payload.output.${name}`,
        `Remove the undeclared ${name} effect output.`,
      );
    }
  }
  for (const [name, field] of Object.entries(fields)) {
    const value = output[name];
    const optional = "optional" in field && field.optional === true;
    if (value === undefined) {
      if (optional) continue;
      return evaluationError(
        "invalid_feedback",
        `$.input.payload.output.${name}`,
        `Provide the required ${name} effect output.`,
      );
    }
    if (!matchesField(value, field)) {
      return evaluationError(
        "invalid_feedback",
        `$.input.payload.output.${name}`,
        `Set ${name} to a value that matches its effect field declaration.`,
      );
    }
  }
  return { kind: "ok", value: undefined };
}

function matchesField(value: JsonValue, field: FieldMap[string]): boolean {
  if (field.type !== "array") return matchesScalarField(value, field);
  if (!Array.isArray(value)) return false;
  const items = field.items;
  if (items.type !== "record") {
    return value.every((item) => matchesScalarField(item, items));
  }
  const itemFields = items.fields;
  return value.every((item) => {
    if (!isJsonObject(item)) return false;
    if (Object.keys(item).some((name) => itemFields[name] === undefined)) return false;
    return Object.entries(itemFields).every(([name, itemField]) => {
      const itemValue = item[name];
      return itemValue === undefined
        ? itemField.optional === true
        : matchesScalarField(itemValue, itemField);
    });
  });
}

function matchesScalarField(
  value: JsonValue,
  field: {
    readonly type: "string" | "number" | "boolean";
    readonly enum?: readonly (string | number)[];
  },
): boolean {
  if (typeof value !== field.type) return false;
  if (field.type === "number" && !Number.isFinite(value)) return false;
  return field.enum === undefined || field.enum.some((item) => item === value);
}

function applyFeedbackAssignments<Context extends JsonObject>(
  assignments: ProducedAssignment,
  fields: FieldMap | undefined,
  output: JsonObject,
  path: string,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<Context> {
  const mapped: Record<string, AssignmentValue> = {};
  for (const [destination, assignment] of Object.entries(assignments)) {
    const field = fields?.[assignment.from];
    mapped[destination] = output[assignment.from] === undefined
      && field !== undefined
      && "optional" in field
      && field.optional === true
      ? { unset: true }
      : assignment;
  }
  return applyAssignments(
    mapped,
    path,
    { ...request, input: { ...request.input, payload: output } },
    options,
  );
}

function renderActiveState<Context extends JsonObject>(
  session: Session<Context>,
  state: StateNode | undefined,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
  policyOverride?: "edit",
): Evaluation<{
  readonly session: Session<Context>;
  readonly intents: readonly Intent[];
}> {
  if (state?.kind !== "state") {
    return { kind: "ok", value: { session, intents: [] } };
  }
  const policy = policyOverride ?? state.render;
  if (policy === "keep") return { kind: "ok", value: { session, intents: [] } };
  const slot = session.viewSlots.main;
  if (policy === "delete") {
    return {
      kind: "ok",
      value: {
        session,
        intents: slot?.current === undefined
          ? []
          : [{
              kind: "view",
              operation: "delete",
              slot: "main",
              handle: slot.current.handle,
            }],
      },
    };
  }
  if (!("view" in state)) {
    return evaluationError(
      "missing_state_view",
      "$.session.position",
      "Add a view before you use the edit or append render policy.",
    );
  }
  const path = `${activeStatePath(request.spec, session, session.position)}.view`;
  const callbacks: Record<string, CallbackRecord> = {};
  const callbackScope: CallbackRenderScope = {
    sessionKey: inputSessionKey(request.input),
    stateId: session.position,
    seq: session.seq,
    viewSlot: "main",
    viewRevision: (slot?.revision ?? 0) + 1,
    reserved: session.callbacks,
    callbacks,
    next: 0,
  };
  const view = renderTextView(
    state.view,
    path,
    { ...request, session },
    callbackScope,
  );
  if (view.kind === "error") return view;
  const planned = planRenderedView(
    slot,
    view.value,
    policy,
    options.viewCompatibility,
    "Add the main view slot before you render this state.",
  );
  if (planned.kind === "error") return planned;
  return {
    kind: "ok",
    value: {
      session: Object.keys(callbacks).length === 0
        ? session
        : { ...session, callbacks: { ...session.callbacks, ...callbacks } },
      intents: planned.value,
    },
  };
}

function planRenderedView(
  slot: ViewSlot | undefined,
  view: JsonObject,
  policy: "edit" | "append",
  compatibility: EditCompatibilityMatrix | undefined,
  missingTargetMessage: string,
): Evaluation<readonly Intent[]> {
  if (policy === "edit" && slot?.current !== undefined) {
    const operation = editCompatibility(
      slot.current.handle.kind,
      slot.current.viewKind,
      String(view.kind),
      compatibility,
    );
    if (operation === undefined) {
      return evaluationError(
        "missing_edit_compatibility",
        "$.session.viewSlots.main.current.viewKind",
        `Register the ${slot.current.handle.kind}/${slot.current.viewKind}/${String(view.kind)} edit compatibility row.`,
      );
    }
    if (operation === "unsupported") {
      return evaluationError(
        "unsupported_view_edit",
        "$.session.viewSlots.main.current.viewKind",
        "Use append or install a view integration that supports this edit.",
      );
    }
    return {
      kind: "ok",
      value: operation === "edit"
        ? [{
            kind: "view",
            operation: "edit",
            slot: "main",
            handle: slot.current.handle,
            view,
          }]
        : [{
            kind: "view",
            operation: "replace",
            slot: "main",
            target: slot.target,
            handle: slot.current.handle,
            view,
          }],
    };
  }
  if (slot === undefined) {
    return evaluationError(
      "missing_view_target",
      "$.session.viewSlots.main",
      missingTargetMessage,
    );
  }
  return {
    kind: "ok",
    value: [{
      kind: "view",
      operation: "send",
      slot: "main",
      target: slot.target,
      view,
    }],
  };
}

function editCompatibility(
  handleKind: string,
  oldViewKind: string,
  newViewKind: string,
  matrix: EditCompatibilityMatrix | undefined,
): EditCompatibility | undefined {
  const registered = matrix?.[handleKind]?.[oldViewKind]?.[newViewKind];
  if (registered !== undefined) return registered;
  if (handleKind !== "chat" || newViewKind !== "text") return undefined;
  if (oldViewKind === "text" || oldViewKind === "rich") return "edit";
  return oldViewKind === "media" ? "replace" : undefined;
}

function renderTextView<Context extends JsonObject>(
  view: View,
  path: string,
  request: CoreRunnerRequest<Context>,
  callbacks?: CallbackRenderScope,
): Evaluation<JsonObject> {
  const scope = { request, parseMode: view.parseMode, callbacks };
  const text = renderViewParts(view.text, `${path}.text`, scope);
  if (text.kind === "error") return text;
  if (text.value.length === 0) {
    return evaluationError(
      "empty_view_text",
      `${path}.text`,
      "Provide text that renders to at least one character.",
    );
  }
  const keyboard = view.keyboard === undefined
    ? { kind: "ok", value: undefined } as const
    : renderKeyboard(view.keyboard, `${path}.keyboard`, scope);
  if (keyboard.kind === "error") return keyboard;
  return {
    kind: "ok",
    value: {
      kind: "text",
      text: text.value,
      parseMode: view.parseMode,
      ...(keyboard.value === undefined ? {} : { keyboard: keyboard.value }),
    } as unknown as JsonObject,
  };
}

type ViewRenderScope<Context extends JsonObject> = {
  readonly request: CoreRunnerRequest<Context>;
  readonly parseMode: View["parseMode"];
  readonly item?: JsonObject;
  readonly callbacks?: CallbackRenderScope;
};

type CallbackRenderScope = {
  readonly sessionKey: string | undefined;
  readonly stateId: StateId;
  readonly seq: number;
  readonly viewSlot: string;
  readonly viewRevision: number;
  readonly reserved: Readonly<Record<string, CallbackRecord>>;
  readonly callbacks: Record<string, CallbackRecord>;
  next: number;
};

function renderViewParts<Context extends JsonObject>(
  parts: readonly ViewPart[],
  path: string,
  scope: ViewRenderScope<Context>,
): Evaluation<string> {
  let rendered = "";
  for (const [index, part] of parts.entries()) {
    if (typeof part === "string") {
      rendered += part;
      continue;
    }
    const value = resolveViewValue(part, `${path}[${index}]`, scope);
    if (value.kind === "error") return value;
    if (
      typeof value.value !== "string"
      && typeof value.value !== "number"
      && typeof value.value !== "boolean"
    ) {
      return evaluationError(
        "invalid_view_value",
        `${path}[${index}]`,
        "Reference a scalar value in this view binding.",
      );
    }
    const text = typeof value.value === "number"
      ? JSON.stringify(value.value)
      : String(value.value);
    rendered += escapeViewBinding(text, scope.parseMode, part.escape);
  }
  return { kind: "ok", value: rendered };
}

function escapeViewBinding(
  value: string,
  parseMode: View["parseMode"],
  context: "text" | "code" | "url",
): string {
  if (parseMode === "MarkdownV2" && context === "text") {
    return value.replace(/[\\_*\[\]()~`>#+\-=|{}.!]/g, "\\$&");
  }
  if (parseMode === "MarkdownV2" && context === "code") {
    return value.replace(/[`\\]/g, "\\$&");
  }
  if (parseMode === "MarkdownV2" && context === "url") {
    return value.replace(/[)\\]/g, "\\$&");
  }
  if (parseMode !== "HTML") return value;
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return context === "url" ? escaped.replaceAll('"', "&quot;") : escaped;
}

function renderKeyboard<Context extends JsonObject>(
  nodes: readonly KeyboardNode[],
  path: string,
  scope: ViewRenderScope<Context>,
): Evaluation<readonly JsonObject[]> {
  const rows: JsonObject[] = [];
  for (const [nodeIndex, node] of nodes.entries()) {
    const nodePath = `${path}[${nodeIndex}]`;
    if (node.kind === "row") {
      const row = renderKeyboardRow(node.buttons, `${nodePath}.buttons`, scope);
      if (row.kind === "error") return row;
      if (row.value !== undefined) rows.push(row.value);
      continue;
    }

    const source = scope.request.session.context[node.source.context];
    if (source === undefined) {
      return missingViewValue(nodePath, node.source.context);
    }
    if (!Array.isArray(source)) {
      return evaluationError(
        "invalid_projection_source",
        `${nodePath}.source`,
        `Set ${node.source.context} to an array before this projection renders.`,
      );
    }
    if (source.length > node.maxItems) {
      return evaluationError(
        "projection_limit",
        nodePath,
        `Reduce ${node.source.context} to ${node.maxItems} items or fewer before this projection renders.`,
      );
    }
    for (const [itemIndex, item] of source.entries()) {
      if (!isJsonObject(item)) {
        return evaluationError(
          "invalid_projection_item",
          `${nodePath}.source[${itemIndex}]`,
          `Set every ${node.source.context} item to a flat record.`,
        );
      }
      for (const [rowIndex, row] of node.rows.entries()) {
        const rendered = renderKeyboardRow(
          row.buttons,
          `${nodePath}.rows[${rowIndex}].buttons`,
          { ...scope, item },
        );
        if (rendered.kind === "error") return rendered;
        if (rendered.value !== undefined) rows.push(rendered.value);
      }
    }
  }
  return { kind: "ok", value: rows };
}

function renderKeyboardRow<Context extends JsonObject>(
  buttons: readonly Button[],
  path: string,
  scope: ViewRenderScope<Context>,
): Evaluation<JsonObject | undefined> {
  const rendered: JsonObject[] = [];
  for (const [index, button] of buttons.entries()) {
    const buttonPath = `${path}[${index}]`;
    if (button.when !== undefined) {
      const visible = evaluateViewComparison(
        button.when.compare,
        `${buttonPath}.when.compare`,
        scope,
      );
      if (visible.kind === "error") return visible;
      if (!visible.value) continue;
    }
    const value = renderButton(button, buttonPath, scope);
    if (value.kind === "error") return value;
    rendered.push(value.value);
  }
  return {
    kind: "ok",
    value: rendered.length === 0 ? undefined : { kind: "row", buttons: rendered },
  };
}

function renderButton<Context extends JsonObject>(
  button: Button,
  path: string,
  scope: ViewRenderScope<Context>,
): Evaluation<JsonObject> {
  const label = renderViewParts(button.label, `${path}.label`, scope);
  if (label.kind === "error") return label;
  if (label.value.length === 0) {
    return evaluationError(
      "empty_button_label",
      `${path}.label`,
      "Provide a button label that renders to at least one character.",
    );
  }
  const payload: Record<string, JsonValue> = {};
  for (const [name, source] of Object.entries(button.payload ?? {})) {
    const value = resolveViewValue(source, `${path}.payload.${name}`, scope);
    if (value.kind === "error") return value;
    payload[name] = value.value;
  }
  const callbacks = scope.callbacks;
  if (callbacks === undefined || callbacks.sessionKey === undefined) {
    return evaluationError(
      "missing_session_key",
      "$.input.payload.sessionKey",
      "Add the sessionKey value before this view renders a button.",
    );
  }
  let callbackId: string;
  do {
    callbackId = `c${callbacks.seq.toString(36)}.${callbacks.viewRevision.toString(36)}.${callbacks.next.toString(36)}`;
    callbacks.next += 1;
  } while (callbackId in callbacks.reserved || callbackId in callbacks.callbacks);
  callbacks.callbacks[callbackId] = {
    sessionKey: callbacks.sessionKey,
    stateId: callbacks.stateId,
    seq: callbacks.seq,
    viewSlot: callbacks.viewSlot,
    viewRevision: callbacks.viewRevision,
    press: button.press,
    payload,
    durable: button.durable,
  };
  return {
    kind: "ok",
    value: {
      kind: "button",
      label: label.value,
      callbackId,
    },
  };
}

function evaluateViewComparison<Context extends JsonObject>(
  comparison: Comparison,
  path: string,
  scope: ViewRenderScope<Context>,
): Evaluation<boolean> {
  const left = resolveViewScalar(comparison.left, `${path}.left`, scope);
  if (left.kind === "error") return left;
  const right = resolveViewScalar(comparison.right, `${path}.right`, scope);
  if (right.kind === "error") return right;
  if (comparison.op === "eq" || comparison.op === "neq") {
    if (typeof left.value !== typeof right.value) {
      return evaluationError(
        "invalid_view_comparison",
        path,
        "Compare view values with the same scalar type.",
      );
    }
  } else if (typeof left.value !== "number" || typeof right.value !== "number") {
    return evaluationError(
      "invalid_view_comparison",
      path,
      "Use number values with an ordered view comparison.",
    );
  }
  switch (comparison.op) {
    case "eq": return { kind: "ok", value: left.value === right.value };
    case "neq": return { kind: "ok", value: left.value !== right.value };
    case "lt": return { kind: "ok", value: left.value < right.value };
    case "lte": return { kind: "ok", value: left.value <= right.value };
    case "gt": return { kind: "ok", value: left.value > right.value };
    case "gte": return { kind: "ok", value: left.value >= right.value };
  }
}

function resolveViewScalar<Context extends JsonObject>(
  value: ScalarValue,
  path: string,
  scope: ViewRenderScope<Context>,
): Evaluation<string | number | boolean> {
  const resolved = resolveViewValue(value, path, scope);
  if (resolved.kind === "error") return resolved;
  if (
    typeof resolved.value === "string"
    || typeof resolved.value === "number"
    || typeof resolved.value === "boolean"
  ) return { kind: "ok", value: resolved.value };
  return evaluationError(
    "invalid_view_value",
    path,
    "Reference a scalar value in this view binding.",
  );
}

function resolveViewValue<Context extends JsonObject>(
  value: Value,
  path: string,
  scope: ViewRenderScope<Context>,
): Evaluation<JsonValue> {
  if (typeof value !== "object" || Array.isArray(value)) {
    return { kind: "ok", value: cloneData(value) as JsonValue };
  }
  if ("context" in value) {
    const resolved = scope.request.session.context[value.context];
    return resolved === undefined
      ? missingViewValue(path, value.context)
      : { kind: "ok", value: cloneData(resolved) };
  }
  if ("parameter" in value) {
    const resolved = scope.request.spec.parameters[value.parameter]?.default;
    return resolved === undefined
      ? missingViewValue(path, value.parameter)
      : { kind: "ok", value: cloneData(resolved) as JsonValue };
  }
  if ("input" in value) {
    const resolved = scope.request.session.callStack.at(-1)?.input[value.input];
    return resolved === undefined
      ? missingViewValue(path, value.input)
      : { kind: "ok", value: cloneData(resolved) };
  }
  if (!("item" in value)) {
    return { kind: "ok", value: cloneData(value) as JsonValue };
  }
  const resolved = scope.item?.[value.item];
  return resolved === undefined
    ? missingViewValue(path, value.item)
    : { kind: "ok", value: cloneData(resolved) };
}

function missingViewValue(path: string, name: string): Evaluation<never> {
  return evaluationError(
    "missing_view_value",
    path,
    `Provide the ${name} value before this view renders.`,
  );
}

function completeUnitReturn<Context extends JsonObject>(
  session: Session<Context>,
  state: Extract<StateNode, { readonly kind: "return" }>,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
): Evaluation<CoreResult<Context>> {
  const frame = session.callStack.at(-1);
  if (frame === undefined) {
    return evaluationError(
      "return_without_call",
      activeStatePath(request.spec, session, session.position),
      "Enter this return state through a unit call.",
    );
  }

  const output: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(state.output)) {
    const resolved = resolveValue(
      value,
      `${activeStatePath(request.spec, session, session.position)}.output.${name}`,
      { ...request, session },
    );
    if (resolved.kind === "error") return resolved;
    output[name] = resolved.value;
  }

  const resumed: Session<Context> = {
    ...session,
    position: frame.caller.stateId,
    callStack: session.callStack.slice(0, -1),
  };
  const caller = activeStateAt(request.spec, resumed, frame.caller.stateId);
  const entry = caller !== undefined && caller.kind !== "final" && caller.kind !== "return"
    ? caller.entry
    : undefined;
  const call = entry?.[frame.caller.entryIndex];
  if (call?.kind !== "call") {
    return evaluationError(
      "invalid_call_frame",
      "$.session.callStack",
      "Restore a call frame that points to its caller entry.",
    );
  }

  const feedbackRequest = {
    ...request,
    session: resumed,
    input: { ...request.input, payload: output },
  };
  const mapped = applyAssignments(
    call.onReturn.assign,
    `${activeStatePath(request.spec, resumed, frame.caller.stateId)}.entry[${frame.caller.entryIndex}].onReturn.assign`,
    feedbackRequest,
    options,
  );
  if (mapped.kind === "error") return mapped;
  const mappedSession = { ...resumed, context: mapped.value };
  const mappedRequest = { ...feedbackRequest, session: mappedSession };
  const selected = selectTransition(
    call.onReturn.do,
    `${activeStatePath(request.spec, resumed, frame.caller.stateId)}.entry[${frame.caller.entryIndex}].onReturn.do`,
    mappedRequest,
    options,
  );
  if (selected.kind === "error") return selected;
  const transition = selected.value?.transition;
  const assigned = transition?.assign === undefined
    ? { kind: "ok", value: mappedSession.context } as const
    : applyAssignments(
        transition.assign,
        `${selected.value!.path}.assign`,
        { ...mappedRequest, input: selected.value!.input },
        options,
      );
  if (assigned.kind === "error") return assigned;
  const assignedSession = { ...mappedSession, context: assigned.value };
  if (transition?.target === undefined) {
    return settleStateEntry(
      assignedSession,
      frame.caller.stateId,
      frame.caller.entryIndex + 1,
      request,
      options,
    );
  }

  const targetState = activeStateAt(request.spec, assignedSession, transition.target);
  if (targetState === undefined) {
    return evaluationError(
      "invalid_transition_target",
      selected.value!.path,
      `Declare the ${transition.target} state before you target it.`,
    );
  }
  if (targetState.kind === "final") {
    return {
      kind: "ok",
      value: enterFinalState(
        assignedSession,
        targetState,
        transition.target,
        request,
        options,
      ),
    };
  }
  if (targetState.kind === "return") {
    return completeUnitReturn(
      { ...assignedSession, position: transition.target, seq: assignedSession.seq + 1 },
      targetState,
      request,
      options,
    );
  }
  const history = recordExitedHistory(request.spec, assignedSession, transition.target);
  const entered: Session<Context> = {
    ...assignedSession,
    history,
    position: transition.target,
    seq: assignedSession.seq + 1,
  };
  return settleStateEntry(entered, transition.target, 0, request, options);
}

function enterCall<Context extends JsonObject>(
  session: Session<Context>,
  stateId: StateId,
  entryIndex: number,
  request: CoreRunnerRequest<Context>,
): Evaluation<Session<Context>> {
  const state = activeStateAt(request.spec, session, stateId);
  const entry = state !== undefined && state.kind !== "final" && state.kind !== "return"
    ? state.entry
    : undefined;
  const call = entry?.[entryIndex];
  if (call?.kind !== "call") return { kind: "ok", value: session };

  if (session.callStack.some((frame) => frame.unit === call.unit)) {
    return evaluationError(
      "recursive_unit_call",
      `${activeStatePath(request.spec, session, stateId)}.entry[${entryIndex}].unit`,
      `Remove the call cycle that re-enters the ${call.unit} unit.`,
    );
  }
  const unit = request.spec.units[call.unit];
  if (unit === undefined) {
    return evaluationError(
      "unknown_unit",
      `${activeStatePath(request.spec, session, stateId)}.entry[${entryIndex}].unit`,
      `Declare the ${call.unit} unit before you call it.`,
    );
  }

  const input: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(call.input)) {
    const resolved = resolveValue(
      value,
      `${activeStatePath(request.spec, session, stateId)}.entry[${entryIndex}].input.${name}`,
      { ...request, session },
    );
    if (resolved.kind === "error") return resolved;
    input[name] = resolved.value;
  }

  const called: Session<Context> = {
    ...session,
    position: initialStateId(unit.states, unit.initial),
    callStack: [...session.callStack, {
      unit: call.unit,
      input: cloneData(input),
      caller: { stateId, entryIndex },
    }],
    seq: session.seq + 1,
  };
  return { kind: "ok", value: called };
}

function resolveValue<Context extends JsonObject>(
  value: Value,
  path: string,
  request: CoreRunnerRequest<Context>,
): Evaluation<JsonValue> {
  if (typeof value !== "object" || Array.isArray(value)) {
    return { kind: "ok", value: cloneData(value) as JsonValue };
  }
  if ("context" in value) {
    return sourceValue(request.session.context[value.context], path, value.context);
  }
  if ("parameter" in value) {
    return sourceValue(request.spec.parameters[value.parameter]?.default, path, value.parameter);
  }
  if ("input" in value) {
    const input = request.session.callStack.at(-1)?.input;
    return sourceValue(input?.[value.input], path, value.input);
  }
  return evaluationError(
    "invalid_value_reference",
    path,
    "Use item only while you render a projection.",
  );
}

function recordExitedHistory<Context extends JsonObject>(
  spec: BotchartSpec,
  session: Session<Context>,
  target: StateId,
): Readonly<Record<StateId, StateId>> {
  const source = session.position;
  const current = session.history;
  const sourceSegments = source.split(".");
  const targetSegments = target.split(".");
  let retained = 0;
  while (
    retained < sourceSegments.length
    && retained < targetSegments.length
    && sourceSegments[retained] === targetSegments[retained]
  ) retained += 1;

  if (
    retained === targetSegments.length
    && retained < sourceSegments.length
    && activeStateAt(spec, session, target)?.kind === "compound"
  ) retained -= 1;

  let history = current;
  for (let length = 1; length < sourceSegments.length; length += 1) {
    if (length <= retained) continue;
    const stateId = sourceSegments.slice(0, length).join(".") as StateId;
    const state = activeStateAt(spec, session, stateId);
    if (state?.kind !== "compound" || state.history === undefined) continue;
    if (history === current) history = { ...current };
    (history as Record<StateId, StateId>)[stateId] = state.history === "deep"
      ? source
      : sourceSegments.slice(0, length + 1).join(".") as StateId;
  }
  return history;
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
  for (const scope of handlerScopes(request.spec, request.session)) {
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
  if (Object.keys(assignments).length === 0) {
    return { kind: "ok", value: request.session.context };
  }
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

function isJsonObject(value: unknown): value is JsonObject {
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
  stateId: StateId,
  request: CoreRunnerRequest<Context>,
  options: CreateRunnerOptions<Context>,
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

  const view = renderTextView(
    state.view,
    `${activeStatePath(request.spec, session, stateId)}.view`,
    { ...request, session },
  );
  if (view.kind === "error") {
    return { kind: "error", session, intents: [], error: view.error };
  }

  const planned = planRenderedView(
    slot,
    view.value,
    state.render,
    options.viewCompatibility,
    "Add the main view slot before you enter a final state with a view.",
  );
  return planned.kind === "error"
    ? { kind: "error", session, intents: [], error: planned.error }
    : { kind: "ok", session: null, intents: planned.value };
}

function stateAt(spec: BotchartSpec, stateId: StateId): StateNode | undefined {
  return stateAtMap(spec.states, stateId);
}

function stateAtMap(
  root: Readonly<Record<string, StateNode>>,
  stateId: StateId,
): StateNode | undefined {
  let states = root;
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

function activeStateAt<Context extends JsonObject>(
  spec: BotchartSpec,
  session: Session<Context>,
  stateId: StateId,
): StateNode | undefined {
  const unit = session.callStack.at(-1)?.unit;
  return unit === undefined
    ? stateAt(spec, stateId)
    : stateAtMap(spec.units[unit]?.states ?? {}, stateId);
}

function activeStatePath<Context extends JsonObject>(
  spec: BotchartSpec,
  session: Session<Context>,
  stateId: StateId,
): string {
  const unit = session.callStack.at(-1)?.unit;
  const base = unit === undefined ? "$.states" : `$.units.${unit}.states`;
  return `${base}.${stateId.split(".").join(".states.")}`;
}

type HandlerOwner = StateNode | BotchartSpec;

function handlerScopes(
  spec: BotchartSpec,
  session: Session,
): readonly { readonly owner: HandlerOwner; readonly path: string }[] {
  const scopes: { owner: HandlerOwner; path: string }[] = [];
  const segments = session.position.split(".");
  for (let length = segments.length; length > 0; length -= 1) {
    const stateId = segments.slice(0, length).join(".");
    const state = activeStateAt(spec, session, stateId);
    if (state !== undefined) {
      scopes.push({ owner: state, path: activeStatePath(spec, session, stateId) });
    }
  }
  if (session.callStack.length === 0) scopes.push({ owner: spec, path: "$" });
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
    return selection;
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
  for (const scope of handlerScopes(request.spec, request.session)) {
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
