import { describe, expect, test } from "bun:test";

import { listAuthSchemes } from "./auth-schemes.ts";
import type { OpenApiDoc } from "./types.ts";

describe("listAuthSchemes", () => {
	test("parses bearer + apiKey", () => {
		const doc: OpenApiDoc = {
			openapi: "3.0.3",
			components: {
				securitySchemes: {
					bearerAuth: {
						type: "http",
						scheme: "bearer",
						bearerFormat: "JWT",
					},
					apiKeyAuth: {
						type: "apiKey",
						in: "header",
						name: "X-API-Key",
					},
				},
			},
		};

		const schemes = listAuthSchemes(doc);
		expect(schemes).toHaveLength(2);

		const bearer = schemes.find((s) => s.key === "bearerAuth");
		expect(bearer?.kind).toBe("http-bearer");

		const apiKey = schemes.find((s) => s.key === "apiKeyAuth");
		expect(apiKey?.kind).toBe("api-key");
		expect(apiKey?.in).toBe("header");
		expect(apiKey?.name).toBe("X-API-Key");
	});

	test("parses oauth2 flows", () => {
		const doc = {
			openapi: "3.0.3",
			components: {
				securitySchemes: {
					oauth: {
						type: "oauth2",
						flows: {
							clientCredentials: {
								tokenUrl: "https://example.com/oauth/token",
								scopes: {
									"read:ping": "read ping",
								},
							},
						},
					},
				},
			},
		} as const;

		const schemes = listAuthSchemes(doc);
		const oauth = schemes.find((s) => s.key === "oauth");
		expect(oauth?.kind).toBe("oauth2");
		expect(oauth?.oauthFlows?.clientCredentials?.tokenUrl).toBe(
			"https://example.com/oauth/token",
		);
		expect(oauth?.oauthFlows?.clientCredentials?.scopes).toEqual(["read:ping"]);
	});
});
