import { describe, expect, test } from "bun:test";

import { deriveParamSpecs } from "./params.ts";
import type { NormalizedOperation } from "./types.ts";

describe("deriveParamSpecs", () => {
	test("derives basic types + flags", () => {
		const op: NormalizedOperation = {
			key: "GET /contacts",
			method: "GET",
			path: "/contacts",
			tags: [],
			parameters: [
				{
					in: "query",
					name: "limit",
					required: false,
					schema: {
						type: "integer",
						format: "int32",
						enum: ["1", "2"],
					},
				},
				{
					in: "header",
					name: "X-Request-Id",
					required: false,
					schema: { type: "string" },
				},
			],
		};

		const specs = deriveParamSpecs(op);
		expect(specs).toHaveLength(2);

		const limit = specs.find((p) => p.name === "limit");
		expect(limit?.kind).toBe("flag");
		expect(limit?.flag).toBe("--limit");
		expect(limit?.type).toBe("integer");
		expect(limit?.format).toBe("int32");
		expect(limit?.enum).toEqual(["1", "2"]);

		const reqId = specs.find((p) => p.name === "X-Request-Id");
		expect(reqId?.kind).toBe("flag");
		expect(reqId?.flag).toBe("--x-request-id");
		expect(reqId?.type).toBe("string");
	});

	test("derives array item types", () => {
		const op: NormalizedOperation = {
			key: "GET /things",
			method: "GET",
			path: "/things",
			tags: [],
			parameters: [
				{
					in: "query",
					name: "ids",
					required: false,
					schema: { type: "array", items: { type: "integer" } },
				},
			],
		};

		const specs = deriveParamSpecs(op);
		expect(specs).toHaveLength(1);
		expect(specs[0]?.type).toBe("array");
		expect(specs[0]?.itemType).toBe("integer");
	});
});
