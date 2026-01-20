/**
 * Bun macro: loads an OpenAPI spec from a URL or file path at bundle-time.
 * The spec text is inlined into the bundle.
 */
export async function loadSpec(spec: string): Promise<string> {
	if (!spec) throw new Error("loadSpec macro: missing spec path/URL");

	if (/^https?:\/\//i.test(spec)) {
		const res = await fetch(spec);
		if (!res.ok) {
			throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
		}
		return await res.text();
	}

	return await Bun.file(spec).text();
}
