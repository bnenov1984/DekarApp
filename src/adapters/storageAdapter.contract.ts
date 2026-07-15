import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../application/ports/storageAdapter.js';

// docs/22_TDD.md §7 — one contract suite, run against both the fake (memory/storageAdapter.ts)
// and the real (indexeddb/storageAdapter.ts) implementations, guaranteeing they're behaviorally
// equivalent rather than merely each independently tested.

export function runStorageAdapterContractTests(makeAdapter: () => StorageAdapter | Promise<StorageAdapter>): void {
  describe('StorageAdapter contract', () => {
    it('read returns null for a missing key', async () => {
      const adapter = await makeAdapter();
      expect(await adapter.read('missing')).toBeNull();
    });

    it('write then read round-trips structured data', async () => {
      const adapter = await makeAdapter();
      await adapter.write('k1', { hello: 'world' });
      expect(await adapter.read('k1')).toEqual({ hello: 'world' });
    });

    it('write then read round-trips a Blob', async () => {
      const adapter = await makeAdapter();
      const blob = new Blob(['hello'], { type: 'text/plain' });
      await adapter.write('blob1', blob);
      const result = await adapter.read('blob1');
      expect(result).toBeInstanceOf(Blob);
      expect(await (result as Blob).text()).toBe('hello');
    });

    it('write overwrites an existing key', async () => {
      const adapter = await makeAdapter();
      await adapter.write('k2', { v: 1 });
      await adapter.write('k2', { v: 2 });
      expect(await adapter.read('k2')).toEqual({ v: 2 });
    });

    it('transaction applies multiple writes together', async () => {
      const adapter = await makeAdapter();
      await adapter.transaction([
        { type: 'write', key: 'a', value: { n: 1 } },
        { type: 'write', key: 'b', value: { n: 2 } },
      ]);
      expect(await adapter.read('a')).toEqual({ n: 1 });
      expect(await adapter.read('b')).toEqual({ n: 2 });
    });

    it('transaction can delete a key', async () => {
      const adapter = await makeAdapter();
      await adapter.write('c', { n: 3 });
      await adapter.transaction([{ type: 'delete', key: 'c' }]);
      expect(await adapter.read('c')).toBeNull();
    });
  });
}
