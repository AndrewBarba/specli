import type { ErrorObject } from "ajv";

export function formatAjvErrors(
	errors: ErrorObject[] | null | undefined,
): string {
	if (!errors?.length) return "Invalid input";

	return errors
		.map((e) => {
			const path = e.instancePath || e.schemaPath || "";
			const msg = e.message || "invalid";
			return `${path} ${msg}`.trim();
		})
		.join("\n");
}
