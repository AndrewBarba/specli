import SwaggerParser from "@apidevtools/swagger-parser";

import { sha256Hex } from "../core/crypto.js";
import { stableStringify } from "../core/stable-json.js";
import type { LoadedSpec, OpenApiDoc, SpecSource } from "../core/types.js";
import { parseYamlContent, readFileText } from "../runtime/compat.js";
import { getSpecId } from "./id.js";

/**
 * Custom filesystem interface for reading files.
 */
export type SpecFs = {
	/** Read file contents as UTF-8 string */
	readFile: (path: string) => Promise<string>;
};

export type LoadSpecOptions = {
	spec?: string;
	embeddedSpecText?: string;
	/** Custom filesystem for reading spec files */
	fs?: SpecFs;
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
	const { spec, embeddedSpecText, fs } = options;

	let source: SpecSource;
	let inputForParser: unknown;

	if (typeof embeddedSpecText === "string") {
		source = "embedded";
		inputForParser = parseSpecText(embeddedSpecText);
	} else if (spec) {
		const isUrl = isProbablyUrl(spec);
		source = isUrl ? "url" : "file";

		if (!isUrl && fs) {
			// Use custom filesystem to read file, then parse
			const content = await fs.readFile(spec);
			inputForParser = parseSpecText(content);
		} else if (!isUrl) {
			// Use default filesystem to read file, then parse
			// This ensures consistent behavior between custom and default fs
			const content = await readFileText(spec);
			inputForParser = parseSpecText(content);
		} else {
			// URL - let SwaggerParser handle fetching
			inputForParser = spec;
		}
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
