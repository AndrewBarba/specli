/**
 * AI SDK integration for specli
 *
 * @example
 * ```ts
 * import { specli } from "specli/ai";
 * import { generateText } from "ai";
 *
 * const result = await generateText({
 *   model: yourModel,
 *   tools: {
 *     api: specli({ spec: "https://api.example.com/openapi.json" }),
 *   },
 *   prompt: "List all users",
 * });
 * ```
 */

export { clearCache, type SpecliToolOptions, specli } from "./tools.ts";
