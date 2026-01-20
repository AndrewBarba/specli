import { describe, expect, test } from "bun:test";
import { clearCache, specli } from "./tools.ts";

const mockOptions = {
	toolCallId: "test-call-id",
	abortSignal: new AbortController().signal,
	messages: [],
};

describe("specli tool", () => {
	test("creates a tool with correct structure", () => {
		const tool = specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		expect(tool).toHaveProperty("description");
		expect(tool).toHaveProperty("inputSchema");
		expect(tool).toHaveProperty("execute");
		expect(typeof tool.execute).toBe("function");
	});

	test("list command returns resources", async () => {
		const tool = specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		const result = await tool.execute!(
			{
				command: "list",
			},
			mockOptions,
		);

		expect(result).toHaveProperty("title");
		expect(result).toHaveProperty("resources");
		expect(Array.isArray((result as { resources: unknown[] }).resources)).toBe(
			true,
		);
	});

	test("help command returns action details", async () => {
		const tool = specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		const result = await tool.execute!(
			{
				command: "help",
				resource: "pets",
				action: "get",
			},
			mockOptions,
		);

		expect(result).toHaveProperty("action");
		expect((result as { action: { name: string } }).action.name).toBe("get");
	});

	test("help command with missing resource returns error", async () => {
		const tool = specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		const result = await tool.execute!(
			{
				command: "help",
			},
			mockOptions,
		);

		expect(result).toHaveProperty("error");
	});

	test("exec command with missing args returns error", async () => {
		const tool = specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		const result = await tool.execute!(
			{
				command: "exec",
				resource: "pets",
				action: "get",
				// missing pet-id arg
			},
			mockOptions,
		);

		expect(result).toHaveProperty("error");
		expect((result as { error: string }).error).toContain(
			"Missing required arguments",
		);
	});

	test("clearCache clears specific spec", async () => {
		const spec = "https://petstore3.swagger.io/api/v3/openapi.json";
		const tool = specli({ spec });

		// Prime the cache
		await tool.execute!({ command: "list" }, mockOptions);

		// Clear should not throw
		clearCache(spec);
	});

	test("clearCache clears all specs", async () => {
		const tool = specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		// Prime the cache
		await tool.execute!({ command: "list" }, mockOptions);

		// Clear all should not throw
		clearCache();
	});
});
