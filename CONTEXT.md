# botchart

A Telegram bot described as one portable, serializable statechart document, plus a pure interpreter that runs it and derived views that draw it.

## Language

### The document

**Spec**:
The canonical statechart document for one bot. It is data, it is executed directly, and every diagram or preview is derived from it.
Its root contains `$schema`, `version`, `schemaRevision`, `packs`, `scope`, `context`, `parameters`, `guards`, `effects`, `presses`, `units`, `stalePress`, `initial`, `on`, and `states`. All root fields are present in canonical JSON. Empty registries use `{}`, and an empty pack list uses `[]`.
`states` is non-empty, `$schema` equals the published schema id, and root `on` cannot contain `after`. `define()` emits the listed key order, but consumers attach no meaning to property order.
`define()` expands authoring shorthand, inserts defaults, and rejects values that are not finite, acyclic JSON data. Optional local fields are omitted when absent, and unknown fields are invalid.
_Avoid_: config, definition, schema

**Spec version**:
The integer generation of the spec's semantics. A changed, removed, or redefined shipped field increments it.

**Schema revision**:
The package version that identifies the exact additive field set within one spec version. A runtime rejects a newer unsupported revision.
The kernel schema source is `packages/botchart/schema.json`. Its revisioned `$id` is `https://svyatov.github.io/botchart/schema/<revision>.json`, and the package exports the same bytes as `botchart/schema`.

**Semantic validation**:
The mandatory validation stage that resolves references and checks relationships between fields. It runs after JSON Schema validation in every runtime.
Validation uses draft 2020-12 with format assertion enabled. Context schemas can use local references and cannot use external references.

**Kernel**:
The frozen part of the spec vocabulary. A field belongs in the kernel only if the interpreter's transition semantics depend on it, or if it is an extension point. Everything else starts in a feature pack.
The freeze is additive. What is frozen is the document's shape, its extension points, and the meaning of every field that ships. Adding a kernel field later is non-breaking; changing one, removing one, or re-meaning one is breaking.

**Feature pack**:
A versioned extension that adds events, intents, UI nodes, or prefab machine fragments. It adds only at an extension point. It never adds a key to a frozen record, never changes what a kernel field means, and never makes a kernel field optional.
A spec lists its feature packs by id and version in resolution order.
Each pack ships JSON Schema draft 2020-12 fragments. A runtime composes them with the kernel schema in spec order and closes the composed objects with `unevaluatedProperties: false`.
The pack id is an absolute URI, and the version is one exact SemVer 2.0.0 value. Pairs are unique. Runtime registration resolves them locally and never fetches the URI.
Schema extension points are event-source branches, view kinds, keyboard-node kinds, button appearance, and entry-pipeline-node kinds. A prefab authoring helper desugars into canonical states.

**Extension point**:
A place in the kernel where a feature pack may add something later without a breaking change. Being one is a reason for a field to be in the kernel. An extension point is declared while the kernel is frozen, never discovered afterwards.

**Registry**:
The set of branded state ids a spec may target, produced by `ids(...)`.

**Spec parameter**:
An immutable runtime input declared under `parameters` with a type and a mandatory default. A host may override it at startup, and it is never session data.
Its declaration is flat, and its default must validate against it. It cannot be optional.

**Authoring shorthand**:
A total, mechanical input form that `define()` expands into canonical JSON. A single transition, a single entry node, a static view string, a nested keyboard array, and omitted authoring defaults are shorthand.
`flow` and `ask` do not ship in 0.1.0. Pack prefab helpers desugar into real states.

**Declared name**:
A botchart-owned name for a state segment, context field, parameter, guard, effect, press, unit, timer, or effect outcome. It matches `[A-Za-z][A-Za-z0-9]*`, and a leading `_` is reserved. Commands use their separate Telegram grammar.

### Evidence and examples

**Corpus member**:
An immutable spec that records how a pinned real bot tested a specific version of the vocabulary.

**Derived asset**:
A maintained adaptation of a corpus member for use as a fixture, example, playground starter, or README sample.

### States and flows

**State**:
One enumerable control position in the spec. Distinct from context, which is the typed data blob a state never enumerates.

**Context**:
The mutable application data for one session. It is the only mutable data plane, including data that a view projects or changes.

**Initial context**:
The complete output produced when `define()` validates `{}` with the supplied Standard Schema validator. The canonical context JSON Schema stores it in its root `default` keyword.
Every runtime validates this value and uses it to create a session. `define()` fails when `{}` cannot produce a valid output.

**Context field**:
A named context value. It is a scalar, an array of scalars, or an array of flat records whose fields are optional scalars.
An optional field can be absent. It does not use `null` as an absence marker.
The canonical context value is a complete, closed draft 2020-12 output schema. Its root is an object. It can retain local `$defs` and validation keywords.

**Field declaration**:
A closed botchart object that describes a string, number, boolean, or array value. An array contains scalars or flat records and never marks its item as optional.
String and number declarations can hold a non-empty list of unique enum values of the declared type. `optional` is valid only at the declaration slots that define absence.

**Value reference**:
A tagged, one-hop read of context, a spec parameter, a call input, or a current projection item. It contains no path or expression.
Its exact forms use `context`, `parameter`, `input`, or `item`. `input` is valid inside a unit, and `item` is valid inside a projection. View bindings also declare their escape context.

**Atomic state**:
A state with no child states. It can keep, delete, edit, or append the current view according to its render policy.
Its canonical fields are `kind: "state"`, optional `view`, explicit `render`, optional `entry`, and optional `on`.

**Compound state**:
A state that contains other states. It may keep shallow or deep history. Omitted history restarts at its initial child.
It is the only nesting construct. Its active leaf owns the view.
Its canonical fields are `kind: "compound"`, local `initial`, non-empty `states`, optional `history`, optional `entry`, and optional `on`. It has no view or render policy.

**State history**:
The last stored position for a compound state. Shallow history stores its immediate child. Deep history stores its active leaf.
History is valid only on a compound state. When no history exists, entry uses the local `initial` child.

**State id**:
The dotted path that names a state, such as `order.saveOrder`. Segments match `[A-Za-z][A-Za-z0-9]*`, a leading `_` is reserved, and a session records its position as this string.
Root and compound `initial` fields name an adjacent child key. Transition targets use full state ids.

**Callable unit**:
A named state subgraph with required immutable input and typed output. A call suspends its caller, and the unit shares the session context.
Its canonical declaration contains `input`, `output`, local `initial`, and non-empty `states`. Input and output records are present even when empty. Unit inputs are required, while unit outputs can be optional.

**Return state**:
A terminal node inside a callable unit. It maps every unit output and resumes the suspended caller.
Its canonical fields are `kind: "return"` and `output`. It has no entry, event handlers, child states, or view.

**Final state**:
A terminal node that ends a session. It commits a final view or deletes the current view before the runtime removes the session.
Its canonical fields are `kind: "final"`, optional `view`, and explicit `render`. It has no entry, event handlers, or child states.

### Events

**Event source**:
One of the kinds of thing that can move a state, or that fires without moving it. The kernel sources are press, command, text, message, timer, lifecycle, and raw.
`on` is keyed by source. An event is identified by its source and name together.
Feature pack sources resolve after lifecycle and before raw, in the order listed by the spec.

**Handler set**:
The closed `on` object for one state or the spec root. Press handlers are a record of transition lists. Command handlers contain optional patterns and transition lists.
Text and raw handlers are ordered lists. Message and lifecycle handlers are records of transition lists. Named state-level `after` handlers contain a delay and transition list.
Root `on` is always present and excludes `after`. State `on` is optional. Empty source maps and lists are omitted.

**Press**:
An inline button tap. Press names are declared once in the `presses` registry. A press name appears on its button and under `on.press`.
Each press declaration contains a payload record, which can be empty. Every non-empty payload field is required and mapped by each button that uses the press. A button with an empty declared payload omits its payload.
_Avoid_: click, tap, callback

**Durable press**:
A press that stays valid after its original view becomes stale and resolves against the current session state.
It remains actionable until its message is deleted or replaced, or the session is removed.

**Stale press policy**:
The root choice for an obsolete press: ignore it, answer it, or answer it and rerender the current active leaf with edit semantics. The canonical default is ignore. A rerender does not move the session, and a durable press bypasses the policy.

**Command**:
The normalized bare name of a Telegram bot command, such as `cancel`. It excludes `/` and this bot's username suffix.
Letter case is preserved, and a name addressed to another bot remains text.
Declared names match `^[a-z][a-z0-9_]{0,31}$`. An incoming uppercase name remains text.

**Message kind**:
One of `animation`, `audio`, `contact`, `dice`, `document`, `location`, `photo`, `poll`, `sticker`, `venue`, `video`, `videoNote`, and `voice`.

**Payload**:
Typed data a button carries with its press. Its schema is declared per event in the registry; its value is written on the button. It never appears on the wire, because callback indirection puts only a short id there.

**Pattern**:
An ECMA-262 Unicode regex source with no delimiters or flags. It routes text or a command remainder to a transition.
Its named capture groups can be read into context.

**`from`**:
The tagged read of a value produced by the current event or operation. It can name a press payload field, regex capture, or operation output field.
Operation outputs include effect progress, effect outcomes, and unit outputs. Valid names come from the local declaration.

**Transition list**:
The ordered alternatives that an event source or effect outcome can hold. First match wins, and a list that matches nothing moves the session nowhere.
A single transition is the one-element list. Authors can write both forms, and the runtime reads only the list. A list is never empty.

**Transition**:
A closed object with optional `target`, `when`, and `assign`. A press transition can also contain `answer`. An empty transition consumes its event and changes nothing.
For a selected transition, the runtime evaluates its condition and applies its assignments. A target then causes exit and target-path entry.
The runtime then runs entry pipelines and renders the active leaf.

**Entry pipeline**:
The ordered, non-empty list of effect runs and unit calls that starts when a state becomes active. A moving result stops the pipeline.
A non-moving result continues to the next node. Semantic validation rejects direct and indirect unit-call recursion.

**Non-moving transition**:
A transition with no `target`. It leaves the session where it is, with no exit, entry, render, or `seq` bump.
A transition with a `target` is always external. This includes a target equal to the current state. It exits, re-enters, re-renders, and bumps `seq`.

**Raw passthrough**:
The escape hatch source. It matches an update by guard ref. It keeps the full Telegram surface usable until a feature pack promotes an update to its own source.

**Blocked lifecycle**:
A lifecycle signal that says the adapter classified an outbound Telegram failure as the recipient blocking the bot.
It is emitted once per failure chain and excludes busy, unauthorized, and rate-limited conditions.

**Error lifecycle**:
A lifecycle signal that says an intent batch failed. A second lifecycle failure in the same chain is terminal.

**Unhandled lifecycle**:
A lifecycle signal emitted once when no normal event handler matches after bubbling. The runtime ignores it when no lifecycle handler matches.

**Event resolution**:
For an inbound update, the runtime tries command, text, message, feature-pack sources, and raw. Within one source, it starts at the active leaf and bubbles to the root. The first matching transition wins.
Press, timer, and lifecycle events enter their distinct source and use the same bubbling. A second lifecycle failure in one processing chain is terminal.

### Runtime

**Scope**:
The axis that derives a session key. Its values are `user`, `chat`, `chat+user`, and `global`. Authoring defaults to `chat+user`, and canonical JSON always states the value.

**Session**:
The stored state of one conversation, keyed by the scope axis. It holds a position, context, state history, and call stack.

**Call frame**:
The suspended caller and immutable inputs for one active unit call. Call frames form a stack and share the session context.

**Unit call**:
An entry-pipeline node with `kind: "call"`, a unit name, a complete input map, and `onReturn`. The return mapping assigns every output to context and holds a non-empty transition list.
A missing optional output unsets its mapped optional context field.

**Intent**:
A unit of work the interpreter emits as data, such as a view operation, an effect invocation, or a timer schedule. Adapters execute intents; the interpreter never performs IO.

**Message handle**:
The serializable tagged address of one rendered Telegram message. The kernel ships the `chat` kind; feature packs can register `inline`, `business`, and `ephemeral` kinds.

**Message target**:
The serializable tagged destination for one view. It stays separate from a message handle because sending and editing need different address data.

**View slot**:
The runtime record that pairs a message target with an optional message handle. A new slot has no handle until the adapter sends its first view.

**View revision**:
The number of the latest interactive render committed to a view slot. Callback records carry it with the state-entry sequence to detect obsolete projected content.

**Callback record**:
The stored payload and freshness data for one rendered button. It belongs to one message handle and view revision.
Obsolete non-durable records are removed, while durable records remain until their message or session ends.

**View operation**:
A semantic `send`, `edit`, `delete`, or `replace` intent. A `replace` operation cleans up the old message and sends the new view as one adapter operation.

**Edit compatibility matrix**:
The complete registry that selects `edit`, `replace`, or `unsupported` for a handle kind, old view kind, and new view kind. Handle and view integrations add their rows.

**Effect**:
A named side-effecting operation whose signature lives in the spec and whose implementation is bound on the adapter. The signature declares inputs, outcomes, the values each outcome carries back into context, and any progress values it may emit while it runs. Each outcome is a transition.
Each run maps all declared inputs from values and maps all declared progress and outcome fields into context.
Its canonical declaration always contains an input record and a non-empty outcome record. Input can be empty. A present progress record is non-empty. An optional timeout uses the delay grammar and requires an outcome named `timeout`.

**Effect run**:
An entry-pipeline node with `kind: "run"`, an effect name, a complete input map, an optional complete progress assignment, and an exhaustive outcome map. Each outcome contains a complete assignment and a non-empty transition list.
The effect receives one immutable input snapshot. Progress updates context and renders the active leaf without moving. An outcome updates context before its transition list is evaluated. Progress or an outcome from an exited state is stale and has no effect.

**Guard**:
A named predicate, declared once in the `guards` registry and referenced by a branded ref, whose implementation is bound on the adapter. Distinct from a comparison of a context field against a literal, which is a construct in the document and needs no binding.
Its canonical declaration is an empty closed object. Its synchronous, pure implementation receives the current context and event.

**Comparing guard**:
A closed condition that compares two scalar literals or value references. It supports equality, inequality, and ordered comparison without a bound implementation.
Its operators are `eq`, `neq`, `lt`, `lte`, `gt`, and `gte`. Equality accepts compatible scalar types, while ordered comparison accepts numbers. Conditions have no Boolean composition in 0.1.0.

**Bounded arithmetic**:
A context assignment that increments or decrements one number field by a declared number. It does not read another field or contain an expression.
The amount is a positive finite JSON number, and the destination is a required number field.

**Assignment value**:
A direct compatible JSON value, a value reference, a produced-value reference, bounded arithmetic, or `{ unset: true }`. Every tagged form is closed.
`unset` applies only to an optional context destination. A missing optional effect progress field, effect outcome field, or unit output unsets its mapped optional destination. Any other missing reference is a local execution or render error.
Semantic validation checks source and destination base types, array shapes, record fields, and optionality. After each assignment batch, the runtime validates the complete context against its stored output JSON Schema.

**Adapter**:
The layer that turns intents into real calls against a Bot API client and feeds events back into the interpreter.

**Boot validation**:
The ordered checks before a first session: composed JSON Schema validation, semantic validation, regex compilation, and binding validation. The runtime requires all declared guards and effects, all listed packs, and a scheduler when the spec contains a timer.
Issues are deterministic and name the instance path, failed rule, and direct fix.

**View**:
The declared appearance of a state as pure data. Its tagged kind and content can be drawn without running the bot.
The kernel text view has `kind: "text"`, a non-empty `text` list of view parts, an explicit `parseMode` of `plain`, `HTML`, or `MarkdownV2`, and an optional non-empty keyboard. Authoring defaults the parse mode to `plain`.
Literal text parts are non-empty. The final rendered text must also be non-empty.

**Keyboard row**:
A tagged `row` node with a non-empty list of buttons. Authoring can use a nested array as shorthand.

**Button**:
A tagged `button` node with a non-empty view-part label, a declared press, an optional payload, an optional comparison, and an optional feature-pack appearance. Its canonical form always states if the press is durable.
The feature pack owns the schema for its appearance value.

**Projection**:
A view construct that repeats one authored shape for each item in a context array. It creates rendered elements and never creates control states.
Its source is a context array of flat records. It declares a positive integer maximum and contains one or more tagged keyboard rows. Nested projections are invalid. Rendering fails before intent emission when the source exceeds the maximum, and derived diagrams show one placeholder row.

**View binding**:
A structured part that reads one declared context field, spec parameter, or projection item field into a view. It is data and contains no expression string.
It renders scalar values and fails when the referenced value is absent.
Canonical view text and button labels are ordered lists of literal strings and view bindings.
Every canonical binding declares an escape context of `text`, `code`, or `url`. Authoring defaults it to `text`, and the runtime applies the selected parse-mode rules.

**Render policy**:
The state choice to edit, append, keep, or delete the current view. A canonical spec states the policy explicitly.
Edit reconciles the current view slot and sends when no handle exists. Append sends a new view and makes it current. Keep leaves the current view unchanged. Delete removes the current view and clears the slot. The compatibility matrix can turn edit into replace.

**Press answer**:
The optional toast or alert sent for an accepted or stale press. Its text uses view parts and has no parse mode.
Explicit text is non-empty. Authoring defaults the kind to toast. An omitted answer emits an empty callback answer.

**Scheduler**:
The host-supplied contract that makes an `after` transition survive a restart. It is an adapter concern only, because the interpreter emits a timer as an intent and never sleeps. It promises at-least-once firing and nothing more: no ordering, and cancellation is best effort, because the staleness token already drops a late or duplicate firing. The simulator uses none of it, since it advances a virtual clock over the same intent stream.

**Delay**:
How long an `after` entry waits, written as a single-unit duration string such as `30s`. It sits in the entry value rather than in the key. One state can therefore hold several named timers, and the form can widen later.
It matches `^[1-9][0-9]*(ms|s|m|h|d)$`. State entry schedules each named timer, and state exit emits its cancellation intent.

**Staleness token**:
The `(sessionKey, stateId, seq)` value carried by every rendered view and scheduled timer, used to discard taps and firings that belong to a position the session has left.
