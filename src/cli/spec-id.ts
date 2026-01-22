import { kebabCase } from "./strings.js";
import type { LoadedSpec } from "./types.js";

export function getSpecId(
	loaded: Pick<LoadedSpec, "doc" | "fingerprint">,
): string {
	const title = loaded.doc.info?.title;
	const fromTitle = title ? kebabCase(title) : "";
	if (fromTitle) return fromTitle;

	return loaded.fingerprint.slice(0, 12);
}
