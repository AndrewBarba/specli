import { Ajv } from "ajv";
import addFormats from "ajv-formats";

export function createAjv() {
	const ajv = new Ajv({
		allErrors: true,
		strict: false,
		coerceTypes: false,
	});

	addFormats.default(ajv);
	return ajv;
}
