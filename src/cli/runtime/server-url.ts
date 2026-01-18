import type { ServerInfo } from "../server.ts";

import { applyTemplate, extractTemplateVars } from "./template.ts";

export type ResolveServerInput = {
	serverOverride?: string;
	servers: ServerInfo[];
	serverVars: Record<string, string>;
};

export function resolveServerUrl(input: ResolveServerInput): string {
	const base = input.serverOverride ?? input.servers[0]?.url;
	if (!base) {
		throw new Error(
			"No server URL found. Provide --server <url> or define servers in the OpenAPI spec.",
		);
	}

	const names = extractTemplateVars(base);
	if (!names.length) return base;

	const vars: Record<string, string> = {};
	for (const name of names) {
		const provided = input.serverVars[name];
		if (typeof provided === "string") {
			vars[name] = provided;
			continue;
		}

		// If spec has default for this var, use it.
		const match = input.servers.find((s) => s.url === base);
		const v = match?.variables.find((x) => x.name === name);
		if (typeof v?.default === "string") {
			vars[name] = v.default;
			continue;
		}

		throw new Error(
			`Missing server variable '${name}'. Provide --server-var ${name}=...`,
		);
	}

	return applyTemplate(base, vars);
}
