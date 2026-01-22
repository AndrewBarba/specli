import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Bun macro: reads the version from package.json at bundle-time.
 */
export function version(): string {
	const currentDir = dirname(fileURLToPath(import.meta.url));
	const packageJsonPath = join(currentDir, "../../package.json");
	const content = readFileSync(packageJsonPath, "utf-8");
	const packageJson = JSON.parse(content);
	return packageJson.version;
}
