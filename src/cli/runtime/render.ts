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
	const { data, kind } = result;

	// Custom renderers for known data kinds
	if (kind === "schema") {
		return renderSchemaText(data as SchemaData);
	}
	if (kind === "whoami") {
		return renderWhoamiText(data as WhoamiData);
	}
	if (kind === "login") {
		return renderLoginText(data as LoginData);
	}
	if (kind === "logout") {
		return renderLogoutText(data as LogoutData);
	}

	// Default: string passthrough or JSON
	if (typeof data === "string") {
		return data.endsWith("\n") ? data : `${data}\n`;
	}

	return `${JSON.stringify(data, null, 2)}\n`;
}

// ----------------------------------------------------------------------------
// Schema Data Rendering
// ----------------------------------------------------------------------------

type SchemaData = {
	title?: string;
	version: string;
	specId: string;
	servers: Array<{ url: string }>;
	authSchemes: Array<{ key: string }>;
	resources: Array<{ name: string; actionCount: number }>;
	cliName?: string;
};

function renderSchemaText(data: SchemaData): string {
	const lines: string[] = [];

	lines.push(data.title ?? "(untitled)");
	lines.push(`OpenAPI: ${data.version}`);
	lines.push(`Servers: ${data.servers.length}`);
	lines.push(`Auth Schemes: ${data.authSchemes.length}`);
	lines.push(`Spec: ${data.specId}`);
	lines.push("");
	lines.push(`Resources: ${data.resources.length}`);
	lines.push("");

	const sorted = [...data.resources].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	for (const r of sorted) {
		lines.push(`- ${r.name} (${r.actionCount} actions)`);
	}

	lines.push("");
	const name = data.cliName ?? "specli";
	lines.push("Next:");
	lines.push(`- ${name} <resource> --help`);
	lines.push(`- ${name} <resource> <action> --help`);

	return `${lines.join("\n")}\n`;
}

// ----------------------------------------------------------------------------
// Whoami Data Rendering
// ----------------------------------------------------------------------------

type WhoamiData = {
	authenticated: boolean;
	authScheme?: string;
	maskedToken?: string;
};

function renderWhoamiText(data: WhoamiData): string {
	const lines: string[] = [];

	if (data.authenticated) {
		lines.push("authenticated: yes");
		if (data.maskedToken) {
			lines.push(`token: ${data.maskedToken}`);
		}
		if (data.authScheme) {
			lines.push(`auth scheme: ${data.authScheme}`);
		}
	} else {
		lines.push("authenticated: no");
		lines.push("Run 'login <token>' to authenticate.");
	}

	return `${lines.join("\n")}\n`;
}

// ----------------------------------------------------------------------------
// Login Data Rendering
// ----------------------------------------------------------------------------

type LoginData = {
	ok: boolean;
};

function renderLoginText(data: LoginData): string {
	return data.ok ? "ok: logged in\n" : "error: login failed\n";
}

// ----------------------------------------------------------------------------
// Logout Data Rendering
// ----------------------------------------------------------------------------

type LogoutData = {
	ok: boolean;
	wasLoggedIn: boolean;
};

function renderLogoutText(data: LogoutData): string {
	return data.wasLoggedIn ? "ok: logged out\n" : "ok: not logged in\n";
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

// ----------------------------------------------------------------------------
// Write Result Helper
// ----------------------------------------------------------------------------

/**
 * Render a CommandResult and write to the appropriate stream.
 * Also sets process.exitCode based on the result.
 *
 * This is a convenience function for CLI commands that combines:
 * - renderToString()
 * - getOutputStream()
 * - getExitCode()
 */
export function writeResult(
	result: CommandResult,
	options: RenderOptions = {},
): void {
	const output = renderToString(result, options);
	const stream = getOutputStream(result);

	if (stream === "stderr") {
		process.stderr.write(output);
	} else {
		process.stdout.write(output);
	}

	process.exitCode = getExitCode(result);
}
