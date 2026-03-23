import { describe, expect, test } from "bun:test";

import {
	findMissingRequired,
	generateBodyFlags,
	parseDotNotationFlags,
} from "./body-flags.js";

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
		expect(flags.find((f) => f.flag === "--name")).toBeDefined();
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
								properties: {
									bio: { type: "string" },
								},
							},
						},
					},
				},
			},
			new Set(),
		);

		expect(flags.find((f) => f.flag === "--user.profile.bio")).toEqual({
			flag: "--user.profile.bio",
			path: ["user", "profile", "bio"],
			type: "string",
			description: "Body field 'user.profile.bio'",
			required: false,
		});
	});

	test("skips reserved flags", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					name: { type: "string" },
					data: { type: "string" }, // --data is reserved
				},
			},
			new Set(["--data"]),
		);

		expect(flags).toHaveLength(1);
		expect(flags[0]?.flag).toBe("--name");
	});

	test("skips --curl builtin flag", () => {
		const reservedFlags = new Set(["--curl"]);

		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					name: { type: "string" },
					curl: { type: "boolean" }, // conflicts with --curl builtin
					email: { type: "string" }, // no conflict
				},
			},
			reservedFlags,
		);

		expect(flags).toHaveLength(2);
		expect(flags.map((f) => f.flag).sort()).toEqual(["--email", "--name"]);
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

	test("merges top-level allOf into flat properties", () => {
		const flags = generateBodyFlags(
			{
				allOf: [
					{
						type: "object",
						properties: {
							name: { type: "string", description: "Name" },
						},
						required: ["name"],
					},
					{
						type: "object",
						properties: {
							email: { type: "string", description: "Email" },
						},
					},
				],
			},
			new Set(),
		);

		expect(flags).toHaveLength(2);
		expect(flags.find((f) => f.flag === "--name")).toEqual({
			flag: "--name",
			path: ["name"],
			type: "string",
			description: "Name",
			required: true,
		});
		expect(flags.find((f) => f.flag === "--email")).toEqual({
			flag: "--email",
			path: ["email"],
			type: "string",
			description: "Email",
			required: false,
		});
	});

	test("merges nested allOf in property schemas", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					transaction: {
						allOf: [
							{ type: "object" },
							{
								type: "object",
								properties: {
									payee_name: {
										type: "string",
										description: "The payee name",
									},
									amount: {
										type: "integer",
										description: "Amount in milliunits",
									},
								},
							},
						],
					},
				},
			},
			new Set(),
		);

		expect(flags).toHaveLength(2);
		expect(flags.find((f) => f.flag === "--transaction.payee_name")).toEqual({
			flag: "--transaction.payee_name",
			path: ["transaction", "payee_name"],
			type: "string",
			description: "The payee name",
			required: false,
		});
		expect(flags.find((f) => f.flag === "--transaction.amount")).toEqual({
			flag: "--transaction.amount",
			path: ["transaction", "amount"],
			type: "integer",
			description: "Amount in milliunits",
			required: false,
		});
	});

	test("handles OpenAPI 3.1 nullable types (type arrays)", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					name: { type: "string", description: "Name" },
					payee_name: {
						type: ["string", "null"],
						description: "Payee name",
					},
					memo: { type: ["string", "null"], description: "Memo" },
					amount: { type: "integer", description: "Amount" },
					category_id: {
						type: ["string", "null"],
						description: "Category",
					},
				},
			},
			new Set(),
		);

		expect(flags).toHaveLength(5);
		expect(flags.find((f) => f.flag === "--name")?.type).toBe("string");
		expect(flags.find((f) => f.flag === "--payee_name")?.type).toBe("string");
		expect(flags.find((f) => f.flag === "--memo")?.type).toBe("string");
		expect(flags.find((f) => f.flag === "--amount")?.type).toBe("integer");
		expect(flags.find((f) => f.flag === "--category_id")?.type).toBe("string");
	});

	test("handles nullable types in nested allOf schemas", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					transaction: {
						allOf: [
							{ type: "object" },
							{
								type: "object",
								properties: {
									account_id: { type: "string" },
									payee_name: {
										type: ["string", "null"],
										description: "The payee name",
									},
									memo: { type: ["string", "null"] },
								},
							},
						],
					},
				},
			},
			new Set(),
		);

		expect(flags).toHaveLength(3);
		expect(
			flags.find((f) => f.flag === "--transaction.account_id"),
		).toBeDefined();
		expect(
			flags.find((f) => f.flag === "--transaction.payee_name"),
		).toBeDefined();
		expect(flags.find((f) => f.flag === "--transaction.memo")).toBeDefined();
	});

	test("handles allOf with properties alongside", () => {
		const flags = generateBodyFlags(
			{
				type: "object",
				properties: {
					id: { type: "string" },
				},
				allOf: [
					{
						type: "object",
						properties: {
							name: { type: "string" },
						},
					},
				],
			},
			new Set(),
		);

		expect(flags).toHaveLength(2);
		expect(flags.find((f) => f.flag === "--id")).toBeDefined();
		expect(flags.find((f) => f.flag === "--name")).toBeDefined();
	});
});

describe("parseDotNotationFlags", () => {
	test("parses flat flags", () => {
		const flagDefs = generateBodyFlags(
			{
				type: "object",
				properties: {
					name: { type: "string" },
					age: { type: "integer" },
				},
			},
			new Set(),
		);

		const result = parseDotNotationFlags({ name: "Ada", age: "30" }, flagDefs);

		expect(result).toEqual({
			name: "Ada",
			age: 30,
		});
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

		// Commander keeps dots: --address.street -> "address.street"
		const result = parseDotNotationFlags(
			{
				name: "Ada",
				"address.street": "123 Main",
				"address.city": "NYC",
			},
			flagDefs,
		);

		expect(result).toEqual({
			name: "Ada",
			address: {
				street: "123 Main",
				city: "NYC",
			},
		});
	});

	test("handles boolean flags", () => {
		const flagDefs = generateBodyFlags(
			{
				type: "object",
				properties: {
					active: { type: "boolean" },
				},
			},
			new Set(),
		);

		const result = parseDotNotationFlags({ active: true }, flagDefs);

		expect(result).toEqual({ active: true });
	});
});

describe("findMissingRequired", () => {
	test("finds missing required fields", () => {
		const flagDefs = generateBodyFlags(
			{
				type: "object",
				properties: {
					name: { type: "string" },
					email: { type: "string" },
				},
				required: ["name", "email"],
			},
			new Set(),
		);

		const missing = findMissingRequired({ name: "Ada" }, flagDefs);

		expect(missing).toEqual(["email"]);
	});

	test("returns empty when all required fields present", () => {
		const flagDefs = generateBodyFlags(
			{
				type: "object",
				properties: {
					name: { type: "string" },
				},
				required: ["name"],
			},
			new Set(),
		);

		const missing = findMissingRequired({ name: "Ada" }, flagDefs);

		expect(missing).toEqual([]);
	});
});
