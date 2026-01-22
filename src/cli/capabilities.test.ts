import { describe, expect, test } from "bun:test";
import type { AuthScheme } from "./auth-schemes.js";
import { deriveCapabilities } from "./capabilities.js";
import type { CommandModel } from "./command-model.js";
import type { ServerInfo } from "./server.js";
import type { NormalizedOperation, OpenApiDoc } from "./types.js";

describe("deriveCapabilities", () => {
	test("reports requestBody + server vars", () => {
		const doc: OpenApiDoc = {
			openapi: "3.0.3",
			security: [{ bearerAuth: [] }],
		};

		const servers: ServerInfo[] = [
			{
				url: "https://{region}.api.example.com",
				variables: [],
				variableNames: ["region"],
			},
		];

		const authSchemes: AuthScheme[] = [
			{ key: "bearerAuth", kind: "http-bearer" },
		];

		const operations: NormalizedOperation[] = [
			{
				key: "POST /contacts",
				method: "POST",
				path: "/contacts",
				tags: [],
				parameters: [],
				requestBody: {
					required: true,
					contentTypes: ["application/json"],
					schemasByContentType: { "application/json": { type: "object" } },
				},
			},
		];

		const commands: CommandModel = {
			resources: [
				{
					resource: "contacts",
					actions: [
						{
							id: "x",
							key: "POST /contacts",
							action: "create",
							pathArgs: [],
							method: "POST",
							path: "/contacts",
							tags: [],
							style: "rest",
							positionals: [],
							flags: [],
							params: [],
							auth: { alternatives: [] },
							requestBody: {
								required: true,
								content: [
									{
										contentType: "application/json",
										required: true,
										schemaType: "object",
									},
								],
								hasJson: true,
								hasFormUrlEncoded: false,
								hasMultipart: false,
								bodyFlags: ["--data", "--file"],
								preferredContentType: "application/json",
							},
						},
					],
				},
			],
		};

		const caps = deriveCapabilities({
			doc,
			servers,
			authSchemes,
			operations,
			commands,
		});
		expect(caps.servers.hasVariables).toBe(true);
		expect(caps.operations.hasRequestBodies).toBe(true);
		expect(caps.commands.hasRequestBodies).toBe(true);
		expect(caps.auth.hasSecurityRequirements).toBe(true);
		expect(caps.auth.kinds).toEqual(["http-bearer"]);
	});
});
