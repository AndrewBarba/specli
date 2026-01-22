import { kebabCase } from "../core/strings.js";
import type {
	JsonSchema,
	NormalizedOperation,
	NormalizedParameter,
} from "../core/types.js";
import {
	getSchemaEnumStrings,
	getSchemaFormat,
	getSchemaType,
	type ParamType,
} from "./schema-shape.js";

export type { ParamType };

export type ParamSpec = {
	kind: "positional" | "flag";
	in: NormalizedParameter["in"];
	name: string;
	flag: string;
	required: boolean;
	description?: string;
	type: ParamType;
	format?: string;
	enum?: string[];

	// Arrays
	itemType?: ParamType;
	itemFormat?: string;
	itemEnum?: string[];

	// Original schema for Ajv validation and future advanced flag expansion.
	schema?: JsonSchema;
};

export function deriveParamSpecs(op: NormalizedOperation): ParamSpec[] {
	const out: ParamSpec[] = [];

	for (const p of op.parameters) {
		const flag = `--${kebabCase(p.name)}`;
		const type = getSchemaType(p.schema);
		const schemaObj =
			p.schema && typeof p.schema === "object"
				? (p.schema as JsonSchema)
				: undefined;

		const itemsSchema =
			schemaObj && type === "array" && typeof schemaObj.items === "object"
				? (schemaObj.items as unknown)
				: undefined;

		out.push({
			kind: p.in === "path" ? "positional" : "flag",
			in: p.in,
			name: p.name,
			flag,
			required: p.required,
			description: p.description,
			type,
			format: getSchemaFormat(p.schema),
			enum: getSchemaEnumStrings(p.schema),
			itemType: type === "array" ? getSchemaType(itemsSchema) : undefined,
			itemFormat: type === "array" ? getSchemaFormat(itemsSchema) : undefined,
			itemEnum:
				type === "array" ? getSchemaEnumStrings(itemsSchema) : undefined,
			schema: schemaObj,
		});
	}

	out.sort((a, b) => {
		if (a.in !== b.in) return a.in.localeCompare(b.in);
		return a.name.localeCompare(b.name);
	});

	return out;
}
