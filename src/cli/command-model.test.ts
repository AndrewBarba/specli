import { describe, expect, test } from "bun:test";

import { buildCommandModel } from "./command-model.ts";
import type { PlannedOperation } from "./naming.ts";

describe("buildCommandModel", () => {
	test("groups operations by resource", () => {
		const planned: PlannedOperation[] = [
			{
				method: "GET",
				path: "/contacts",
				tags: ["Contacts"],
				parameters: [],
				resource: "contacts",
				action: "list",
				pathArgs: [],
				style: "rest",
			},
			{
				method: "GET",
				path: "/contacts/{id}",
				tags: ["Contacts"],
				parameters: [],
				resource: "contacts",
				action: "get",
				pathArgs: ["id"],
				style: "rest",
			},
		];

		const model = buildCommandModel(planned);
		expect(model.resources).toHaveLength(1);
		expect(model.resources[0]?.resource).toBe("contacts");
		expect(model.resources[0]?.actions).toHaveLength(2);
		expect(model.resources[0]?.actions.map((a) => a.action)).toEqual([
			"get",
			"list",
		]);
	});
});
