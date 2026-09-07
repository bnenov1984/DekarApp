import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// docs/22_TDD.md §10 — "Продуктови решения, които са технически проверими — превърнати в
// permanent тестове, за да не се 'изгубят' в бъдещ рефакторинг." These two are explicitly called
// out there as "архитектурен linter правило, не unit тест": a source-tree scan, not a behavioral
// test against one module. Scans every .ts/.svelte file under src/ (this file's own filename is
// excluded so its own quoted forbidden terms, in this comment block, don't self-trigger).

const SELF = fileURLToPath(import.meta.url);
const SRC_ROOT = dirname(SELF);
const SCAN_EXTENSIONS = new Set(['.ts', '.svelte']);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (SCAN_EXTENSIONS.has(extname(full)) && full !== SELF) {
      out.push(full);
    }
  }
  return out;
}

function findMatches(pattern: RegExp): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = [];
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const lines = readFileSync(file, 'utf-8').split('\n');
    lines.forEach((text, i) => {
      if (pattern.test(text)) hits.push({ file, line: i + 1, text: text.trim() });
    });
  }
  return hits;
}

describe('PD-011 — v1 scope excludes CAD import (DWG/DXF)', () => {
  it('no DWG/DXF reference exists anywhere in src/ — the import path does not exist, not just an unused UI button', () => {
    const hits = findMatches(/\b(dwg|dxf)\b/i);
    expect(hits, `Found DWG/DXF reference(s), violating PD-011's v1 scope boundary:\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });
});

describe('PD-016 — Medical is PARKED (zero references, not just an inactive feature)', () => {
  it('no Medical workspace/extension reference exists anywhere in src/', () => {
    const hits = findMatches(/medical/i);
    expect(hits, `Found a Medical-domain reference, violating PD-016's PARKED status:\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });
});

describe('PD-013 — Ghost never commits without an explicit user gesture', () => {
  it("the 'AIGenerated' provenance literal is only ever assigned in commitGhost.ts — no second path exists", () => {
    // core/domain/types.ts's `type Provenance = 'Manual' | 'AIGenerated'` declares the value, it
    // never assigns it — excluded as the one legitimate non-assignment reference. Every other
    // hit here would mean a second code path can produce an AI-committed Measurement without
    // going through commitGhostCommand's single, explicit-gesture-only entry point (roundtrip.
    // test.ts's "same create path" test already covers what that one path does structurally).
    const typesDeclaration = join('core', 'domain', 'types.ts');
    const commitGhostFile = join('application', 'commands', 'commitGhost.ts');
    // test files legitimately assert the literal as an expected value (roundtrip.test.ts) — not
    // a second *production* code path, which is what this guards against.
    const hits = findMatches(/AIGenerated/).filter((h) => !h.file.endsWith(typesDeclaration) && !h.file.endsWith('.test.ts'));
    const allowed = hits.filter((h) => h.file.endsWith(commitGhostFile));
    const unexpected = hits.filter((h) => !h.file.endsWith(commitGhostFile));
    expect(allowed.length, 'expected commitGhost.ts to still reference AIGenerated').toBeGreaterThan(0);
    expect(unexpected, `Found 'AIGenerated' outside commitGhost.ts, a possible second commit path:\n${JSON.stringify(unexpected, null, 2)}`).toEqual(
      [],
    );
  });
});
