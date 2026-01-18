import { describe, expect, test } from "bun:test";

import { listServers } from "./server.ts";
import type { OpenApiDoc } from "./types.ts";

describe("listServers", () => {
	test("extracts server variables from template", () => {
		const doc: OpenApiDoc = {
			openapi: "3.0.3",
			servers: [
				{
					url: "https://{region}.api.example.com/{basePath}",
					variables: {
						region: {
							default: "us",
							enum: ["us", "eu"],
						},
						basePath: {
							default: "v1",
						},
					},
				} as const,
			],
		};

		const servers = listServers(doc);
		expect(servers).toHaveLength(1);
		expect(servers[0]?.variableNames).toEqual(["region", "basePath"]);
		expect(servers[0]?.variables.map((v) => v.name)).toEqual([
			"region",
			"basePath",
		]);
		expect(servers[0]?.variables[0]?.enum).toEqual(["us", "eu"]);
	});
});
