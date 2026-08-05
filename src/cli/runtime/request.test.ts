import { describe, expect, test } from "bun:test";

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import type { CommandAction } from "../model/command-model.js";

import { generateBodyFlags } from "./body-flags.js";
import { buildRequest } from "./request.js";
import { createAjv, formatAjvErrors } from "./validate/index.js";

function makeAction(partial?: Partial<CommandAction>): CommandAction {
	return {
		id: "test",
		key: "POST /contacts",
		action: "create",
		pathArgs: [],
		rawPathArgs: [],
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
			preferredContentType: "application/json",
			preferredSchema: undefined,
		},
		requestBodySchema: {
			type: "object",
			properties: {
				name: { type: "string" },
			},
			required: ["name"],
		},
		...partial,
	};
}

describe("buildRequest (requestBody)", () => {
	test("builds body from expanded body flags", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action = makeAction();
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			const { request, curl } = await buildRequest({
				specId: "spec",
				action,
				positionalValues: [],
				flagValues: { name: "A" }, // --name A
				globals: {},
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [],
				bodyFlagDefs,
			});

			expect(request.headers.get("Content-Type")).toBe("application/json");
			expect(await request.clone().text()).toBe('{"name":"A"}');
			expect(curl).toContain("--data");
			expect(curl).toContain('{"name":"A"}');
		} finally {
			process.env.HOME = prevHome;
		}
	});

	test("throws when requestBody is required but missing", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action = makeAction();
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			await expect(() =>
				buildRequest({
					specId: "spec",
					action,
					positionalValues: [],
					flagValues: {},
					globals: {},
					servers: [
						{
							url: "https://api.example.com",
							variables: [],
							variableNames: [],
						},
					],
					authSchemes: [],
					bodyFlagDefs,
				}),
			).toThrow("Required: --name");
		} finally {
			process.env.HOME = prevHome;
		}
	});

	test("throws friendly error for missing required expanded field", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			// Schema with two fields, one required
			const action = makeAction({
				requestBodySchema: {
					type: "object",
					properties: {
						name: { type: "string" },
						email: { type: "string" },
					},
					required: ["name"],
				},
			});
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			// Provide email but not name (the required one)
			await expect(() =>
				buildRequest({
					specId: "spec",
					action,
					positionalValues: [],
					flagValues: { email: "test@example.com" }, // --email (but missing --name)
					globals: {},
					servers: [
						{
							url: "https://api.example.com",
							variables: [],
							variableNames: [],
						},
					],
					authSchemes: [],
					bodyFlagDefs,
				}),
			).toThrow("Missing required fields: --name");
		} finally {
			process.env.HOME = prevHome;
		}
	});

	test("builds nested object from dot notation flags", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action = makeAction({
				requestBodySchema: {
					type: "object",
					properties: {
						name: { type: "string" },
						address: {
							type: "object",
							properties: {
								street: { type: "string" },
								city: { type: "string" },
							},
						},
					},
					required: ["name"],
				},
			});
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			// Dot notation: --address.street and --address.city should create nested object
			const { request } = await buildRequest({
				specId: "spec",
				action,
				positionalValues: [],
				flagValues: {
					name: "Ada",
					"address.street": "123 Main St", // Commander keeps dots in keys
					"address.city": "NYC",
				},
				globals: {},
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [],
				bodyFlagDefs,
			});

			const body = JSON.parse(await request.clone().text());
			expect(body).toEqual({
				name: "Ada",
				address: {
					street: "123 Main St",
					city: "NYC",
				},
			});
		} finally {
			process.env.HOME = prevHome;
		}
	});
});

function makeMultipartAction(partial?: Partial<CommandAction>): CommandAction {
	return makeAction({
		requestBody: {
			required: true,
			content: [
				{
					contentType: "multipart/form-data",
					required: true,
					schemaType: "object",
				},
			],
			hasJson: false,
			hasFormUrlEncoded: false,
			hasMultipart: true,
			preferredContentType: "multipart/form-data",
			preferredSchema: undefined,
		},
		requestBodySchema: {
			type: "object",
			properties: {
				file: { type: "string", format: "binary" },
				model_id: { type: "string" },
			},
			required: ["file", "model_id"],
		},
		...partial,
	});
}

async function withMultipartSetup(
	fn: (ctx: { dir: string; audioPath: string }) => Promise<void>,
): Promise<void> {
	const prevHome = process.env.HOME;
	const dir = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
	process.env.HOME = dir;
	mkdirSync(dir, { recursive: true });
	const audioPath = `${dir}/audio.mp3`;
	writeFileSync(audioPath, "fake-audio-bytes");

	try {
		await fn({ dir, audioPath });
	} finally {
		process.env.HOME = prevHome;
	}
}

const testServers = [
	{ url: "https://api.example.com", variables: [], variableNames: [] },
];

describe("buildRequest (multipart)", () => {
	test("builds FormData body with file and scalar fields", async () => {
		await withMultipartSetup(async ({ audioPath }) => {
			const action = makeMultipartAction();
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			const { request, body, bodyParts } = await buildRequest({
				specId: "spec",
				action,
				positionalValues: [],
				flagValues: { file: audioPath, model_id: "scribe_v1" },
				globals: {},
				servers: testServers,
				authSchemes: [],
				bodyFlagDefs,
			});

			expect(request.headers.get("Content-Type")).toMatch(
				/^multipart\/form-data; boundary=/,
			);
			const formData = await request.clone().formData();
			expect(formData.get("model_id")).toBe("scribe_v1");
			const file = formData.get("file");
			expect(file).toBeInstanceOf(File);
			expect((file as File).name).toBe("audio.mp3");
			expect(await (file as File).text()).toBe("fake-audio-bytes");

			expect(body).toBeUndefined();
			expect(bodyParts).toEqual([
				{ name: "file", value: audioPath, isFile: true },
				{ name: "model_id", value: "scribe_v1", isFile: false },
			]);
		});
	});

	test("curl output uses -F for files and omits content-type", async () => {
		await withMultipartSetup(async ({ audioPath }) => {
			const action = makeMultipartAction();
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			const { curl } = await buildRequest({
				specId: "spec",
				action,
				positionalValues: [],
				flagValues: { file: audioPath, model_id: "scribe_v1" },
				globals: {},
				servers: testServers,
				authSchemes: [],
				bodyFlagDefs,
			});

			expect(curl).toContain(`-F 'file=@${audioPath}'`);
			expect(curl).toContain("--form-string 'model_id=scribe_v1'");
			expect(curl.toLowerCase()).not.toContain("content-type");
			expect(curl).not.toContain("--data");
		});
	});

	test("throws when file does not exist", async () => {
		await withMultipartSetup(async ({ dir }) => {
			const action = makeMultipartAction();
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			await expect(() =>
				buildRequest({
					specId: "spec",
					action,
					positionalValues: [],
					flagValues: { file: `${dir}/missing.mp3`, model_id: "scribe_v1" },
					globals: {},
					servers: testServers,
					authSchemes: [],
					bodyFlagDefs,
				}),
			).toThrow(`File not found: ${dir}/missing.mp3 (--file)`);
		});
	});

	test("throws when required scalar field is missing", async () => {
		await withMultipartSetup(async ({ audioPath }) => {
			const action = makeMultipartAction();
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			await expect(() =>
				buildRequest({
					specId: "spec",
					action,
					positionalValues: [],
					flagValues: { file: audioPath },
					globals: {},
					servers: testServers,
					authSchemes: [],
					bodyFlagDefs,
				}),
			).toThrow("Missing required fields: --model_id");
		});
	});

	test("throws when required multipart body has no flags", async () => {
		await withMultipartSetup(async () => {
			const action = makeMultipartAction({
				requestBodySchema: {
					type: "object",
					properties: {
						file: { type: "string", format: "binary" },
					},
				},
			});
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			await expect(() =>
				buildRequest({
					specId: "spec",
					action,
					positionalValues: [],
					flagValues: {},
					globals: {},
					servers: testServers,
					authSchemes: [],
					bodyFlagDefs,
				}),
			).toThrow("Multipart request body requires body field flags.");
		});
	});

	test("validates scalar fields with the body schema", async () => {
		await withMultipartSetup(async ({ audioPath }) => {
			const action = makeMultipartAction({
				requestBodySchema: {
					type: "object",
					properties: {
						file: { type: "string", format: "binary" },
						num_speakers: { type: "integer" },
					},
					required: ["file"],
				},
			});
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			await expect(() =>
				buildRequest({
					specId: "spec",
					action,
					positionalValues: [],
					flagValues: { file: audioPath, num_speakers: "abc" },
					globals: {},
					servers: testServers,
					authSchemes: [],
					bodyFlagDefs,
				}),
			).toThrow();
		});
	});

	test("throws for nested body fields under multipart", async () => {
		await withMultipartSetup(async ({ audioPath }) => {
			const action = makeMultipartAction({
				requestBodySchema: {
					type: "object",
					properties: {
						file: { type: "string", format: "binary" },
						options: {
							type: "object",
							properties: { language: { type: "string" } },
						},
					},
					required: ["file"],
				},
			});
			const bodyFlagDefs = generateBodyFlags(
				action.requestBodySchema,
				new Set(),
			);

			await expect(() =>
				buildRequest({
					specId: "spec",
					action,
					positionalValues: [],
					flagValues: { file: audioPath, "options.language": "en" },
					globals: {},
					servers: testServers,
					authSchemes: [],
					bodyFlagDefs,
				}),
			).toThrow(
				"Nested body fields are not supported for multipart requests: --options.language",
			);
		});
	});
});

describe("buildRequest (query parameters)", () => {
	test("builds query string from flag values", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action: CommandAction = {
				id: "test",
				key: "GET /contacts",
				action: "list",
				pathArgs: [],
				rawPathArgs: [],
				method: "GET",
				path: "/contacts",
				tags: [],
				style: "rest",
				positionals: [],
				flags: [
					{
						flag: "--limit",
						name: "limit",
						in: "query",
						type: "integer",
						required: false,
					},
					{
						flag: "--name",
						name: "name",
						in: "query",
						type: "string",
						required: false,
					},
				],
				params: [
					{
						kind: "flag",
						flag: "--limit",
						name: "limit",
						in: "query",
						required: false,
						type: "integer",
					},
					{
						kind: "flag",
						flag: "--name",
						name: "name",
						in: "query",
						required: false,
						type: "string",
					},
				],
				auth: { alternatives: [] },
			};

			const { request } = await buildRequest({
				specId: "spec",
				action,
				positionalValues: [],
				flagValues: { limit: 10, name: "andrew" },
				globals: {},
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [],
			});

			expect(request.method).toBe("GET");
			expect(request.url).toBe(
				"https://api.example.com/contacts?limit=10&name=andrew",
			);
		} finally {
			process.env.HOME = prevHome;
		}
	});

	test("handles array query parameters", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action: CommandAction = {
				id: "test",
				key: "GET /contacts",
				action: "list",
				pathArgs: [],
				rawPathArgs: [],
				method: "GET",
				path: "/contacts",
				tags: [],
				style: "rest",
				positionals: [],
				flags: [
					{
						flag: "--tag",
						name: "tag",
						in: "query",
						type: "array",
						itemType: "string",
						required: false,
					},
				],
				params: [
					{
						kind: "flag",
						flag: "--tag",
						name: "tag",
						in: "query",
						required: false,
						type: "array",
					},
				],
				auth: { alternatives: [] },
			};

			const { request } = await buildRequest({
				specId: "spec",
				action,
				positionalValues: [],
				flagValues: { tag: ["vip", "active"] },
				globals: {},
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [],
			});

			expect(request.url).toBe(
				"https://api.example.com/contacts?tag=vip&tag=active",
			);
		} finally {
			process.env.HOME = prevHome;
		}
	});
});

describe("formatAjvErrors", () => {
	test("pretty prints required errors", () => {
		const ajv = createAjv();
		const validate = ajv.compile({
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
		});

		validate({});
		const msg = formatAjvErrors(validate.errors);
		expect(msg).toBe("/ missing required property 'name'");
	});
});

describe("buildRequest (curl masking)", () => {
	test("masks authorization header token in curl output", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action: CommandAction = {
				id: "test",
				key: "GET /contacts",
				action: "list",
				pathArgs: [],
				rawPathArgs: [],
				method: "GET",
				path: "/contacts",
				tags: [],
				style: "rest",
				positionals: [],
				flags: [],
				params: [],
				auth: {
					alternatives: [[{ key: "bearerAuth", scopes: [] }]],
				},
			};

			const { curl } = await buildRequest({
				specId: "spec",
				action,
				positionalValues: [],
				flagValues: {},
				globals: { bearerToken: "sk_test_1234567890abcdef" },
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [
					{
						key: "bearerAuth",
						kind: "http-bearer",
						scheme: "bearer",
					},
				],
			});

			// Should contain masked token, not the real one
			expect(curl).toContain("Bearer sk_...def");
			expect(curl).not.toContain("sk_test_1234567890abcdef");
		} finally {
			process.env.HOME = prevHome;
		}
	});

	test("masks short tokens with ***", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action: CommandAction = {
				id: "test",
				key: "GET /contacts",
				action: "list",
				pathArgs: [],
				rawPathArgs: [],
				method: "GET",
				path: "/contacts",
				tags: [],
				style: "rest",
				positionals: [],
				flags: [],
				params: [],
				auth: {
					alternatives: [[{ key: "bearerAuth", scopes: [] }]],
				},
			};

			const { curl } = await buildRequest({
				specId: "spec",
				action,
				positionalValues: [],
				flagValues: {},
				globals: { bearerToken: "abc" },
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [
					{
						key: "bearerAuth",
						kind: "http-bearer",
						scheme: "bearer",
					},
				],
			});

			// Short tokens should be fully masked
			expect(curl).toContain("Bearer ***");
			expect(curl).not.toContain("Bearer abc");
		} finally {
			process.env.HOME = prevHome;
		}
	});
});
