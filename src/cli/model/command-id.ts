import { kebabCase } from "../core/strings.js";

export type CommandIdParts = {
	specId: string;
	resource: string;
	action: string;
	operationKey: string;
};

export function buildCommandId(parts: CommandIdParts): string {
	// operationKey is the ultimate disambiguator, but we keep the id readable.
	// Example:
	//   contacts-api:contacts:get:GET-/contacts/{id}
	const op = kebabCase(parts.operationKey.replace(/\s+/g, "-"));
	return `${parts.specId}:${kebabCase(parts.resource)}:${kebabCase(parts.action)}:${op}`;
}
