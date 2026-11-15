import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  directAnthropicModelId,
  firstStepToolChoice,
  maxOutputTokensFor,
  PRIMARY_PARAMETRIC_MODEL,
  resolveChatModel,
} from './parametricModels.ts';

// Banc d'essai du 08/10/2026 (3 pièces, prompt + outil réels de cadam) :
// Sonnet 4.5 3/3 en 11-15 s ; GPT-5.6 Sol 3/3 ; Sonnet 5 2/3 compilés et
// 1/3 aux bonnes dimensions — écarté.
describe('modèles paramétriques', () => {
  it('Claude Sonnet 4.5 est le modèle principal', () => {
    assert.equal(PRIMARY_PARAMETRIC_MODEL, 'anthropic/claude-sonnet-5.5');
  });
});

describe('modèle imposé côté serveur', () => {
  it('accepte Sonnet 5.5, seul modèle autorisé', () => {
    assert.equal(
      resolveChatModel('anthropic/claude-sonnet-5.5'),
      'anthropic/claude-sonnet-5.5',
    );
  });

  it('GPT-5.6 Sol (retiré le 15/11/2026) retombe sur Sonnet 5.5', () => {
    assert.equal(
      resolveChatModel('openai/gpt-5.6-sol'),
      'anthropic/claude-sonnet-5.5',
    );
  });

  it('remplace tout autre modèle demandé par le navigateur par le principal', () => {
    for (const demande of [
      'anthropic/claude-opus-4.1',
      'anthropic/claude-sonnet-5',
      'anthropic/claude-sonnet-4.5',
      'google/gemini-3.1-pro-preview',
      '',
      undefined,
    ]) {
      assert.equal(resolveChatModel(demande), 'anthropic/claude-sonnet-5.5');
    }
  });
});

describe('appel direct Anthropic', () => {
  it("convertit l'identifiant OpenRouter en identifiant API Anthropic", () => {
    assert.equal(
      directAnthropicModelId('anthropic/claude-sonnet-5.5'),
      'claude-sonnet-5-5',
    );
  });
});

// 13/10/2026 : Claude Sonnet 5.5 refuse tool_choice "any"/"tool"
// (« not supported for this model ») ; chaque appel retombait en silence
// sur GPT-5.6 Sol.
describe('choix d’outil au premier tour', () => {
  it('les modèles Claude choisissent eux-mêmes leur outil', () => {
    assert.equal(firstStepToolChoice('anthropic/claude-sonnet-5.5'), 'auto');
  });

  it('les autres modèles restent obligés de prendre un outil', () => {
    assert.equal(firstStepToolChoice('openai/gpt-5.6-sol'), 'required');
  });
});

// 15/10/2026 : Sonnet 5.5 réfléchit de lui-même ; sur le coffret de pied
// à coulisse, sa réflexion a rempli les 16 000 jetons et aucune pièce n'est
// sortie (0,17 $ perdus, client remboursé).
describe('place laissée à la réponse', () => {
  it('Claude a de quoi réfléchir puis écrire la pièce', () => {
    assert.equal(
      maxOutputTokensFor('anthropic/claude-sonnet-5.5', false),
      32000,
    );
  });

  it('les autres modèles gardent leurs limites', () => {
    assert.equal(maxOutputTokensFor('openai/gpt-5.6-sol', false), 16000);
    assert.equal(maxOutputTokensFor('openai/gpt-5.6-sol', true), 20000);
  });
});
