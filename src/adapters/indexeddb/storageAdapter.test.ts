import 'fake-indexeddb/auto';
import { runStorageAdapterContractTests } from '../storageAdapter.contract.js';
import { IndexedDbStorageAdapter } from './storageAdapter.js';

// A fresh database name per test file run keeps this isolated from the other IndexedDB-backed
// contract test files (projectRepository.test.ts, surfaceRepository.test.ts) — fake-indexeddb's
// global `indexedDB` is shared process-wide, same as a real browser's would be per-origin.
let counter = 0;
runStorageAdapterContractTests(() => new IndexedDbStorageAdapter(`storage-adapter-test-${counter++}`));
