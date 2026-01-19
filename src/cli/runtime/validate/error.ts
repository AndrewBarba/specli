import type { ErrorObject } from "ajv";

export function formatAjvErrors(
	errors: ErrorObject[] | null | undefined,
): string {
	if (!errors?.length) return "Invalid input";

	return errors
		.map((e) => {
			const path = e.instancePath || e.schemaPath || "";

			if (
				e.keyword === "required" &&
				e.params &&
				typeof e.params === "object" &&
				"missingProperty" in e.params
			) {
				const missing = String(
					(e.params as { missingProperty?: unknown }).missingProperty,
				);
				const where = e.instancePath || "/";
				return `${where} missing required property '${missing}'`.trim();
			}

			const msg = e.message || "invalid";
			return `${path} ${msg}`.trim();
		})
		.join("\n");
}
