import { Script, words } from "./types.js";

// Keep the current block and its word offset when earlier blocks move or change.
export function remapPosition(old: Script, next: Script, position: number): number {
  let start = 0;
  for (const block of old.blocks) {
    const length = block.text.match(/\S+/g)?.length ?? 0;
    if (position < start + length) {
      const index = next.blocks.findIndex(b => b.id === block.id);
      if (index >= 0) {
        const before = words({...next, blocks: next.blocks.slice(0, index)}).length;
        const size = next.blocks[index].text.match(/\S+/g)?.length ?? 0;
        return Math.min(Math.max(0, words(next).length - 1), before + Math.min(position - start, Math.max(0, size - 1)));
      }
      break;
    }
    start += length;
  }
  return Math.min(position, Math.max(0, words(next).length - 1));
}
