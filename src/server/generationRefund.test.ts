import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldRefundGeneration } from './generationRefund.ts';

type Part = { type: string; text?: string; state?: string };
const texte = (text: string): Part => ({ type: 'text', text });
const outil = (state: string): Part => ({ type: 'tool-create_mesh', state });

describe('remboursement du tour initial', () => {
  it('rembourse un tour qui n’a rien produit', () => {
    assert.equal(
      shouldRefundGeneration([texte('  '), { type: 'step-start' }]),
      true,
    );
  });

  it('rembourse quand l’outil a échoué côté serveur (create_mesh sans FAL_KEY)', () => {
    const parts = [
      { type: 'step-start' },
      { type: 'reasoning', text: '' },
      outil('output-error'),
    ];
    assert.equal(shouldRefundGeneration(parts), true);
  });

  it('rembourse même si le modèle a écrit un texte, puisque la pièce n’a pas été produite', () => {
    assert.equal(
      shouldRefundGeneration([
        texte('Voici votre grille'),
        outil('output-error'),
      ]),
      true,
    );
  });

  it('ne rembourse pas un outil réussi', () => {
    assert.equal(shouldRefundGeneration([outil('output-available')]), false);
  });

  it('ne rembourse pas un outil client en attente (build_parametric_model compilé ensuite)', () => {
    assert.equal(
      shouldRefundGeneration([
        { type: 'tool-build_parametric_model', state: 'input-available' },
      ]),
      false,
    );
  });

  it('ne rembourse pas une réponse texte sans outil', () => {
    assert.equal(
      shouldRefundGeneration([texte('Il me faut les dimensions')]),
      false,
    );
  });
});
