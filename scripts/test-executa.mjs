import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "executas", "mini-notes-summarizer", "Cargo.toml");
const binary = process.env.EXECUTA_BIN;
const child = binary
  ? spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] })
  : spawn("cargo", ["run", "--quiet", "--manifest-path", manifestPath], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"]
    });

child.stderr.on("data", (chunk) => process.stderr.write(chunk));
const lines = createInterface({ input: child.stdout });
const pending = new Map();
let samplingEvidence;

function send(frame) {
  child.stdin.write(`${JSON.stringify(frame)}\n`);
}

function request(id, method, params = {}) {
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 12_000);
    pending.set(String(id), (frame) => {
      clearTimeout(timer);
      resolve(frame);
    });
  });
  send({ jsonrpc: "2.0", id, method, params });
  return promise;
}

lines.on("line", (line) => {
  let frame;
  try {
    frame = JSON.parse(line);
  } catch {
    throw new Error(`non-JSON stdout: ${line}`);
  }
  if (frame.method === "sampling/createMessage") {
    samplingEvidence = frame;
    send({
      jsonrpc: "2.0",
      id: frame.id,
      result: {
        role: "assistant",
        content: { type: "text", text: "客户跟进与登录修复最优先，随后整理 Workshop 构思。" },
        model: "protocol-test-model",
        stopReason: "endTurn"
      }
    });
    return;
  }
  const resolver = pending.get(String(frame.id));
  if (resolver) {
    pending.delete(String(frame.id));
    resolver(frame);
  }
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const initialized = await request(1, "initialize", { protocolVersion: "2.0", capabilities: {} });
  assert(initialized.result?.protocolVersion === "2.0", "initialize did not negotiate v2");
  assert(initialized.result?.client_capabilities?.sampling, "initialize did not advertise sampling");

  const described = await request(2, "describe");
  assert(described.result?.name === "tool-test-mini-notes-summarizer-12345678", "describe identity mismatch");
  assert(described.result?.host_capabilities?.includes("llm.sample"), "manifest lacks llm.sample");
  assert(Array.isArray(described.result?.tools?.[0]?.parameters), "tool parameters[] missing");

  const invoked = await request(3, "invoke", {
    tool: "summarize",
    arguments: {
      notes: [
        { order: 1, content: "明天跟客户 follow up" },
        { order: 2, content: "修复登录 bug" },
        { order: 3, content: "Workshop 内容想法" }
      ]
    },
    context: { invoke_id: "invoke-protocol-test" },
    invoke_id: "invoke-protocol-test"
  });
  assert(samplingEvidence?.method === "sampling/createMessage", "invoke emitted no reverse sampling request");
  assert(samplingEvidence?.params?.metadata?.invoke_id === "invoke-protocol-test", "sampling metadata lost invoke_id");
  assert(samplingEvidence?.params?.context?.invoke_id === "invoke-protocol-test", "sampling context lost invoke_id");
  assert(invoked.result?.success === true, "invoke failed");
  assert(invoked.result?.data?.summary?.includes("客户跟进"), "summary was not taken from sampling result");

  const health = await request(4, "health");
  assert(health.result?.status === "ready", "health is not ready");

  const shutdown = await request(5, "shutdown");
  assert(shutdown.result?.ok === true, "shutdown failed");
  console.log(JSON.stringify({
    ok: true,
    checked: ["initialize", "describe", "invoke", "sampling/createMessage", "health", "shutdown"],
    sampling_request: samplingEvidence
  }, null, 2));
} finally {
  child.stdin.end();
  child.kill();
}

