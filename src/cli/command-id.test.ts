import { describe, expect, test } from "bun:test";

import { buildCommandId } from "./command-id.ts";

describe("buildCommandId", () => {
	test("includes spec/resource/action/op", () => {
		expect(
			buildCommandId({
				specId: "contacts-api",
				resource: "contacts",
				action: "get",
				operationKey: "GET /contacts/{id}",
			}),
		).toBe("contacts-api:contacts:get:get-contacts-id");
	});

	test("disambiguates by operationKey", () => {
		const a = buildCommandId({
			specId: "x",
			resource: "contacts",
			action: "list",
			operationKey: "GET /contacts",
		});
		const b = buildCommandId({
			specId: "x",
			resource: "contacts",
			action: "list",
			operationKey: "GET /contacts/search",
		});
		expect(a).not.toBe(b);
	});
});
