export function stableStringify(
	value: unknown,
	options?: { space?: number },
): string {
	const visiting = new WeakSet<object>();
	return JSON.stringify(sort(value, visiting), null, options?.space);
}

function sort(value: unknown, visiting: WeakSet<object>): unknown {
	if (value === null) return null;

	if (Array.isArray(value)) {
		if (visiting.has(value)) return { __specli_circular: true };
		visiting.add(value);
		const out = value.map((v) => sort(v, visiting));
		visiting.delete(value);
		return out;
	}

	if (typeof value === "object") {
		if (visiting.has(value)) return { __specli_circular: true };
		visiting.add(value);

		const obj = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(obj).sort()) {
			out[key] = sort(obj[key], visiting);
		}

		visiting.delete(value);
		return out;
	}

	return value;
}
