use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{self, BufRead, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const TOOL_ID: &str = "tool-test-mini-notes-summarizer-12345678";
const VERSION: &str = "1.0.0";

type Pending = Arc<Mutex<HashMap<String, mpsc::Sender<Value>>>>;
type Output = Arc<Mutex<io::Stdout>>;

static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

fn manifest() -> Value {
    json!({
        "name": TOOL_ID,
        "display_name": "Mini Notes Summarizer",
        "version": VERSION,
        "description": "Summarizes a list of notes by borrowing the host LLM through sampling/createMessage.",
        "author": "Mini Notes contributors",
        "license": "MIT",
        "host_capabilities": ["llm.sample"],
        "tools": [{
            "name": "summarize",
            "description": "Summarize ordered notes into a concise, useful paragraph.",
            "timeout": 90,
            "streaming": false,
            "parameters": [{
                "name": "notes",
                "type": "array",
                "items": {"type": "object"},
                "description": "Ordered notes shaped as [{content, order}].",
                "required": true
            }]
        }],
        "runtime": {"type": "binary"}
    })
}

fn write_frame(output: &Output, frame: &Value) -> Result<(), String> {
    let encoded = serde_json::to_string(frame).map_err(|error| error.to_string())?;
    let mut stdout = output
        .lock()
        .map_err(|_| "stdout lock poisoned".to_string())?;
    stdout
        .write_all(format!("{encoded}\n").as_bytes())
        .map_err(|error| error.to_string())?;
    stdout.flush().map_err(|error| error.to_string())
}

fn response(id: Value, result: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "result": result})
}

fn error_response(id: Value, code: i64, message: impl Into<String>) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {"code": code, "message": message.into()}
    })
}

fn id_key(id: &Value) -> String {
    serde_json::to_string(id).unwrap_or_else(|_| "null".to_string())
}

fn next_reverse_id() -> String {
    let serial = REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("sampling-{nanos}-{serial}")
}

fn note_lines(notes: &Value) -> Result<Vec<String>, String> {
    let items = notes
        .as_array()
        .ok_or_else(|| "arguments.notes must be an array".to_string())?;
    if items.is_empty() {
        return Err("at least one note is required".to_string());
    }

    let mut lines = Vec::with_capacity(items.len());
    for (index, note) in items.iter().enumerate() {
        let content = note
            .get("content")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .ok_or_else(|| format!("notes[{index}].content must be a non-empty string"))?;
        let order = note
            .get("order")
            .and_then(Value::as_u64)
            .unwrap_or((index + 1) as u64);
        lines.push(format!("{order}. {content}"));
    }
    Ok(lines)
}

fn summarize(
    notes: &Value,
    invoke_id: &str,
    pending: &Pending,
    output: &Output,
) -> Result<Value, String> {
    let lines = note_lines(notes)?;
    let reverse_id = next_reverse_id();
    let (tx, rx) = mpsc::channel();
    pending
        .lock()
        .map_err(|_| "pending map lock poisoned".to_string())?
        .insert(id_key(&Value::String(reverse_id.clone())), tx);

    let prompt = format!(
        "请总结下面按添加顺序排列的笔记。提炼主要事项、共同主题和下一步重点。使用与笔记相同的主要语言，输出一段不超过 120 个汉字（或 100 个英文词）的简洁总结，不要添加标题或前言。\n\n{}",
        lines.join("\n")
    );
    let reverse_request = json!({
        "jsonrpc": "2.0",
        "id": reverse_id,
        "method": "sampling/createMessage",
        "params": {
            "messages": [{
                "role": "user",
                "content": {"type": "text", "text": prompt}
            }],
            "maxTokens": 256,
            "systemPrompt": "You are a concise notes assistant. Base the summary only on the supplied notes.",
            "includeContext": "none",
            "metadata": {
                "invoke_id": invoke_id,
                "executa_invoke_id": invoke_id,
                "tool": "summarize",
                "note_count": lines.len()
            },
            "context": {"invoke_id": invoke_id},
            "_clientTimeoutS": 75.0
        }
    });

    if let Err(error) = write_frame(output, &reverse_request) {
        pending
            .lock()
            .ok()
            .and_then(|mut map| map.remove(&id_key(&Value::String(reverse_id))));
        return Err(format!("could not send sampling/createMessage: {error}"));
    }

    let host_response = rx.recv_timeout(Duration::from_secs(75)).map_err(|error| {
        pending
            .lock()
            .ok()
            .and_then(|mut map| map.remove(&id_key(&Value::String(reverse_id.clone()))));
        format!("sampling/createMessage did not complete: {error}")
    })?;

    if let Some(host_error) = host_response.get("error") {
        let code = host_error
            .get("code")
            .and_then(Value::as_i64)
            .unwrap_or(-32603);
        let message = host_error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("host sampling error");
        return Err(format!("sampling/createMessage [{code}] {message}"));
    }

    let result = host_response
        .get("result")
        .ok_or_else(|| "sampling response has no result".to_string())?;
    let summary = result
        .pointer("/content/text")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| "sampling response has no content.text".to_string())?;

    Ok(json!({
        "summary": summary,
        "model": result.get("model").cloned().unwrap_or(Value::Null),
        "usage": result.get("usage").cloned().unwrap_or(Value::Null),
        "stopReason": result.get("stopReason").cloned().unwrap_or(Value::Null),
        "note_count": lines.len()
    }))
}

fn invoke(params: &Value, pending: &Pending, output: &Output) -> Value {
    let started = Instant::now();
    let tool = params.get("tool").and_then(Value::as_str).unwrap_or("");
    if tool != "summarize" {
        return json!({"success": false, "error": format!("unknown tool: {tool}")});
    }

    let arguments = params.get("arguments").unwrap_or(&Value::Null);
    let notes = arguments.get("notes").unwrap_or(&Value::Null);
    let invoke_id = params
        .get("invoke_id")
        .and_then(Value::as_str)
        .or_else(|| params.pointer("/context/invoke_id").and_then(Value::as_str))
        .unwrap_or("");

    match summarize(notes, invoke_id, pending, output) {
        Ok(data) => json!({
            "success": true,
            "data": data,
            "duration_ms": started.elapsed().as_millis()
        }),
        Err(error) => json!({
            "success": false,
            "error": error,
            "duration_ms": started.elapsed().as_millis()
        }),
    }
}

fn handle_request(message: Value, pending: Pending, output: Output) {
    let id = message.get("id").cloned().unwrap_or(Value::Null);
    let method = message.get("method").and_then(Value::as_str).unwrap_or("");
    let params = message.get("params").cloned().unwrap_or_else(|| json!({}));

    let frame = match method {
        "initialize" => {
            let offered = params
                .get("protocolVersion")
                .and_then(Value::as_str)
                .unwrap_or("1.1");
            let protocol = if offered == "2.0" { "2.0" } else { offered };
            response(
                id,
                json!({
                    "protocolVersion": protocol,
                    "serverInfo": {"name": TOOL_ID, "version": VERSION},
                    "client_capabilities": if protocol == "2.0" { json!({"sampling": {}}) } else { json!({}) },
                    "capabilities": {}
                }),
            )
        }
        "describe" => response(id, manifest()),
        "health" => response(
            id,
            json!({
                "status": "ready",
                "message": "",
                "details": {"version": VERSION}
            }),
        ),
        "invoke" => response(id, invoke(&params, &pending, &output)),
        "shutdown" => response(id, json!({"ok": true})),
        _ => error_response(id, -32601, format!("method not found: {method}")),
    };

    if message.get("id").is_some() {
        if let Err(error) = write_frame(&output, &frame) {
            eprintln!("failed to write JSON-RPC response: {error}");
        }
    }
}

fn main() {
    let output = Arc::new(Mutex::new(io::stdout()));
    let pending: Pending = Arc::new(Mutex::new(HashMap::new()));

    for raw in io::stdin().lock().lines() {
        let line = match raw {
            Ok(line) if !line.trim().is_empty() => line,
            Ok(_) => continue,
            Err(error) => {
                eprintln!("stdin read error: {error}");
                break;
            }
        };

        let message: Value = match serde_json::from_str(&line) {
            Ok(message) => message,
            Err(_) => {
                let _ = write_frame(&output, &error_response(Value::Null, -32700, "parse error"));
                continue;
            }
        };

        // Responses without a method belong to a reverse RPC previously
        // issued by an invoke worker. The single stdin reader dispatches them
        // while the worker waits, avoiding the classic sampling deadlock.
        if message.get("method").is_none() {
            if let Some(id) = message.get("id") {
                let sender = pending
                    .lock()
                    .ok()
                    .and_then(|mut map| map.remove(&id_key(id)));
                if let Some(sender) = sender {
                    let _ = sender.send(message);
                } else {
                    eprintln!("unmatched reverse-RPC response id={id}");
                }
            }
            continue;
        }

        let pending_for_thread = Arc::clone(&pending);
        let output_for_thread = Arc::clone(&output);
        thread::spawn(move || handle_request(message, pending_for_thread, output_for_thread));
    }
}
