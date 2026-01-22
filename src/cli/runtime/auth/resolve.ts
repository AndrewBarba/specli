import type { AuthScheme } from "../../auth-schemes.js";

export type AuthInputs = {
	flagAuthScheme?: string;
	profileAuthScheme?: string;
	embeddedAuthScheme?: string;
	hasStoredToken?: boolean;
};

const BEARER_COMPATIBLE_KINDS = new Set([
	"http-bearer",
	"oauth2",
	"openIdConnect",
]);

export function resolveAuthScheme(
	authSchemes: AuthScheme[],
	required: import("../../auth-requirements.js").AuthSummary,
	inputs: AuthInputs,
): string | undefined {
	// Priority: CLI flag > profile > embedded default
	if (inputs.flagAuthScheme) return inputs.flagAuthScheme;

	if (
		inputs.profileAuthScheme &&
		authSchemes.some((s) => s.key === inputs.profileAuthScheme)
	) {
		return inputs.profileAuthScheme;
	}

	if (
		inputs.embeddedAuthScheme &&
		authSchemes.some((s) => s.key === inputs.embeddedAuthScheme)
	) {
		return inputs.embeddedAuthScheme;
	}

	// If operation requires exactly one scheme, choose it.
	const alts = required.alternatives;
	if (alts.length === 1 && alts[0]?.length === 1) return alts[0][0]?.key;

	// Otherwise if there is only one scheme in spec, pick it.
	if (authSchemes.length === 1) return authSchemes[0]?.key;

	// If user has a stored token and operation accepts a bearer-compatible scheme,
	// automatically pick the first one that matches.
	if (inputs.hasStoredToken && alts.length > 0) {
		for (const alt of alts) {
			if (alt.length !== 1) continue;
			const key = alt[0]?.key;
			const scheme = authSchemes.find((s) => s.key === key);
			if (scheme && BEARER_COMPATIBLE_KINDS.has(scheme.kind)) {
				return key;
			}
		}
	}

	return undefined;
}
