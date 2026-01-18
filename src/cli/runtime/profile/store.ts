import { YAML } from "bun";

export type Profile = {
	name: string;
	server?: string;
	authScheme?: string;
	// For apiKey schemes we also need the apiKey name/in from spec to inject,
	// but that is discoverable from the spec at runtime.
};

export type ProfilesFile = {
	profiles: Profile[];
	defaultProfile?: string;
};

function configDir(): string {
	// Keep it simple (v1). We can move to env-paths later.
	const home = process.env.HOME;
	if (!home) throw new Error("Missing HOME env var");
	return `${home}/.config/opencli`;
}

function configPathJson(): string {
	return `${configDir()}/profiles.json`;
}

function configPathYaml(): string {
	return `${configDir()}/profiles.yaml`;
}

export async function readProfiles(): Promise<ProfilesFile> {
	const jsonPath = configPathJson();
	const yamlPath = configPathYaml();

	const jsonFile = Bun.file(jsonPath);
	const yamlFile = Bun.file(yamlPath);

	const file = (await jsonFile.exists())
		? jsonFile
		: (await yamlFile.exists())
			? yamlFile
			: null;

	if (!file) return { profiles: [] };

	const text = await file.text();
	let parsed: unknown;
	try {
		parsed = YAML.parse(text) as unknown;
	} catch {
		parsed = JSON.parse(text) as unknown;
	}

	const obj =
		parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: {};
	const profiles = Array.isArray(obj.profiles)
		? (obj.profiles as Profile[])
		: [];

	return {
		profiles: profiles.filter(Boolean),
		defaultProfile:
			typeof obj.defaultProfile === "string"
				? (obj.defaultProfile as string)
				: undefined,
	};
}

export async function writeProfiles(data: ProfilesFile): Promise<void> {
	const dir = configDir();
	await Bun.$`mkdir -p ${dir}`;
	await Bun.write(configPathJson(), JSON.stringify(data, null, 2));
}

export function getProfile(
	data: ProfilesFile,
	name: string | undefined,
): Profile | undefined {
	const wanted = name ?? data.defaultProfile;
	if (!wanted) return undefined;
	return data.profiles.find((p) => p?.name === wanted);
}

export function upsertProfile(
	data: ProfilesFile,
	profile: Profile,
): ProfilesFile {
	const profiles = data.profiles.filter((p) => p.name !== profile.name);
	profiles.push(profile);
	profiles.sort((a, b) => a.name.localeCompare(b.name));
	return { ...data, profiles };
}

export function removeProfile(data: ProfilesFile, name: string): ProfilesFile {
	return { ...data, profiles: data.profiles.filter((p) => p.name !== name) };
}
