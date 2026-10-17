import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { effortFor, generationCost } from './parametricModels.ts';

// Banc du 17/10/2026 (30 générations + 12 pièces du groupe FB + paires photo) :
// Sonnet 5.5 à l'effort par défaut (high) réfléchit jusqu'au plafond de 32 000
// jetons et ne livre rien sur les objets complexes (278 s, 0,33 $). En effort
// « low » : tout compile du premier coup en 10-50 s pour 0,013-0,07 $.
describe('effort de réflexion', () => {
  it('Claude Sonnet 5.5 travaille en effort low', () => {
    assert.equal(effortFor('anthropic/claude-sonnet-5.5', false), 'low');
  });
  it('option réflexion : effort medium (jamais un budget fixe, refusé par Sonnet 5.5)', () => {
    assert.equal(effortFor('anthropic/claude-sonnet-5.5', true), 'medium');
  });
  it('les autres modèles ne reçoivent pas d’effort Anthropic', () => {
    assert.equal(effortFor('openai/gpt-5.6-sol', false), undefined);
  });
});

// Tarif décidé le 17/10/2026 : 20 tokens par génération, 30 avec photos jointes
// (les photos sont le seul surcoût réel une fois l'effort réglé).
describe('prix d’une génération', () => {
  it('prompt texte : 20 tokens', () => assert.equal(generationCost(false), 20));
  it('prompt + photos : 30 tokens', () => assert.equal(generationCost(true), 30));
});

describe('prompt cadam — finitions', () => {
  const src = readFileSync(new URL('../src/server/aiChat.ts', import.meta.url), 'utf8');
  it('demande des objets utilisables (arêtes adoucies, bords de travail, jeux)', () => {
    assert.match(src, /# Finishing/);
    assert.match(src, /Round or chamfer edges/);
    assert.match(src, /clearances/);
  });
  it("n'envoie plus le budget de réflexion fixe refusé par Sonnet 5.5", () => {
    assert.doesNotMatch(src, /type: 'enabled',\s*budgetTokens/);
  });
});
