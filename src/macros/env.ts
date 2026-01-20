/**
 * Bun macro: reads an environment variable at bundle-time.
 * Returns undefined if the env var is not set.
 *
 * Usage:
 *   import { env } from "./macros/env.ts" with { type: "macro" };
 *   const value = env("MY_VAR");
 */
export function env(name: string): string | undefined {
	if (!name) throw new Error("env macro: missing variable name");
	return process.env[name];
}

/**
 * Bun macro: reads a required environment variable at bundle-time.
 * Throws if the env var is not set.
 */
export function envRequired(name: string): string {
	if (!name) throw new Error("envRequired macro: missing variable name");
	const value = process.env[name];
	if (value === undefined) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}
