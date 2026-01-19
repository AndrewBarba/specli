#!/usr/bin/env bun

const specs = [
	{
		name: "vercel",
		url: "https://api.vercel.com/copper/_openapi.json",
	},
	{
		name: "digitalocean",
		url: "https://raw.githubusercontent.com/digitalocean/openapi/main/specification/DigitalOcean-public.v2.yaml",
	},
	// {
	// 	name: "stripe",
	// 	url: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.yaml",
	// },
	// NOTE: OpenAI spec is not reliably fetchable via raw.githubusercontent.com
	// in some environments (intermittent 404). Keep it out of the default smoke
	// list to avoid flaky CI.
	// {
	// 	name: "openai",
	// 	url: "https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml",
	// },
] as const;

type Result = {
	spec: string;
	ok: boolean;
	ms: number;
	error?: string;
};

const results: Result[] = [];

for (const spec of specs) {
	const start = performance.now();
	try {
		console.log(spec.url);
		await Bun.$`bun ./src/entry.ts --spec ${spec.url} __schema --json --min > /dev/null`;
		results.push({
			spec: spec.name,
			ok: true,
			ms: Math.round(performance.now() - start),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		results.push({
			spec: spec.name,
			ok: false,
			ms: Math.round(performance.now() - start),
			error: message,
		});
	}
}

const allOk = results.every((r) => r.ok);
for (const r of results) {
	if (r.ok) {
		process.stdout.write(`ok  ${r.spec} (${r.ms}ms)\n`);
	} else {
		process.stdout.write(`fail ${r.spec} (${r.ms}ms)\n${r.error}\n`);
	}
}

process.exitCode = allOk ? 0 : 1;
