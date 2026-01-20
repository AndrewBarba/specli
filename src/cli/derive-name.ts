const RESERVED_NAMES = [
	"exec",
	"compile",
	"profile",
	"auth",
	"help",
	"version",
];

/**
 * Derives a clean binary name from an OpenAPI spec.
 * Priority:
 *   1. info.title (kebab-cased, sanitized)
 *   2. Host from spec URL (if URL provided)
 *   3. Fallback to "specli"
 */
export async function deriveBinaryName(spec: string): Promise<string> {
	try {
		// Load spec to extract title
		const text = await loadSpecText(spec);
		const doc = parseSpec(text);

		const title = doc?.info?.title;
		if (title && typeof title === "string") {
			const name = sanitizeName(title);
			if (name) return name;
		}
	} catch {
		// Fall through to URL-based derivation
	}

	// Try to derive from URL host
	if (/^https?:\/\//i.test(spec)) {
		try {
			const url = new URL(spec);
			const hostParts = url.hostname.split(".");
			// Use first meaningful segment (skip www, api prefixes)
			const meaningful = hostParts.find(
				(p) => p !== "www" && p !== "api" && p.length > 2,
			);
			if (meaningful) {
				const name = sanitizeName(meaningful);
				if (name) return name;
			}
		} catch {
			// Invalid URL, fall through
		}
	}

	// Fallback
	return "specli";
}

async function loadSpecText(spec: string): Promise<string> {
	if (/^https?:\/\//i.test(spec)) {
		const res = await fetch(spec);
		if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
		return res.text();
	}
	return Bun.file(spec).text();
}

function parseSpec(text: string): { info?: { title?: string } } | null {
	try {
		const trimmed = text.trimStart();
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			return JSON.parse(text);
		}
		// Use Bun's YAML parser
		const { YAML } = globalThis.Bun ?? {};
		if (YAML?.parse) {
			return YAML.parse(text) as { info?: { title?: string } };
		}
		// Fallback: only JSON supported
		return null;
	} catch {
		return null;
	}
}

/**
 * Convert title to valid binary name:
 * - kebab-case
 * - lowercase
 * - remove invalid chars
 * - max 32 chars
 * - avoid reserved names
 */
function sanitizeName(input: string): string {
	let name = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with dash
		.replace(/^-+|-+$/g, "") // Trim leading/trailing dashes
		.slice(0, 32); // Limit length

	if (RESERVED_NAMES.includes(name)) {
		name = `${name}-cli`;
	}

	return name;
}
