import { YAML } from "bun";

export type LoadOpenApiMacroInput = {
	spec: string;
};

function parseMaybeYaml(text: string): unknown {
	const trimmed = text.trimStart();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		return JSON.parse(text);
	}

	return YAML.parse(text);
}

// Bun macro: this runs at bundle-time when imported with `with { type: "macro" }`.
// Keep the return value JSON-serializable.
export async function loadOpenApiSpecText(
	input: LoadOpenApiMacroInput,
): Promise<string> {
	if (!input?.spec) throw new Error("loadOpenApiSpecText: missing input.spec");

	if (/^https?:\/\//i.test(input.spec)) {
		const res = await fetch(input.spec);
		if (!res.ok)
			throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
		return await res.text();
	}

	return await Bun.file(input.spec).text();
}

export type LoadOpenApiFromEnvInput = {
	// Name of env var to read at bundle-time.
	// The value should be a URL or a local file path.
	env: string;
	fallbackSpec?: string;
};

export async function loadOpenApiSpecTextFromEnv(
	input: LoadOpenApiFromEnvInput,
): Promise<string> {
	if (!input?.env)
		throw new Error("loadOpenApiSpecTextFromEnv: missing input.env");

	const spec = process.env[input.env] ?? input.fallbackSpec;
	if (!spec) {
		throw new Error(
			`Missing env var ${input.env}. Set it at build-time or pass fallbackSpec.`,
		);
	}

	return await loadOpenApiSpecText({ spec });
}

// Convenience: return parsed object if you prefer embedding objects.
export async function loadOpenApiSpecObject(
	input: LoadOpenApiMacroInput,
): Promise<unknown> {
	return parseMaybeYaml(await loadOpenApiSpecText(input));
}

export async function loadOpenApiSpecObjectFromEnv(
	input: LoadOpenApiFromEnvInput,
): Promise<unknown> {
	return parseMaybeYaml(await loadOpenApiSpecTextFromEnv(input));
}
