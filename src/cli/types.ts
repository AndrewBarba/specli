export type SpecSource = "embedded" | "file" | "url";

export type OpenApiDoc = {
	openapi: string;
	info?: {
		title?: string;
		version?: string;
	};
	servers?: Array<{ url: string }>;
	security?: unknown;
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

export type NormalizedRequestBody = {
	required: boolean;
	contentTypes: string[];
	schemasByContentType: Record<string, unknown | undefined>;
};

export type NormalizedOperation = {
	method: string;
	path: string;
	operationId?: string;
	tags: string[];
	summary?: string;
	description?: string;
	deprecated?: boolean;
	security?: unknown;
	parameters: NormalizedParameter[];
	requestBody?: NormalizedRequestBody;
};

export type LoadedSpec = {
	source: SpecSource;
	id: string;
	fingerprint: string;
	doc: OpenApiDoc;
};
