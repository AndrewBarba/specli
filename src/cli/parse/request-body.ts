import type {
	JsonSchema,
	NormalizedOperation,
	NormalizedRequestBody,
} from "../core/types.js";
import { isJsonSchema } from "../core/types.js";
import {
	getSchemaEnumStrings,
	getSchemaFormat,
	getSchemaType,
	type ParamType,
} from "./schema-shape.js";

export type RequestBodyContent = {
	contentType: string;
	required: boolean;
	schemaType: ParamType;
	schemaFormat?: string;
	schemaEnum?: string[];
};

export type RequestBodyInfo = {
	required: boolean;
	content: RequestBodyContent[];
	// Convenience flags for later arg generation.
	hasJson: boolean;
	hasFormUrlEncoded: boolean;
	hasMultipart: boolean;

	// Phase 1 planning: supported generic body inputs.
	bodyFlags: string[];
	preferredContentType?: string;

	// Original JSON Schema (for expanded flags + validation)
	preferredSchema?: JsonSchema;
};

function getRequestBody(
	op: NormalizedOperation,
): NormalizedRequestBody | undefined {
	return op.requestBody;
}

export function deriveRequestBodyInfo(
	op: NormalizedOperation,
): RequestBodyInfo | undefined {
	const rb = getRequestBody(op);
	if (!rb) return undefined;

	const content: RequestBodyContent[] = [];
	for (const contentType of rb.contentTypes) {
		const schema = rb.schemasByContentType[contentType];
		content.push({
			contentType,
			required: rb.required,
			schemaType: getSchemaType(schema),
			schemaFormat: getSchemaFormat(schema),
			schemaEnum: getSchemaEnumStrings(schema),
		});
	}

	content.sort((a, b) => a.contentType.localeCompare(b.contentType));

	const hasJson = content.some((c) => c.contentType.includes("json"));
	const hasFormUrlEncoded = content.some(
		(c) => c.contentType === "application/x-www-form-urlencoded",
	);
	const hasMultipart = content.some((c) =>
		c.contentType.startsWith("multipart/"),
	);

	const bodyFlags = ["--data", "--file"]; // always available when requestBody exists

	const preferredContentType =
		content.find((c) => c.contentType === "application/json")?.contentType ??
		content.find((c) => c.contentType.includes("json"))?.contentType ??
		content[0]?.contentType;

	const preferredSchema = preferredContentType
		? rb.schemasByContentType[preferredContentType]
		: undefined;

	return {
		required: rb.required,
		content,
		hasJson,
		hasFormUrlEncoded,
		hasMultipart,
		bodyFlags,
		preferredContentType,
		preferredSchema: isJsonSchema(preferredSchema)
			? preferredSchema
			: undefined,
	};
}
