import { describe, expect, test } from "bun:test";

import { tmpdir } from "node:os";

import type { CommandAction } from "../command-model.ts";

import { generateBodyFlags } from "./body-flags.ts";
import { buildRequest } from "./request.ts";
import { createAjv, formatAjvErrors } from "./validate/index.ts";

function makeAction(partial?: Partial<CommandAction>): CommandAction {
	return {
		id: "test",
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
