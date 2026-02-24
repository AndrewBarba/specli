import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

import { main } from "./main.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specText = readFileSync(join(__dirname, "../../fixtures/openapi.json"), "utf-8");

describe("main", () => {
	test("passes custom fetch option to generated commands", async () => {
		const prevHome = process.env.HOME;
		process.env.HOME = `${tmpdir()}/specli-test-${crypto.randomUUID()}`;

		let capturedUrl = "";
		const customFetch = (async (input: Request): Promise<Response> => {
			capturedUrl = input.url;
			return new Response(JSON.stringify([{ id: "1", name: "Ada" }]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof fetch;

		const stdoutChunks: string[] = [];
		const stderrChunks: string[] = [];
		const origStdout = process.stdout.write.bind(process.stdout);
		const origStderr = process.stderr.write.bind(process.stderr);

		process.stdout.write = ((chunk: any) => {
			stdoutChunks.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;
		process.stderr.write = ((chunk: any) => {
			stderrChunks.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;

		try {
			await main(
				[
					"node",
					"specli",
					"contacts",
					"list",
					"--limit",
					"1",
					"--server",
					"https://api.example.com",
					"--json",
				],
				{ embeddedSpecText: specText, fetch: customFetch },
			);
		} finally {
			process.stdout.write = origStdout;
			process.stderr.write = origStderr;
			process.env.HOME = prevHome;
		}

		expect(capturedUrl).toBe("https://api.example.com/contacts?limit=1");
		expect(stderrChunks.join("")).toBe("");
		expect(stdoutChunks.join("").length).toBeGreaterThan(0);
	});
});
