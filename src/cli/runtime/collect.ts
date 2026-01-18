export function collectRepeatable(
	value: string,
	previous: string[] | undefined,
): string[] {
	return [...(previous ?? []), value];
}
