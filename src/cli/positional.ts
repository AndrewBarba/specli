import type { ParamSpec } from "./params.js";

export type ActionShapeForCli = {
	pathArgs: string[];
	params: ParamSpec[];
};

export type PositionalArg = {
	name: string;
	required: boolean;
	description?: string;
	type: import("./schema-shape.js").ParamType;
	format?: string;
	enum?: string[];
};

export type FlagsIndex = {
	flags: Array<
		Pick<
			import("./params.js").ParamSpec,
			| "in"
			| "name"
			| "flag"
			| "required"
			| "description"
			| "type"
			| "format"
			| "enum"
			| "itemType"
			| "itemFormat"
			| "itemEnum"
		>
	>;
};

export function derivePositionals(action: ActionShapeForCli): PositionalArg[] {
	const byName = new Map<string, PositionalArg>();

	// Use pathArgs order; match metadata from params when available.
	for (const name of action.pathArgs) {
		const p = action.params.find(
			(x: ParamSpec) => x.in === "path" && x.name === name,
		);
		byName.set(name, {
			name,
			required: true,
			description: p?.description,
			type: p?.type ?? "unknown",
			format: p?.format,
			enum: p?.enum,
		});
	}

	return [...byName.values()];
}

export function deriveFlags(action: ActionShapeForCli): FlagsIndex {
	return {
		flags: action.params
			.filter((p: ParamSpec) => p.kind === "flag")
			.map((p: ParamSpec) => ({
				in: p.in,
				name: p.name,
				flag: p.flag,
				required: p.required,
				description: p.description,
				type: p.type,
				format: p.format,
				enum: p.enum,
				itemType: p.itemType,
				itemFormat: p.itemFormat,
				itemEnum: p.itemEnum,
			})),
	};
}
