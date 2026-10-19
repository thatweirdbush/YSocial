// Downloads the BE swagger document (Development only) into docs/swagger.json.
// Dev cert: `dotnet dev-certs https --trust` (`npm run api:fetch` runs Node with --use-system-ca); alternatively
// start Node with NODE_EXTRA_CA_CERTS=<PEM file> (read at Node start, never put it in .env*).
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://localhost:49895").replace(/\/+$/, "");
const url = `${base}/swagger/v1/swagger.json`;
const target = resolve(process.cwd(), "docs/swagger.json");

try {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const document = await response.json();
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(`swagger written: ${target} (${Object.keys(document.paths ?? {}).length} paths)`);
} catch (error) {
  console.error(`api:fetch failed for ${url}: ${error instanceof Error ? error.message : error}`);
  console.error("Is the BE running in Development & is its dev cert trusted (dotnet dev-certs https --trust)?");
  process.exit(1);
}
