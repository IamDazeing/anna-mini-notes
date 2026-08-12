import { STORAGE_KEY } from "./config";
import type { AnnaApi, Note } from "./types";

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<Note>;
  return typeof note.id === "string"
    && typeof note.content === "string"
    && typeof note.order === "number"
    && typeof note.createdAt === "string";
}

export async function loadNotes(anna: AnnaApi): Promise<Note[]> {
  const result = await anna.storage.get({ key: STORAGE_KEY });
  const raw = result?.value;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isNote).sort((a, b) => a.order - b.order);
}

export async function saveNotes(anna: AnnaApi, notes: Note[]): Promise<void> {
  await anna.storage.set({ key: STORAGE_KEY, value: notes });
}
