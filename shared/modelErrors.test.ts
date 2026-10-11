import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { userFacingModelError } from './modelErrors.ts';

describe('message d’erreur IA pour le client', () => {
  it('confirme qu’aucun token n’a été débité en cas de crédit fournisseur épuisé', () => {
    const error = Object.assign(new Error('Insufficient credits'), {
      statusCode: 402,
    });
    const message = userFacingModelError(error);
    assert.match(message, /momentanément indisponible/);
    assert.match(message, /Aucun token n’a été débité/);
  });

  it('masque les détails techniques lors d’une panne fournisseur', () => {
    const message = userFacingModelError(
      new Error('Provider returned error 503 upstream overloaded'),
    );
    assert.match(message, /momentanément indisponible/);
    assert.doesNotMatch(message, /503|upstream|Provider/);
  });
});
