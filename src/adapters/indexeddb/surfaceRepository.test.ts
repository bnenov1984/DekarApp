import 'fake-indexeddb/auto';
import { runSurfaceRepositoryContractTests } from '../surfaceRepository.contract.js';
import { IndexedDbSurfaceRepository } from './surfaceRepository.js';

let counter = 0;
runSurfaceRepositoryContractTests(() => new IndexedDbSurfaceRepository(`surface-repo-test-${counter++}`));
