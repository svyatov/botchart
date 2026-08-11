import type {
  CoreInput,
  CoreResult,
  SemanticSessionSnapshot,
  CoreRunner,
} from "./runtime.js";
import type { BotchartSpec } from "./spec.generated.js";
import type { JsonValue } from "./spec.js";

export const transcriptSchemaId =
  "https://svyatov.github.io/botchart/conformance/0.1.0/transcript.schema.json" as const;
export const transcriptVersion = 1 as const;
export const transcriptSchemaRevision = "0.1.0" as const;

export type TranscriptSpecReference = {
  readonly path: string;
  readonly sha256: string;
};

export type TranscriptInitial = {
  readonly session: SemanticSessionSnapshot;
  readonly now: string;
};

export type TranscriptStep = {
  readonly name: string;
  readonly input: CoreInput;
  readonly advance?: string;
  readonly covers: readonly string[];
  readonly result: CoreResult;
};

export type GoldenTranscript = {
  readonly $schema: typeof transcriptSchemaId;
  readonly transcriptVersion: typeof transcriptVersion;
  readonly schemaRevision: typeof transcriptSchemaRevision;
  readonly name: string;
  readonly spec: TranscriptSpecReference;
  readonly initial: TranscriptInitial;
  readonly steps: readonly TranscriptStep[];
};

export type TranscriptIssue = {
  readonly code: string;
  readonly path: string;
  readonly message: string;
};

export type TranscriptValidation =
  | { readonly ok: true; readonly value: GoldenTranscript }
  | { readonly ok: false; readonly issues: readonly TranscriptIssue[] };

export type TranscriptIdKind = "callback" | "effect" | "timer";

export type TranscriptIdCounters = {
  readonly stable: (kind: TranscriptIdKind, value: string) => string;
};

type ReplayTranscriptIdCounters = TranscriptIdCounters & {
  readonly original: (kind: TranscriptIdKind, value: string) => string;
};

export type ReplayTranscriptOptions = {
  readonly transcript: GoldenTranscript;
  readonly spec: BotchartSpec;
  readonly runner: CoreRunner;
};

export type TranscriptReplay = {
  readonly transcript: GoldenTranscript;
  readonly issues: readonly TranscriptIssue[];
};

export type CoverageManifest = {
  readonly schemaRevision: string;
  readonly rules: readonly string[];
};

export type VerifyCoverageOptions = {
  readonly manifest: CoverageManifest;
  readonly transcripts: readonly GoldenTranscript[];
};

export type TranscriptVerification = {
  readonly ok: boolean;
  readonly issues: readonly TranscriptIssue[];
};

export type VerifyTranscriptOptions = {
  readonly transcript: unknown;
  readonly spec: BotchartSpec;
  readonly runner: CoreRunner;
};

export function validateTranscript(value: unknown): TranscriptValidation {
  const issue = validateTranscriptValue(value);
  return issue === undefined
    ? { ok: true, value: value as GoldenTranscript }
    : { ok: false, issues: [issue] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const stateIdPattern = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/;
const delayPattern = /^[1-9][0-9]*(?:ms|s|m|h|d)$/;
const rulePattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
const utcPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;

function validateTranscriptValue(value: unknown): TranscriptIssue | undefined {
  let issue = closedObject(value, "$", [
    "$schema",
    "transcriptVersion",
    "schemaRevision",
    "name",
    "spec",
    "initial",
    "steps",
  ]);
  if (issue !== undefined) return issue;
  const transcript = value as Record<string, unknown>;

  if (transcript.$schema !== transcriptSchemaId || transcript.transcriptVersion !== transcriptVersion) {
    return invalidValue(
      "$",
      `Set $schema to ${transcriptSchemaId} and transcriptVersion to 1.`,
    );
  }
  if (transcript.schemaRevision !== transcriptSchemaRevision) {
    return invalidValue("$.schemaRevision", `Set schemaRevision to ${transcriptSchemaRevision}.`);
  }
  if (!isNonEmptyString(transcript.name)) {
    return invalidValue("$.name", "Set name to a non-empty scenario name.");
  }

  issue = validateSpecReference(transcript.spec);
  if (issue !== undefined) return issue;
  issue = validateInitial(transcript.initial);
  if (issue !== undefined) return issue;
  if (!Array.isArray(transcript.steps) || transcript.steps.length === 0) {
    return invalidValue("$.steps", "Add at least one transcript step.");
  }

  const names = new Set<string>();
  let session = (transcript.initial as Record<string, unknown>).session;
  let final = false;
  for (const [index, stepValue] of transcript.steps.entries()) {
    const path = `$.steps[${index}]`;
    issue = validateStep(stepValue, path);
    if (issue !== undefined) return issue;
    const step = stepValue as Record<string, unknown>;
    const name = step.name as string;
    if (names.has(name)) {
      return {
        code: "duplicate_step_name",
        path: `${path}.name`,
        message: "Use a unique step name.",
      };
    }
    names.add(name);
    if (final) {
      return {
        code: "step_after_final",
        path,
        message: "Remove this step because the prior step ended the session.",
      };
    }

    const result = step.result as Record<string, unknown>;
    if (result.kind === "error") {
      if (compareTranscriptValues(
        session as JsonValue,
        result.session as JsonValue,
      ).length > 0) {
        return {
          code: "non_atomic_failure",
          path: `${path}.result.session`,
          message: "Copy the prior session into the failed result.",
        };
      }
      session = result.session;
    } else if (result.session === null) {
      final = true;
    } else {
      session = result.session;
    }
  }

  return undefined;
}

function validateSpecReference(value: unknown): TranscriptIssue | undefined {
  const issue = closedObject(value, "$.spec", ["path", "sha256"]);
  if (issue !== undefined) return issue;
  const spec = value as Record<string, unknown>;
  if (
    !isNonEmptyString(spec.path)
    || spec.path.startsWith("/")
    || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(spec.path)
    || !spec.path.endsWith(".json")
  ) {
    return invalidValue("$.spec.path", "Set path to a relative JSON file path.");
  }
  if (typeof spec.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(spec.sha256)) {
    return invalidValue("$.spec.sha256", "Set sha256 to 64 lowercase hexadecimal characters.");
  }
  return undefined;
}

function validateInitial(value: unknown): TranscriptIssue | undefined {
  const issue = closedObject(value, "$.initial", ["session", "now"]);
  if (issue !== undefined) return issue;
  const initial = value as Record<string, unknown>;
  if (!isUtcTime(initial.now)) {
    return invalidValue("$.initial.now", "Set now to an RFC 3339 UTC time.");
  }
  return validateSession(initial.session, "$.initial.session");
}

function validateStep(value: unknown, path: string): TranscriptIssue | undefined {
  let issue = closedObject(value, path, ["name", "input", "advance", "covers", "result"], [
    "name",
    "input",
    "covers",
    "result",
  ]);
  if (issue !== undefined) return issue;
  const step = value as Record<string, unknown>;
  if (!isNonEmptyString(step.name)) {
    return invalidValue(`${path}.name`, "Set name to a non-empty step name.");
  }
  issue = validateCoreInput(step.input, `${path}.input`);
  if (issue !== undefined) return issue;
  if (step.advance !== undefined && (typeof step.advance !== "string" || !delayPattern.test(step.advance))) {
    return invalidValue(`${path}.advance`, "Use one positive delay unit, such as 30s.");
  }
  if (!Array.isArray(step.covers) || step.covers.length === 0) {
    return invalidValue(`${path}.covers`, "Add at least one coverage rule.");
  }
  const covers = new Set<string>();
  for (const [index, rule] of step.covers.entries()) {
    if (typeof rule !== "string" || !rulePattern.test(rule)) {
      return invalidValue(`${path}.covers[${index}]`, "Use a dotted lowercase coverage rule id.");
    }
    if (covers.has(rule)) {
      return {
        code: "duplicate_coverage",
        path: `${path}.covers[${index}]`,
        message: `Keep one claim for ${rule} in this step.`,
      };
    }
    covers.add(rule);
  }
  return validateCoreResult(step.result, `${path}.result`);
}

function validateCoreInput(value: unknown, path: string): TranscriptIssue | undefined {
  const issue = closedObject(value, path, ["origin", "source", "name", "payload"]);
  if (issue !== undefined) return issue;
  const input = value as Record<string, unknown>;
  if (typeof input.origin !== "string" || !["telegram", "effect", "scheduler", "adapter"].includes(input.origin)) {
    return invalidValue(`${path}.origin`, "Use telegram, effect, scheduler, or adapter.");
  }
  if (!isNonEmptyString(input.source)) {
    return invalidValue(`${path}.source`, "Set source to a non-empty event source.");
  }
  if (!isNonEmptyString(input.name)) {
    return invalidValue(`${path}.name`, "Set name to a non-empty event name.");
  }
  if (!isJsonValue(input.payload)) {
    return invalidValue(`${path}.payload`, "Set payload to JSON data.");
  }
  return undefined;
}

function validateCoreResult(value: unknown, path: string): TranscriptIssue | undefined {
  if (!isRecord(value)) return invalidValue(path, "Set result to an ok or error object.");
  if (value.kind === "ok") {
    let issue = closedObject(value, path, ["kind", "session", "intents"]);
    if (issue !== undefined) return issue;
    if (value.session !== null) {
      issue = validateSession(value.session, `${path}.session`);
      if (issue !== undefined) return issue;
    }
    return validateIntents(value.intents, `${path}.intents`);
  }
  if (value.kind === "error") {
    let issue = closedObject(value, path, ["kind", "session", "intents", "error"]);
    if (issue !== undefined) return issue;
    issue = validateSession(value.session, `${path}.session`);
    if (issue !== undefined) return issue;
    if (!Array.isArray(value.intents) || value.intents.length !== 0) {
      return invalidValue(`${path}.intents`, "Set intents to an empty array for a failed step.");
    }
    issue = closedObject(value.error, `${path}.error`, ["code", "path", "message"]);
    if (issue !== undefined) return issue;
    const error = value.error as Record<string, unknown>;
    for (const field of ["code", "path", "message"] as const) {
      if (!isNonEmptyString(error[field])) {
        return invalidValue(`${path}.error.${field}`, `Set ${field} to a non-empty string.`);
      }
    }
    return undefined;
  }
  return invalidValue(`${path}.kind`, "Use ok or error as the result kind.");
}

function validateSession(value: unknown, path: string): TranscriptIssue | undefined {
  let issue = closedObject(value, path, [
    "position",
    "context",
    "history",
    "callStack",
    "seq",
    "viewSlots",
    "callbacks",
  ]);
  if (issue !== undefined) return issue;
  const session = value as Record<string, unknown>;
  if (typeof session.position !== "string" || !stateIdPattern.test(session.position)) {
    return invalidValue(`${path}.position`, "Set position to a valid full state id.");
  }
  if (!isRecord(session.context) || !isJsonValue(session.context)) {
    return invalidValue(`${path}.context`, "Set context to a JSON object.");
  }
  if (!isRecord(session.history)) {
    return invalidValue(`${path}.history`, "Set history to an object of state ids.");
  }
  for (const [key, stateId] of Object.entries(session.history)) {
    if (typeof stateId !== "string" || !stateIdPattern.test(stateId)) {
      return invalidValue(`${path}.history.${key}`, "Set the history value to a valid state id.");
    }
  }
  if (!Array.isArray(session.callStack)) {
    return invalidValue(`${path}.callStack`, "Set callStack to an array.");
  }
  for (const [index, frame] of session.callStack.entries()) {
    issue = validateCallFrame(frame, `${path}.callStack[${index}]`);
    if (issue !== undefined) return issue;
  }
  if (!Number.isInteger(session.seq) || Number(session.seq) < 0) {
    return invalidValue(`${path}.seq`, "Set seq to a non-negative integer.");
  }
  if (!isRecord(session.viewSlots)) {
    return invalidValue(`${path}.viewSlots`, "Set viewSlots to an object.");
  }
  for (const [key, slot] of Object.entries(session.viewSlots)) {
    issue = validateViewSlot(slot, `${path}.viewSlots.${key}`);
    if (issue !== undefined) return issue;
  }
  if (!isRecord(session.callbacks)) {
    return invalidValue(`${path}.callbacks`, "Set callbacks to an object.");
  }
  for (const [key, callback] of Object.entries(session.callbacks)) {
    issue = validateCallback(callback, `${path}.callbacks.${key}`);
    if (issue !== undefined) return issue;
  }
  return undefined;
}

function validateCallFrame(value: unknown, path: string): TranscriptIssue | undefined {
  let issue = closedObject(value, path, ["unit", "input", "caller"]);
  if (issue !== undefined) return issue;
  const frame = value as Record<string, unknown>;
  if (!isNonEmptyString(frame.unit)) return invalidValue(`${path}.unit`, "Set unit to a non-empty name.");
  if (!isRecord(frame.input) || !isJsonValue(frame.input)) {
    return invalidValue(`${path}.input`, "Set input to a JSON object.");
  }
  issue = closedObject(frame.caller, `${path}.caller`, ["stateId", "entryIndex"]);
  if (issue !== undefined) return issue;
  const caller = frame.caller as Record<string, unknown>;
  if (typeof caller.stateId !== "string" || !stateIdPattern.test(caller.stateId)) {
    return invalidValue(`${path}.caller.stateId`, "Set stateId to a valid full state id.");
  }
  if (!Number.isInteger(caller.entryIndex) || Number(caller.entryIndex) < 0) {
    return invalidValue(`${path}.caller.entryIndex`, "Set entryIndex to a non-negative integer.");
  }
  return undefined;
}

function validateViewSlot(value: unknown, path: string): TranscriptIssue | undefined {
  let issue = closedObject(value, path, ["target", "revision", "current"], ["target", "revision"]);
  if (issue !== undefined) return issue;
  const slot = value as Record<string, unknown>;
  issue = validateChatTarget(slot.target, `${path}.target`);
  if (issue !== undefined) return issue;
  if (!Number.isInteger(slot.revision) || Number(slot.revision) < 0) {
    return invalidValue(`${path}.revision`, "Set revision to a non-negative integer.");
  }
  if (slot.current !== undefined) {
    issue = closedObject(slot.current, `${path}.current`, ["handle", "viewKind"]);
    if (issue !== undefined) return issue;
    const current = slot.current as Record<string, unknown>;
    issue = validateChatHandle(current.handle, `${path}.current.handle`);
    if (issue !== undefined) return issue;
    if (!isNonEmptyString(current.viewKind)) {
      return invalidValue(`${path}.current.viewKind`, "Set viewKind to a non-empty view kind.");
    }
  }
  return undefined;
}

function validateCallback(value: unknown, path: string): TranscriptIssue | undefined {
  const fields = [
    "sessionKey",
    "stateId",
    "seq",
    "viewSlot",
    "viewRevision",
    "handle",
    "press",
    "payload",
    "durable",
  ];
  const issue = closedObject(
    value,
    path,
    fields,
    fields.filter((field) => field !== "handle"),
  );
  if (issue !== undefined) return issue;
  const callback = value as Record<string, unknown>;
  if (!isNonEmptyString(callback.sessionKey)) return invalidValue(`${path}.sessionKey`, "Set sessionKey to a non-empty key.");
  if (typeof callback.stateId !== "string" || !stateIdPattern.test(callback.stateId)) {
    return invalidValue(`${path}.stateId`, "Set stateId to a valid full state id.");
  }
  if (!Number.isInteger(callback.seq) || Number(callback.seq) < 0) return invalidValue(`${path}.seq`, "Set seq to a non-negative integer.");
  if (!isNonEmptyString(callback.viewSlot)) return invalidValue(`${path}.viewSlot`, "Set viewSlot to a non-empty slot name.");
  if (!Number.isInteger(callback.viewRevision) || Number(callback.viewRevision) < 0) {
    return invalidValue(`${path}.viewRevision`, "Set viewRevision to a non-negative integer.");
  }
  if (callback.handle !== undefined) {
    const handleIssue = validateChatHandle(callback.handle, `${path}.handle`);
    if (handleIssue !== undefined) return handleIssue;
  }
  if (!isNonEmptyString(callback.press)) return invalidValue(`${path}.press`, "Set press to a non-empty press name.");
  if (!isRecord(callback.payload) || !isJsonValue(callback.payload)) {
    return invalidValue(`${path}.payload`, "Set payload to a JSON object.");
  }
  if (typeof callback.durable !== "boolean") return invalidValue(`${path}.durable`, "Set durable to true or false.");
  return undefined;
}

function validateIntents(value: unknown, path: string): TranscriptIssue | undefined {
  if (!Array.isArray(value)) return invalidValue(path, "Set intents to an array.");
  for (const [index, intent] of value.entries()) {
    const issue = validateIntent(intent, `${path}[${index}]`);
    if (issue !== undefined) return issue;
  }
  return undefined;
}

function validateIntent(value: unknown, path: string): TranscriptIssue | undefined {
  if (!isRecord(value)) return invalidValue(path, "Set the intent to a closed intent object.");
  if (value.kind === "view") return validateViewIntent(value, path);
  if (value.kind === "effect") {
    let issue = closedObject(value, path, ["kind", "id", "effect", "input", "token"]);
    if (issue !== undefined) return issue;
    if (!isNonEmptyString(value.id)) return invalidValue(`${path}.id`, "Set id to a non-empty effect id.");
    if (!isNonEmptyString(value.effect)) return invalidValue(`${path}.effect`, "Set effect to a non-empty effect name.");
    if (!isRecord(value.input) || !isJsonValue(value.input)) return invalidValue(`${path}.input`, "Set input to a JSON object.");
    return validateToken(value.token, `${path}.token`);
  }
  if (value.kind === "timer") return validateTimerIntent(value, path);
  if (value.kind === "pressAnswer") {
    let issue = closedObject(value, path, ["kind", "callbackQueryId", "answer"], ["kind", "callbackQueryId"]);
    if (issue !== undefined) return issue;
    if (!isNonEmptyString(value.callbackQueryId)) {
      return invalidValue(`${path}.callbackQueryId`, "Set callbackQueryId to a non-empty id.");
    }
    if (value.answer !== undefined) {
      issue = closedObject(value.answer, `${path}.answer`, ["kind", "text"]);
      if (issue !== undefined) return issue;
      const answer = value.answer as Record<string, unknown>;
      if (typeof answer.kind !== "string" || !["toast", "alert"].includes(answer.kind)) {
        return invalidValue(`${path}.answer.kind`, "Use toast or alert as the answer kind.");
      }
      if (!isNonEmptyString(answer.text)) return invalidValue(`${path}.answer.text`, "Set text to a non-empty answer.");
    }
    return undefined;
  }
  return invalidValue(`${path}.kind`, "Use view, effect, timer, or pressAnswer as the intent kind.");
}

function validateViewIntent(value: Record<string, unknown>, path: string): TranscriptIssue | undefined {
  const operation = value.operation;
  const fields = operation === "send"
    ? ["kind", "operation", "slot", "target", "view"]
    : operation === "edit"
      ? ["kind", "operation", "slot", "handle", "view"]
      : operation === "delete"
        ? ["kind", "operation", "slot", "handle"]
        : operation === "replace"
          ? ["kind", "operation", "slot", "target", "handle", "view"]
          : undefined;
  if (fields === undefined) return invalidValue(`${path}.operation`, "Use send, edit, delete, or replace.");
  let issue = closedObject(value, path, fields);
  if (issue !== undefined) return issue;
  if (!isNonEmptyString(value.slot)) return invalidValue(`${path}.slot`, "Set slot to a non-empty slot name.");
  if ("target" in value) {
    issue = validateChatTarget(value.target, `${path}.target`);
    if (issue !== undefined) return issue;
  }
  if ("handle" in value) {
    issue = validateChatHandle(value.handle, `${path}.handle`);
    if (issue !== undefined) return issue;
  }
  if ("view" in value && (!isRecord(value.view) || !isJsonValue(value.view))) {
    return invalidValue(`${path}.view`, "Set view to a JSON object.");
  }
  return undefined;
}

function validateTimerIntent(value: Record<string, unknown>, path: string): TranscriptIssue | undefined {
  const schedule = value.operation === "schedule";
  const fields = schedule
    ? ["kind", "operation", "id", "timer", "fireAt", "token"]
    : value.operation === "cancel"
      ? ["kind", "operation", "id"]
      : undefined;
  if (fields === undefined) return invalidValue(`${path}.operation`, "Use schedule or cancel as the timer operation.");
  const issue = closedObject(value, path, fields);
  if (issue !== undefined) return issue;
  if (!isNonEmptyString(value.id)) return invalidValue(`${path}.id`, "Set id to a non-empty timer id.");
  if (!schedule) return undefined;
  if (!isNonEmptyString(value.timer)) return invalidValue(`${path}.timer`, "Set timer to a non-empty timer name.");
  if (!isUtcTime(value.fireAt)) return invalidValue(`${path}.fireAt`, "Set fireAt to an RFC 3339 UTC time.");
  return validateToken(value.token, `${path}.token`);
}

function validateToken(value: unknown, path: string): TranscriptIssue | undefined {
  const issue = closedObject(value, path, ["sessionKey", "stateId", "seq"]);
  if (issue !== undefined) return issue;
  const token = value as Record<string, unknown>;
  if (!isNonEmptyString(token.sessionKey)) return invalidValue(`${path}.sessionKey`, "Set sessionKey to a non-empty key.");
  if (typeof token.stateId !== "string" || !stateIdPattern.test(token.stateId)) {
    return invalidValue(`${path}.stateId`, "Set stateId to a valid full state id.");
  }
  if (!Number.isInteger(token.seq) || Number(token.seq) < 0) return invalidValue(`${path}.seq`, "Set seq to a non-negative integer.");
  return undefined;
}

function validateChatTarget(value: unknown, path: string): TranscriptIssue | undefined {
  const issue = closedObject(value, path, ["kind", "chatId"]);
  if (issue !== undefined) return issue;
  const target = value as Record<string, unknown>;
  if (target.kind !== "chat") return invalidValue(`${path}.kind`, "Set kind to chat.");
  if (typeof target.chatId !== "number" || !Number.isFinite(target.chatId)) {
    return invalidValue(`${path}.chatId`, "Set chatId to a finite number.");
  }
  return undefined;
}

function validateChatHandle(value: unknown, path: string): TranscriptIssue | undefined {
  const issue = closedObject(value, path, ["kind", "chatId", "messageId"]);
  if (issue !== undefined) return issue;
  const handle = value as Record<string, unknown>;
  if (handle.kind !== "chat") return invalidValue(`${path}.kind`, "Set kind to chat.");
  for (const field of ["chatId", "messageId"] as const) {
    if (typeof handle[field] !== "number" || !Number.isFinite(handle[field])) {
      return invalidValue(`${path}.${field}`, `Set ${field} to a finite number.`);
    }
  }
  return undefined;
}

function closedObject(
  value: unknown,
  path: string,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): TranscriptIssue | undefined {
  if (!isRecord(value)) return invalidValue(path, "Set this value to an object.");
  const unknown = Object.keys(value).find((field) => !allowed.includes(field));
  if (unknown !== undefined) {
    return {
      code: "unknown_field",
      path: `${path}.${unknown}`,
      message: `Remove the ${unknown} field.`,
    };
  }
  const missing = required.find((field) => !(field in value));
  if (missing !== undefined) {
    return {
      code: "missing_field",
      path,
      message: `Add the ${missing} field.`,
    };
  }
  return undefined;
}

function invalidValue(path: string, message: string): TranscriptIssue {
  return { code: "invalid_value", path, message };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUtcTime(value: unknown): value is string {
  return typeof value === "string" && utcPattern.test(value) && !Number.isNaN(Date.parse(value));
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

export function createTranscriptIdCounters(): TranscriptIdCounters {
  return createReplayTranscriptIdCounters();
}

function createReplayTranscriptIdCounters(): ReplayTranscriptIdCounters {
  const values = new Map<TranscriptIdKind, {
    readonly mapped: Map<string, string>;
    next: number;
  }>();

  return {
    stable(kind, value) {
      let state = values.get(kind);
      if (state === undefined) {
        state = { mapped: new Map(), next: 1 };
        values.set(kind, state);
      }

      const existing = state.mapped.get(value);
      if (existing !== undefined) return existing;

      const typed = new RegExp(`^${kind}:(?<counter>[1-9][0-9]*)$`).exec(value);
      const stable = typed === null ? `${kind}:${state.next}` : value;
      state.next = Math.max(state.next + Number(typed === null), Number(typed?.groups?.counter ?? 0) + 1);
      state.mapped.set(value, stable);
      return stable;
    },
    original(kind, value) {
      const state = values.get(kind);
      if (state === undefined) return value;
      for (const [original, stable] of state.mapped) {
        if (stable === value) return original;
      }
      return value;
    },
  };
}

export function verifyCoverage(options: VerifyCoverageOptions): readonly TranscriptIssue[] {
  const { manifest, transcripts } = options;
  const issues: TranscriptIssue[] = [];
  const counts = new Map<string, number>();
  for (const [index, rule] of manifest.rules.entries()) {
    if (counts.has(rule)) {
      issues.push({
        code: "duplicate_rule",
        path: `$.rules[${index}]`,
        message: `Keep one ${rule} rule in coverage.json.`,
      });
    } else {
      counts.set(rule, 0);
    }
  }

  for (const [transcriptIndex, transcript] of transcripts.entries()) {
    if (transcript.schemaRevision !== manifest.schemaRevision) {
      issues.push({
        code: "coverage_revision_mismatch",
        path: `$.transcripts[${transcriptIndex}].schemaRevision`,
        message: `Set schemaRevision to ${manifest.schemaRevision}.`,
      });
    }
    for (const [stepIndex, step] of transcript.steps.entries()) {
      for (const [claimIndex, rule] of step.covers.entries()) {
        const path = `$.transcripts[${transcriptIndex}].steps[${stepIndex}].covers[${claimIndex}]`;
        const count = counts.get(rule);
        if (count === undefined) {
          issues.push({
            code: "unknown_coverage",
            path,
            message: `Add ${rule} to coverage.json or remove this claim.`,
          });
        } else if (count > 0) {
          issues.push({
            code: "duplicate_coverage",
            path,
            message: `Keep one transcript claim for ${rule}.`,
          });
          counts.set(rule, count + 1);
        } else {
          counts.set(rule, 1);
        }
      }
    }
  }

  for (const [rule, count] of counts) {
    if (count === 0) {
      issues.push({
        code: "missing_coverage",
        path: `$.rules[${manifest.rules.indexOf(rule)}]`,
        message: `Add one transcript claim for ${rule}.`,
      });
    }
  }

  return issues;
}

export function replayTranscript(options: ReplayTranscriptOptions): TranscriptReplay {
  return runTranscript(options, true);
}

function runTranscript(
  options: ReplayTranscriptOptions,
  compareResults: boolean,
): TranscriptReplay {
  const { runner, spec, transcript } = options;
  const issues: TranscriptIssue[] = [];
  const counters = createReplayTranscriptIdCounters();
  for (const callbackId of Object.keys(transcript.initial.session.callbacks)) {
    counters.stable("callback", callbackId);
  }
  const steps: TranscriptStep[] = [];
  let now = Date.parse(transcript.initial.now);
  let session = transcript.initial.session;
  let runtimeSession = transcript.initial.session;
  let final = false;

  for (const [index, step] of transcript.steps.entries()) {
    const stepPath = `$.steps[${index}]`;
    if (final) {
      issues.push({
        code: "step_after_final",
        path: stepPath,
        message: "Remove this step because the prior step ended the session.",
      });
      steps.push(step);
      continue;
    }

    if (step.advance !== undefined) now += delayMilliseconds(step.advance);

    const runtimeResult = runner({
      spec,
      session: runtimeSession,
      input: restoreInputIds(step.input, counters),
      now: new Date(now).toISOString(),
    });
    const result = normalizeResult(runtimeResult, counters);

    if (result.kind === "error") {
      const sessionIssues = compareTranscriptValues(
        session as unknown as JsonValue,
        result.session as unknown as JsonValue,
        `${stepPath}.result.session`,
      );
      if (sessionIssues.length > 0 || result.intents.length > 0) {
        issues.push({
          code: "non_atomic_failure",
          path: `${stepPath}.result`,
          message: "Return the prior session and no intents for a failed step.",
        });
      }
    }

    if (compareResults) {
      const comparison = compareTranscriptValues(
        step.result as unknown as JsonValue,
        result as unknown as JsonValue,
        `${stepPath}.result`,
      );
      issues.push(...comparison);
    }
    steps.push({ ...step, result });

    if (result.kind === "ok") {
      if (result.session === null) {
        final = true;
      } else {
        session = result.session;
        runtimeSession = runtimeResult.session!;
      }
    } else {
      session = result.session;
      runtimeSession = runtimeResult.session!;
    }
  }

  return {
    transcript: { ...transcript, steps },
    issues,
  };
}

function restoreInputIds(
  input: CoreInput,
  counters: ReplayTranscriptIdCounters,
): CoreInput {
  if (input.origin === "telegram" && input.source === "press") {
    return { ...input, name: counters.original("callback", input.name) };
  }
  if (
    input.origin !== "effect"
    || !isRecord(input.payload)
    || typeof input.payload.id !== "string"
  ) return input;
  return {
    ...input,
    payload: {
      ...input.payload,
      id: counters.original("effect", input.payload.id),
    },
  };
}

export async function verifyTranscript(
  options: VerifyTranscriptOptions,
): Promise<TranscriptVerification> {
  const validation = validateTranscript(options.transcript);
  if (!validation.ok) return { ok: false, issues: validation.issues };

  const digest = await digestSpec(options.spec as unknown as JsonValue);
  const issues: TranscriptIssue[] = [];
  if (validation.value.spec.sha256 !== digest) {
    issues.push({
      code: "spec_digest_mismatch",
      path: "$.spec.sha256",
      message: `Set the spec digest to ${digest}.`,
    });
  }

  issues.push(...replayTranscript({
    transcript: validation.value,
    spec: options.spec,
    runner: options.runner,
  }).issues);

  return { ok: issues.length === 0, issues };
}

export async function updateTranscript(
  options: ReplayTranscriptOptions,
): Promise<TranscriptReplay> {
  const replay = runTranscript(options, false);
  const sha256 = await digestSpec(options.spec as unknown as JsonValue);

  return {
    ...replay,
    transcript: {
      ...replay.transcript,
      spec: { ...replay.transcript.spec, sha256 },
    },
  };
}

function delayMilliseconds(delay: string): number {
  const match = /^(?<amount>[1-9][0-9]*)(?<unit>ms|s|m|h|d)$/.exec(delay);
  if (match?.groups === undefined) return 0;

  const amount = Number(match.groups.amount);
  const units: Readonly<Record<string, number>> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return amount * (units[match.groups.unit ?? ""] ?? 0);
}

function normalizeResult(result: CoreResult, counters: TranscriptIdCounters): CoreResult {
  const session = result.session === null
    ? null
    : {
        ...result.session,
        callbacks: Object.fromEntries(
          Object.entries(result.session.callbacks).map(([id, callback]) => [
            counters.stable("callback", id),
            callback,
          ]),
        ),
      };
  const intents = result.intents.map((intent) => {
    if (intent.kind === "effect") {
      return { ...intent, id: counters.stable("effect", intent.id) };
    }
    if (intent.kind === "timer") {
      return { ...intent, id: counters.stable("timer", intent.id) };
    }
    if (intent.kind === "view" && "view" in intent) {
      return {
        ...intent,
        view: normalizeViewCallbackIds(intent.view, counters),
      };
    }
    return intent;
  });

  if (result.kind === "error") {
    return { ...result, session: session ?? result.session, intents: result.intents };
  }

  return { ...result, session, intents };
}

function normalizeViewCallbackIds(
  value: Readonly<Record<string, JsonValue>>,
  counters: TranscriptIdCounters,
): Readonly<Record<string, JsonValue>> {
  return normalizeCallbackValue(value, counters) as Readonly<Record<string, JsonValue>>;
}

function normalizeCallbackValue(
  value: JsonValue,
  counters: TranscriptIdCounters,
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCallbackValue(item, counters));
  }
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [
      name,
      name === "callbackId" && typeof item === "string"
        ? counters.stable("callback", item)
        : normalizeCallbackValue(item, counters),
    ]),
  );
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }

  return value;
}

export function stringifyTranscript(value: GoldenTranscript | JsonValue): string {
  return `${JSON.stringify(sortJson(value as JsonValue), null, 2)}\n`;
}

export async function digestSpec(spec: BotchartSpec | JsonValue): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(sortJson(spec as JsonValue)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function compareTranscriptValues(
  expected: JsonValue,
  actual: JsonValue,
  path = "$",
): readonly TranscriptIssue[] {
  if (Object.is(expected, actual)) {
    return [];
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return [valueMismatch(path, expected)];
    }

    for (let index = 0; index < expected.length; index += 1) {
      const issues = compareTranscriptValues(expected[index] ?? null, actual[index] ?? null, `${path}[${index}]`);
      if (issues.length > 0) return issues;
    }

    return [];
  }

  if (isJsonObject(expected) && isJsonObject(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      if (!(key in expected) || !(key in actual)) {
        return [valueMismatch(path, expected)];
      }

      const issues = compareTranscriptValues(expected[key] ?? null, actual[key] ?? null, `${path}.${key}`);
      if (issues.length > 0) return issues;
    }

    return [];
  }

  return [valueMismatch(path, expected)];
}

function isJsonObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueMismatch(path: string, expected: JsonValue): TranscriptIssue {
  return {
    code: "value_mismatch",
    path,
    message: `Set the value to ${JSON.stringify(expected)}.`,
  };
}
