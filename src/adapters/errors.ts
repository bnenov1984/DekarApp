// docs/23_API.md §8 error taxonomy — Adapters/Application errors that reach the UI are typed,
// never bare strings (15 §16). This is the one adapter error this slice actually exercises
// (ISS-008); MapProvider/AIProvider/CloudAdapter error types arrive with their own slices.

export class StorageQuotaExceededError extends Error {
  constructor(message = 'Storage quota exceeded') {
    super(message);
    this.name = 'StorageQuotaExceededError';
  }
}
