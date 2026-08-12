import fs from "node:fs";

const [releaseTag, platform, archive] = process.argv.slice(2);
if (!releaseTag || !platform || !archive) {
  throw new Error(
    "usage: verify-release-metadata.mjs <release-tag> <platform> <archive>"
  );
}

const executa = JSON.parse(
  fs.readFileSync("executas/mini-notes-summarizer/executa.json", "utf8")
);
const expectedTag = `v${executa.version}`;
if (releaseTag !== expectedTag) {
  throw new Error(`release tag ${releaseTag} must match Executa version ${expectedTag}`);
}

const asset = executa.distribution?.binary_urls?.[platform];
if (!asset) throw new Error(`missing binary_urls.${platform}`);
if (!asset.url.endsWith(`/${expectedTag}/${archive}`)) {
  throw new Error(`binary URL does not match tag/archive: ${asset.url}`);
}

console.log(`verified ${platform}: ${archive}`);
