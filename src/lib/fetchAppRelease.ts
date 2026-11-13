import { createServerFn } from "@tanstack/start";
import { z } from "zod";

// Fetches the dist.zip asset from a GitHub Release and returns its file contents.
// Env vars required (in .env.local — never commit):
//   APP_GITHUB_REPO  = owner/repo   e.g. networklogic-uk/donorbook
//   APP_GITHUB_TOKEN = GitHub PAT with repo read access

const InputSchema = z.object({ version: z.string() });

export type AppReleaseFile = { path: string; dataBase64: string };

export const fetchAppRelease = createServerFn({ method: "GET" })
  .validator(InputSchema)
  .handler(async ({ data }) => {
    const repo  = process.env.APP_GITHUB_REPO;
    const token = process.env.APP_GITHUB_TOKEN;

    if (!repo)  throw new Error("APP_GITHUB_REPO not set in .env.local");
    if (!token) throw new Error("APP_GITHUB_TOKEN not set in .env.local");

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    // 1. Find the release by tag
    const releaseRes = await fetch(
      `https://api.github.com/repos/${repo}/releases/tags/${data.version}`,
      { headers }
    );
    if (!releaseRes.ok) {
      const body = await releaseRes.text();
      throw new Error(`GitHub release not found for ${data.version}: ${body}`);
    }
    const release = await releaseRes.json() as { assets: { name: string; url: string }[] };

    // 2. Find the dist ZIP asset
    const asset = release.assets.find(
      (a) => a.name === `donorbook-dist-${data.version}.zip`
    );
    if (!asset) {
      throw new Error(
        `dist ZIP not found in release ${data.version}. ` +
        `Expected asset: donorbook-dist-${data.version}.zip. ` +
        `Found: ${release.assets.map((a) => a.name).join(", ") || "none"}`
      );
    }

    // 3. Download the asset (private repo — must use API, not browser URL)
    const dlRes = await fetch(asset.url, {
      headers: { ...headers, Accept: "application/octet-stream" },
    });
    if (!dlRes.ok) throw new Error(`Failed to download dist ZIP: ${dlRes.status}`);

    const buffer = await dlRes.arrayBuffer();

    // 4. Unzip in-process using fflate (server-side)
    const { unzipSync } = await import("fflate");
    const unzipped = unzipSync(new Uint8Array(buffer));

    // 5. Return each file as base64 so the client can include it in the package ZIP
    const files: AppReleaseFile[] = Object.entries(unzipped).map(([path, data]) => ({
      path,
      dataBase64: Buffer.from(data).toString("base64"),
    }));

    return { files, assetName: asset.name };
  });
