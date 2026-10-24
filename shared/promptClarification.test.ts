import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// 24/10/2026 : les 3 premiers testeurs ont tous eu une génération « à
// l'aveugle » — le prompt système interdisait toute question dès qu'une pièce
// était demandée. Décision de Houcem : jusqu'à 3 questions (une par tour)
// tant que la demande n'est pas claire, toujours avec une valeur par défaut,
// et les cotes manquantes se demandent même pour un objet connu.
const src = readFileSync(
  new URL('../src/server/aiChat.ts', import.meta.url),
  'utf8',
);
const tools = readFileSync(new URL('./chatAi.ts', import.meta.url), 'utf8');
const debut = src.indexOf('const PARAMETRIC_AGENT_PROMPT');
const prompt = src.slice(debut, src.indexOf('# OpenSCAD code rules', debut));

describe('prompt cadam — questions de clarification', () => {
  it('ne réserve plus answer_user aux salutations', () => {
    assert.doesNotMatch(prompt, /Use answer_user only for greetings/);
  });

  it('pose une question quand les cotes manquent, même pour un objet connu', () => {
    assert.match(prompt, /dimensions are missing/i);
    assert.match(prompt, /official dimensions as the default/i);
  });

  it('une question par tour, avec une valeur par défaut', () => {
    assert.match(prompt, /one question per turn/i);
    assert.match(prompt, /always include a default/i);
  });

  it('au plus 3 questions, puis construit avec les valeurs par défaut', () => {
    assert.match(prompt, /at most 3 clarifying questions/i);
    assert.match(prompt, /after the third/i);
  });

  it('signale les demandes hors domaine (figurines) et propose une version simplifiée', () => {
    assert.match(prompt, /organic figures/i);
  });

  it("l'outil answer_user annonce la question de clarification", () => {
    assert.match(tools, /clarifying question/i);
  });
});
