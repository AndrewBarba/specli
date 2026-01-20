import type { AuthScheme } from "../../auth-schemes.ts";

export type AuthInputs = {
	flagAuthScheme?: string;
	profileAuthScheme?: string;
	embeddedAuthScheme?: string;
};

export function resolveAuthScheme(
	authSchemes: AuthScheme[],
	required: import("../../auth-requirements.ts").AuthSummary,
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

	return undefined;
}
