import { describe, expect, test } from "bun:test";
import { planOperation } from "./naming.ts";
import type { NormalizedOperation } from "./types.ts";

describe("planOperation", () => {
	test("REST: GET /contacts -> contacts list", () => {
		const op: NormalizedOperation = {
			method: "GET",
			path: "/contacts",
			operationId: "Contacts.List",
			tags: ["Contacts"],
			parameters: [],
		};

		const planned = planOperation(op);
		expect(planned.style).toBe("rest");
		expect(planned.resource).toBe("contacts");
		expect(planned.action).toBe("list");
		expect(planned.pathArgs).toEqual([]);
	});

	test("REST: singleton /ping stays ping and prefers operationId action", () => {
		const op: NormalizedOperation = {
			method: "GET",
			path: "/ping",
			operationId: "Ping.Get",
			tags: [],
			parameters: [],
		};

		const planned = planOperation(op);
		expect(planned.style).toBe("rest");
		expect(planned.resource).toBe("ping");
		expect(planned.action).toBe("get");
	});

	test("REST: singular path pluralizes to contacts", () => {
		const op: NormalizedOperation = {
			method: "GET",
			path: "/contact/{id}",
			tags: [],
			parameters: [],
		};

		const planned = planOperation(op);
		expect(planned.style).toBe("rest");
		expect(planned.resource).toBe("contacts");
		expect(planned.action).toBe("get");
		expect(planned.pathArgs).toEqual(["id"]);
	});

	test("RPC: POST /Contacts.List -> contacts list", () => {
		const op: NormalizedOperation = {
			method: "POST",
			path: "/Contacts.List",
			operationId: "Contacts.List",
			tags: [],
			parameters: [],
		};

		const planned = planOperation(op);
		expect(planned.style).toBe("rpc");
		expect(planned.resource).toBe("contacts");
		expect(planned.action).toBe("list");
	});

	test("RPC: Retrieve canonicalizes to get", () => {
		const op: NormalizedOperation = {
			method: "POST",
			path: "/Contacts.Retrieve",
			operationId: "Contacts.Retrieve",
			tags: [],
			parameters: [],
		};

		const planned = planOperation(op);
		expect(planned.style).toBe("rpc");
		expect(planned.resource).toBe("contacts");
		expect(planned.action).toBe("get");
	});
});
