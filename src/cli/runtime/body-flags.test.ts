import { describe, expect, test } from "bun:test";

import {
	findMissingRequired,
	generateBodyFlags,
	parseDotNotationFlags,
} from "./body-flags.ts";

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
