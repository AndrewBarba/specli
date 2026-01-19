import { InvalidArgumentError } from "commander";

import type { ParamType } from "../../schema-shape.ts";

export function coerceValue(raw: string, type: ParamType): unknown {
	if (type === "string" || type === "unknown") return raw;

	if (type === "boolean") {
		// Commander boolean options are handled without a value; keep for completeness.
		if (raw === "true") return true;
		if (raw === "false") return false;
		throw new InvalidArgumentError(`Expected boolean, got '${raw}'`);
	}

	if (type === "integer") {
		const n = Number.parseInt(raw, 10);
		if (!Number.isFinite(n))
			throw new InvalidArgumentError(`Expected integer, got '${raw}'`);
		return n;
	}

	if (type === "number") {
		const n = Number(raw);
		if (!Number.isFinite(n))
			throw new InvalidArgumentError(`Expected number, got '${raw}'`);
		return n;
	}

	// For now, accept objects as JSON strings.
	if (type === "object") {
		try {
			return JSON.parse(raw);
		} catch {
			throw new InvalidArgumentError(
				`Expected JSON object, got '${raw}'. Use --data/--file for complex bodies.`,
			);
		}
	}

	// Arrays should usually be passed as repeatable flags or comma-separated,
	// but allow JSON arrays too.
	if (type === "array") {
		return coerceArrayInput(raw, "string");
	}

	return raw;
}

export function coerceArrayInput(raw: string, itemType: ParamType): unknown[] {
	const trimmed = raw.trim();
	if (!trimmed) return [];

	if (trimmed.startsWith("[")) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			throw new InvalidArgumentError(`Expected JSON array, got '${raw}'`);
		}
		if (!Array.isArray(parsed)) {
			throw new InvalidArgumentError(`Expected JSON array, got '${raw}'`);
		}
		return parsed.map((v) => coerceValue(String(v), itemType));
	}

	return trimmed
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => coerceValue(s, itemType));
}
