export function getArgValue(argv: string[], key: string): string | undefined {
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a) continue;

		if (a === key) return argv[i + 1];
		if (a.startsWith(`${key}=`)) return a.slice(key.length + 1);
	}
	return undefined;
}

export function hasAnyArg(argv: string[], names: string[]): boolean {
	return argv.some((a) => a && names.includes(a));
}
