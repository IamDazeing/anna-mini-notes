import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectAnna } from "./anna";
import App from "./App";
import { DEV_TOOL_ID, STORAGE_KEY } from "./config";
import type { AnnaApi, Note } from "./types";

vi.mock("./anna", () => ({ connectAnna: vi.fn() }));

describe("Mini Notes UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.__ANNA_TOOL_IDS__ = undefined;
  });

  it("creates, lists, summarizes, and deletes notes through Anna Host APIs", async () => {
    let persisted: Note[] = [];
    const get = vi.fn(async () => ({ value: persisted }));
    const set = vi.fn(async ({ value }: { key: string; value: unknown }) => {
      persisted = value as Note[];
      return { ok: true };
    });
    const invoke = vi.fn().mockResolvedValue({
      summary: "先跟进客户，再修复登录问题。"
    });
    const anna = { storage: { get, set }, tools: { invoke } } as AnnaApi;
    vi.mocked(connectAnna).mockResolvedValue(anna);

    render(<App />);
    await screen.findByText("已连接 · notes 由 Anna storage 保存");

    const input = screen.getByRole("textbox", { name: "新笔记" });
    const save = screen.getByRole("button", { name: "保存" });
    expect(save.hasAttribute("disabled")).toBe(true);

    fireEvent.change(input, { target: { value: "   " } });
    expect(save.hasAttribute("disabled")).toBe(true);

    fireEvent.change(input, { target: { value: "明天跟客户 follow up" } });
    fireEvent.click(save);

    await screen.findByText("明天跟客户 follow up");
    expect((input as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByText("01")).not.toBeNull();
    expect(set).toHaveBeenLastCalledWith({
      key: STORAGE_KEY,
      value: [expect.objectContaining({ content: "明天跟客户 follow up", order: 1 })]
    });

    fireEvent.click(screen.getByRole("button", { name: "Summarize" }));
    await screen.findByText("先跟进客户，再修复登录问题。");
    expect(get).toHaveBeenCalledWith({ key: STORAGE_KEY });
    expect(invoke).toHaveBeenCalledWith({
      tool_id: DEV_TOOL_ID,
      method: "summarize",
      args: { notes: [{ content: "明天跟客户 follow up", order: 1 }] }
    });

    fireEvent.click(screen.getByRole("button", { name: "删除笔记 1" }));
    await waitFor(() => {
      expect(screen.queryByText("明天跟客户 follow up")).toBeNull();
    });
    expect(screen.queryByText("还没有笔记。先记下一件值得继续推进的小事。")).not.toBeNull();
    expect(set).toHaveBeenLastCalledWith({ key: STORAGE_KEY, value: [] });
  });
});
