#!/usr/bin/env node

// Runtime-aware CLI entry point
// - In Bun: runs cli.ts directly (TypeScript, full features including compile)
// - In Node.js: runs dist/cli.js (compiled JS, exec only)

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

if (typeof globalThis.Bun !== "undefined") {
	// Running in Bun - import TypeScript directly
	await import(join(root, "cli.ts"));
} else {
	// Running in Node.js - use compiled JS
	await import(join(root, "dist", "cli.js"));
}
