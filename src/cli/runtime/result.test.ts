import { describe, expect, test } from "bun:test";
import {
	type CurlResult,
	type DataResult,
	type ErrorResult,
	getBody,
	getStatus,
	isCurl,
	isData,
	isError,
	isOk,
	isPrepared,
	isSuccess,
	isValidation,
	type PreparedResult,
	type SuccessResult,
	type ValidationResult,
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
	request: mockPreparedRequest,
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
};

const validationResult: ValidationResult = {
	type: "validation",
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

describe("type guards", () => {
	test("isSuccess", () => {
		expect(isSuccess(successResult)).toBe(true);
		expect(isSuccess(errorHttpResult)).toBe(false);
		expect(isSuccess(validationResult)).toBe(false);
	});

	test("isError", () => {
		expect(isError(errorHttpResult)).toBe(true);
		expect(isError(errorNoResponseResult)).toBe(true);
		expect(isError(successResult)).toBe(false);
	});

	test("isValidation", () => {
		expect(isValidation(validationResult)).toBe(true);
		expect(isValidation(errorHttpResult)).toBe(false);
	});

	test("isPrepared", () => {
		expect(isPrepared(preparedResult)).toBe(true);
		expect(isPrepared(successResult)).toBe(false);
	});

	test("isCurl", () => {
		expect(isCurl(curlResult)).toBe(true);
		expect(isCurl(preparedResult)).toBe(false);
	});

	test("isData", () => {
		expect(isData(dataResult)).toBe(true);
		expect(isData(successResult)).toBe(false);
	});
});

describe("isOk", () => {
	test("success with 2xx is ok", () => {
		expect(isOk(successResult)).toBe(true);
	});

	test("success with non-2xx is not ok", () => {
		const result: SuccessResult = {
			...successResult,
			response: { ...successResult.response, ok: false, status: 400 },
		};
		expect(isOk(result)).toBe(false);
	});

	test("error is not ok", () => {
		expect(isOk(errorHttpResult)).toBe(false);
		expect(isOk(errorNoResponseResult)).toBe(false);
	});

	test("validation is not ok", () => {
		expect(isOk(validationResult)).toBe(false);
	});

	test("prepared is ok", () => {
		expect(isOk(preparedResult)).toBe(true);
	});

	test("curl is ok", () => {
		expect(isOk(curlResult)).toBe(true);
	});

	test("data is ok", () => {
		expect(isOk(dataResult)).toBe(true);
	});
});

describe("getBody", () => {
	test("success returns response body", () => {
		expect(getBody(successResult)).toEqual({ id: 123, name: "Test" });
	});

	test("error with response returns response body", () => {
		expect(getBody(errorHttpResult)).toEqual({ error: "Not found" });
	});

	test("error without response returns undefined", () => {
		expect(getBody(errorNoResponseResult)).toBeUndefined();
	});

	test("data returns data", () => {
		expect(getBody(dataResult)).toEqual({ resources: ["users", "posts"] });
	});

	test("prepared returns undefined", () => {
		expect(getBody(preparedResult)).toBeUndefined();
	});
});

describe("getStatus", () => {
	test("success returns status", () => {
		expect(getStatus(successResult)).toBe(200);
	});

	test("error with response returns status", () => {
		expect(getStatus(errorHttpResult)).toBe(404);
	});

	test("error without response returns undefined", () => {
		expect(getStatus(errorNoResponseResult)).toBeUndefined();
	});

	test("other types return undefined", () => {
		expect(getStatus(preparedResult)).toBeUndefined();
		expect(getStatus(curlResult)).toBeUndefined();
		expect(getStatus(dataResult)).toBeUndefined();
	});
});
