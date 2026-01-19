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

Defaults to embed into the binary:
  --server <url>           Default server URL (baked in; user flags override)
  --server-var <k=v>       Default server variable (repeatable)
  --auth <scheme>          Default auth scheme key

  -h, --help               Show help

Examples:
  bun ./src/compile.ts --spec ./fixtures/openapi.json
  bun ./src/compile.ts --spec https://api.vercel.com/copper/_openapi.json --name copper --minify
  bun ./src/compile.ts --spec https://api.vercel.com/copper/_openapi.json --target bun-linux-x64 --outfile ./dist/copper-linux
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
	const server = getArgValue(argv, "--server");
	const serverVar = getArgValues(argv, "--server-var");
	const auth = getArgValue(argv, "--auth");
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

	// Allow compile-time defaults (server/auth) by embedding execArgv.
	const embeddedExecArgv: string[] = [];
	if (server) embeddedExecArgv.push(`--server=${server}`);
	for (const pair of serverVar) embeddedExecArgv.push(`--server-var=${pair}`);
	if (auth) embeddedExecArgv.push(`--auth=${auth}`);

	// Fetch/read the spec now and inject it as a build-time constant.
	// This avoids relying on Bun macros reading env vars during Bun.build().
	let embeddedSpecText: string;
	if (/^https?:\/\//i.test(spec)) {
		const res = await fetch(spec);
		if (!res.ok)
			throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
		embeddedSpecText = await res.text();
	} else {
		embeddedSpecText = await Bun.file(spec).text();
	}

	const compileTarget = target
		? (target as Bun.Build.Target)
		: (`bun-${process.platform}-${process.arch}` as Bun.Build.Target);

	const result = await Bun.build({
		entrypoints: ["./src/entry-compile.ts"],
		minify,
		bytecode,
		define: {
			...define,
			OPENCLI_EMBED_SPEC_TEXT: JSON.stringify(embeddedSpecText),
		},
		compile: {
			target: compileTarget,
			outfile,
			execArgv:
				embeddedExecArgv.length || compileExecArgv.length
					? [...embeddedExecArgv, ...compileExecArgv]
					: undefined,
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
