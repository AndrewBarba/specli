import type { CommandAction } from "../../command-model.ts";
import type { JsonSchema } from "../../types.ts";

export type ValidationSchemas = {
	querySchema?: JsonSchema;
	headerSchema?: JsonSchema;
	cookieSchema?: JsonSchema;
};

type ObjectSchema = {
	type: "object";
	properties: Record<string, JsonSchema>;
	required?: string[];
};

export function deriveValidationSchemas(
	action: CommandAction,
): ValidationSchemas {
	// We validate only simple containers for now.
	// Deep style/encoding differences for OpenAPI params are out of scope for v1.
	const query: ObjectSchema = { type: "object", properties: {}, required: [] };
	const header: ObjectSchema = { type: "object", properties: {}, required: [] };
	const cookie: ObjectSchema = { type: "object", properties: {}, required: [] };

	for (const p of action.params) {
		if (p.kind !== "flag") continue;
		const target =
			p.in === "query"
				? query
				: p.in === "header"
					? header
					: p.in === "cookie"
						? cookie
						: undefined;
		if (!target) continue;

		const schema = p.schema ?? (p.type === "unknown" ? {} : { type: p.type });
		target.properties[p.name] = schema;
		if (p.required) {
			if (!target.required) target.required = [];
			target.required.push(p.name);
		}
	}

	if (!query.required?.length) delete query.required;
	if (!header.required?.length) delete header.required;
	if (!cookie.required?.length) delete cookie.required;

	return {
		querySchema: Object.keys(query.properties).length ? query : undefined,
		headerSchema: Object.keys(header.properties).length ? header : undefined,
		cookieSchema: Object.keys(cookie.properties).length ? cookie : undefined,
	};
}
