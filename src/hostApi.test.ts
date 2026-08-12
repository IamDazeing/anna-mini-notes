import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_TOOL_ID, EXECUTA_HANDLE, resolveToolId, STORAGE_KEY } from "./config";
import { loadNotes, saveNotes } from "./notesStorage";
import { summarizeNotes } from "./summarizer";
import type { AnnaApi, Note } from "./types";

describe("Anna Host API boundaries", () => {
  beforeEach(() => {
    window.__ANNA_TOOL_IDS__ = undefined;
  });

  it("loads and saves notes only through anna.storage", async () => {
    const notes: Note[] = [{
      id: "note-1",
      content: "修复登录 bug",
      order: 1,
      createdAt: "2026-08-12T00:00:00.000Z"
    }];
    const get = vi.fn().mockResolvedValue({ value: notes });
    const set = vi.fn().mockResolvedValue({ ok: true });
    const anna = { storage: { get, set }, tools: { invoke: vi.fn() } } as AnnaApi;

    await expect(loadNotes(anna)).resolves.toEqual(notes);
    await saveNotes(anna, notes);

    expect(get).toHaveBeenCalledWith({ key: STORAGE_KEY });
    expect(set).toHaveBeenCalledWith({ key: STORAGE_KEY, value: notes });
  });

  it("routes summaries through anna.tools.invoke with matching identity", async () => {
    const invoke = vi.fn().mockResolvedValue({ summary: "优先修复登录问题。" });
    const anna = {
      storage: { get: vi.fn(), set: vi.fn() },
      tools: { invoke }
    } as AnnaApi;

    await expect(summarizeNotes(anna, [{
      id: "note-1",
      content: "修复登录 bug",
      order: 1,
      createdAt: "2026-08-12T00:00:00.000Z"
    }])).resolves.toBe("优先修复登录问题。");

    expect(invoke).toHaveBeenCalledWith({
      tool_id: DEV_TOOL_ID,
      method: "summarize",
      args: { notes: [{ content: "修复登录 bug", order: 1 }] }
    });
  });

  it("prefers the host-resolved bundled tool identity", async () => {
    const resolvedToolId = "tool-server-minted-mini-notes-abcdef12";
    expect(resolveToolId({ [EXECUTA_HANDLE]: resolvedToolId })).toBe(resolvedToolId);
    window.__ANNA_TOOL_IDS__ = { [EXECUTA_HANDLE]: resolvedToolId };
    const invoke = vi.fn().mockResolvedValue({ summary: "来自 sampling 的总结。" });
    const anna = {
      storage: { get: vi.fn(), set: vi.fn() },
      tools: { invoke }
    } as AnnaApi;

    await summarizeNotes(anna, [{
      id: "note-2",
      content: "准备 Workshop",
      order: 2,
      createdAt: "2026-08-12T00:00:00.000Z"
    }]);

    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      tool_id: resolvedToolId,
      method: "summarize"
    }));
  });
});
