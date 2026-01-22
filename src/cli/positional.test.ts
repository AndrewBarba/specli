import { describe, expect, test } from "bun:test";
import type { ActionShapeForCli } from "./positional.js";
import { deriveFlags, derivePositionals } from "./positional.js";

describe("derivePositionals", () => {
	test("returns ordered positionals from pathArgs", () => {
		const action: ActionShapeForCli = {
			pathArgs: ["id"],
			params: [
				{
					kind: "positional",
					in: "path",
					name: "id",
					flag: "--id",
					required: true,
					type: "string",
				},
			],
		};

		const pos = derivePositionals(action);
		expect(pos).toEqual([
			{
				name: "id",
				required: true,
				type: "string",
				format: undefined,
				enum: undefined,
				description: undefined,
			},
		]);
	});
});

describe("deriveFlags", () => {
	test("returns only flag params", () => {
		const action: ActionShapeForCli = {
			pathArgs: [],
			params: [
				{
					kind: "flag",
					in: "query",
					name: "limit",
					flag: "--limit",
					required: false,
					type: "integer",
				},
			],
		};

		const flags = deriveFlags(action);
		expect(flags.flags).toEqual([
			{
				in: "query",
				name: "limit",
				flag: "--limit",
				required: false,
				description: undefined,
				type: "integer",
				format: undefined,
				enum: undefined,
			},
		]);
	});
});
