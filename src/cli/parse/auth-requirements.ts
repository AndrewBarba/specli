import type { SecurityRequirement } from "../core/types.js";
import type { AuthScheme } from "./auth-schemes.js";

export type AuthRequirement = {
	key: string;
	scopes: string[];
};

export type AuthSummary = {
	// Alternatives: any one of these sets is sufficient.
	alternatives: AuthRequirement[][];
};

function isSecurityRequirement(value: unknown): value is SecurityRequirement {
	if (!value || typeof value !== "object") return false;
	if (Array.isArray(value)) return false;

	for (const [k, v] of Object.entries(value)) {
		if (typeof k !== "string") return false;
		if (!Array.isArray(v)) return false;
		if (!v.every((s) => typeof s === "string")) return false;
	}

	return true;
}

function normalizeSecurity(value: unknown): {
	requirements: SecurityRequirement[];
	source: "none" | "empty" | "non-empty";
} {
	if (value == null) return { requirements: [], source: "none" };
	if (!Array.isArray(value)) return { requirements: [], source: "none" };

	const reqs = value.filter(isSecurityRequirement);
	if (reqs.length === 0) return { requirements: [], source: "empty" };
	return { requirements: reqs, source: "non-empty" };
}

export function summarizeAuth(
	operationSecurity: unknown,
	globalSecurity: unknown,
	knownSchemes: AuthScheme[],
): AuthSummary {
	// Per spec:
	// - operation security overrides root
	// - empty array [] means "no auth"
	const op = normalizeSecurity(operationSecurity);
	if (op.source === "non-empty") {
		return { alternatives: toAlternatives(op.requirements, knownSchemes) };
	}
	if (op.source === "empty") {
		return { alternatives: [] };
	}

	const global = normalizeSecurity(globalSecurity);
	if (global.source === "non-empty") {
		return { alternatives: toAlternatives(global.requirements, knownSchemes) };
	}

	return { alternatives: [] };
}

function toAlternatives(
	requirements: SecurityRequirement[],
	knownSchemes: AuthScheme[],
): AuthRequirement[][] {
	const known = new Set(knownSchemes.map((s) => s.key));

	return requirements.map((req) => {
		const out: AuthRequirement[] = [];
		for (const [key, scopes] of Object.entries(req)) {
			out.push({
				key,
				scopes: Array.isArray(scopes) ? scopes : [],
			});
		}

		// Stable order.
		out.sort((a, b) => a.key.localeCompare(b.key));

		// Prefer known schemes first.
		out.sort((a, b) => {
			const ak = known.has(a.key) ? 0 : 1;
			const bk = known.has(b.key) ? 0 : 1;
			if (ak !== bk) return ak - bk;
			return a.key.localeCompare(b.key);
		});

		return out;
	});
}
