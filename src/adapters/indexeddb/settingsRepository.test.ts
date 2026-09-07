import 'fake-indexeddb/auto';
import { runSettingsRepositoryContractTests } from '../settingsRepository.contract.js';
import { IndexedDbSettingsRepository } from './settingsRepository.js';

let counter = 0;
runSettingsRepositoryContractTests(() => new IndexedDbSettingsRepository(`settings-repository-test-${counter++}`));
