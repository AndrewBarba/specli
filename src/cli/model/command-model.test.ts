import { describe, expect, test } from "bun:test";

import { buildCommandModel } from "./command-model.js";
import type { PlannedOperation } from "./naming.js";

describe("buildCommandModel", () => {
	test("groups operations by resource", () => {
		const planned: PlannedOperation[] = [
			{
				key: "GET /contacts",
				method: "GET",
				path: "/contacts",
				tags: ["Contacts"],
				parameters: [],
				resource: "contacts",
				action: "list",
				canonicalAction: "list",
				pathArgs: [],
				rawPathArgs: [],
				style: "rest",
			},
			{
				key: "GET /contacts/{id}",
				method: "GET",
				path: "/contacts/{id}",
				tags: ["Contacts"],
				parameters: [],
				resource: "contacts",
				action: "get",
				canonicalAction: "get",
				pathArgs: ["id"],
				rawPathArgs: ["id"],
				style: "rest",
			},
		];

		const model = buildCommandModel(planned, { specId: "contacts-api" });
		expect(model.resources).toHaveLength(1);
		expect(model.resources[0]?.resource).toBe("contacts");
		expect(model.resources[0]?.actions).toHaveLength(2);
		expect(model.resources[0]?.actions.map((a) => a.action)).toEqual([
			"get",
			"list",
		]);
	});
});
