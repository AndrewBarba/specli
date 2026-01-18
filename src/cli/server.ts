import type { OpenApiDoc } from "./types.ts";

export type ServerInfo = {
	url: string;
};

export function listServers(doc: OpenApiDoc): ServerInfo[] {
	const servers = doc.servers ?? [];
	const out: ServerInfo[] = [];

	for (const s of servers) {
		if (!s || typeof s !== "object") continue;
		if (typeof s.url !== "string") continue;
		out.push({ url: s.url });
	}

	return out;
}

export function getDefaultServerUrl(doc: OpenApiDoc): string | undefined {
	return listServers(doc)[0]?.url;
}
