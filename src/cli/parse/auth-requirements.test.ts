import { describe, expect, test } from "bun:test";

import { summarizeAuth } from "./auth-requirements.js";
import type { AuthScheme } from "./auth-schemes.js";

describe("summarizeAuth", () => {
	test("uses operation-level security when present", () => {
		const schemes: AuthScheme[] = [{ key: "oauth", kind: "oauth2" }];

		const summary = summarizeAuth(
			[{ oauth: ["read:ping"] }],
			[{ oauth: ["read:other"] }],
			schemes,
		);

		expect(summary.alternatives).toEqual([
			[{ key: "oauth", scopes: ["read:ping"] }],
		]);
	});

	test("empty operation security disables auth", () => {
		const schemes: AuthScheme[] = [{ key: "oauth", kind: "oauth2" }];

		const summary = summarizeAuth([], [{ oauth: ["read:other"] }], schemes);
		expect(summary.alternatives).toEqual([]);
	});
});
