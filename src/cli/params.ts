import {
	getSchemaEnumStrings,
	getSchemaFormat,
	getSchemaType,
} from "./schema-shape.ts";
import { kebabCase } from "./strings.ts";
import type { NormalizedOperation, NormalizedParameter } from "./types.ts";

export type ParamType = import("./schema-shape.ts").ParamType;

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
};

export function deriveParamSpecs(op: NormalizedOperation): ParamSpec[] {
	const out: ParamSpec[] = [];

	for (const p of op.parameters) {
		const flag = `--${kebabCase(p.name)}`;
		out.push({
			kind: p.in === "path" ? "positional" : "flag",
			in: p.in,
			name: p.name,
			flag,
			required: p.required,
			description: p.description,
			type: getSchemaType(p.schema),
			format: getSchemaFormat(p.schema),
			enum: getSchemaEnumStrings(p.schema),
		});
	}

	out.sort((a, b) => {
		if (a.in !== b.in) return a.in.localeCompare(b.in);
		return a.name.localeCompare(b.name);
	});

	return out;
}
