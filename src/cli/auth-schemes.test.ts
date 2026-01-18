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
});
