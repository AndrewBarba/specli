import { describe, expect, test } from "bun:test";

import { tmpdir } from "node:os";

import type { CommandAction } from "../command-model.ts";

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
	test("builds body from expanded --body-* flags", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/opencli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const { request, curl } = await buildRequest({
				specId: "spec",
				action: makeAction(),
				positionalValues: [],
				flagValues: { __body: { bodyName: "A" } },
				globals: {},
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [],
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
		const home = `${tmpdir()}/opencli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			await expect(() =>
				buildRequest({
					specId: "spec",
					action: makeAction(),
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
				}),
			).toThrow(
				"Missing request body. Provide --data, --file, or --body-* flags.",
			);
		} finally {
			process.env.HOME = prevHome;
		}
	});

	test("throws friendly error for missing required expanded field", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/opencli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			await expect(() =>
				buildRequest({
					specId: "spec",
					action: makeAction(),
					positionalValues: [],
					flagValues: { __body: { bodyFoo: "bar" } },
					globals: {},
					servers: [
						{
							url: "https://api.example.com",
							variables: [],
							variableNames: [],
						},
					],
					authSchemes: [],
				}),
			).toThrow(
				"Missing required body field 'name'. Provide --body-name or use --data/--file.",
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
