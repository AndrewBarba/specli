import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveBinaryName } from "./spec/derive-name.js";

// Resolve the package root directory (at runtime this file is at dist/cli/compile.js)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "../..");

export type CompileOptions = {
	name?: string;
	outfile?: string;
	target?: string;
	minify?: boolean;
	bytecode?: boolean;
	dotenv?: boolean; // --no-dotenv sets this to false
	bunfig?: boolean; // --no-bunfig sets this to false
	define?: string[];
	server?: string;
	serverVar?: string[];
	auth?: string;
};

function parseKeyValue(input: string): { key: string; value: string } {
	const idx = input.indexOf("=");
	if (idx === -1)
		throw new Error(`Invalid --define '${input}', expected key=value`);
	const key = input.slice(0, idx).trim();
	const value = input.slice(idx + 1).trim();
	if (!key) throw new Error(`Invalid --define '${input}', missing key`);
	return { key, value };
}

/**
 * Loads the OpenAPI spec from a URL or file path.
 */
async function loadSpec(spec: string): Promise<string> {
	if (!spec) throw new Error("Missing spec path/URL");

	if (/^https?:\/\//i.test(spec)) {
		const res = await fetch(spec);
		if (!res.ok) {
			throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
		}
		return await res.text();
	}

	return await fs.promises.readFile(spec, "utf-8");
}

/**
 * Reads the package version from package.json.
 */
function getPackageVersion(): string {
	const packageJsonPath = path.join(packageRoot, "package.json");
	const content = fs.readFileSync(packageJsonPath, "utf-8");
	const packageJson = JSON.parse(content);
	return packageJson.version;
}

/**
 * Generates a temporary entrypoint file with all values hardcoded.
 * This avoids the Bun macro security restriction in node_modules.
 */
function generateEntrypoint(options: {
	specText: string;
	cliName: string | undefined;
	server: string | undefined;
	serverVars: string | undefined;
	auth: string | undefined;
	version: string;
}): string {
	const mainImportPath = path.join(packageRoot, "dist/cli/main.js");

	// Escape the spec text for embedding as a string literal
	const escapedSpec = JSON.stringify(options.specText);
	const escapedName = options.cliName
		? JSON.stringify(options.cliName)
		: "undefined";
	const escapedServer = options.server
		? JSON.stringify(options.server)
		: "undefined";
	const escapedServerVars = options.serverVars
		? JSON.stringify(options.serverVars)
		: "undefined";
	const escapedAuth = options.auth ? JSON.stringify(options.auth) : "undefined";
	const escapedVersion = JSON.stringify(options.version);

	return `#!/usr/bin/env bun
// Auto-generated entrypoint for specli compile
// This file embeds all configuration at build time

import { main } from ${JSON.stringify(mainImportPath)};

const embeddedSpecText = ${escapedSpec};
const cliName = ${escapedName};
const server = ${escapedServer};
const serverVars = ${escapedServerVars};
const auth = ${escapedAuth};
const embeddedVersion = ${escapedVersion};

await main(process.argv, {
	embeddedSpecText,
	cliName,
	server,
	serverVars: serverVars ? serverVars.split(",") : undefined,
	auth,
	version: embeddedVersion,
});
`;
}

export async function compileCommand(
	spec: string,
	options: CompileOptions,
): Promise<void> {
	// Derive name from spec if not provided
	const name = options.name ?? (await deriveBinaryName(spec));
	const outfile = options.outfile ?? `./out/${name}`;

	const target = options.target
		? (options.target as Bun.Build.Target)
		: (`bun-${process.platform}-${process.arch}` as Bun.Build.Target);

	// Load the spec content
	process.stdout.write(`Loading spec: ${spec}\n`);
	const specText = await loadSpec(spec);

	// Get package version
	const version = getPackageVersion();

	// Generate temporary entrypoint file
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "specli-"));
	const tempEntrypoint = path.join(tempDir, "entrypoint.ts");

	const entrypointCode = generateEntrypoint({
		specText,
		cliName: name,
		server: options.server,
		serverVars: options.serverVar?.join(","),
		auth: options.auth,
		version,
	});

	fs.writeFileSync(tempEntrypoint, entrypointCode);

	try {
		// Parse --define pairs
		const define: Record<string, string> = {};
		if (options.define) {
			for (const pair of options.define) {
				const { key, value } = parseKeyValue(pair);
				define[key] = JSON.stringify(value);
			}
		}

		// Build command args
		const buildArgs = [
			"build",
			"--compile",
			`--outfile=${outfile}`,
			`--target=${target}`,
		];

		if (options.minify) buildArgs.push("--minify");
		if (options.bytecode) buildArgs.push("--bytecode");

		for (const [k, v] of Object.entries(define)) {
			buildArgs.push("--define", `${k}=${v}`);
		}

		if (options.dotenv === false)
			buildArgs.push("--no-compile-autoload-dotenv");
		if (options.bunfig === false)
			buildArgs.push("--no-compile-autoload-bunfig");

		buildArgs.push(tempEntrypoint);

		const proc = Bun.spawn({
			cmd: ["bun", ...buildArgs],
			stdout: "pipe",
			stderr: "pipe",
			env: process.env as Record<string, string>,
		});

		const output = await new Response(proc.stdout).text();
		const error = await new Response(proc.stderr).text();
		const code = await proc.exited;

		if (output) process.stdout.write(output);
		if (error) process.stderr.write(error);
		if (code !== 0) {
			process.exitCode = code;
			return;
		}

		process.stdout.write(`ok: built ${outfile}\n`);
		process.stdout.write(`target: ${target}\n`);
		process.stdout.write(`name: ${name}\n`);
	} finally {
		// Clean up temporary files
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}
