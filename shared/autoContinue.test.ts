import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { lastStepAsksUser, shouldAutoContinue } from './autoContinue.ts';

const toujours = () => true;
const msg = (types: string[]) => [
  { role: 'user', parts: [{ type: 'text' }] },
  { role: 'assistant', parts: types.map((type) => ({ type })) },
];

// 16/11/2026, prod : question + modèle construit dans la foulée sans attendre le client.
describe('relance automatique du navigateur', () => {
  it('ne relance pas après une question', () => {
    const m = msg(['step-start', 'tool-answer_user']);
    assert.equal(lastStepAsksUser(m), true);
    assert.equal(shouldAutoContinue(m, toujours), false);
  });

  it('ne relance pas si la question et une construction sont dans la même étape', () => {
    const m = msg([
      'step-start',
      'tool-answer_user',
      'tool-build_parametric_model',
    ]);
    assert.equal(shouldAutoContinue(m, toujours), false);
  });

  it('relance après une compilation (auto-contrôle), comme avant', () => {
    const m = msg([
      'step-start',
      'reasoning',
      'text',
      'tool-build_parametric_model',
    ]);
    assert.equal(shouldAutoContinue(m, toujours), true);
  });

  it('une question d’une étape précédente ne bloque pas la suite', () => {
    const m = msg([
      'step-start',
      'tool-answer_user',
      'step-start',
      'tool-build_parametric_model',
    ]);
    assert.equal(shouldAutoContinue(m, toujours), true);
  });

  it('respecte la règle du SDK quand elle refuse', () => {
    assert.equal(
      shouldAutoContinue(msg(['step-start', 'text']), () => false),
      false,
    );
  });

  it('ChatSession utilise ce garde-fou', () => {
    const src = readFileSync(
      new URL('../src/components/chat/ChatSession.tsx', import.meta.url),
      'utf8',
    );
    assert.match(src, /shouldAutoContinue\(/);
  });

  it('le serveur interdit les appels d’outils en parallèle à Claude', () => {
    const src = readFileSync(
      new URL('../src/server/aiChat.ts', import.meta.url),
      'utf8',
    );
    assert.match(src, /disableParallelToolUse: true/);
  });
});
