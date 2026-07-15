import { runStorageAdapterContractTests } from '../storageAdapter.contract.js';
import { InMemoryStorageAdapter } from './storageAdapter.js';

runStorageAdapterContractTests(() => new InMemoryStorageAdapter());
