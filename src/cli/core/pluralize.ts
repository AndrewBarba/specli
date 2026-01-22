const IRREGULAR: Record<string, string> = {
	person: "people",
	man: "men",
	woman: "women",
	child: "children",
	tooth: "teeth",
	foot: "feet",
	mouse: "mice",
	goose: "geese",
};

const UNCOUNTABLE = new Set([
	"metadata",
	"information",
	"equipment",
	"money",
	"series",
	"species",
]);

export function pluralize(word: string): string {
	const w = word.trim();
	if (!w) return w;

	const lower = w.toLowerCase();
	if (UNCOUNTABLE.has(lower)) return lower;
	if (IRREGULAR[lower]) return IRREGULAR[lower];

	// already plural-ish
	if (lower.endsWith("s")) return lower;

	if (/[bcdfghjklmnpqrstvwxyz]y$/.test(lower)) {
		return lower.replace(/y$/, "ies");
	}

	if (/(ch|sh|x|z)$/.test(lower)) {
		return `${lower}es`;
	}

	return `${lower}s`;
}
