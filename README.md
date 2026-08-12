# Anna Mini Notes with LLM Summary

一个严格遵循 Anna 本地开发模型的 Mini Notes App。笔记由 iframe 通过 `AnnaAppRuntime.connect()` 调用 `anna.storage.get/set` 保存；总结由 UI 调用 `anna.tools.invoke`，本地 Executa 再通过 reverse JSON-RPC `sampling/createMessage` 借用 host LLM。没有浏览器本地存储、自建 HTTP 服务、LLM API key 或固定规则总结。

## 核心链路

```text
Anna App iframe
  → AnnaAppRuntime.connect()
  → anna.storage.get / anna.storage.set
  → anna.tools.invoke({ method: "summarize" })
  → Rust Executa invoke
  → reverse JSON-RPC sampling/createMessage
  → host LLM / executa-dev mock fixture
  → InvokeResult.data.summary
  → UI
```

## 项目结构

```text
src/                              React/TypeScript UI 与 Host API 分层
  anna.ts                         runtime connect、storage/tool identity 常量
  notesStorage.ts                 只通过 anna.storage.get/set 读写 notes
  summarizer.ts                   anna.tools.invoke 调用边界
executas/mini-notes-summarizer/   Rust 长驻 JSON-RPC Executa
fixtures/sampling.jsonl           executa dev 的离线 sampling fixture
scripts/test-executa.mjs          完整 reverse-RPC 协议测试及可读证据
scripts/package-executa.*         当前机器原生二进制 archive 打包
.github/workflows/                三平台 GitHub Release workflow
manifest.json                     Anna App manifest
bundle/                           npm run build 生成，未提交
```

`required_executas` 使用 bundled handle `bundled:mini-notes-summarizer`；`ui.host_api.tools` 授权 `required:bundled:mini-notes-summarizer`。本地 harness 将它解析到 `executa.json` 的 `tool_id`，前端开发常量和 Executa `describe.name` 同为 `tool-test-mini-notes-summarizer-12345678`。

## 安装、构建与严格校验

需要 Node.js 22+、npm、Rust stable（`cargo`）。`anna-app dev` 的默认 local bridge 还需要 [`uv`/`uvx`](https://docs.astral.sh/uv/getting-started/installation/) 在 `PATH` 中。无需 Anna 登录。

```bash
npm install
npm run build
npm run validate
```

等价的显式校验命令是：

```bash
npx anna-app validate --strict
```

Vite 会把 React/TypeScript 构建到 `bundle/`；`manifest.json` 的 `ui.bundle.entry` 与 view entry 都是构建后的 `index.html`。Anna runtime SDK 由 harness 在 `/static/anna-apps/_sdk/latest/index.js` 提供，保持在 Vite bundle 之外。

## UI harness：storage 与 tools wiring

```bash
npm run build
npm run dev
# 等价：npx anna-app dev --no-llm
```

打开 CLI 输出的 dashboard URL 和 Mini Notes view：

1. 输入一条笔记并保存。空白输入的保存按钮不可用，成功后输入框清空。
2. 新增多条笔记，检查显示的添加顺序。
3. 删除一条笔记，列表立即更新。
4. 点击 Summarize。

默认 `anna-app dev` storage 是无登录的 legacy in-memory `runtime_state`。它适合验证 Host API wiring，但不承诺刷新外层 dashboard 或重启 dev 后仍保留。实现中没有 `localStorage`、IndexedDB 或文件存储：启动和 Summarize 会调用 `anna.storage.get({key:"mini-notes:notes:v1"})`，新增/删除会调用 `anna.storage.set`。可从 dev dashboard 的 RPC/recording 查看这些方法，也可直接审阅 `src/notesStorage.ts`。

`--no-llm` 只禁用 harness 的 LLM/sampling，**不会跳过** `anna.tools.invoke`。因此点击 Summarize 仍进入真实 App → Executa 路由，但反向 sampling 会按预期失败，UI 显示类似：

```text
[-32603] harness started with --no-llm
```

这证明 UI wiring 被触发，不代表 Executa sampling 实现失败。sampling 的离线成功路径必须按下一节单独测试，不能用 UI fixture 伪造最终 summary。

## Executa sampling 离线测试

```bash
npx anna-app executa dev \
  --dir executas/mini-notes-summarizer \
  --mock-sampling fixtures/sampling.jsonl
```

Windows PowerShell 可直接执行一行：

```powershell
npm run executa:mock
```

不带 `--invoke` 时会进入 REPL，可输入：

```text
describe
health
invoke summarize {"notes":[{"order":1,"content":"明天跟客户 follow up"},{"order":2,"content":"修复登录 bug"},{"order":3,"content":"Workshop 内容想法"}]}
quit
```

仓库的 `npm run executa:mock` 会直接以 one-shot 方式执行上述三条示例笔记，规避不同 shell 对 JSON 引号的差异。

CLI 会先完成 `initialize` + `describe`，invoke 时读取 `fixtures/sampling.jsonl`。若使用 CLI 的 trace/recording，查找 `sampling/createMessage` 即可确认 reverse RPC 曾被发起；request 的 `params.messages[0].content.text` 包含当前 notes，`metadata.executa_invoke_id` 和 `context.invoke_id` 关联父 invoke。

仓库还提供完全自动、无需 CLI mock 格式推断的协议测试：

```bash
npm run test:executa
```

脚本启动真实 Rust 进程，依次发送 `initialize`、`describe`、`invoke`、`health`、`shutdown`；当它从 stdout 收到 `sampling/createMessage` 时才回送 mock host response。最终打印完整 `sampling_request`，这是 summary 路径的直接证据。它还断言 UI 收到的 summary 与 sampling response 一致，而非 Tool 本地拼接。

## 手动 JSON-RPC 测试

先编译：

```bash
cargo build --manifest-path executas/mini-notes-summarizer/Cargo.toml
```

Executa 是长驻进程，stdin/stdout 每行一个 JSON。先发送：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2.0","capabilities":{}}}
{"jsonrpc":"2.0","id":2,"method":"describe"}
{"jsonrpc":"2.0","id":3,"method":"invoke","params":{"tool":"summarize","arguments":{"notes":[{"order":1,"content":"修复登录 bug"}]},"invoke_id":"manual-1","context":{"invoke_id":"manual-1"}}}
```

第三条会让 Tool 输出一个新的 `sampling/createMessage` request。复制其中的 `id`，回送：

```json
{"jsonrpc":"2.0","id":"<sampling request id>","result":{"role":"assistant","content":{"type":"text","text":"优先修复登录问题。"},"model":"manual-mock","stopReason":"endTurn"}}
```

随后 Tool 返回原始 invoke id `3` 的 `InvokeResult`。stdout 仅包含 JSON-RPC；日志进入 stderr；每个 response 会 flush；主 reader 持续到 EOF。invoke 在 worker thread 等待时，唯一 stdin reader 仍会把 host response 分派给对应 sampling request，因此不会死锁。

## 本机 Executa binary archive

Windows x86_64：

```powershell
npm run package:executa
```

macOS（脚本自动识别 ARM64 或 x86_64）：

```bash
./scripts/package-executa.sh
```

产物分别为 `.zip` 或 `.tar.gz`，archive root 结构：

```text
manifest.json
bin/mini-notes-summarizer[.exe]
```

根 `manifest.json` 声明 `name`、`version`、`runtime.binary.entrypoint` 和执行权限。发布物是 Rust 原生单文件二进制，不要求用户安装解释器。

可对解压后的二进制复用 smoke test：

```bash
EXECUTA_BIN=/absolute/path/to/bin/mini-notes-summarizer npm run test:executa
```

PowerShell：

```powershell
$env:EXECUTA_BIN="C:\absolute\path\bin\mini-notes-summarizer.exe"
npm run test:executa
```

## GitHub Actions Release

`.github/workflows/release-executa.yml` 支持两种触发：

- 推送 `v*` tag；
- Actions 页面手动 `workflow_dispatch`，填写 tag。

一次 workflow 在 macOS ARM runner 上分别构建 ARM64 和交叉构建 x86_64，在 Windows runner 构建 x86_64。每个平台都先执行 `scripts/test-executa.mjs`（覆盖 describe 以及真正的 reverse sampling invoke），再验证 archive 成员。最终 release job 把三者上传为 **GitHub Release assets**：

```text
mini-notes-summarizer-darwin-arm64.tar.gz
mini-notes-summarizer-darwin-x86_64.tar.gz
mini-notes-summarizer-windows-x86_64.zip
```

Workflow artifacts 仅是 job 间传输，不能替代 Release assets。

## 各层关系

- `manifest.json` 是 App 能力边界：声明 UI bundle/view、storage/tools Host API grant，以及必需的 bundled Executa。
- `bundle/` 是 iframe 加载的静态产物，只能经 Anna runtime 调 Host API。
- `executa.json` 让 harness 发现本地 Tool，并描述 binary distribution 的三平台 URL/entrypoint。
- Anna storage / APS KV 是 notes 的平台持久化抽象；本地无登录 harness 使用 legacy in-memory `runtime_state` 实现同一 `get/set` wiring。
- sampling 是 Executa 借用 host LLM 的 reverse JSON-RPC 能力；v2 handshake、`host_capabilities:["llm.sample"]` 和父 `invoke_id` correlation 缺一不可。
- binary archive 把 Executa 协议进程和安装 manifest 放在一起，让 Agent 按平台下载、解析 entrypoint 并执行。

## 已知边界

- 本地 UI harness 的 legacy storage 不保证外层 dashboard 刷新或 dev 重启后的持久性。
- `--no-llm` 下 Summarize 失败是专门保留的验收行为；成功 mock sampling 在 `executa dev` 中验证。
- `executa.json` 的 GitHub URL 含 `OWNER` 占位符；首次发布仓库后应替换为实际 owner，或在 Anna 发布生命周期中使用实际 release asset URL。

## License

MIT
