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

	test("prefers JSON when both JSON and multipart are offered", () => {
		const op: NormalizedOperation = {
			key: "POST /speech-to-text",
			method: "POST",
			path: "/speech-to-text",
			tags: [],
			parameters: [],
			requestBody: {
				required: true,
				contentTypes: ["multipart/form-data", "application/json"],
				schemasByContentType: {
					"application/json": { type: "object" },
					"multipart/form-data": { type: "object" },
				},
			},
		};

		const info = deriveRequestBodyInfo(op);
		expect(info?.preferredContentType).toBe("application/json");
	});

	test("selects multipart for multipart-only operations", () => {
		const op: NormalizedOperation = {
			key: "POST /speech-to-text",
			method: "POST",
			path: "/speech-to-text",
			tags: [],
			parameters: [],
			requestBody: {
				required: true,
				contentTypes: ["multipart/form-data"],
				schemasByContentType: {
					"multipart/form-data": {
						type: "object",
						properties: { file: { type: "string", format: "binary" } },
					},
				},
			},
		};

		const info = deriveRequestBodyInfo(op);
		expect(info?.hasMultipart).toBe(true);
		expect(info?.preferredContentType).toBe("multipart/form-data");
		expect(info?.preferredSchema).toEqual({
			type: "object",
			properties: { file: { type: "string", format: "binary" } },
		});
	});
});
