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
	enum?: unknown[];
	allOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	anyOf?: JsonSchema[];
	nullable?: boolean;
};

export type BodyFlagDef = {
	flag: string; // e.g. "--name" or "--address.street"
	path: string[]; // e.g. ["name"] or ["address", "street"]
	type: "string" | "number" | "integer" | "boolean" | "array" | "json";
	description: string;
	required: boolean;
};

// ── Schema flattening (discriminated unions) ──────────────────────

/**
 * Merge properties from an array of sub-schemas (allOf).
 * Duplicates are safe to skip — allOf requires all branches to validate,
 * so same-named properties must be compatible. We pick the first and let
 * Ajv enforce the full constraints against the original schema.
 * Required = union of all.
 */
function mergeAllOf(schemas: JsonSchema[]): JsonSchema {
	const props: Record<string, JsonSchema> = {};
	const requiredSet = new Set<string>();

	for (const sub of schemas) {
		const resolved = flattenSchema(sub);
		if (resolved.properties) {
			for (const [k, v] of Object.entries(resolved.properties)) {
				if (!props[k]) props[k] = v;
			}
		}
		if (resolved.required) {
			for (const r of resolved.required) requiredSet.add(r);
		}
	}

	return { type: "object", properties: props, required: [...requiredSet] };
}

/**
 * Merge a property definition that appears in multiple oneOf/anyOf branches.
 * Same type + single-value enums → combine enums.
 * Same type → keep first. Type conflict → string fallback.
 */
function mergePropertyAcrossBranches(a: JsonSchema, b: JsonSchema): JsonSchema {
	const typeA = a.type ?? "string";
	const typeB = b.type ?? "string";

	if (typeA !== typeB) {
		return { type: "string", description: a.description ?? b.description };
	}

	// combine enums if both have them
	if (a.enum && b.enum) {
		const combined = [...new Set([...a.enum, ...b.enum])];
		return { ...a, enum: combined };
	}

	return a;
}

/**
 * Merge properties across oneOf/anyOf branches.
 * Required = intersection of all branches' required sets.
 */
function mergeOneOf(branches: JsonSchema[]): JsonSchema {
	const resolved = branches.map(flattenSchema);

	// merge types directly if all branches are non-object primitives
	const allPrimitive = resolved.every(
		(r) => r.type && r.type !== "object" && !r.properties,
	);
	if (allPrimitive) {
		return resolved.reduce((a, b) => mergePropertyAcrossBranches(a, b));
	}

	const props: Record<string, JsonSchema> = {};
	const requiredSets: Set<string>[] = [];

	for (const r of resolved) {
		if (r.properties) {
			for (const [k, v] of Object.entries(r.properties)) {
				props[k] = props[k] ? mergePropertyAcrossBranches(props[k], v) : v;
			}
		}
		requiredSets.push(new Set(r.required ?? []));
	}

	// Required = intersection of all branches
	let required: string[] = [];
	if (requiredSets.length > 0) {
		let intersection = requiredSets[0] ?? new Set<string>();
		for (let i = 1; i < requiredSets.length; i++) {
			const s = requiredSets[i];
			if (s) intersection = new Set([...intersection].filter((r) => s.has(r)));
		}
		required = [...intersection];
	}

	return { type: "object", properties: props, required };
}

/**
 * Flatten a schema that uses allOf/oneOf/anyOf into a single object schema
 * with merged properties. Passes through plain schemas unchanged.
 */
export function flattenSchema(schema: JsonSchema): JsonSchema {
	const branches = schema.allOf ?? schema.oneOf ?? schema.anyOf;
	if (!branches) return schema;

	const result = schema.allOf ? mergeAllOf(branches) : mergeOneOf(branches);

	// Parent may have its own properties/required alongside the composition
	if (schema.properties) {
		result.properties = { ...result.properties, ...schema.properties };
	}
	if (schema.required) {
		const reqSet = new Set([...(result.required ?? []), ...schema.required]);
		result.required = [...reqSet];
	}
	return result;
}

// ── Flag generation ──────────────────────────────────────────────

/**
 * Generate flag definitions from a JSON schema.
 * Recursively handles nested objects using dot notation.
 * Flattens discriminated unions (oneOf/allOf/anyOf) first.
 */
export function generateBodyFlags(
	schema: JsonSchema | undefined,
	reservedFlags: Set<string>,
): BodyFlagDef[] {
	if (!schema) return [];

	const resolved = flattenSchema(schema);
	if (resolved.type !== "object" || !resolved.properties) return [];

	const flags: BodyFlagDef[] = [];
	const requiredSet = new Set(resolved.required ?? []);

	collectFlags(resolved.properties, [], requiredSet, flags, reservedFlags);

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

		// Flatten composition (oneOf/allOf/anyOf) at the property level
		const resolved = flattenSchema(propSchema);
		const desc = propSchema.description ?? resolved.description;
		const t = resolved.type;
		const isRequired =
			pathPrefix.length === 0 ? requiredAtRoot.has(name) : false;

		if (t === "object" && resolved.properties) {
			// Recurse into nested object
			const nestedRequired = new Set(resolved.required ?? []);
			collectFlags(
				resolved.properties,
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
			out.push({
				flag: flagName,
				path,
				type: t,
				description: desc ?? `Body field '${path.join(".")}'`,
				required: isRequired,
			});
		} else if (t === "array") {
			out.push({
				flag: flagName,
				path,
				type: "array",
				description:
					desc ??
					`Body field '${path.join(".")}' (JSON array or comma-separated)`,
				required: isRequired,
			});
		} else if ((t === "object" && !resolved.properties) || !t) {
			// Opaque object or typeless schema (e.g. nullable: true) — accept JSON
			out.push({
				flag: flagName,
				path,
				type: "json",
				description: desc ?? `Body field '${path.join(".")}' (JSON)`,
				required: isRequired,
			});
		}
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
	} else if (type === "array") {
		// Already an array (e.g. from Commander accumulator) — pass through
		if (Array.isArray(value)) {
			current[finalKey] = value;
		} else {
			const trimmed = String(value).trim();
			if (trimmed.startsWith("[")) {
				try {
					current[finalKey] = JSON.parse(trimmed);
				} catch {
					// Bad JSON — fall back to comma-split
					current[finalKey] = trimmed
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean);
				}
			} else {
				current[finalKey] = trimmed
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
			}
		}
	} else if (type === "json") {
		try {
			current[finalKey] = JSON.parse(String(value));
		} catch {
			current[finalKey] = String(value);
		}
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
