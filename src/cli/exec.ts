import { main } from "./main.ts";

export type ExecOptions = {
	server?: string;
	serverVar?: string[];
	auth?: string;
	bearerToken?: string;
	oauthToken?: string;
	username?: string;
	password?: string;
	apiKey?: string;
	profile?: string;
	json?: boolean;
};

export async function execCommand(
	spec: string,
	options: ExecOptions,
	commandArgs: string[],
): Promise<void> {
	// commandArgs includes the spec as first element, filter it out
	// to get the remaining args (resource, action, etc.)
	const remainingArgs = commandArgs.slice(1);

	// Reconstruct argv for main():
	// [node, script, --spec, <spec>, ...options, ...remainingArgs]
	const argv = [
		process.argv[0] ?? "bun",
		process.argv[1] ?? "opencli",
		"--spec",
		spec,
	];

	// Add common options back as flags
	if (options.server) {
		argv.push("--server", options.server);
	}
	if (options.serverVar) {
		for (const v of options.serverVar) {
			argv.push("--server-var", v);
		}
	}
	if (options.auth) {
		argv.push("--auth", options.auth);
	}
	if (options.bearerToken) {
		argv.push("--bearer-token", options.bearerToken);
	}
	if (options.oauthToken) {
		argv.push("--oauth-token", options.oauthToken);
	}
	if (options.username) {
		argv.push("--username", options.username);
	}
	if (options.password) {
		argv.push("--password", options.password);
	}
	if (options.apiKey) {
		argv.push("--api-key", options.apiKey);
	}
	if (options.profile) {
		argv.push("--profile", options.profile);
	}
	if (options.json) {
		argv.push("--json");
	}

	// Append remaining args (subcommand + its args)
	argv.push(...remainingArgs);

	await main(argv);
}
