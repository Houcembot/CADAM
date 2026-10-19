import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createToolCallRelay } from './toolCallRelay.ts';

type Ctx = { toolCall: { toolCallId: string } };
const appel = (id: string): Ctx => ({ toolCall: { toolCallId: id } });

describe('relais des appels d’outil (appel arrivé avant l’éditeur)', () => {
  it('rejoue un appel arrivé sans gestionnaire, une fois le gestionnaire branché', () => {
    const taches: Array<() => void> = [];
    const relay = createToolCallRelay<Ctx>((fn) => taches.push(fn));
    const recus: string[] = [];
    relay.dispatch(appel('t1'));
    assert.equal(recus.length, 0);
    relay.setHandler((ctx) => recus.push(ctx.toolCall.toolCallId));
    assert.equal(recus.length, 0, 'pas avant la fin des effets de l’éditeur');
    taches.forEach((t) => t());
    assert.deepEqual(recus, ['t1']);
  });

  it('transmet tout de suite quand le gestionnaire est déjà branché', () => {
    const relay = createToolCallRelay<Ctx>(() =>
      assert.fail('aucune mise en attente'),
    );
    const recus: string[] = [];
    relay.setHandler((ctx) => recus.push(ctx.toolCall.toolCallId));
    relay.dispatch(appel('t2'));
    assert.deepEqual(recus, ['t2']);
  });

  it('ne rejoue jamais deux fois le même appel', () => {
    const taches: Array<() => void> = [];
    const relay = createToolCallRelay<Ctx>((fn) => taches.push(fn));
    const recus: string[] = [];
    relay.dispatch(appel('t3'));
    const h = (ctx: { toolCall: { toolCallId: string } }) =>
      recus.push(ctx.toolCall.toolCallId);
    relay.setHandler(h);
    relay.setHandler(h);
    taches.forEach((t) => t());
    taches.forEach((t) => t());
    assert.deepEqual(recus, ['t3']);
  });

  it('signale les appels pris en charge, pour que la reprise ne les marque pas en erreur', () => {
    const relay = createToolCallRelay<Ctx>(() => {});
    relay.dispatch(appel('t4'));
    assert.equal(relay.isInFlight('t4'), true);
    assert.equal(relay.isInFlight('autre'), false);
  });
});
