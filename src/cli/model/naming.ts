import { pluralize } from "../core/pluralize.js";
import { kebabCase } from "../core/strings.js";
import type { NormalizedOperation } from "../core/types.js";

export type PlannedOperation = NormalizedOperation & {
	resource: string;
	action: string;
	pathArgs: string[];
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

	return {
		...op,
		key: op.key,
		style,
		resource,
		action,
		canonicalAction: action,
		pathArgs: getPathArgs(op.path).map((a) => kebabCase(a)),
	};
}

export function planOperations(ops: NormalizedOperation[]): PlannedOperation[] {
	const planned = ops.map(planOperation);

	// Stable collision handling: if resource+action repeats, add a suffix.
	const counts = new Map<string, number>();
	for (const op of planned) {
		const key = `${op.resource}:${op.action}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	const seen = new Map<string, number>();
	return planned.map((op) => {
		const key = `${op.resource}:${op.action}`;
		const total = counts.get(key) ?? 0;
		if (total <= 1) return op;

		const idx = (seen.get(key) ?? 0) + 1;
		seen.set(key, idx);

		const suffix = op.operationId
			? kebabCase(op.operationId)
			: kebabCase(`${op.method}-${op.path}`);

		const disambiguatedAction = `${op.action}-${suffix}-${idx}`;

		return {
			...op,
			action: disambiguatedAction,
			aliasOf: `${op.resource} ${op.canonicalAction}`,
		};
	});
}
