import { isBun } from "../compat.ts";

const bunLiteral = "bun" as const;

export type SecretKey = {
	service: string;
	name: string;
};

export function secretServiceForSpec(specId: string): string {
	return `specli:${specId}`;
}

export function tokenSecretKey(specId: string, profile: string): SecretKey {
	return {
		service: secretServiceForSpec(specId),
		name: `profile:${profile}:token`,
	};
}

/**
 * Store a token securely.
 * In Bun: uses the native secrets store (system keychain)
 * In Node.js: secrets are not supported, warns user
 */
export async function setToken(
	specId: string,
	profile: string,
	token: string,
): Promise<void> {
	if (!isBun) {
		console.warn(
			"Warning: Secure token storage requires Bun. Token will not be persisted.",
		);
		console.warn(
			"Use --bearer-token <token> flag instead when running with Node.js.",
		);
		return;
	}

	const { secrets } = await import(bunLiteral);
	const key = tokenSecretKey(specId, profile);
	await secrets.set({ service: key.service, name: key.name, value: token });
}

/**
 * Retrieve a stored token.
 * In Bun: retrieves from the native secrets store
 * In Node.js: returns null (secrets not supported)
 */
export async function getToken(
	specId: string,
	profile: string,
): Promise<string | null> {
	if (!isBun) {
		return null;
	}

	const { secrets } = await import(bunLiteral);
	const key = tokenSecretKey(specId, profile);
	return await secrets.get({ service: key.service, name: key.name });
}

/**
 * Delete a stored token.
 * In Bun: removes from the native secrets store
 * In Node.js: returns false (secrets not supported)
 */
export async function deleteToken(
	specId: string,
	profile: string,
): Promise<boolean> {
	if (!isBun) {
		console.warn(
			"Warning: Secure token storage requires Bun. No token to delete.",
		);
		return false;
	}

	const { secrets } = await import(bunLiteral);
	const key = tokenSecretKey(specId, profile);
	return await secrets.delete({ service: key.service, name: key.name });
}
