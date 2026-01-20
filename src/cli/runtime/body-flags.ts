/**
 * Body flag generation and parsing utilities.
 *
 * Generates CLI flags from JSON schema properties and parses
 * dot-notation flags back into nested objects.
 */

type JsonSchema = {
	type?: string;
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	required?: string[];
	description?: string;
};

export type BodyFlagDef = {
	flag: string; // e.g. "--name" or "--address.street"
	path: string[]; // e.g. ["name"] or ["address", "street"]
	type: "string" | "number" | "integer" | "boolean";
	description: string;
	required: boolean;
};

/**
 * Generate flag definitions from a JSON schema.
 * Recursively handles nested objects using dot notation.
 */
export function generateBodyFlags(
	schema: JsonSchema | undefined,
	reservedFlags: Set<string>,
): BodyFlagDef[] {
	if (!schema || schema.type !== "object" || !schema.properties) {
		return [];
	}

	const flags: BodyFlagDef[] = [];
	const requiredSet = new Set(schema.required ?? []);

	collectFlags(schema.properties, [], requiredSet, flags, reservedFlags);

	return flags;
}

function collectFlags(
	properties: Record<string, JsonSchema>,
	pathPrefix: string[],
	requiredAtRoot: Set<string>,
	out: BodyFlagDef[],
	reservedFlags: Set<string>,
): void {
	for (const [name, propSchema] of Object.entries(properties)) {
		if (!name || typeof name !== "string") continue;
		if (!propSchema || typeof propSchema !== "object") continue;

		const path = [...pathPrefix, name];
		const flagName = `--${path.join(".")}`;

		// Skip if this flag would conflict with an operation parameter
		if (reservedFlags.has(flagName)) continue;

		const t = propSchema.type;

		if (t === "object" && propSchema.properties) {
			// Recurse into nested object
			const nestedRequired = new Set(propSchema.required ?? []);
			collectFlags(
				propSchema.properties,
				path,
				nestedRequired,
				out,
				reservedFlags,
			);
		} else if (
			t === "string" ||
			t === "number" ||
			t === "integer" ||
			t === "boolean"
		) {
			// Leaf property - generate a flag
			const isRequired =
				pathPrefix.length === 0 ? requiredAtRoot.has(name) : false;

			out.push({
				flag: flagName,
				path,
				type: t,
				description: propSchema.description ?? `Body field '${path.join(".")}'`,
				required: isRequired,
			});
		}
		// Skip arrays and other complex types for now
	}
}

/**
 * Parse flag values with dot notation into a nested object.
 *
 * Example:
 *   { "address.street": "123 Main", "address.city": "NYC", "name": "Ada" }
 * Becomes:
 *   { address: { street: "123 Main", city: "NYC" }, name: "Ada" }
 */
export function parseDotNotationFlags(
	flagValues: Record<string, unknown>,
	flagDefs: BodyFlagDef[],
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const def of flagDefs) {
		// Commander keeps dots in option names: --address.street -> "address.street"
		const dotKey = def.path.join(".");
		const value = flagValues[dotKey];

		if (value === undefined) continue;

		setNestedValue(result, def.path, value, def.type);
	}

	return result;
}

/**
 * Set a value at a nested path, creating intermediate objects as needed.
 */
function setNestedValue(
	obj: Record<string, unknown>,
	path: string[],
	value: unknown,
	type: string,
): void {
	let current = obj;

	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i] as string;
		if (!(key in current) || typeof current[key] !== "object") {
			current[key] = {};
		}
		current = current[key] as Record<string, unknown>;
	}

	const finalKey = path[path.length - 1] as string;

	// Coerce value based on type
	if (type === "boolean") {
		current[finalKey] = true;
	} else if (type === "integer") {
		current[finalKey] = Number.parseInt(String(value), 10);
	} else if (type === "number") {
		current[finalKey] = Number(String(value));
	} else {
		current[finalKey] = String(value);
	}
}

/**
 * Check if all required fields are present.
 * Returns list of missing field paths.
 */
export function findMissingRequired(
	flagValues: Record<string, unknown>,
	flagDefs: BodyFlagDef[],
): string[] {
	const missing: string[] = [];

	for (const def of flagDefs) {
		if (!def.required) continue;

		// Commander keeps dots in option names: --address.street -> "address.street"
		const dotKey = def.path.join(".");
		if (flagValues[dotKey] === undefined) {
			missing.push(dotKey);
		}
	}

	return missing;
}
