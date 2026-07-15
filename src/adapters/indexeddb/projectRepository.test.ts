import 'fake-indexeddb/auto';
import { runProjectRepositoryContractTests } from '../projectRepository.contract.js';
import { IndexedDbProjectRepository } from './projectRepository.js';
import { IndexedDbSurfaceRepository } from './surfaceRepository.js';

let counter = 0;
runProjectRepositoryContractTests(() => {
  const dbName = `project-repo-test-${counter++}`;
  return { projects: new IndexedDbProjectRepository(dbName), surfaces: new IndexedDbSurfaceRepository(dbName) };
});
