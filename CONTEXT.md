# botchart

A Telegram bot described as one portable, serializable statechart document, plus a pure interpreter that runs it and derived views that draw it.

## Language

### The document

**Spec**:
The canonical statechart document for one bot. It is data, it is executed directly, and every diagram or preview is derived from it.
_Avoid_: config, definition, schema

**Kernel**:
The frozen part of the spec vocabulary. Once frozen, new capability arrives as a feature pack rather than as a kernel change. A field belongs in the kernel only if the interpreter's transition semantics depend on it, or if no feature pack could add it later without a breaking change. Everything else starts in a feature pack.

**Feature pack**:
A versioned extension that adds events, intents, UI nodes, or prefab machine fragments without touching the kernel.

**Registry**:
The set of branded top-level state ids a spec may target, produced by `ids(...)`. It holds top-level keys only, so nothing nested is addressable through it.

### States and flows

**State**:
One enumerable control position in the spec. Distinct from context, which is the typed data blob a state never enumerates.

**Compound state**:
A state that contains other states. It may carry `history`, which decides whether re-entering it resumes where the session left off or restarts.

**Flow**:
Sugar for a strictly linear sequence of states. It desugars into a compound state whose children are its steps. A flow is opaque: nothing outside names a step, no step names a sibling, and flows do not nest.

**Step**:
One member of a flow, either an `ask` or a `run`. A step is a real state after desugaring.

**Step name**:
The leading argument a step constructor takes, which identifies the step inside its flow. It is a free string under one rule for both constructors. Two steps deriving the same name is an error, fixed with the `as` override rather than by suffixing.
_Avoid_: step index, step position

**State id**:
The dotted path that names a state, such as `order.saveOrder`. Segments match `[A-Za-z][A-Za-z0-9]*`, a leading `_` is reserved, and a session records its position as this string.

### Events

**Event source**:
One of the six kinds of thing that can move a state: a press, a command, a text match, a timer, a lifecycle signal, or a raw update. `on` is keyed by source, so an event is identified by its source and its name together, never by a single concatenated string.

**Press**:
An inline button tap. Press names are declared once in the `presses` registry, because a press is the only source whose name appears in two places that can disagree: on the button and under `on.press`.
_Avoid_: click, tap, callback

**Payload**:
Typed data a button carries with its press. Its schema is declared per event in the registry; its value is written on the button. It never appears on the wire, because callback indirection puts only a short id there.

**Pattern**:
A serialised regex that routes a text message or a command remainder to a transition. Its named capture groups can be read into context. Distinct from **match**, which validates an `ask` step's reply and is a Standard Schema, not a regex.

**`from`**:
The one way a transition reads runtime data into context. It names a payload key under a press, or a capture group under a pattern, and nothing anywhere else.

**Raw passthrough**:
The escape hatch source. It matches an update by guard ref and exists so the whole Telegram surface stays usable before a feature pack promotes any part of it to its own source.

### Runtime

**Session**:
The stored state of one conversation, keyed by the scope axis. It holds a state id and a context value.

**Intent**:
A unit of work the interpreter emits as data, such as an API call, an effect invocation, or a timer schedule. Adapters execute intents; the interpreter never performs IO.

**Effect**:
A named side-effecting operation whose signature lives in the spec and whose implementation is bound on the adapter. It declares its outcomes, and each outcome is a transition.

**Adapter**:
The layer that turns intents into real calls against a Bot API client and feeds events back into the interpreter.

**View**:
The declared appearance of a state as pure data: text, parse mode, keyboard. The reconciler compares the desired view against what is on screen and chooses edit, append, or delete and resend.

**Staleness token**:
The `(sessionKey, stateId, seq)` value carried by every rendered view and scheduled timer, used to discard taps and firings that belong to a position the session has left.
