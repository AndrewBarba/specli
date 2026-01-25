import type { JsonSchema, SecurityRequirement } from "../core/types.js";
import { type AuthSummary, summarizeAuth } from "../parse/auth-requirements.js";
import type { AuthScheme } from "../parse/auth-schemes.js";
import { deriveParamSpecs, type ParamSpec } from "../parse/params.js";
import {
	deriveFlags,
	derivePositionals,
	type PositionalArg,
} from "../parse/positional.js";
import {
	deriveRequestBodyInfo,
	type RequestBodyInfo,
} from "../parse/request-body.js";
import { buildCommandId } from "./command-id.js";
import type { PlannedOperation } from "./naming.js";

export type CommandAction = {
	id: string;
	key: string;
	action: string;
	/** CLI-friendly path arg names (kebab-case) for display */
	pathArgs: string[];
	/** Original path template variable names (for URL substitution) */
	rawPathArgs: string[];
	method: string;
	path: string;
	operationId?: string;
	tags: string[];
	summary?: string;
	description?: string;
	deprecated?: boolean;
	style: PlannedOperation["style"];

	// Derived CLI shape (Phase 1 output; Phase 2 will wire these into commander)
	positionals: PositionalArg[];
	flags: Array<
		Pick<
			ParamSpec,
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

	// Full raw params list (useful for debugging and future features)
	params: ParamSpec[];

	auth: AuthSummary;
	requestBody?: RequestBodyInfo;
	requestBodySchema?: JsonSchema;
};

export type CommandResource = {
	resource: string;
	actions: CommandAction[];
};

export type CommandModel = {
	resources: CommandResource[];
};

export type BuildCommandModelOptions = {
	specId: string;
	globalSecurity?: SecurityRequirement[];
	authSchemes?: AuthScheme[];
};

export function buildCommandModel(
	planned: PlannedOperation[],
	options: BuildCommandModelOptions,
): CommandModel {
	const byResource = new Map<string, CommandAction[]>();

	for (const op of planned) {
		const list = byResource.get(op.resource) ?? [];
		const params = deriveParamSpecs(op);
		const positionals = derivePositionals({ pathArgs: op.pathArgs, params });
		const flags = deriveFlags({ pathArgs: op.pathArgs, params });

		list.push({
			id: buildCommandId({
				specId: options.specId,
				resource: op.resource,
				action: op.action,
				operationKey: op.key,
			}),
			key: op.key,
			action: op.action,
			pathArgs: op.pathArgs,
			rawPathArgs: op.rawPathArgs,
			method: op.method,
			path: op.path,
			operationId: op.operationId,
			tags: op.tags,
			summary: op.summary,
			description: op.description,
			deprecated: op.deprecated,
			style: op.style,
			params,
			positionals,
			flags: flags.flags,
			auth: summarizeAuth(
				op.security,
				options.globalSecurity,
				options.authSchemes ?? [],
			),
			requestBody: deriveRequestBodyInfo(op),
			requestBodySchema: deriveRequestBodyInfo(op)?.preferredSchema,
		});
		byResource.set(op.resource, list);
	}

	const resources: CommandResource[] = [];

	for (const [resource, actions] of byResource.entries()) {
		actions.sort((a, b) => {
			if (a.action !== b.action) return a.action.localeCompare(b.action);
			if (a.path !== b.path) return a.path.localeCompare(b.path);
			return a.method.localeCompare(b.method);
		});
		resources.push({ resource, actions });
	}

	resources.sort((a, b) => a.resource.localeCompare(b.resource));

	return { resources };
}
