'use strict';
/*
 * Teste directo de cobertura: invoca a função de cada uma das 100
 * habilidades de unidade + 27 efeitos de apoio, isoladamente, com um tabuleiro
 * mínimo montado à mão. Não depende de nenhuma IA escolher a carta — testa o
 * código da habilidade em si.
 */
const fs = require('fs');
const path = require('path');
const { GameEngine } = require('../js/game-engine.js');
const { UNIT_ABILITIES, APOIO_ABILITIES } = require('../js/ability-engine.js');

const cartas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cartas.json'), 'utf8'));
const fillerUnit = cartas.unidades.find(c => c.id === 'reinos-01');
const fillerApoio = cartas.apoios[0];

function freshEngine() {
  return new GameEngine({ playerDeck: [fillerUnit, fillerUnit], aiDeck: [fillerUnit, fillerUnit], log: () => {} });
}

function place(engine, cardDef, ownerId, slotType, slotIndex) {
  const card = engine._instantiate(cardDef, ownerId);
  card.slotType = slotType; card.slotIndex = slotIndex;
  (slotType === 'frente' ? engine.players[ownerId].front : engine.players[ownerId].back)[slotIndex] = card;
  return card;
}

let failures = [];
let ok = 0;

for (const cardDef of cartas.unidades) {
  const def = UNIT_ABILITIES.get(cardDef.habilidade_texto);
  if (!def) { failures.push(`${cardDef.id}: SEM ENTRADA na tabela de habilidades — "${cardDef.habilidade_texto}"`); continue; }
  try {
    const engine = freshEngine();
    const isFront = ['TANQUE', 'GUERREIRO', 'ASSASSINO'].includes(cardDef.papel);
    const subject = place(engine, cardDef, 'player', isFront ? 'frente' : 'retaguarda', 0);
    const allyFiller = place(engine, fillerUnit, 'player', 'frente', 1);
    const enemyFiller1 = place(engine, fillerUnit, 'ai', 'frente', 0);
    const enemyFiller2 = place(engine, fillerUnit, 'ai', 'retaguarda', 0);

    switch (def.trigger) {
      case 'static':
        def.run(engine, subject); break;
      case 'onEnter': case 'onDeath': case 'turnStart': case 'turnEnd':
        def.run(engine, subject); break;
      case 'onKill':
        def.run(engine, subject); break;
      case 'onAllyDeath':
        def.run(engine, subject, allyFiller); break;
      case 'onAttacked':
        def.run(engine, subject, enemyFiller1); break;
      case 'onAllyHealed':
        def.run(engine, subject, allyFiller); break;
      case 'combatMod':
        def.run(engine, subject, enemyFiller1); break;
      case 'activated':
        def.run(engine, subject, allyFiller.uid, allyFiller.uid); break;
      case 'special_countdown':
        subject.turnosEmCampo = 2;
        def.run(engine, subject); break;
      case 'damageReductionLane': case 'damageReductionGlobal': case 'damageReductionSelf':
      case 'staticLaneDebuff': case 'onEnterLaneDebuff': case 'onEnterLaneDebuff_special':
      case 'none':
        break; // aplicados genericamente pelo motor, não têm .run próprio
      default:
        failures.push(`${cardDef.id}: gatilho desconhecido "${def.trigger}"`);
        continue;
    }
    if (def.onDeath) def.onDeath(engine, subject);
    if (def.onKill) def.onKill(engine, subject);
    if (def.onAllyDeath) def.onAllyDeath(engine, subject, allyFiller);
    ok++;
  } catch (e) {
    failures.push(`${cardDef.id} (${cardDef.habilidade_nome}): ${e.message}`);
  }
}

for (const cardDef of cartas.apoios) {
  const def = APOIO_ABILITIES.get(cardDef.id);
  if (!def) { failures.push(`${cardDef.id}: SEM ENTRADA na tabela de apoios`); continue; }
  try {
    const engine = freshEngine();
    const allyA = place(engine, fillerUnit, 'player', 'frente', 0);
    const allyB = place(engine, fillerUnit, 'player', 'frente', 1);
    engine.enemies = engine.enemies.bind(engine);
    const enemyA = place(engine, fillerUnit, 'ai', 'frente', 0);
    allyA.vidaAtual = 1; // ferido, para pickers de "mais ferida"
    enemyA.vidaAtual = 2;
    engine._currentApoioMult = 1;

    if (def.needsTarget === 'allyPair') def.run(engine, 'player', allyA, allyB);
    else if (def.needsTarget === 'ally') def.run(engine, 'player', allyA, {});
    else if (def.needsTarget === 'enemy') def.run(engine, 'player', enemyA, {});
    else def.run(engine, 'player');
    ok++;
  } catch (e) {
    failures.push(`${cardDef.id} (${cardDef.efeito_nome}): ${e.message}`);
  }
}

console.log(`Testadas com sucesso: ${ok}/${cartas.unidades.length + cartas.apoios.length}`);
if (failures.length) {
  console.log(`\nFALHAS (${failures.length}):`);
  failures.forEach(f => console.log('  - ' + f));
  process.exitCode = 1;
} else {
  console.log('Todas as cartas correm sem erro.');
}
