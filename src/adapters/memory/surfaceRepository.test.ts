import { runSurfaceRepositoryContractTests } from '../surfaceRepository.contract.js';
import { InMemorySurfaceRepository } from './surfaceRepository.js';

runSurfaceRepositoryContractTests(() => new InMemorySurfaceRepository());
