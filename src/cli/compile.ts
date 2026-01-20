import { deriveBinaryName } from "./derive-name.ts";

export type CompileOptions = {
	name?: string;
	outfile?: string;
	target?: string;
	minify?: boolean;
	bytecode?: boolean;
	dotenv?: boolean; // --no-dotenv sets this to false
	bunfig?: boolean; // --no-bunfig sets this to false
	execArgv?: string[];
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

export async function compileCommand(
	spec: string,
	options: CompileOptions,
): Promise<void> {
	// Derive name from spec if not provided
	const name = options.name ?? (await deriveBinaryName(spec));
	const outfile = options.outfile ?? `./dist/${name}`;

	const target = options.target
		? (options.target as Bun.Build.Target)
		: (`bun-${process.platform}-${process.arch}` as Bun.Build.Target);

	// Build embedded execArgv for runtime defaults
	const embeddedExecArgv: string[] = [];
	if (options.server) {
		embeddedExecArgv.push(`--server=${options.server}`);
	}
	if (options.serverVar) {
		for (const pair of options.serverVar) {
			embeddedExecArgv.push(`--server-var=${pair}`);
		}
	}
	if (options.auth) {
		embeddedExecArgv.push(`--auth=${options.auth}`);
	}

	// User-provided exec-argv
	const compileExecArgv = options.execArgv ?? [];

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

	const execArgv =
		embeddedExecArgv.length || compileExecArgv.length
			? [...embeddedExecArgv, ...compileExecArgv]
			: [];
	for (const arg of execArgv) {
		buildArgs.push("--compile-exec-argv", arg);
	}

	if (options.dotenv === false) buildArgs.push("--no-compile-autoload-dotenv");
	if (options.bunfig === false) buildArgs.push("--no-compile-autoload-bunfig");

	buildArgs.push("./src/compiled.ts");

	const proc = Bun.spawn({
		cmd: ["bun", ...buildArgs],
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			SPECLI_EMBED_SPEC: spec,
			SPECLI_CLI_NAME: name,
		},
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
}
