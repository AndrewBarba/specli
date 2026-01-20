#!/usr/bin/env node
import { spawn } from "node:child_process";

const isBun = typeof globalThis.Bun !== "undefined";
const isCompileCommand = process.argv.includes("compile");

if (!isBun && isCompileCommand) {
	// Re-run with Bun for compile command
	const child = spawn("bun", process.argv.slice(1), {
		stdio: "inherit",
	});
	child.on("close", (code) => process.exit(code ?? 0));
	child.on("error", (err) => {
		if (err.code === "ENOENT") {
			console.error("Error: The 'compile' command requires Bun.");
			console.error("Install Bun: https://bun.sh");
			process.exit(1);
		}
		throw err;
	});
} else {
	// Run the CLI directly
	const root = new URL("..", import.meta.url).pathname;
	const entry = isBun ? `${root}cli.ts` : `${root}dist/cli.js`;
	await import(entry);
}
