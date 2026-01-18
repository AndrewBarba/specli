import type { AuthScheme } from "../../auth-schemes.ts";

export type AuthInputs = {
	profileAuthScheme?: string;
	flagAuthScheme?: string;
};

export function resolveAuthScheme(
	authSchemes: AuthScheme[],
	required: import("../../auth-requirements.ts").AuthSummary,
	inputs: AuthInputs,
): string | undefined {
	// Explicit flag wins (but may still be validated later when applying).
	if (inputs.flagAuthScheme) return inputs.flagAuthScheme;

	if (
		inputs.profileAuthScheme &&
		authSchemes.some((s) => s.key === inputs.profileAuthScheme)
	) {
		return inputs.profileAuthScheme;
	}

	// If operation requires exactly one scheme, choose it.
	const alts = required.alternatives;
	if (alts.length === 1 && alts[0]?.length === 1) return alts[0][0]?.key;

	// Otherwise if there is only one scheme in spec, pick it.
	if (authSchemes.length === 1) return authSchemes[0]?.key;

	return undefined;
}
