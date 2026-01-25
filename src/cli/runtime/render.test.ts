import { describe, expect, test } from "bun:test";
import {
	getExitCode,
	getOutputStream,
	renderToJSON,
	renderToString,
	toJSON,
} from "./render.js";
import type {
	CurlResult,
	DataResult,
	ErrorResult,
	PreparedResult,
	SuccessResult,
	ValidationResult,
} from "./result.js";

const mockPreparedRequest = {
	method: "GET",
	url: "https://api.example.com/users/123",
	headers: { Authorization: "Bearer token" },
	curl: "curl -X GET https://api.example.com/users/123",
};

const successResult: SuccessResult = {
	type: "success",
	request: mockPreparedRequest,
	response: {
		status: 200,
		ok: true,
		headers: { "content-type": "application/json" },
		body: { id: 123, name: "Test" },
		rawBody: '{"id":123,"name":"Test"}',
	},
	timing: {
		startedAt: "2024-01-01T00:00:00.000Z",
		durationMs: 100,
	},
};

const errorHttpResult: ErrorResult = {
	type: "error",
	message: "Not found",
	resource: "users",
	action: "get",
	response: {
		status: 404,
		ok: false,
		headers: {},
		body: { error: "Not found" },
		rawBody: '{"error":"Not found"}',
	},
};

const errorNoResponseResult: ErrorResult = {
	type: "error",
	message: "Network error",
	resource: "users",
	action: "get",
};

const validationResult: ValidationResult = {
	type: "validation",
	resource: "users",
	action: "create",
	errors: [
		{ path: "body.name", message: "Required field" },
		{ path: "query.limit", message: "Must be a number" },
	],
};

const preparedResult: PreparedResult = {
	type: "prepared",
	request: mockPreparedRequest,
};

const curlResult: CurlResult = {
	type: "curl",
	curl: "curl -X GET https://api.example.com/users",
	request: mockPreparedRequest,
};

const dataResult: DataResult = {
	type: "data",
	data: { resources: ["users", "posts"] },
};

describe("toJSON", () => {
	test("success result", () => {
		const json = toJSON(successResult);
		expect(json).toEqual({
			ok: true,
			status: 200,
			body: { id: 123, name: "Test" },
		});
	});

	test("error with response", () => {
		const json = toJSON(errorHttpResult);
		expect(json).toEqual({
			ok: false,
			error: "Not found",
			status: 404,
			body: { error: "Not found" },
		});
	});

	test("error without response", () => {
		const json = toJSON(errorNoResponseResult);
		expect(json).toEqual({
			ok: false,
			error: "Network error",
		});
	});

	test("validation result", () => {
		const json = toJSON(validationResult);
		expect(json).toEqual({
			ok: false,
			error: "Validation failed",
			errors: [
				{ path: "body.name", message: "Required field" },
				{ path: "query.limit", message: "Must be a number" },
			],
		});
	});

	test("prepared result", () => {
		const json = toJSON(preparedResult);
		expect(json).toEqual({
			ok: true,
			request: mockPreparedRequest,
		});
	});

	test("curl result", () => {
		const json = toJSON(curlResult);
		expect(json).toEqual({
			ok: true,
			curl: "curl -X GET https://api.example.com/users",
		});
	});

	test("data result", () => {
		const json = toJSON(dataResult);
		expect(json).toEqual({
			ok: true,
			data: { resources: ["users", "posts"] },
		});
	});
});

describe("renderToJSON", () => {
	test("compact by default", () => {
		const output = renderToJSON(successResult);
		expect(output).toBe(
			'{"ok":true,"status":200,"body":{"id":123,"name":"Test"}}\n',
		);
	});

	test("pretty print when requested", () => {
		const output = renderToJSON(successResult, { prettyPrint: true });
		expect(output).toContain("{\n");
		expect(output).toContain('"ok": true');
	});
});

describe("renderToString", () => {
	test("success renders body as JSON", () => {
		const output = renderToString(successResult);
		expect(output).toContain('"id": 123');
		expect(output).toContain('"name": "Test"');
	});

	test("success with string body renders as-is", () => {
		const result: SuccessResult = {
			...successResult,
			response: { ...successResult.response, body: "plain text" },
		};
		const output = renderToString(result);
		expect(output).toBe("plain text\n");
	});

	test("error with response renders status and body", () => {
		const output = renderToString(errorHttpResult);
		expect(output).toContain("HTTP 404");
		expect(output).toContain('"error": "Not found"');
	});

	test("error without response renders message with help hint", () => {
		const output = renderToString(errorNoResponseResult);
		expect(output).toContain("error: Network error");
		expect(output).toContain("Run 'users get --help'");
	});

	test("validation renders errors with help hint", () => {
		const output = renderToString(validationResult);
		expect(output).toContain("Validation errors:");
		expect(output).toContain("body.name: Required field");
		expect(output).toContain("Run 'users create --help'");
	});

	test("prepared renders request details", () => {
		const output = renderToString(preparedResult);
		expect(output).toContain("GET https://api.example.com/users/123");
		expect(output).toContain("Headers:");
		expect(output).toContain("Authorization: Bearer token");
	});

	test("curl renders just the curl command", () => {
		const output = renderToString(curlResult);
		expect(output).toBe("curl -X GET https://api.example.com/users\n");
	});

	test("data renders as JSON", () => {
		const output = renderToString(dataResult);
		expect(output).toContain('"resources"');
		expect(output).toContain('"users"');
	});

	test("json format uses renderToJSON", () => {
		const output = renderToString(successResult, { format: "json" });
		expect(output).toBe(
			'{"ok":true,"status":200,"body":{"id":123,"name":"Test"}}\n',
		);
	});
});

describe("getExitCode", () => {
	test("success with ok response returns 0", () => {
		expect(getExitCode(successResult)).toBe(0);
	});

	test("success with non-ok response returns 1", () => {
		const result: SuccessResult = {
			...successResult,
			response: { ...successResult.response, ok: false },
		};
		expect(getExitCode(result)).toBe(1);
	});

	test("error returns 1", () => {
		expect(getExitCode(errorHttpResult)).toBe(1);
		expect(getExitCode(errorNoResponseResult)).toBe(1);
	});

	test("validation returns 1", () => {
		expect(getExitCode(validationResult)).toBe(1);
	});

	test("prepared returns 0", () => {
		expect(getExitCode(preparedResult)).toBe(0);
	});

	test("curl returns 0", () => {
		expect(getExitCode(curlResult)).toBe(0);
	});

	test("data returns 0", () => {
		expect(getExitCode(dataResult)).toBe(0);
	});
});

describe("getOutputStream", () => {
	test("success with ok response returns stdout", () => {
		expect(getOutputStream(successResult)).toBe("stdout");
	});

	test("success with non-ok response returns stderr", () => {
		const result: SuccessResult = {
			...successResult,
			response: { ...successResult.response, ok: false },
		};
		expect(getOutputStream(result)).toBe("stderr");
	});

	test("error returns stderr", () => {
		expect(getOutputStream(errorHttpResult)).toBe("stderr");
		expect(getOutputStream(errorNoResponseResult)).toBe("stderr");
	});

	test("validation returns stderr", () => {
		expect(getOutputStream(validationResult)).toBe("stderr");
	});

	test("prepared returns stdout", () => {
		expect(getOutputStream(preparedResult)).toBe("stdout");
	});

	test("curl returns stdout", () => {
		expect(getOutputStream(curlResult)).toBe("stdout");
	});

	test("data returns stdout", () => {
		expect(getOutputStream(dataResult)).toBe("stdout");
	});
});
