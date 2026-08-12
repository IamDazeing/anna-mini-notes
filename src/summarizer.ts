import { resolveToolId, TOOL_METHOD } from "./config";
import type { AnnaApi, Note } from "./types";

type SummaryPayload = { summary?: unknown };

export async function summarizeNotes(anna: AnnaApi, notes: Note[]): Promise<string> {
  const reply = await anna.tools.invoke({
    tool_id: resolveToolId(),
    method: TOOL_METHOD,
    args: {
      notes: notes.map(({ content, order }) => ({ content, order }))
    }
  });

  // Current runtime unwraps InvokeResult.data; tolerate the full envelope too
  // so a protocol recording or older harness remains easy to inspect.
  const outer = reply as { data?: SummaryPayload } & SummaryPayload;
  const summary = outer?.data?.summary ?? outer?.summary;
  if (typeof summary !== "string" || !summary.trim()) {
    throw new Error("Executa returned no summary text");
  }
  return summary.trim();
}
