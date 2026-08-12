// Served by the Anna host at runtime and intentionally external to the Vite bundle.
// @ts-expect-error Anna's host SDK is not a local TypeScript package.
import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";
import type { AnnaApi } from "./types";

export async function connectAnna(): Promise<AnnaApi> {
  return (await AnnaAppRuntime.connect()) as AnnaApi;
}
