import { describe, expect, test } from "bun:test";

import {
	findMissingRequired,
	flattenSchema,
	generateBodyFlags,
	parseDotNotationFlags,
} from "./body-flags.js";

describe("flattenSchema", () => {
	test("allOf merges properties and unions required", () => {
		const result = flattenSchema({
			required: ["parentReq"],
			allOf: [
				{
					type: "object",
					properties: {
						name: { type: "string" },
						parentReq: { type: "string" },
					},
					required: ["name"],
				},
				{
					type: "object",
					properties: { age: { type: "integer" } },
					required: ["age"],
				},
			],
		});

		expect(result.type).toBe("object");
		expect(Object.keys(result.properties ?? {})).toEqual(
			expect.arrayContaining(["name", "age", "parentReq"]),
		);
		expect(result.required).toEqual(
			expect.arrayContaining(["name", "age", "parentReq"]),
		);
	});

	test("oneOf merges properties, intersects required, combines enums", () => {
		const result = flattenSchema({
			oneOf: [
				{
					type: "object",
					properties: {
						name: { type: "string" },
						email: { type: "string" },
						kind: { type: "string", enum: ["a"] },
					},
					required: ["name", "email"],
				},
				{
					type: "object",
					properties: {
						name: { type: "string" },
						phone: { type: "string" },
						kind: { type: "string", enum: ["b"] },
					},
					required: ["name"],
				},
			],
		});

		expect(Object.keys(result.properties ?? {})).toEqual(
			expect.arrayContaining(["name", "email", "phone", "kind"]),
		);
		// required = intersection
		expect(result.required).toEqual(["name"]);
		// enums combined
		expect(result.properties?.kind?.enum).toEqual(
			expect.arrayContaining(["a", "b"]),
		);
	});

	test("oneOf/anyOf merge parent-level properties and required", () => {
		for (const key of ["oneOf", "anyOf"] as const) {
			const result = flattenSchema({
				required: ["shared"],
				properties: { shared: { type: "string" } },
				[key]: [
					{ type: "object", properties: { x: { type: "string" } } },
					{ type: "object", properties: { y: { type: "integer" } } },
				],
			});

			expect(result.properties?.shared).toEqual({ type: "string" });
			expect(result.properties?.x).toBeDefined();
			expect(result.required).toEqual(expect.arrayContaining(["shared"]));
		}
	});

	test("type conflict across oneOf branches falls back to string", () => {
		const result = flattenSchema({
			oneOf: [
				{ type: "object", properties: { value: { type: "number" } } },
				{ type: "object", properties: { value: { type: "boolean" } } },
			],
		});

		expect(result.properties?.value?.type).toBe("string");
	});

	test("flat schema passes through unchanged", () => {
		const schema = {
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
		};
		expect(flattenSchema(schema)).toBe(schema);
	});

	test("discriminated oneOf with allOf branches", () => {
		const result = flattenSchema({
			oneOf: [
				{
					allOf: [
						{
							type: "object",
							properties: {
								name: { type: "string" },
								prompt: { type: "string" },
								type: { type: "string", enum: ["text"] },
							},
							required: ["name", "prompt", "type"],
						},
					],
				},
				{
					allOf: [
						{
							type: "object",
							properties: {
								name: { type: "string" },
								prompt: { type: "array" },
								type: { type: "string", enum: ["chat"] },
							},
							required: ["name", "prompt", "type"],
						},
					],
				},
			],
		});

		expect(Object.keys(result.properties ?? {})).toEqual(
			expect.arrayContaining(["name", "prompt", "type"]),
		);
		expect(result.properties?.type?.enum).toEqual(
			expect.arrayContaining(["text", "chat"]),
		);
		expect(result.required).toEqual(
			expect.arrayContaining(["name", "prompt", "type"]),
		);
	});
});

describe("generateBodyFlags", () => {
	test("generates flags for simple properties", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					name: { type: "string" },
					age: { type: "integer" },
					active: { type: "boolean" },
				},
				required: ["name"],
			},
			new Set(),
		);

		expect(flags).toHaveLength(3);
		expect(flags.find((f) => f.flag === "--name")).toEqual({
			flag: "--name",
			path: ["name"],
			type: "string",
			description: "Body field 'name'",
			required: true,
		});
		expect(flags.find((f) => f.flag === "--age")).toEqual({
			flag: "--age",
			path: ["age"],
			type: "integer",
			description: "Body field 'age'",
			required: false,
		});
	});

	test("generates dot-notation flags for nested objects", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					name: { type: "string" },
					address: {
						type: "object",
						properties: {
							street: { type: "string" },
							city: { type: "string" },
							zip: { type: "string" },
						},
					},
				},
			},
			new Set(),
		);

		expect(flags).toHaveLength(4);
		expect(flags.find((f) => f.flag === "--address.street")).toEqual({
			flag: "--address.street",
			path: ["address", "street"],
			type: "string",
			description: "Body field 'address.street'",
			required: false,
		});
	});

	test("handles deeply nested objects", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					user: {
						type: "object",
						properties: {
							profile: {
								type: "object",
								properties: { bio: { type: "string" } },
							},
						},
					},
				},
			},
			new Set(),
		);

		expect(flags.find((f) => f.flag === "--user.profile.bio")?.type).toBe(
			"string",
		);
	});

	test("skips reserved flags", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					name: { type: "string" },
					data: { type: "string" },
					curl: { type: "boolean" },
				},
			},
			new Set(["--data", "--curl"]),
		);

		expect(flags).toHaveLength(1);
		expect(flags[0]?.flag).toBe("--name");
	});

	test("uses description from schema", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					email: { type: "string", description: "User email address" },
				},
			},
			new Set(),
		);

		expect(flags[0]?.description).toBe("User email address");
	});

	test("array and opaque object types", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					tags: { type: "array", items: { type: "string" } },
					metadata: { type: "object" },
					config: { nullable: true, description: "Optional config" },
					ids: {
						type: "array",
						items: { type: "string" },
						description: "List of IDs",
					},
				},
			},
			new Set(),
		);

		expect(flags.find((f) => f.flag === "--tags")).toMatchObject({
			type: "array",
		});
		expect(flags.find((f) => f.flag === "--metadata")).toMatchObject({
			type: "json",
		});
		expect(flags.find((f) => f.flag === "--config")).toMatchObject({
			type: "json",
			description: "Optional config",
		});
		expect(flags.find((f) => f.flag === "--ids")?.description).toBe(
			"List of IDs",
		);
	});

	test("property-level allOf flattens into dot-notation flags", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					address: {
						allOf: [
							{ type: "object", properties: { street: { type: "string" } } },
							{ type: "object", properties: { city: { type: "string" } } },
						],
					},
				},
			},
			new Set(),
		);

		expect(flags.find((f) => f.flag === "--address.street")).toBeDefined();
		expect(flags.find((f) => f.flag === "--address.city")).toBeDefined();
	});

	test("property-level oneOf type conflict generates string flag", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					value: {
						description: "A flexible value",
						oneOf: [{ type: "string" }, { type: "integer" }],
					},
				},
			},
			new Set(),
		);

		expect(flags).toHaveLength(1);
		expect(flags[0]).toMatchObject({
			type: "string",
			description: "A flexible value",
		});
	});

	test("discriminated union with allOf branches", () => {
		const flags = generateBodyFlags(
			{
				oneOf: [
					{
						allOf: [
							{
								type: "object",
								properties: {
									name: { type: "string", description: "Name" },
									prompt: { type: "string" },
									type: { type: "string", enum: ["text"] },
									config: { type: "object" },
									labels: { type: "array", items: { type: "string" } },
								},
								required: ["name", "prompt", "type"],
							},
						],
					},
					{
						allOf: [
							{
								type: "object",
								properties: {
									name: { type: "string", description: "Name" },
									prompt: { type: "array", items: { type: "object" } },
									type: { type: "string", enum: ["chat"] },
									config: { type: "object" },
									labels: { type: "array", items: { type: "string" } },
								},
								required: ["name", "prompt", "type"],
							},
						],
					},
				],
				// biome-ignore lint/suspicious/noExplicitAny: JsonSchema is not exported
			} as any,
			new Set(),
		);

		expect(flags.map((f) => f.flag).sort()).toEqual(
			expect.arrayContaining([
				"--config",
				"--labels",
				"--name",
				"--prompt",
				"--type",
			]),
		);
		expect(flags.find((f) => f.flag === "--name")).toMatchObject({
			required: true,
		});
		expect(flags.find((f) => f.flag === "--type")).toMatchObject({
			type: "string",
		});
		expect(flags.find((f) => f.flag === "--config")).toMatchObject({
			type: "json",
		});
		expect(flags.find((f) => f.flag === "--labels")).toMatchObject({
			type: "array",
		});
	});
});

describe("parseDotNotationFlags", () => {
	test("parses flat flags with type coercion", () => {
		const flagDefs = generateBodyFlags(
			{
				type: "object",
				properties: {
					name: { type: "string" },
					age: { type: "integer" },
					active: { type: "boolean" },
				},
			},
			new Set(),
		);

		const result = parseDotNotationFlags(
			{ name: "Ada", age: "30", active: true },
			flagDefs,
		);

		expect(result).toEqual({ name: "Ada", age: 30, active: true });
	});

	test("parses nested flags into objects", () => {
		const flagDefs = generateBodyFlags(
			{
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
			},
			new Set(),
		);

		const result = parseDotNotationFlags(
			{ name: "Ada", "address.street": "123 Main", "address.city": "NYC" },
			flagDefs,
		);

		expect(result).toEqual({
			name: "Ada",
			address: { street: "123 Main", city: "NYC" },
		});
	});

	test("array: JSON string, comma-separated, pre-parsed, bad JSON", () => {
		const flagDefs = generateBodyFlags(
			{
				type: "object",
				properties: { tags: { type: "array", items: { type: "string" } } },
			},
			new Set(),
		);

		expect(parseDotNotationFlags({ tags: '["a", "b"]' }, flagDefs)).toEqual({
			tags: ["a", "b"],
		});
		expect(parseDotNotationFlags({ tags: "a,b,c" }, flagDefs)).toEqual({
			tags: ["a", "b", "c"],
		});
		expect(
			parseDotNotationFlags({ tags: ["already", "parsed"] }, flagDefs),
		).toEqual({
			tags: ["already", "parsed"],
		});
		// bad JSON falls back to comma-split
		expect(parseDotNotationFlags({ tags: "[bad json" }, flagDefs).tags).toEqual(
			["[bad json"],
		);
	});

	test("json: parses valid JSON, falls back to string", () => {
		const flagDefs = generateBodyFlags(
			{
				type: "object",
				properties: { metadata: { type: "object" } },
			},
			new Set(),
		);

		expect(parseDotNotationFlags({ metadata: '{"k": "v"}' }, flagDefs)).toEqual(
			{
				metadata: { k: "v" },
			},
		);
		expect(parseDotNotationFlags({ metadata: "not-json" }, flagDefs)).toEqual({
			metadata: "not-json",
		});
	});
});

describe("findMissingRequired", () => {
	test("finds missing required fields", () => {
		const flagDefs = generateBodyFlags(
			{
				type: "object",
				properties: { name: { type: "string" }, email: { type: "string" } },
				required: ["name", "email"],
			},
			new Set(),
		);

		expect(findMissingRequired({ name: "Ada" }, flagDefs)).toEqual(["email"]);
		expect(
			findMissingRequired({ name: "Ada", email: "a@b.c" }, flagDefs),
		).toEqual([]);
	});
});
