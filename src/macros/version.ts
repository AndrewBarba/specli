import { join } from "node:path";

/**
 * Bun macro: reads the version from package.json at bundle-time.
 */
export function version(): string {
	const packageJsonPath = join(import.meta.dir, "../../package.json");
	const packageJson = require(packageJsonPath);
	return packageJson.version;
}
