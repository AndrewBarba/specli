import SwaggerParser from "@apidevtools/swagger-parser";
import { YAML } from "bun";

import { sha256Hex } from "./crypto.ts";
import { getSpecId } from "./spec-id.ts";
import { stableStringify } from "./stable-json.ts";
import type { LoadedSpec, OpenApiDoc, SpecSource } from "./types.ts";

export type LoadSpecOptions = {
	spec?: string;
	embeddedSpecText?: string;
	embeddedSpecObject?: unknown;
};

function isProbablyUrl(input: string): boolean {
	return /^https?:\/\//i.test(input);
}

function parseSpecText(text: string): unknown {
	const trimmed = text.trimStart();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		return JSON.parse(text);
	}

	return YAML.parse(text);
}

export async function loadSpec(options: LoadSpecOptions): Promise<LoadedSpec> {
	const { spec, embeddedSpecText, embeddedSpecObject } = options;

	let source: SpecSource;
	let inputForParser: unknown;

	if (typeof embeddedSpecObject !== "undefined") {
		source = "embedded";
		inputForParser = embeddedSpecObject;
	} else if (typeof embeddedSpecText === "string") {
		source = "embedded";
		inputForParser = parseSpecText(embeddedSpecText);
	} else {
		if (!spec) {
			throw new Error(
				"Missing spec. Provide --spec <url|path> or build with an embedded spec.",
			);
		}

		source = isProbablyUrl(spec) ? "url" : "file";
		inputForParser = spec;
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
