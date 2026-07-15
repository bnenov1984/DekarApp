import { runProjectRepositoryContractTests } from '../projectRepository.contract.js';
import { InMemoryProjectRepository } from './projectRepository.js';
import { InMemorySurfaceRepository } from './surfaceRepository.js';

runProjectRepositoryContractTests(() => {
  const surfaces = new InMemorySurfaceRepository();
  return { projects: new InMemoryProjectRepository(surfaces), surfaces };
});
