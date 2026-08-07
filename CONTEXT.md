# botchart

A Telegram bot described as one portable, serializable statechart document, plus a pure interpreter that runs it and derived views that draw it.

## Language

### The document

**Spec**:
The canonical statechart document for one bot. It is data, it is executed directly, and every diagram or preview is derived from it.
_Avoid_: config, definition, schema

**Kernel**:
The frozen part of the spec vocabulary. A field belongs in the kernel only if the interpreter's transition semantics depend on it, or if it is an extension point. Everything else starts in a feature pack.
The freeze is additive. What is frozen is the document's shape, its extension points, and the meaning of every field that ships. Adding a kernel field later is non-breaking; changing one, removing one, or re-meaning one is breaking.

**Feature pack**:
A versioned extension that adds events, intents, UI nodes, or prefab machine fragments. It adds only at an extension point. It never adds a key to a frozen record, never changes what a kernel field means, and never makes a kernel field optional.

**Extension point**:
A place in the kernel where a feature pack may add something later without a breaking change. Being one is a reason for a field to be in the kernel. An extension point is declared while the kernel is frozen, never discovered afterwards.

**Registry**:
The set of branded state ids a spec may target, produced by `ids(...)`.

### States and flows

**State**:
One enumerable control position in the spec. Distinct from context, which is the typed data blob a state never enumerates.

**Compound state**:
A state that contains other states. It may carry `history`, which decides whether re-entering it resumes where the session left off or restarts. It is the only nesting construct: `flow` and its steps were deleted, so a sequence of screens is a compound state whose children are ordinary states.

**State id**:
The dotted path that names a state, such as `order.saveOrder`. Segments match `[A-Za-z][A-Za-z0-9]*`, a leading `_` is reserved, and a session records its position as this string.

### Events

**Event source**:
One of the kinds of thing that can move a state, or that fires without moving it. The kernel freezes the list and its resolution order: a press, a command, a text match, a non-text inbound message, a timer, a lifecycle signal, and a raw update. `on` is keyed by source, so an event is identified by its source and its name together, never by a single concatenated string. `on` is an extension point, so a feature pack may register a further source, and every pack source resolves after all the kernel ones.

**Press**:
An inline button tap. Press names are declared once in the `presses` registry, because a press is the only source whose name appears in two places that can disagree: on the button and under `on.press`.
_Avoid_: click, tap, callback

**Payload**:
Typed data a button carries with its press. Its schema is declared per event in the registry; its value is written on the button. It never appears on the wire, because callback indirection puts only a short id there.

**Pattern**:
A serialised regex that routes a text message or a command remainder to a transition. Its named capture groups can be read into context.

**`from`**:
The one way a transition reads runtime data into context. It names a payload key under a press, or a capture group under a pattern, and nothing anywhere else.

**Transition list**:
The ordered alternatives one event source or one effect outcome may hold in place of a single transition. First match wins, and a list that matches nothing moves the session nowhere. A single transition is the one-element list, so both forms are written and only the list is read. A list is never empty.

**Non-moving transition**:
A transition with no `target`. It replies and leaves the session where it is: no exit, no entry, no `seq` bump. A transition that names a `target` is always external, even when the target is the state it is already in, so it exits, re-enters, re-renders and bumps `seq`.

**Raw passthrough**:
The escape hatch source. It matches an update by guard ref and exists so the whole Telegram surface stays usable before a feature pack promotes any part of it to its own source.

### Runtime

**Session**:
The stored state of one conversation, keyed by the scope axis. It holds a state id and a context value.

**Intent**:
A unit of work the interpreter emits as data, such as a view operation, an effect invocation, or a timer schedule. Adapters execute intents; the interpreter never performs IO.

**Message handle**:
The serializable tagged address of one rendered Telegram message. The kernel ships the `chat` kind; feature packs can register `inline`, `business`, and `ephemeral` kinds.

**Message target**:
The serializable tagged destination for one view. It stays separate from a message handle because sending and editing need different address data.

**View slot**:
The runtime record that pairs a message target with an optional message handle. A new slot has no handle until the adapter sends its first view.

**View operation**:
A semantic `send`, `edit`, `delete`, or `replace` intent. A `replace` operation cleans up the old message and sends the new view as one adapter operation.

**Edit compatibility matrix**:
The complete registry that selects `edit`, `replace`, or `unsupported` for a handle kind, old view kind, and new view kind. Handle and view integrations add their rows.

**Effect**:
A named side-effecting operation whose signature lives in the spec and whose implementation is bound on the adapter. The signature declares inputs, outcomes, the values each outcome carries back into context, and any progress values it may emit while it runs. Each outcome is a transition.

**Guard**:
A named predicate, declared once in the `guards` registry and referenced by a branded ref, whose implementation is bound on the adapter. Distinct from a comparison of a context field against a literal, which is a construct in the document and needs no binding.

**Adapter**:
The layer that turns intents into real calls against a Bot API client and feeds events back into the interpreter.

**View**:
The declared appearance of a state as pure data: text, parse mode, keyboard. The reconciler compares the desired view against what is on screen and chooses edit, append, or delete and resend.

**Scheduler**:
The host-supplied contract that makes an `after` transition survive a restart. It is an adapter concern only, because the interpreter emits a timer as an intent and never sleeps. It promises at-least-once firing and nothing more: no ordering, and cancellation is best effort, because the staleness token already drops a late or duplicate firing. The simulator uses none of it, since it advances a virtual clock over the same intent stream.

**Delay**:
How long an `after` entry waits, written as a single-unit duration string such as `30s`. It sits in the entry value rather than in the key. One state can therefore hold several named timers, and the form can widen later.

**Staleness token**:
The `(sessionKey, stateId, seq)` value carried by every rendered view and scheduled timer, used to discard taps and firings that belong to a position the session has left.
