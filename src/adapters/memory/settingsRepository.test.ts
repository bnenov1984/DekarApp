import { runSettingsRepositoryContractTests } from '../settingsRepository.contract.js';
import { InMemorySettingsRepository } from './settingsRepository.js';

runSettingsRepositoryContractTests(() => new InMemorySettingsRepository());
