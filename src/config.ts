export const STORAGE_KEY = "mini-notes:notes:v1";
export const EXECUTA_HANDLE = "mini-notes-summarizer";
export const DEV_TOOL_ID = "tool-test-mini-notes-summarizer-12345678";
export const TOOL_METHOD = "summarize";

declare global {
  interface Window {
    __ANNA_TOOL_IDS__?: Record<string, string>;
  }
}

export function resolveToolId(mapping?: Record<string, string>): string {
  const resolved = mapping ?? window.__ANNA_TOOL_IDS__;
  return resolved?.[EXECUTA_HANDLE] ?? DEV_TOOL_ID;
}
