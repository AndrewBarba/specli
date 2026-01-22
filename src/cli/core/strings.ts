export function kebabCase(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return "";

	// Convert spaces/underscores/dots to dashes, split camelCase.
	return trimmed
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[\s_.:/]+/g, "-")
		.replace(/[^a-zA-Z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
}

export function titleCase(input: string): string {
	return input
		.split(/\s+/g)
		.filter(Boolean)
		.map((w) => w[0]?.toUpperCase() + w.slice(1))
		.join(" ");
}
