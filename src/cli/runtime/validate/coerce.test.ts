import { describe, expect, test } from "bun:test";

import { coerceArrayInput, coerceValue } from "./coerce.ts";

describe("coerceValue", () => {
	test("returns string as-is for string type", () => {
		expect(coerceValue("hello", "string")).toBe("hello");
	});

	test("returns string as-is for unknown type", () => {
		expect(coerceValue("hello", "unknown")).toBe("hello");
	});

	test("parses integer type", () => {
		expect(coerceValue("42", "integer")).toBe(42);
		expect(coerceValue("-10", "integer")).toBe(-10);
		expect(coerceValue("0", "integer")).toBe(0);
	});

	test("throws for invalid integer", () => {
		expect(() => coerceValue("abc", "integer")).toThrow("Expected integer");
	});

	test("truncates decimal for integer type (parseInt behavior)", () => {
		// parseInt("12.5", 10) returns 12 - this is expected JS behavior
		expect(coerceValue("12.5", "integer")).toBe(12);
	});

	test("parses number type", () => {
		expect(coerceValue("42", "number")).toBe(42);
		expect(coerceValue("3.14", "number")).toBe(3.14);
		expect(coerceValue("-0.5", "number")).toBe(-0.5);
	});

	test("throws for invalid number", () => {
		expect(() => coerceValue("abc", "number")).toThrow("Expected number");
	});

	test("parses boolean type", () => {
		expect(coerceValue("true", "boolean")).toBe(true);
		expect(coerceValue("false", "boolean")).toBe(false);
	});

	test("throws for invalid boolean", () => {
		expect(() => coerceValue("yes", "boolean")).toThrow("Expected boolean");
		expect(() => coerceValue("1", "boolean")).toThrow("Expected boolean");
	});

	test("parses object type as JSON", () => {
		expect(coerceValue('{"a":1}', "object")).toEqual({ a: 1 });
	});

	test("throws for invalid object JSON", () => {
		expect(() => coerceValue("not json", "object")).toThrow(
			"Expected JSON object",
		);
	});
});

describe("coerceArrayInput", () => {
	test("parses comma-separated values", () => {
		expect(coerceArrayInput("a,b,c", "string")).toEqual(["a", "b", "c"]);
	});

	test("trims whitespace in comma-separated values", () => {
		expect(coerceArrayInput("a, b, c", "string")).toEqual(["a", "b", "c"]);
	});

	test("parses JSON array", () => {
		expect(coerceArrayInput('["a","b","c"]', "string")).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	test("coerces array items to specified type", () => {
		expect(coerceArrayInput("1,2,3", "integer")).toEqual([1, 2, 3]);
		expect(coerceArrayInput('["1","2","3"]', "integer")).toEqual([1, 2, 3]);
	});

	test("returns empty array for empty string", () => {
		expect(coerceArrayInput("", "string")).toEqual([]);
		expect(coerceArrayInput("   ", "string")).toEqual([]);
	});

	test("throws for invalid JSON array", () => {
		expect(() => coerceArrayInput("[invalid", "string")).toThrow(
			"Expected JSON array",
		);
	});

	test("treats non-array JSON as comma-separated string", () => {
		// If it doesn't start with '[', it's treated as comma-separated
		// '{"a":1}' doesn't start with '[', so it's treated as a single value
		expect(coerceArrayInput('{"a":1}', "string")).toEqual(['{"a":1}']);
	});
});
