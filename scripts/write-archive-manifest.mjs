import fs from "node:fs";

const [platform, destination] = process.argv.slice(2);
if (!platform || !destination) {
  throw new Error("usage: write-archive-manifest.mjs <platform> <destination>");
}
const windows = platform === "windows-x86_64";
const entrypoint = windows
  ? "bin/mini-notes-summarizer.exe"
  : "bin/mini-notes-summarizer";
const manifest = {
  name: "tool-test-mini-notes-summarizer-12345678",
  version: "1.0.0",
  runtime: {
    binary: {
      entrypoint,
      permissions: { [entrypoint]: "0o755" }
    }
  }
};
fs.writeFileSync(destination, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

