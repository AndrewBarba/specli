export function parseHeaderInput(input: string): {
	name: string;
	value: string;
} {
	const trimmed = input.trim();
	if (!trimmed) throw new Error("Empty header");

	// Support either "Name: Value" or "Name=Value".
	const colon = trimmed.indexOf(":");
	if (colon !== -1) {
		const name = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();
		if (!name) throw new Error("Invalid header name");
		return { name, value };
	}

	const eq = trimmed.indexOf("=");
	if (eq !== -1) {
		const name = trimmed.slice(0, eq).trim();
		const value = trimmed.slice(eq + 1).trim();
		if (!name) throw new Error("Invalid header name");
		return { name, value };
	}

	throw new Error("Invalid header format. Use 'Name: Value' or 'Name=Value'.");
}

export function mergeHeaders(
	base: Headers,
	entries: Array<{ name: string; value: string }>,
): Headers {
	const h = new Headers(base);
	for (const { name, value } of entries) {
		h.set(name, value);
	}
	return h;
}
