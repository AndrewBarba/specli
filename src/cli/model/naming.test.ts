import { describe, expect, test } from "bun:test";
import type { NormalizedOperation } from "../core/types.js";
import { planOperation, planOperations } from "./naming.js";

describe("planOperation", () => {
	test("REST: GET /contacts -> contacts list", () => {
		const op: NormalizedOperation = {
			key: "GET /contacts",
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
			key: "GET /ping",
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
			key: "GET /contact/{id}",
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
			key: "POST /Contacts.List",
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
			key: "POST /Contacts.Retrieve",
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

describe("planOperations collision handling", () => {
	test("disambiguates colliding creates with meaningful names", () => {
		const ops: NormalizedOperation[] = [
			{
				key: "POST /v13/deployments",
				method: "POST",
				path: "/v13/deployments",
				operationId: "createDeployment",
				tags: ["deployments"],
				parameters: [],
			},
			{
				key: "POST /v2/deployments/files",
				method: "POST",
				path: "/v2/deployments/files",
				operationId: "uploadDeploymentFiles",
				tags: ["deployments"],
				parameters: [],
			},
		];

		const planned = planOperations(ops);
		// Should extract meaningful disambiguators, not "create-create-deployment-1"
		// First op falls back to path segment "v13", second extracts "upload-files" from operationId
		expect(planned[0]?.action).toBe("create-v13");
		expect(planned[1]?.action).toBe("create-upload-files");
	});

	test("disambiguates colliding gets with meaningful names from operationId", () => {
		const ops: NormalizedOperation[] = [
			{
				key: "GET /deployments/{idOrUrl}",
				method: "GET",
				path: "/deployments/{idOrUrl}",
				operationId: "getDeployment",
				tags: ["deployments"],
				parameters: [],
			},
			{
				key: "GET /deployments/{idOrUrl}/events",
				method: "GET",
				path: "/deployments/{idOrUrl}/events",
				operationId: "getDeploymentEvents",
				tags: ["deployments"],
				parameters: [],
			},
			{
				key: "GET /deployments/{id}/files",
				method: "GET",
				path: "/deployments/{id}/files",
				operationId: "listDeploymentFiles",
				tags: ["deployments"],
				parameters: [],
			},
		];

		const planned = planOperations(ops);
		// Should extract meaningful disambiguators from operationId and path
		// First one has no extra info, falls back to numeric suffix
		expect(planned[0]?.action).toBe("get-1");
		// Second extracts "events" from operationId
		expect(planned[1]?.action).toBe("get-events");
		// Third extracts "files" from operationId (list -> get canonicalization doesn't affect disambiguator)
		expect(planned[2]?.action).toBe("get-files");
	});

	test("disambiguated names never collide with each other", () => {
		// Both operationIds reduce to the same disambiguator ("priorities"),
		// which used to produce two `list-priorities` commands.
		const ops: NormalizedOperation[] = [
			{
				key: "GET /priority",
				method: "GET",
				path: "/priority",
				operationId: "getPriorities",
				tags: ["Issue priorities"],
				parameters: [],
			},
			{
				key: "GET /priority/search",
				method: "GET",
				path: "/priority/search",
				operationId: "searchPriorities",
				tags: ["Issue priorities"],
				parameters: [],
			},
		];

		const planned = planOperations(ops);
		expect(planned[0]?.action).toBe("list-priorities");
		expect(planned[1]?.action).toBe("list-search");
	});

	test("disambiguated names never collide with an unrelated command", () => {
		// `list-events` is already taken by a non-colliding operation, so the
		// colliding one must fall through to another candidate.
		const ops: NormalizedOperation[] = [
			{
				key: "GET /events",
				method: "GET",
				path: "/events",
				operationId: "listProjectEvents",
				tags: ["projects"],
				parameters: [],
			},
			{
				key: "GET /projects",
				method: "GET",
				path: "/projects",
				operationId: "listProjects",
				tags: ["projects"],
				parameters: [],
			},
			{
				key: "GET /teams/events",
				method: "GET",
				path: "/teams/events",
				operationId: "listProjectEventsByTeam",
				tags: ["projects"],
				parameters: [],
			},
		];

		const planned = planOperations(ops);
		expect(planned[0]?.action).toBe("list-events");
		expect(planned[1]?.action).toBe("list-1");
		expect(planned[2]?.action).toBe("list-events-by-team");
	});

	test("no collision means no suffix", () => {
		const ops: NormalizedOperation[] = [
			{
				key: "GET /contacts",
				method: "GET",
				path: "/contacts",
				operationId: "listContacts",
				tags: ["contacts"],
				parameters: [],
			},
			{
				key: "POST /contacts",
				method: "POST",
				path: "/contacts",
				operationId: "createContact",
				tags: ["contacts"],
				parameters: [],
			},
		];

		const planned = planOperations(ops);
		expect(planned[0]?.action).toBe("list");
		expect(planned[1]?.action).toBe("create");
	});

	test("numbers colliding operations consecutively", () => {
		// Only operations that actually fall back to a number consume one, so
		// the sequence has no gaps. The previous counter incremented once per
		// group member regardless, which named the third operation "get-3".
		const ops: NormalizedOperation[] = [
			{
				key: "GET /users/{id}",
				method: "GET",
				path: "/users/{id}",
				operationId: "getUser",
				tags: ["users"],
				parameters: [],
			},
			{
				key: "GET /users/{id}/profile",
				method: "GET",
				path: "/users/{id}/profile",
				operationId: "getUser",
				tags: ["users"],
				parameters: [],
			},
			{
				key: "GET /users/{id}/user",
				method: "GET",
				path: "/users/{id}/user",
				operationId: "getUser",
				tags: ["users"],
				parameters: [],
			},
		];

		const planned = planOperations(ops);
		expect(planned[0]?.action).toBe("get-1");
		expect(planned[1]?.action).toBe("get-profile");
		expect(planned[2]?.action).toBe("get-2");
	});

	test("falls back to path segment when operationId has no extra info", () => {
		const ops: NormalizedOperation[] = [
			{
				key: "GET /users/{id}",
				method: "GET",
				path: "/users/{id}",
				operationId: "getUser",
				tags: ["users"],
				parameters: [],
			},
			{
				key: "GET /users/{id}/profile",
				method: "GET",
				path: "/users/{id}/profile",
				operationId: "getUser",
				tags: ["users"],
				parameters: [],
			},
		];

		const planned = planOperations(ops);
		expect(planned[0]?.action).toBe("get-1");
		expect(planned[1]?.action).toBe("get-profile");
	});
});
