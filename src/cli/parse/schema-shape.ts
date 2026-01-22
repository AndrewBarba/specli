export type ParamType =
	| "string"
	| "number"
	| "integer"
	| "boolean"
	| "array"
	| "object"
	| "unknown";

export function getSchemaType(schema: unknown): ParamType {
	if (!schema || typeof schema !== "object") return "unknown";
	const t = (schema as { type?: unknown }).type;
	if (t === "string") return "string";
	if (t === "number") return "number";
	if (t === "integer") return "integer";
	if (t === "boolean") return "boolean";
	if (t === "array") return "array";
	if (t === "object") return "object";
	return "unknown";
}

export function getSchemaFormat(schema: unknown): string | undefined {
	if (!schema || typeof schema !== "object") return undefined;
	const f = (schema as { format?: unknown }).format;
	return typeof f === "string" ? f : undefined;
}

export function getSchemaEnumStrings(schema: unknown): string[] | undefined {
	if (!schema || typeof schema !== "object") return undefined;
	const e = (schema as { enum?: unknown }).enum;
	if (!Array.isArray(e)) return undefined;

	// We only surface string enums for now (enough for flag docs + completion).
	const values = e.filter((v) => typeof v === "string") as string[];
	return values.length ? values : undefined;
}
