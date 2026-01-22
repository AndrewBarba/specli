import { describe, expect, test } from "bun:test";

import type { NormalizedOperation } from "../core/types.js";
import { deriveRequestBodyInfo } from "./request-body.js";

describe("deriveRequestBodyInfo", () => {
	test("summarizes content types and convenience flags", () => {
		const op: NormalizedOperation = {
			key: "POST /contacts",
			method: "POST",
			path: "/contacts",
			tags: [],
			parameters: [],
			requestBody: {
				required: true,
				contentTypes: ["application/x-www-form-urlencoded", "application/json"],
				schemasByContentType: {
					"application/json": { type: "object" },
					"application/x-www-form-urlencoded": { type: "object" },
				},
			},
		};

		const info = deriveRequestBodyInfo(op);
		expect(info?.required).toBe(true);
		expect(info?.hasJson).toBe(true);
		expect(info?.hasFormUrlEncoded).toBe(true);
		expect(info?.hasMultipart).toBe(false);
		expect(info?.content.map((c) => c.contentType)).toEqual([
			"application/json",
			"application/x-www-form-urlencoded",
		]);
		expect(info?.preferredSchema).toEqual({ type: "object" });
	});
});
