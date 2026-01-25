/**
 * Render functions for CommandResult.
 *
 * These functions convert the IR to output formats suitable for
 * CLI display or programmatic consumption.
 */

import type {
	CommandResult,
	CurlResult,
	DataResult,
	ErrorResult,
	PreparedResult,
	SuccessResult,
	ValidationResult,
} from "./result.js";

// ----------------------------------------------------------------------------
// Render Options
// ----------------------------------------------------------------------------

export type RenderOptions = {
	/** Output format: "text" (human readable) or "json" (machine readable) */
	format?: "text" | "json";
	/** Include timing information in output */
	showTiming?: boolean;
	/** Pretty-print JSON output (default: true for text, false for json format) */
	prettyPrint?: boolean;
};

// ----------------------------------------------------------------------------
// Main Render Function
// ----------------------------------------------------------------------------

/**
 * Render a CommandResult to a string for CLI output.
 *
 * @param result - The command result to render
 * @param options - Rendering options
 * @returns A string ready to be output (includes trailing newline)
 */
export function renderToString(
	result: CommandResult,
	options: RenderOptions = {},
): string {
	const { format = "text" } = options;

	if (format === "json") {
		return renderToJSON(result, options);
	}

	return renderToText(result, options);
}

// ----------------------------------------------------------------------------
// JSON Rendering
// ----------------------------------------------------------------------------

/**
 * Render a CommandResult to JSON string.
 */
export function renderToJSON(
	result: CommandResult,
	options: RenderOptions = {},
): string {
	const { prettyPrint = false } = options;
	const indent = prettyPrint ? 2 : undefined;

	const json = toJSON(result);
	return `${JSON.stringify(json, null, indent)}\n`;
}

/**
 * Convert a CommandResult to a plain JSON-serializable object.
 */
export function toJSON(result: CommandResult): Record<string, unknown> {
	switch (result.type) {
		case "success":
			return {
				ok: true,
				status: result.response.status,
				body: result.response.body,
			};

		case "error":
			return {
				ok: false,
				error: result.message,
				...(result.response && {
					status: result.response.status,
					body: result.response.body,
				}),
			};

		case "validation":
			return {
				ok: false,
				error: "Validation failed",
				errors: result.errors,
			};

		case "prepared":
			return {
				ok: true,
				request: result.request,
			};

		case "curl":
			return {
				ok: true,
				curl: result.curl,
			};

		case "data":
			return {
				ok: true,
				data: result.data,
			};
	}
}

// ----------------------------------------------------------------------------
// Text Rendering
// ----------------------------------------------------------------------------

/**
 * Render a CommandResult to human-readable text.
 */
export function renderToText(
	result: CommandResult,
	options: RenderOptions = {},
): string {
	switch (result.type) {
		case "success":
			return renderSuccessText(result, options);
		case "error":
			return renderErrorText(result, options);
		case "validation":
			return renderValidationText(result, options);
		case "prepared":
			return renderPreparedText(result, options);
		case "curl":
			return renderCurlText(result, options);
		case "data":
			return renderDataText(result, options);
	}
}

function renderSuccessText(
	result: SuccessResult,
	_options: RenderOptions,
): string {
	const body = result.response.body;

	if (typeof body === "string") {
		return body.endsWith("\n") ? body : `${body}\n`;
	}

	return `${JSON.stringify(body, null, 2)}\n`;
}

function renderErrorText(result: ErrorResult, _options: RenderOptions): string {
	const lines: string[] = [];

	// If we have an HTTP response, show status first
	if (result.response) {
		lines.push(`HTTP ${result.response.status}`);

		const body = result.response.body;
		if (typeof body === "string") {
			lines.push(body);
		} else if (body !== undefined && body !== null) {
			lines.push(JSON.stringify(body, null, 2));
		}
	} else {
		// No HTTP response - just an error message
		lines.push(`error: ${result.message}`);

		// Add help hint if we have resource/action context
		if (result.action) {
			const helpCmd = result.resource
				? `${result.resource} ${result.action} --help`
				: `${result.action} --help`;
			lines.push("");
			lines.push(`Run '${helpCmd}' to see available options.`);
		}
	}

	return `${lines.join("\n")}\n`;
}

function renderValidationText(
	result: ValidationResult,
	_options: RenderOptions,
): string {
	const lines: string[] = ["Validation errors:"];

	for (const error of result.errors) {
		lines.push(`  ${error.path}: ${error.message}`);
	}

	// Add help hint if we have resource/action context
	if (result.action) {
		const helpCmd = result.resource
			? `${result.resource} ${result.action} --help`
			: `${result.action} --help`;
		lines.push("");
		lines.push(`Run '${helpCmd}' to see available options.`);
	}

	return `${lines.join("\n")}\n`;
}

function renderPreparedText(
	result: PreparedResult,
	_options: RenderOptions,
): string {
	const { request } = result;
	const lines: string[] = [`${request.method} ${request.url}`, "", "Headers:"];

	for (const [key, value] of Object.entries(request.headers)) {
		lines.push(`  ${key}: ${value}`);
	}

	if (request.body) {
		lines.push("");
		lines.push("Body:");
		lines.push(request.body);
	}

	return `${lines.join("\n")}\n`;
}

function renderCurlText(result: CurlResult, _options: RenderOptions): string {
	return `${result.curl}\n`;
}

function renderDataText(result: DataResult, _options: RenderOptions): string {
	const { data } = result;

	if (typeof data === "string") {
		return data.endsWith("\n") ? data : `${data}\n`;
	}

	return `${JSON.stringify(data, null, 2)}\n`;
}

// ----------------------------------------------------------------------------
// Exit Code Helper
// ----------------------------------------------------------------------------

/**
 * Determine the exit code for a CommandResult.
 * Returns 0 for success, 1 for errors.
 */
export function getExitCode(result: CommandResult): number {
	switch (result.type) {
		case "success":
			return result.response.ok ? 0 : 1;
		case "error":
		case "validation":
			return 1;
		case "prepared":
		case "curl":
		case "data":
			return 0;
	}
}

// ----------------------------------------------------------------------------
// Output Stream Helper
// ----------------------------------------------------------------------------

/**
 * Determine which output stream to use for a CommandResult.
 * Returns "stdout" for success, "stderr" for errors.
 */
export function getOutputStream(result: CommandResult): "stdout" | "stderr" {
	switch (result.type) {
		case "success":
			return result.response.ok ? "stdout" : "stderr";
		case "error":
		case "validation":
			return "stderr";
		case "prepared":
		case "curl":
		case "data":
			return "stdout";
	}
}
