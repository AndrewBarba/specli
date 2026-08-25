import { pluralize } from "../core/pluralize.js";
import { kebabCase } from "../core/strings.js";
import type { NormalizedOperation } from "../core/types.js";

export type PlannedOperation = NormalizedOperation & {
	resource: string;
	action: string;
	/** CLI-friendly path arg names (kebab-case) */
	pathArgs: string[];
	/** Original path template variable names (for URL substitution) */
	rawPathArgs: string[];
	style: "rest" | "rpc";
	canonicalAction: string;
	aliasOf?: string;
};

const GENERIC_TAGS = new Set(["default", "defaults", "api"]);

function getPathSegments(path: string): string[] {
	return path
		.split("/")
		.map((s) => s.trim())
		.filter(Boolean);
}

function getPathArgs(path: string): string[] {
	const args: string[] = [];
	const re = /\{([^}]+)\}/g;

	while (true) {
		const match = re.exec(path);
		if (!match) break;
		// biome-ignore lint/style/noNonNullAssertion: unknown
		args.push(match[1]!);
	}

	return args;
}

function pickResourceFromTags(tags: string[]): string | undefined {
	if (!tags.length) return undefined;
	const first = tags[0]?.trim();
	if (!first) return undefined;
	if (GENERIC_TAGS.has(first.toLowerCase())) return undefined;
	return first;
}

function splitOperationId(operationId: string): {
	prefix?: string;
	suffix?: string;
} {
	const trimmed = operationId.trim();
	if (!trimmed) return {};

	// Prefer dot-notation when present: Contacts.List
	if (trimmed.includes(".")) {
		const [prefix, ...rest] = trimmed.split(".");
		return { prefix, suffix: rest.join(".") };
	}

	// Try separators: Contacts_List, Contacts__List
	if (trimmed.includes("__")) {
		const [prefix, ...rest] = trimmed.split("__");
		return { prefix, suffix: rest.join("__") };
	}

	if (trimmed.includes("_")) {
		const [prefix, ...rest] = trimmed.split("_");
		return { prefix, suffix: rest.join("_") };
	}

	return { suffix: trimmed };
}

function inferStyle(op: NormalizedOperation): "rest" | "rpc" {
	// Path-based RPC convention (common in gRPC-ish HTTP gateways)
	// - POST /Contacts.List
	// - POST /Contacts/Service.List
	if (op.path.includes(".")) return "rpc";

	// operationId dot-notation alone is not enough to call it RPC; many REST APIs
	// have dotted ids. We treat dotted operationId as a weak signal.
	if (op.operationId?.includes(".") && op.method === "POST") return "rpc";

	return "rest";
}

function inferResource(op: NormalizedOperation): string {
	const tag = pickResourceFromTags(op.tags);
	if (tag) return pluralize(kebabCase(tag));

	if (op.operationId) {
		const { prefix } = splitOperationId(op.operationId);
		if (prefix) {
			const fromId = kebabCase(prefix);
			if (fromId === "ping") return "ping";
			return pluralize(fromId);
		}
	}

	const segments = getPathSegments(op.path);
	let first = segments[0] ?? "api";

	// If first segment is rpc-ish, like Contacts.List, split it.
	// biome-ignore lint/style/noNonNullAssertion: split always returns at least one element
	first = first.includes(".") ? first.split(".")[0]! : first;

	// Singletons like /ping generally shouldn't become `pings`.
	if (first.toLowerCase() === "ping") return "ping";

	// Strip path params if they appear in first segment (rare)
	const cleaned = first.replace(/^\{.+\}$/, "");
	return pluralize(kebabCase(cleaned || "api"));
}

/**
 * Extracts a meaningful disambiguator from an operationId by removing
 * redundant parts that are already represented in the command name.
 *
 * Examples:
 *   - "createDeployment" with action "create" and resource "deployments" -> null (no extra info)
 *   - "uploadDeploymentFiles" with action "create" and resource "deployments" -> "upload-files"
 *   - "getDeploymentEvents" with action "get" and resource "deployments" -> "events"
 */
function extractDisambiguator(
	operationId: string,
	action: string,
	resource: string,
): string | null {
	// Convert to kebab for consistent comparison
	let name = kebabCase(operationId);

	// Remove action prefix if it matches the command's action or its synonyms
	// This avoids redundancy like "get-get-deployment" or "get-list-files"
	const actionSynonyms: Record<string, string[]> = {
		get: ["get", "retrieve", "read", "list", "search"],
		list: ["list", "search", "get"],
		create: ["create", "post"],
		update: ["update", "patch", "put"],
		delete: ["delete", "remove"],
	};
	const synonyms = actionSynonyms[action] ?? [action];

	for (const synonym of synonyms) {
		if (name.startsWith(`${synonym}-`)) {
			name = name.slice(synonym.length + 1);
			break;
		}
	}

	// Remove resource name (singular and plural forms) from anywhere in the string
	const singularResource = resource.replace(/s$/, "");
	const resourcePatterns = [resource, singularResource];
	for (const pattern of resourcePatterns) {
		// Remove from start: "deployment-events" -> "events"
		if (name.startsWith(`${pattern}-`)) {
			name = name.slice(pattern.length + 1);
		}
		// Remove from middle: "upload-deployment-files" -> "upload-files"
		else if (name.includes(`-${pattern}-`)) {
			name = name.replace(`-${pattern}-`, "-");
		}
		// Remove from end: "upload-deployment" -> "upload"
		else if (name.endsWith(`-${pattern}`)) {
			name = name.slice(0, -(pattern.length + 1));
		}
		// Exact match means no extra info
		if (name === pattern) {
			return null;
		}
	}

	// If nothing meaningful remains, return null
	if (!name || name === action) return null;

	return name;
}

/** Derive a meaningful action name without adding a numeric suffix. */
function deriveSemanticAction(op: PlannedOperation): string | undefined {
	if (op.operationId) {
		const disambiguator = extractDisambiguator(
			op.operationId,
			op.action,
			op.resource,
		);
		if (disambiguator) {
			// Use the disambiguator directly as action: "upload-files", "get-events"
			return `${op.action}-${disambiguator}`;
		}
	}

	// Fallback: try to extract something from the path
	const segments = getPathSegments(op.path);
	// Look for the last non-parameter segment that isn't the resource
	const singularResource = op.resource.replace(/s$/, "");
	for (let i = segments.length - 1; i >= 0; i--) {
		const seg = segments[i];
		if (!seg || seg.startsWith("{")) continue;
		const kebabSeg = kebabCase(seg);
		if (kebabSeg !== op.resource && kebabSeg !== singularResource) {
			return `${op.action}-${kebabSeg}`;
		}
	}

	return undefined;
}

function deriveOperationIdAction(op: PlannedOperation): string | undefined {
	return op.operationId ? kebabCase(op.operationId) : undefined;
}

function derivePathIdentityAction(op: PlannedOperation): string | undefined {
	const re = /\{[^}]+\}/g;
	const path = kebabCase(op.path.replace(re, ""));
	return path ? `${op.action}-${path}` : undefined;
}

type CollisionCandidate = {
	operation: PlannedOperation;
	semanticAction: string | undefined;
	fallbackBaseAction: string;
	assignedAction?: string;
};

type CandidateCommand = {
	candidate: CollisionCandidate;
	action: string;
	commandKey: string;
};

type ActionOption = (candidate: CollisionCandidate) => string | undefined;

const MEANINGFUL_ACTION_OPTIONS: ActionOption[] = [
	(candidate) => candidate.semanticAction,
	(candidate) => deriveOperationIdAction(candidate.operation),
	(candidate) => derivePathIdentityAction(candidate.operation),
];

function buildCommandKey(resource: string, action: string): string {
	return `${resource}:${action}`;
}

/**
 * Assign the best available meaningful action to every colliding operation.
 *
 * Try a short action derived from the operation ID or path first, then the full
 * operation ID, then the full request path. For each option, calculate every
 * unassigned operation's command before assigning any. Use a command only when
 * exactly one operation would receive it and it is not already in use.
 */
function assignMeaningfulActions(
	candidates: CollisionCandidate[],
	allocatedCommands: Set<string>,
): void {
	for (const getAction of MEANINGFUL_ACTION_OPTIONS) {
		const unassignedCandidates = candidates.filter(
			(candidate) => !candidate.assignedAction,
		);
		const candidateCommands: CandidateCommand[] = [];
		const candidateCommandCounts = new Map<string, number>();

		for (const candidate of unassignedCandidates) {
			const action = getAction(candidate);
			if (!action) continue;
			const commandKey = buildCommandKey(candidate.operation.resource, action);
			candidateCommands.push({ candidate, action, commandKey });
			candidateCommandCounts.set(
				commandKey,
				(candidateCommandCounts.get(commandKey) ?? 0) + 1,
			);
		}

		for (const candidateCommand of candidateCommands) {
			const isUniqueAndAvailable =
				candidateCommandCounts.get(candidateCommand.commandKey) === 1 &&
				!allocatedCommands.has(candidateCommand.commandKey);
			if (!isUniqueAndAvailable) continue;

			candidateCommand.candidate.assignedAction = candidateCommand.action;
			allocatedCommands.add(candidateCommand.commandKey);
		}
	}
}

function canonicalizeAction(action: string): string {
	const a = kebabCase(action);

	// Common RPC verbs -> REST canonical verbs
	if (a === "retrieve" || a === "read") return "get";
	if (a === "list" || a === "search") return "list";
	if (a === "create") return "create";
	if (a === "update" || a === "patch") return "update";
	if (a === "delete" || a === "remove") return "delete";

	return a;
}

function inferRestAction(op: NormalizedOperation): string {
	// If operationId is present and looks intentional, prefer it.
	// This helps with singleton endpoints like GET /ping (Ping.Get) vs collections.
	if (op.operationId) {
		const { suffix } = splitOperationId(op.operationId);
		if (suffix) {
			const fromId = canonicalizeAction(suffix);
			if (
				fromId === "get" ||
				fromId === "list" ||
				fromId === "create" ||
				fromId === "update" ||
				fromId === "delete"
			) {
				return fromId;
			}
		}
	}

	const method = op.method.toUpperCase();
	const args = getPathArgs(op.path);
	const hasId = args.length > 0;

	if (method === "GET" && !hasId) return "list";
	if (method === "POST" && !hasId) return "create";

	if (method === "GET" && hasId) return "get";
	if ((method === "PUT" || method === "PATCH") && hasId) return "update";
	if (method === "DELETE" && hasId) return "delete";

	return kebabCase(method);
}

function inferRpcAction(op: NormalizedOperation): string {
	// Prefer operationId suffix: Contacts.List -> list
	if (op.operationId) {
		const { suffix } = splitOperationId(op.operationId);
		if (suffix) return canonicalizeAction(suffix);
	}

	// Else take last segment and split by '.'
	const segments = getPathSegments(op.path);
	const last = segments[segments.length - 1] ?? "";
	if (last.includes(".")) {
		const part = last.split(".").pop() ?? last;
		return canonicalizeAction(part);
	}

	return kebabCase(op.method);
}

export function planOperation(op: NormalizedOperation): PlannedOperation {
	const style = inferStyle(op);
	const resource = inferResource(op);
	const action = style === "rpc" ? inferRpcAction(op) : inferRestAction(op);
	const rawPathArgs = getPathArgs(op.path);

	return {
		...op,
		key: op.key,
		style,
		resource,
		action,
		canonicalAction: action,
		pathArgs: rawPathArgs.map((a) => kebabCase(a)),
		rawPathArgs,
	};
}

export function planOperations(ops: NormalizedOperation[]): PlannedOperation[] {
	const planned = ops.map(planOperation);

	// Count initial commands so only colliding operations are reallocated.
	const commandCounts = new Map<string, number>();
	for (const op of planned) {
		const commandKey = buildCommandKey(op.resource, op.action);
		commandCounts.set(commandKey, (commandCounts.get(commandKey) ?? 0) + 1);
	}

	// Reserve non-colliding commands so fallback names cannot replace them.
	const allocatedCommands = new Set<string>();
	for (const [commandKey, count] of commandCounts) {
		if (count === 1) allocatedCommands.add(commandKey);
	}

	// Number operations within each collision group for numeric fallbacks.
	const numericSuffixCounts = new Map<string, number>();
	const collisionCandidates: CollisionCandidate[] = [];
	for (const op of planned) {
		const commandKey = buildCommandKey(op.resource, op.action);
		const collisionCount = commandCounts.get(commandKey) ?? 0;
		if (collisionCount <= 1) continue;

		const numericSuffix = (numericSuffixCounts.get(commandKey) ?? 0) + 1;
		numericSuffixCounts.set(commandKey, numericSuffix);
		const semanticAction = deriveSemanticAction(op);
		collisionCandidates.push({
			operation: op,
			semanticAction,
			fallbackBaseAction: semanticAction ?? `${op.action}-${numericSuffix}`,
		});
	}

	assignMeaningfulActions(collisionCandidates, allocatedCommands);

	for (const candidate of collisionCandidates) {
		if (candidate.assignedAction) continue;

		// Numeric suffixes are the last resort after every meaningful option fails.
		const { operation } = candidate;
		const { fallbackBaseAction } = candidate;
		let action = fallbackBaseAction;
		let suffix = 2;
		let commandKey = buildCommandKey(operation.resource, action);
		while (allocatedCommands.has(commandKey)) {
			action = `${fallbackBaseAction}-${suffix}`;
			commandKey = buildCommandKey(operation.resource, action);
			suffix++;
		}
		candidate.assignedAction = action;
		allocatedCommands.add(commandKey);
	}

	const assignedActions = new Map(
		collisionCandidates.map(({ operation, assignedAction }) => [
			operation,
			assignedAction,
		]),
	);
	return planned.map((op) => {
		const action = assignedActions.get(op);
		return action
			? {
					...op,
					action,
					aliasOf: `${op.resource} ${op.canonicalAction}`,
				}
			: op;
	});
}
