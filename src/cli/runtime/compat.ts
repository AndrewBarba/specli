/**
 * Cross-runtime compatibility utilities for Bun and Node.js
 *
 * This module provides abstractions over Bun-specific APIs to allow
 * the exec command to run in Node.js while compile remains Bun-only.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

/**
 * Detect if we're running in Bun
 */
export const isBun = typeof globalThis.Bun !== "undefined";

/**
 * Read a file's text content - works in both Bun and Node.js
 */
export async function readFileText(path: string): Promise<string> {
	if (isBun) {
		return Bun.file(path).text();
	}
	return readFileSync(path, "utf-8");
}

/**
 * Check if a file exists - works in both Bun and Node.js
 */
export async function fileExists(path: string): Promise<boolean> {
	if (isBun) {
		return Bun.file(path).exists();
	}
	return existsSync(path);
}

/**
 * Write text to a file - works in both Bun and Node.js
 */
export async function writeFileText(
	path: string,
	content: string,
): Promise<void> {
	if (isBun) {
		await Bun.write(path, content);
		return;
	}
	writeFileSync(path, content, "utf-8");
}

/**
 * Create directory recursively - works in both Bun and Node.js
 */
export async function mkdirp(path: string): Promise<void> {
	if (isBun) {
		await Bun.$`mkdir -p ${path}`;
		return;
	}
	mkdirSync(path, { recursive: true });
}

/**
 * Parse YAML content - works in both Bun and Node.js
 */
export function parseYamlContent(text: string): unknown {
	if (isBun) {
		const { YAML } = globalThis.Bun;
		return YAML.parse(text);
	}
	return parseYaml(text);
}

/**
 * Read from stdin - works in both Bun and Node.js
 */
export async function readStdinText(): Promise<string> {
	if (isBun) {
		return Bun.stdin.text();
	}
	// Node.js stdin reading
	return new Promise((resolve, reject) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.on("end", () => resolve(data));
		process.stdin.on("error", reject);
	});
}
