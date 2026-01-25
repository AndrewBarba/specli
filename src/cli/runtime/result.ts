/**
 * Intermediate Representation (IR) for command results.
 *
 * All specli operations return a CommandResult which can be:
 * - Rendered to string for CLI output
 * - Serialized to JSON for programmatic use
 * - Inspected/modified before execution (PreparedRequest)
 */

// ----------------------------------------------------------------------------
// Prepared Request (pre-flight)
// ----------------------------------------------------------------------------

/**
 * A request that has been built but not yet executed.
 * Can be inspected, modified, or converted to curl.
 */
export type PreparedRequest = {
	/** HTTP method */
	method: string;
	/** Full URL including query params */
	url: string;
	/** Request headers */
	headers: Record<string, string>;
	/** Request body (if any) */
	body?: string;
	/** Curl command equivalent */
	curl: string;
};

// ----------------------------------------------------------------------------
// Response
// ----------------------------------------------------------------------------

/**
 * HTTP response data.
 */
export type ResponseData = {
	/** HTTP status code */
	status: number;
	/** Whether status is 2xx */
	ok: boolean;
	/** Response headers */
	headers: Record<string, string>;
	/** Parsed response body */
	body: unknown;
	/** Raw response body as string */
	rawBody: string;
};

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

/**
 * A single validation error.
 */
export type ValidationError = {
	/** Path to the invalid field (e.g., "body.name", "query.limit") */
	path: string;
	/** Error message */
	message: string;
	/** The invalid value (if available) */
	value?: unknown;
};

// ----------------------------------------------------------------------------
// Timing
// ----------------------------------------------------------------------------

/**
 * Request timing information.
 */
export type Timing = {
	/** When the request started (ISO string) */
	startedAt: string;
	/** Total duration in milliseconds */
	durationMs: number;
};

// ----------------------------------------------------------------------------
// Command Results (discriminated union)
// ----------------------------------------------------------------------------

/**
 * Base fields shared by all result types.
 */
type ResultBase = {
	/** Resource name (e.g., "users") */
	resource?: string;
	/** Action name (e.g., "list", "get") */
	action?: string;
};

/**
 * Successful execution result.
 */
export type SuccessResult = ResultBase & {
	type: "success";
	/** The prepared request that was sent */
	request: PreparedRequest;
	/** The response received */
	response: ResponseData;
	/** Request timing */
	timing: Timing;
};

/**
 * Error result (HTTP error or execution error).
 */
export type ErrorResult = ResultBase & {
	type: "error";
	/** Error message */
	message: string;
	/** The prepared request (if available) */
	request?: PreparedRequest;
	/** The response (if HTTP error) */
	response?: ResponseData;
	/** Request timing (if request was made) */
	timing?: Timing;
};

/**
 * Validation failure result.
 */
export type ValidationResult = ResultBase & {
	type: "validation";
	/** Validation errors */
	errors: ValidationError[];
	/** The request that failed validation (partial) */
	request?: Partial<PreparedRequest>;
};

/**
 * Prepared request result (dry-run mode).
 */
export type PreparedResult = ResultBase & {
	type: "prepared";
	/** The prepared request ready to execute */
	request: PreparedRequest;
};

/**
 * Curl output result (--curl mode).
 */
export type CurlResult = ResultBase & {
	type: "curl";
	/** The curl command */
	curl: string;
	/** The full prepared request */
	request: PreparedRequest;
};

/**
 * Data result (for list, help, schema commands).
 */
export type DataResult = ResultBase & {
	type: "data";
	/** The data payload */
	data: unknown;
};

/**
 * All possible command result types.
 */
export type CommandResult =
	| SuccessResult
	| ErrorResult
	| ValidationResult
	| PreparedResult
	| CurlResult
	| DataResult;

// ----------------------------------------------------------------------------
// Type guards
// ----------------------------------------------------------------------------

export function isSuccess(result: CommandResult): result is SuccessResult {
	return result.type === "success";
}

export function isError(result: CommandResult): result is ErrorResult {
	return result.type === "error";
}

export function isValidation(
	result: CommandResult,
): result is ValidationResult {
	return result.type === "validation";
}

export function isPrepared(result: CommandResult): result is PreparedResult {
	return result.type === "prepared";
}

export function isCurl(result: CommandResult): result is CurlResult {
	return result.type === "curl";
}

export function isData(result: CommandResult): result is DataResult {
	return result.type === "data";
}

// ----------------------------------------------------------------------------
// Helper to check if result represents a successful operation
// ----------------------------------------------------------------------------

/**
 * Returns true if the result represents a successful operation.
 * For HTTP requests, this means a 2xx status code.
 */
export function isOk(result: CommandResult): boolean {
	switch (result.type) {
		case "success":
			return result.response.ok;
		case "error":
		case "validation":
			return false;
		case "prepared":
		case "curl":
		case "data":
			return true;
	}
}

// ----------------------------------------------------------------------------
// Helper to extract body from result
// ----------------------------------------------------------------------------

/**
 * Extract the response body from a result (if available).
 */
export function getBody(result: CommandResult): unknown {
	switch (result.type) {
		case "success":
			return result.response.body;
		case "error":
			return result.response?.body;
		case "data":
			return result.data;
		default:
			return undefined;
	}
}

// ----------------------------------------------------------------------------
// Helper to extract status from result
// ----------------------------------------------------------------------------

/**
 * Extract the HTTP status code from a result (if available).
 */
export function getStatus(result: CommandResult): number | undefined {
	switch (result.type) {
		case "success":
			return result.response.status;
		case "error":
			return result.response?.status;
		default:
			return undefined;
	}
}
