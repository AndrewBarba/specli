#!/usr/bin/env bun
/**
 * Build script for npm publishing
 *
 * This script:
 * 1. Uses Bun to transpile TypeScript to JavaScript (handles .ts imports)
 * 2. Uses tsc to generate declaration files only
 * 3. Adds shebang to CLI entry point
 */

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Glob } from "bun";

const DIST_DIR = "dist";
const ROOT_DIR = process.cwd();

async function run(cmd: string[]) {
	const proc = Bun.spawn(cmd, {
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		process.exit(exitCode);
	}
}

async function getAllFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await getAllFiles(fullPath)));
		} else {
			files.push(fullPath);
		}
	}
	return files;
}

async function getSourceFiles(): Promise<string[]> {
	const glob = new Glob("**/*.ts");
	const files: string[] = [];

	// Get all .ts files excluding test files, scripts, fixtures, and Bun-only files
	for await (const file of glob.scan({
		cwd: ROOT_DIR,
		onlyFiles: true,
	})) {
		if (
			file.endsWith(".test.ts") ||
			file.startsWith("scripts/") ||
			file.startsWith("fixtures/") ||
			file.startsWith("node_modules/") ||
			// Exclude Bun-only files (macros, compiled entry)
			file.startsWith("src/macros/") ||
			file === "src/compiled.ts"
		) {
			continue;
		}
		files.push(file);
	}

	return files;
}

async function transpileWithBun() {
	const sourceFiles = await getSourceFiles();

	// Transpile each file individually to preserve directory structure
	for (const file of sourceFiles) {
		const outPath = join(DIST_DIR, file.replace(/\.ts$/, ".js"));
		const outDir = dirname(outPath);

		// Ensure output directory exists
		await Bun.$`mkdir -p ${outDir}`.quiet();

		// Build the file
		const result = await Bun.build({
			entrypoints: [file],
			outdir: outDir,
			target: "node",
			format: "esm",
			sourcemap: "external",
			naming: "[name].[ext]",
			external: [
				// Mark all dependencies as external
				"commander",
				"@apidevtools/swagger-parser",
				"ajv",
				"ajv-formats",
				"openapi-types",
				"yaml",
				"ai",
				"zod",
				// Node built-ins
				"node:*",
			],
		});

		if (!result.success) {
			console.error(`Failed to build ${file}:`);
			for (const log of result.logs) {
				console.error(log);
			}
			process.exit(1);
		}
	}
}

async function generateDeclarations() {
	// Use tsc only for declaration files with a special config
	const declarationConfig = {
		extends: "./tsconfig.json",
		compilerOptions: {
			emitDeclarationOnly: true,
			declaration: true,
			declarationMap: true,
			outDir: "./dist",
			rootDir: ".",
			// Keep these to avoid errors during declaration emit
			noEmit: false,
		},
		include: ["index.ts", "cli.ts", "src/**/*.ts"],
		exclude: [
			"**/*.test.ts",
			"scripts/**",
			"fixtures/**",
			"src/macros/**",
			"src/compiled.ts",
		],
	};

	// Write temp tsconfig for declarations
	const tempConfigPath = "tsconfig.declarations.json";
	await Bun.write(tempConfigPath, JSON.stringify(declarationConfig, null, 2));

	try {
		// Run tsc for declarations - it will have errors but still emit .d.ts files
		const proc = Bun.spawn(["bunx", "tsc", "-p", tempConfigPath], {
			stdout: "pipe",
			stderr: "pipe",
		});
		await proc.exited;
		// We ignore the exit code because tsc will error on .ts imports
		// but still generates the declaration files
	} finally {
		// Clean up temp config
		await Bun.$`rm -f ${tempConfigPath}`.quiet();
	}
}

async function rewriteDeclarationImports() {
	const files = await getAllFiles(DIST_DIR);
	const dtsFiles = files.filter((f) => f.endsWith(".d.ts"));

	for (const file of dtsFiles) {
		let content = await Bun.file(file).text();
		// Rewrite .ts imports to .js in declaration files
		content = content.replace(
			/(from\s+["'])(\.\.?\/[^"']+)\.ts(["'])/g,
			"$1$2.js$3",
		);
		content = content.replace(
			/(import\s*\(\s*["'])(\.\.?\/[^"']+)\.ts(["']\s*\))/g,
			"$1$2.js$3",
		);
		await Bun.write(file, content);
	}
}

async function addShebang() {
	const cliPath = join(DIST_DIR, "cli.js");
	let content = await Bun.file(cliPath).text();
	if (!content.startsWith("#!")) {
		content = `#!/usr/bin/env node\n${content}`;
		await Bun.write(cliPath, content);
  }
}

async function main() {
	console.log("Cleaning dist directory...");
	await run(["rm", "-rf", DIST_DIR]);

	console.log("Transpiling TypeScript with Bun...");
	await transpileWithBun();

	console.log("Generating declaration files...");
	await generateDeclarations();

	console.log("Rewriting declaration imports...");
	await rewriteDeclarationImports();

	console.log("Adding shebang to CLI...");
	await addShebang();

	console.log("Build complete!");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
