export function stableStringify(value: unknown): string {
	return JSON.stringify(sort(value));
}

function sort(value: unknown): unknown {
	if (value === null) return null;

	if (Array.isArray(value)) {
		return value.map(sort);
	}

	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(obj).sort()) {
			out[key] = sort(obj[key]);
		}
		return out;
	}

	return value;
}
