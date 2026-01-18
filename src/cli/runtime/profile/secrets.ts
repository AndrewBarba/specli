import { secrets } from "bun";

export type SecretKey = {
	service: string;
	name: string;
};

export function secretServiceForSpec(specId: string): string {
	return `opencli:${specId}`;
}

export function tokenSecretKey(specId: string, profile: string): SecretKey {
	return {
		service: secretServiceForSpec(specId),
		name: `profile:${profile}:token`,
	};
}

export async function setToken(
	specId: string,
	profile: string,
	token: string,
): Promise<void> {
	const key = tokenSecretKey(specId, profile);
	await secrets.set({ service: key.service, name: key.name, value: token });
}

export async function getToken(
	specId: string,
	profile: string,
): Promise<string | null> {
	const key = tokenSecretKey(specId, profile);
	return await secrets.get({ service: key.service, name: key.name });
}

export async function deleteToken(
	specId: string,
	profile: string,
): Promise<boolean> {
	const key = tokenSecretKey(specId, profile);
	return await secrets.delete({ service: key.service, name: key.name });
}
