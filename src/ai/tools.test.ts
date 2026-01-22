import { describe, expect, test } from "bun:test";
import { specli } from "./tools.js";

const mockOptions = {
	toolCallId: "test-call-id",
	abortSignal: new AbortController().signal,
	messages: [],
};

describe("specli tool", () => {
	test("creates a tool with correct structure", async () => {
		const tool = await specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		expect(tool).toHaveProperty("description");
		expect(tool).toHaveProperty("inputSchema");
		expect(tool).toHaveProperty("execute");
		expect(typeof tool.execute).toBe("function");
	});

	test("list command returns resources", async () => {
		const tool = await specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		const result = (await tool.execute?.({ command: "list" }, mockOptions)) as {
			resources: unknown[];
		};

		expect(result).toHaveProperty("resources");
		expect(Array.isArray(result.resources)).toBe(true);
	});

	test("help command returns action details", async () => {
		const tool = await specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		const result = (await tool.execute?.(
			{ command: "help", resource: "pets", action: "get" },
			mockOptions,
		)) as { action: string };

		expect(result).toHaveProperty("action");
		expect(result.action).toBe("get");
	});

	test("help command with missing resource returns error", async () => {
		const tool = await specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		const result = (await tool.execute?.({ command: "help" }, mockOptions)) as {
			error: string;
		};

		expect(result).toHaveProperty("error");
	});

	test("exec command with missing args returns error", async () => {
		const tool = await specli({
			spec: "https://petstore3.swagger.io/api/v3/openapi.json",
		});

		const result = (await tool.execute?.(
			{ command: "exec", resource: "pets", action: "get" },
			mockOptions,
		)) as { error: string };

		expect(result).toHaveProperty("error");
		// Error can be "Missing args" or "Missing template variable" depending on where validation occurs
		expect(result.error).toBeTruthy();
	});
});
