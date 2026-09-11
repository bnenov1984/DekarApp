import { runAuthAdapterContractTests } from '../authAdapter.contract.js';
import { InMemoryAuthAdapter } from './authAdapter.js';

runAuthAdapterContractTests(() => new InMemoryAuthAdapter());
