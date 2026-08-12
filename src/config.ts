export const STORAGE_KEY = "mini-notes:notes:v1";
export const DEV_TOOL_ID = "tool-test-mini-notes-summarizer-12345678";
export const TOOL_METHOD = "summarize";

declare global {
  interface Window {
    __ANNA_TOOL_IDS__?: Record<string, string>;
  }
}

export function resolveToolId(): string {
  return window.__ANNA_TOOL_IDS__?.["mini-notes-summarizer"] ?? DEV_TOOL_ID;
}

