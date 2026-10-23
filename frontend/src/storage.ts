import { uid } from "./id";
import type { Script } from "./types";
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = indexedDB.open("pulso", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("data");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (error) { reject(error); }
  });
  return database;
}
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const r = db.transaction("data").objectStore("data").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function cachePut(key: string, data: unknown) {
  const db = await openDatabase();
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
  let response: Response;
  try {
    response = await fetch("/api/" + path, {
      method, headers: {"Content-Type": "application/json"},
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(8000),
    });
  } catch { throw new Error("Backend indisponível. Execute npm start na raiz do projeto e abra localhost:8787."); }
  if (!response.ok) throw new Error(`O servidor recusou a operação (${response.status}). Verifique os campos e o endereço localhost.`);
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Este endereço serve somente o frontend. Execute npm start na raiz para iniciar também o backend.");
  return response.json() as Promise<T>;
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
      id: uid(),
      title: s.title,
      program: String(s.program || "").slice(0, 200),
      updated: new Date().toISOString(),
      status: "Em edição",
      blocks: s.blocks.map((b: Record<string, unknown>) => {
        if (typeof b.text !== "string" || b.text.length > 100000)
          throw new Error("Texto inválido ou muito extenso.");
        return {
          id: uid(),
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
