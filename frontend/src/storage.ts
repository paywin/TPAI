import type { Script } from "./types";
export const API_BASE =
  "__TAURI_INTERNALS__" in window ? "http://127.0.0.1:8765" : "";
const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("pulso", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("data");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const r = db.transaction("data").objectStore("data").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function cachePut(key: string, data: unknown) {
  const db = await database;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("data", "readwrite");
    tx.objectStore("data").put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(API_BASE + "/api/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(
      "Falha ao salvar ou carregar dados. Verifique o motor local e os campos.",
    );
  return response.json();
}
export function validateImport(input: unknown): Script[] {
  const list = Array.isArray(input) ? input : [input];
  if (list.length > 200) throw new Error("Importe até 200 roteiros por vez.");
  return list.map((s) => {
    if (
      !s ||
      typeof s.title !== "string" ||
      !s.title.trim() ||
      s.title.length > 200 ||
      !Array.isArray(s.blocks) ||
      s.blocks.length < 1 ||
      s.blocks.length > 200
    )
      throw new Error("Arquivo de roteiro inválido.");
    return {
      id: crypto.randomUUID(),
      title: s.title,
      program: String(s.program || "").slice(0, 200),
      updated: new Date().toISOString(),
      status: "Em edição",
      blocks: s.blocks.map((b: Record<string, unknown>) => {
        if (typeof b.text !== "string" || b.text.length > 100000)
          throw new Error("Texto inválido ou muito extenso.");
        return {
          id: crypto.randomUUID(),
          title: String(b.title || "Bloco").slice(0, 200),
          text: b.text,
          kind: String(b.kind || "roteiro").slice(0, 100),
          duration: /^\d{1,3}:[0-5]\d$/.test(String(b.duration))
            ? String(b.duration)
            : "00:30",
        };
      }),
    } as Script;
  });
}
