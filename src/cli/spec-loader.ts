import SwaggerParser from "@apidevtools/swagger-parser";

import { sha256Hex } from "./crypto.js";
import { parseYamlContent } from "./runtime/compat.js";
import { getSpecId } from "./spec-id.js";
import { stableStringify } from "./stable-json.js";
import type { LoadedSpec, OpenApiDoc, SpecSource } from "./types.js";

export type LoadSpecOptions = {
	spec?: string;
	embeddedSpecText?: string;
};

function isProbablyUrl(input: string): boolean {
	return /^https?:\/\//i.test(input);
}

function parseSpecText(text: string): unknown {
	const trimmed = text.trimStart();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		return JSON.parse(text);
	}

	return parseYamlContent(text);
}

export async function loadSpec(options: LoadSpecOptions): Promise<LoadedSpec> {
	const { spec, embeddedSpecText } = options;

	let source: SpecSource;
	let inputForParser: unknown;

	if (typeof embeddedSpecText === "string") {
		source = "embedded";
		inputForParser = parseSpecText(embeddedSpecText);
	} else if (spec) {
		source = isProbablyUrl(spec) ? "url" : "file";
		inputForParser = spec;
	} else {
		throw new Error(
			"Missing spec. Provide --spec <url|path> or build with an embedded spec.",
		);
	}

	const doc = (await SwaggerParser.dereference(
		// biome-ignore lint/suspicious/noExplicitAny: unknown
		inputForParser as any,
	)) as OpenApiDoc;

	if (!doc || typeof doc !== "object" || typeof doc.openapi !== "string") {
		throw new Error("Loaded spec is not a valid OpenAPI document");
	}

	const fingerprint = await sha256Hex(stableStringify(doc));
	const id = getSpecId({ doc, fingerprint });

	return { source, id, fingerprint, doc };
}
