import { FormEvent, useEffect, useMemo, useState } from "react";
import { connectAnna } from "./anna";
import { loadNotes, saveNotes } from "./notesStorage";
import { summarizeNotes } from "./summarizer";
import type { AnnaApi, Note } from "./types";

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function App() {
  const [anna, setAnna] = useState<AnnaApi | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState("正在连接 Anna…");
  const [busy, setBusy] = useState(true);

  const nextOrder = useMemo(
    () => notes.reduce((max, note) => Math.max(max, note.order), 0) + 1,
    [notes]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const runtime = await connectAnna();
        const stored = await loadNotes(runtime);
        if (!active) return;
        setAnna(runtime);
        setNotes(stored);
        setStatus("已连接 · notes 由 Anna storage 保存");
      } catch (error) {
        if (active) setStatus(`连接失败：${errorText(error)}`);
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function addNote(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!anna || !content || busy) return;
    const note: Note = {
      id: crypto.randomUUID(),
      content,
      order: nextOrder,
      createdAt: new Date().toISOString()
    };
    const updated = [...notes, note];
    setBusy(true);
    try {
      await saveNotes(anna, updated);
      setNotes(updated);
      setDraft("");
      setSummary("");
      setStatus(`已通过 anna.storage.set 保存第 ${note.order} 条笔记`);
    } catch (error) {
      setStatus(`保存失败：${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteNote(id: string) {
    if (!anna || busy) return;
    const updated = notes.filter((note) => note.id !== id);
    setBusy(true);
    try {
      await saveNotes(anna, updated);
      setNotes(updated);
      setSummary("");
      setStatus("已通过 anna.storage.set 更新 notes");
    } catch (error) {
      setStatus(`删除失败：${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onSummarize() {
    if (!anna || notes.length === 0 || busy) return;
    setBusy(true);
    setSummary("");
    setStatus("正在调用 anna.tools.invoke → Executa → sampling/createMessage…");
    try {
      // Re-read storage at the action boundary, making persisted Anna state
      // the explicit source of truth for the summary.
      const stored = await loadNotes(anna);
      setNotes(stored);
      const text = await summarizeNotes(anna, stored);
      setSummary(text);
      setStatus("总结完成 · 内容来自 host sampling");
    } catch (error) {
      setStatus(`总结失败：${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header>
        <p className="eyebrow">ANNA APP</p>
        <h1>Mini Notes</h1>
        <p className="subtitle">把零散想法放在一处，再借用 host LLM 快速收束。</p>
      </header>

      <form className="composer" onSubmit={addNote}>
        <label htmlFor="note-input">新笔记</label>
        <div className="composer-row">
          <textarea
            id="note-input"
            value={draft}
            maxLength={500}
            rows={3}
            placeholder="例如：明天跟客户 follow up"
            onChange={(event) => setDraft(event.target.value)}
            disabled={!anna || busy}
          />
          <button className="primary" type="submit" disabled={!anna || busy || !draft.trim()}>
            保存
          </button>
        </div>
      </form>

      <section className="notes-section" aria-labelledby="notes-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">STORAGE</p>
            <h2 id="notes-title">笔记 · {notes.length}</h2>
          </div>
          <button className="summary-button" onClick={onSummarize} disabled={!anna || busy || notes.length === 0}>
            {busy ? "处理中…" : "Summarize"}
          </button>
        </div>

        {notes.length === 0 ? (
          <div className="empty">还没有笔记。先记下一件值得继续推进的小事。</div>
        ) : (
          <ol className="notes-list">
            {notes.map((note) => (
              <li key={note.id}>
                <span className="order">{String(note.order).padStart(2, "0")}</span>
                <p>{note.content}</p>
                <button className="delete" onClick={() => void deleteNote(note.id)} disabled={busy} aria-label={`删除笔记 ${note.order}`}>
                  删除
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {summary && (
        <section className="summary-card" aria-live="polite">
          <p className="eyebrow">LLM SUMMARY</p>
          <p>{summary}</p>
        </section>
      )}

      <footer className="status" aria-live="polite">{status}</footer>
    </main>
  );
}

