import type { ParamSpec } from "./params.ts";

export type ActionShapeForCli = {
	pathArgs: string[];
	params: ParamSpec[];
};

export type PositionalArg = {
	name: string;
	required: boolean;
	description?: string;
	type: import("./schema-shape.ts").ParamType;
	format?: string;
	enum?: string[];
};

export type FlagsIndex = {
	flags: Array<
		Pick<
			import("./params.ts").ParamSpec,
			| "in"
			| "name"
			| "flag"
			| "required"
			| "description"
			| "type"
			| "format"
			| "enum"
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
			})),
	};
}
