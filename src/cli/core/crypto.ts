export async function sha256Hex(text: string): Promise<string> {
	const data = new TextEncoder().encode(text);
	const hash = await crypto.subtle.digest("SHA-256", data);
	const bytes = new Uint8Array(hash);

	let out = "";
	for (const b of bytes) out += b.toString(16).padStart(2, "0");
	return out;
}
