import { spawn } from "node:child_process";

const args = JSON.stringify({
  notes: [
    { order: 1, content: "明天跟客户 follow up" },
    { order: 2, content: "修复登录 bug" },
    { order: 3, content: "Workshop 内容想法" }
  ]
});
const cli = new URL("../node_modules/@anna-ai/cli/dist/cli.js", import.meta.url);
const child = spawn(
  process.execPath,
  [
    cli.pathname.replace(/^\/(.:\/)/, "$1"),
    "executa", "dev",
    "--dir", "executas/mini-notes-summarizer",
    "--mock-sampling", "fixtures/sampling.jsonl",
    "--invoke", "summarize",
    "--args", args
  ],
  { stdio: "inherit", shell: false }
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
