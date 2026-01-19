#!/usr/bin/env bun

function printHelp(): void {
	process.stdout.write(`Usage:
  bun ./src/compile.ts [options]

Options:
  --name <name>            Binary name (default: opencli)
  --spec <url|path>        OpenAPI spec to embed (required)
  --outfile <path>         Output executable path (default: ./dist/<name>)
  --target <target>        Bun compile target (e.g. bun-linux-x64)
  --minify                 Enable minification
  --bytecode               Enable bytecode compilation (experimental)
  --no-dotenv              Disable .env autoload in compiled binary
  --no-bunfig              Disable bunfig.toml autoload in compiled binary
  --exec-argv <arg>        Add an embedded process.execArgv value (repeatable)
  --define <k=v>           Build-time constant (repeatable)
  -h, --help               Show help

Examples:
  bun ./src/compile.ts --spec ./fixtures/openapi.json
  bun ./src/compile.ts --spec https://api.vercel.com/copper/_openapi.json --target bun-linux-x64 --outfile ./dist/opencli-linux
  bun ./src/compile.ts --spec ./openapi.yaml --define BUILD_VERSION=1.2.3 --minify
`);
}

function getArgValue(argv: string[], key: string): string | undefined {
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a) continue;
		if (a === key) return argv[i + 1];
		if (a.startsWith(`${key}=`)) return a.slice(key.length + 1);
	}
	return undefined;
}

function getArgValues(argv: string[], key: string): string[] {
	const out: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a) continue;
		if (a === key) {
			const v = argv[i + 1];
			if (typeof v === "string") out.push(v);
			continue;
		}
		if (a.startsWith(`${key}=`)) out.push(a.slice(key.length + 1));
	}
	return out;
}

function hasArg(argv: string[], ...names: string[]): boolean {
	return argv.some((a) => (a ? names.includes(a) : false));
}

function parseKeyValue(input: string): { key: string; value: string } {
	const idx = input.indexOf("=");
	if (idx === -1)
		throw new Error(`Invalid --define '${input}', expected key=value`);
	const key = input.slice(0, idx).trim();
	const value = input.slice(idx + 1).trim();
	if (!key) throw new Error(`Invalid --define '${input}', missing key`);
	return { key, value };
}

async function main(argv: string[]): Promise<void> {
	if (hasArg(argv, "-h", "--help")) {
		printHelp();
		return;
	}

	const name = getArgValue(argv, "--name") ?? "opencli";
	const spec = getArgValue(argv, "--spec");
	if (!spec) {
		throw new Error("Missing --spec <url|path>");
	}

	const outfile = getArgValue(argv, "--outfile") ?? `./dist/${name}`;
	const target = getArgValue(argv, "--target");
	const minify = hasArg(argv, "--minify");
	const bytecode = hasArg(argv, "--bytecode");
	const autoloadDotenv = !hasArg(argv, "--no-dotenv");
	const autoloadBunfig = !hasArg(argv, "--no-bunfig");

	const compileExecArgv = getArgValues(argv, "--exec-argv");

	const definePairs = getArgValues(argv, "--define");
	const define: Record<string, string> = {};
	for (const pair of definePairs) {
		const { key, value } = parseKeyValue(pair);
		define[key] = JSON.stringify(value);
	}

	// Prepare the embedded spec for the entrypoint macro.
	// We pass the spec location through env to keep the macro callsite static.
	process.env.OPENCLI_EMBED_SPEC = spec;

	const compileTarget = target
		? (target as Bun.Build.Target)
		: (`bun-${process.platform}-${process.arch}` as Bun.Build.Target);

	const result = await Bun.build({
		entrypoints: ["./src/entry-bundle.ts"],
		minify,
		bytecode,
		define,
		compile: {
			target: compileTarget,
			outfile,
			execArgv: compileExecArgv.length ? compileExecArgv : undefined,
			autoloadDotenv,
			autoloadBunfig,
			// tsconfig.json and package.json autoload are disabled by default.
		},
	});

	if (!result.success) {
		for (const log of result.logs) {
			process.stderr.write(`${log.message}\n`);
		}
		process.exitCode = 1;
		return;
	}

	process.stdout.write(`ok: built ${outfile}\n`);
	process.stdout.write(`target: ${compileTarget}\n`);
}

await main(process.argv);
