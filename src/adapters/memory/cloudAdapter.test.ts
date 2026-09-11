import { runCloudAdapterContractTests } from '../cloudAdapter.contract.js';
import { InMemoryCloudAdapter } from './cloudAdapter.js';

runCloudAdapterContractTests(() => new InMemoryCloudAdapter());
