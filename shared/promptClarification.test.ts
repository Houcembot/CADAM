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

  // 15/11/2026 (décision Houcem) : plus de plafond de 3 questions ; l'IA
  // demande tout ce qu'il faut (questions gratuites), jusqu'au « go » du client.
  it('pose autant de questions que nécessaire, jusqu’au feu vert du client', () => {
    assert.doesNotMatch(prompt, /at most 3 clarifying questions/i);
    assert.match(prompt, /as many clarifying questions as you need/i);
    assert.match(prompt, /says to go ahead/i);
  });

  // 15/11/2026 : clé copiée d'une photo, dents remplacées par 2 encoches
  // inventées. L'IA doit raisonner sur la fonction et reproduire (ou demander)
  // les éléments qui font marcher l'objet.
  it('raisonne sur la fonction et reproduit les éléments fonctionnels de la photo', () => {
    assert.match(prompt, /Function first/);
    assert.match(prompt, /Never replace them with generic/);
    assert.match(prompt, /ask for what you need before building/);
  });

  it('signale les demandes hors domaine (figurines) et propose une version simplifiée', () => {
    assert.match(prompt, /organic figures/i);
  });

  // 26/10 : banc interne, figurine Jett construite sans prévenir que c'était
  // une version simplifiée (seul le titre le disait).
  it('annonce la version simplifiée quand il construit une figurine', () => {
    assert.match(prompt, /When you build a simplified version/i);
    assert.match(prompt, /say so in your reply/i);
  });

  // 02/11/2026 : roue dentée, le texte disait 10 dents et la photo en montrait
  // 40 ; le modèle a suivi le texte et n'a signalé l'écart qu'en une phrase.
  it('pose une question quand le texte contredit les photos jointes', () => {
    assert.match(prompt, /attached photos contradict each other/i);
    assert.match(prompt, /photo's values as the default/i);
    assert.match(prompt, /does not contradict the attached photos/i);
  });

  it("l'outil answer_user annonce la question de clarification", () => {
    assert.match(tools, /clarifying question/i);
  });

  // 15/11/2026 (test en prod) : « fais-moi une clé » → question, puis le serveur
  // relançait le modèle qui construisait sans attendre la réponse.
  it('une question (answer_user) termine le tour côté serveur', () => {
    assert.match(
      src,
      /stopWhen: \[stepCountIs\(5\), hasToolCall\('answer_user'\)\]/,
    );
  });
});
