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

	// For now, accept arrays/objects as JSON strings.
	if (type === "array" || type === "object") {
		try {
			return JSON.parse(raw);
		} catch {
			throw new InvalidArgumentError(
				`Expected JSON ${type}, got '${raw}'. Use --data/--file for complex bodies.`,
			);
		}
	}

	return raw;
}
