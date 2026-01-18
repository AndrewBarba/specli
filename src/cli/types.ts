export type SpecSource = "embedded" | "file" | "url";

export type SecurityRequirement = Record<string, string[]>;

export type OpenApiDoc = {
	openapi: string;
	info?: {
		title?: string;
		version?: string;
	};
	servers?: Array<{ url: string; description?: string; variables?: unknown }>;
	security?: SecurityRequirement[];
	components?: {
		securitySchemes?: Record<string, unknown>;
	};
	paths?: Record<string, unknown>;
};

export type NormalizedParameter = {
	in: "path" | "query" | "header" | "cookie";
	name: string;
	required: boolean;
	description?: string;
	schema?: unknown;
};

// Minimal JSON Schema-like shape for validation and flag expansion.
export type JsonSchema = Record<string, unknown>;

export function isJsonSchema(value: unknown): value is JsonSchema {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type NormalizedRequestBody = {
	required: boolean;
	contentTypes: string[];
	schemasByContentType: Record<string, unknown | undefined>;
};

export type NormalizedOperation = {
	key: string;
	method: string;
	path: string;
	operationId?: string;
	tags: string[];
	summary?: string;
	description?: string;
	deprecated?: boolean;
	security?: SecurityRequirement[];
	parameters: NormalizedParameter[];
	requestBody?: NormalizedRequestBody;
};

export type LoadedSpec = {
	source: SpecSource;
	id: string;
	fingerprint: string;
	doc: OpenApiDoc;
};
