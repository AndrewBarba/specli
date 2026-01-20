import { parseYamlContent, readFileText } from "./compat.ts";

export type BodyInput =
	| { kind: "none" }
	| { kind: "data"; data: string }
	| { kind: "file"; path: string };

export async function loadBody(
	input: BodyInput,
): Promise<{ raw: string; json?: unknown } | undefined> {
	if (input.kind === "none") return undefined;
	if (input.kind === "data") return { raw: input.data };

	const text = await readFileText(input.path);
	return { raw: text };
}

export function parseBodyAsJsonOrYaml(text: string): unknown {
	const trimmed = text.trimStart();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		return JSON.parse(text);
	}
	return parseYamlContent(text);
}
