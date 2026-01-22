import { describe, expect, test } from "bun:test";

import { indexOperations } from "./operations.js";
import type { OpenApiDoc } from "./types.js";

describe("indexOperations", () => {
	test("indexes basic operations", () => {
		const doc: OpenApiDoc = {
			openapi: "3.0.3",
			paths: {
				"/contacts": {
					get: {
						operationId: "Contacts.List",
						tags: ["Contacts"],
						parameters: [
							{
								in: "query",
								name: "limit",
								schema: { type: "integer" },
							},
						],
					},
				},
				"/contacts/{id}": {
					get: {
						operationId: "Contacts.Get",
						tags: ["Contacts"],
						parameters: [
							{
								in: "path",
								name: "id",
								required: true,
								schema: { type: "string" },
							},
						],
					},
				},
			},
		};

		const ops = indexOperations(doc);
		expect(ops).toHaveLength(2);

		expect(ops[0]?.key).toBe("GET /contacts");
		expect(ops[0]?.path).toBe("/contacts");
		expect(ops[0]?.method).toBe("GET");
		expect(ops[0]?.parameters).toHaveLength(1);
		expect(ops[0]?.parameters[0]?.in).toBe("query");

		expect(ops[1]?.key).toBe("GET /contacts/{id}");
		expect(ops[1]?.path).toBe("/contacts/{id}");
		expect(ops[1]?.method).toBe("GET");
		expect(ops[1]?.parameters).toHaveLength(1);
		expect(ops[1]?.parameters[0]?.in).toBe("path");
		expect(ops[1]?.parameters[0]?.required).toBe(true);
	});
});
