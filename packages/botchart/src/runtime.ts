import type {
  BotchartSpec,
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

export type CreateSessionOptions = {
  readonly spec: BotchartSpec;
  readonly target?: MessageTarget;
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
  const state = stateAt(request.spec, request.session.position);
  const transitions = request.input.source === "message"
    ? messageTransitions(state, request.input.name)
    : undefined;
  const transition = transitions?.find((candidate) => candidate.when === undefined);

  if (transition?.target === undefined) {
    return { kind: "ok", session: request.session, intents: [] };
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
    return enterFinalState(request.session, targetState);
  }

  return {
    kind: "ok",
    session: {
      ...request.session,
      position: transition.target,
      seq: request.session.seq + 1,
    },
    intents: [],
  };
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

function messageTransitions(
  state: StateNode | undefined,
  name: string,
): readonly Transition[] | undefined {
  if (state === undefined || state.kind === "final" || state.kind === "return") {
    return undefined;
  }

  const handlers = state.on?.message as Readonly<Record<string, readonly Transition[]>> | undefined;
  return handlers?.[name];
}
