export function extractTemplateVars(template: string): string[] {
	const out: string[] = [];
	const re = /\{([^}]+)\}/g;
	while (true) {
		const match = re.exec(template);
		if (!match) break;
		out.push((match[1] ?? "").trim());
	}
	return out.filter(Boolean);
}

export function applyTemplate(
	template: string,
	vars: Record<string, string>,
	options?: { encode?: boolean },
): string {
	const encode = options?.encode ?? false;
	return template.replace(/\{([^}]+)\}/g, (_, rawName) => {
		const name = String(rawName).trim();
		const value = vars[name];
		if (typeof value !== "string") {
			throw new Error(`Missing template variable: ${name}`);
		}
		return encode ? encodeURIComponent(value) : value;
	});
}
