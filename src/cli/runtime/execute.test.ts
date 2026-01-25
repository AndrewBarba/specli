import { describe, expect, test } from "bun:test";

import { tmpdir } from "node:os";

import type { CommandAction } from "../model/command-model.js";

import { execute } from "./execute.js";

function makeAction(partial?: Partial<CommandAction>): CommandAction {
	return {
		id: "test",
		key: "GET /users/{id}",
		action: "get",
		pathArgs: ["id"],
		rawPathArgs: ["id"],
		method: "GET",
		path: "/users/{id}",
		tags: [],
		style: "rest",
		positionals: [{ name: "id", in: "path", required: true }],
		flags: [],
		params: [],
		auth: { alternatives: [] },
		...partial,
	};
}

describe("execute", () => {
	test("uses custom fetch implementation", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action = makeAction();
			let capturedRequest: Request | null = null;

			const customFetch = async (input: Request): Promise<Response> => {
				capturedRequest = input;
				return new Response(JSON.stringify({ id: "123", name: "Test User" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			};

			const result = await execute({
				specId: "spec",
				action,
				positionalValues: ["123"],
				flagValues: {},
				globals: {},
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [],
				fetch: customFetch,
			});

			expect(result.type).toBe("success");
			expect(capturedRequest).not.toBeNull();
			expect(capturedRequest?.url).toBe("https://api.example.com/users/123");
			expect(capturedRequest?.method).toBe("GET");

			if (result.type === "success") {
				expect(result.response.status).toBe(200);
				expect(result.response.body).toEqual({ id: "123", name: "Test User" });
			}
		} finally {
			process.env.HOME = prevHome;
		}
	});

	test("custom fetch receives correct headers", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action = makeAction({
				auth: { alternatives: [[{ key: "bearerAuth", scopes: [] }]] },
			});
			let capturedHeaders: Headers | null = null;

			const customFetch = async (input: Request): Promise<Response> => {
				capturedHeaders = input.headers;
				return new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			};

			await execute({
				specId: "spec",
				action,
				positionalValues: ["123"],
				flagValues: {},
				globals: { bearerToken: "test-token-123" },
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [
					{ key: "bearerAuth", kind: "http-bearer", scheme: "bearer" },
				],
				fetch: customFetch,
			});

			expect(capturedHeaders).not.toBeNull();
			expect(capturedHeaders?.get("Authorization")).toBe(
				"Bearer test-token-123",
			);
		} finally {
			process.env.HOME = prevHome;
		}
	});

	test("custom fetch can return error responses", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action = makeAction();

			const customFetch = async (_input: Request): Promise<Response> => {
				return new Response(
					JSON.stringify({ error: "Not Found", message: "User not found" }),
					{
						status: 404,
						headers: { "Content-Type": "application/json" },
					},
				);
			};

			const result = await execute({
				specId: "spec",
				action,
				positionalValues: ["999"],
				flagValues: {},
				globals: {},
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [],
				fetch: customFetch,
			});

			expect(result.type).toBe("success");
			if (result.type === "success") {
				expect(result.response.status).toBe(404);
				expect(result.response.ok).toBe(false);
				expect(result.response.body).toEqual({
					error: "Not Found",
					message: "User not found",
				});
			}
		} finally {
			process.env.HOME = prevHome;
		}
	});

	test("custom fetch errors are captured", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action = makeAction();

			const customFetch = async (_input: Request): Promise<Response> => {
				throw new Error("Network error: connection refused");
			};

			const result = await execute({
				specId: "spec",
				action,
				positionalValues: ["123"],
				flagValues: {},
				globals: {},
				servers: [
					{ url: "https://api.example.com", variables: [], variableNames: [] },
				],
				authSchemes: [],
				fetch: customFetch,
			});

			expect(result.type).toBe("error");
			if (result.type === "error") {
				expect(result.message).toBe("Network error: connection refused");
			}
		} finally {
			process.env.HOME = prevHome;
		}
	});

	test("uses global fetch when no custom fetch provided", async () => {
		const prevHome = process.env.HOME;
		const home = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;
		process.env.HOME = home;

		try {
			const action = makeAction();

			// This will use the real fetch, which should fail with an error
			// since api.example.com doesn't exist (or return an error)
			const result = await execute({
				specId: "spec",
				action,
				positionalValues: ["123"],
				flagValues: {},
				globals: {},
				servers: [
					{
						url: "https://httpbin.org",
						variables: [],
						variableNames: [],
					},
				],
				authSchemes: [],
				// No custom fetch - uses global fetch
			});

			// httpbin.org/users/123 should return a 404 but still work
			expect(result.type).toBe("success");
		} finally {
			process.env.HOME = prevHome;
		}
	});
});
