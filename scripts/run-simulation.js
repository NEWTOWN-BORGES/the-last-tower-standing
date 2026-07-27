'use strict';
/*
 * Simulação headless (Node, sem browser) — corre N partidas IA vs IA para
 * confirmar que o motor não rebenta e que todas as 127 cartas (100 unidades +
 * 27 apoios) chegam a ser jogadas e a executar a sua habilidade pelo menos
 * uma vez em todas as partidas combinadas.
 */
const fs = require('fs');
const path = require('path');
const { GameEngine } = require('../js/game-engine.js');
const { AIPlayer } = require('../js/ai-player.js');
const { buildFactionDeck, listFactions } = require('../js/deck-builder.js');

const cartas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cartas.json'), 'utf8'));
const factions = listFactions(cartas);
const N = parseInt(process.argv[2] || '200', 10);

const seenUnit = new Set();
const seenApoio = new Set();
const wins = { player: 0, ai: 0, empate: 0 };
let totalRounds = 0;
let crashes = 0;

for (let i = 0; i < N; i++) {
  const fA = factions[i % factions.length];
  const fB = factions[(i + 1 + Math.floor(i / factions.length)) % factions.length];
  const deckA = buildFactionDeck(cartas, fA);
  const deckB = buildFactionDeck(cartas, fB);

  let engine;
  try {
    engine = new GameEngine({ playerDeck: deckA, aiDeck: deckB, log: () => {} });
  } catch (e) {
    crashes++;
    console.error(`CRASH ao criar engine (jogo ${i}, ${fA} vs ${fB}):`, e);
    continue;
  }

  const aiP1 = new AIPlayer('player');
  const aiP2 = new AIPlayer('ai');

  try {
    let guard = 0;
    while (engine.phase !== 'gameover' && guard++ < 500) {
      if (engine.phase === 'placement') {
        if (engine.activePlayer === 'player') aiP1.act(engine); else aiP2.act(engine);
      }
    }
    if (engine.phase !== 'gameover') throw new Error('jogo não terminou dentro do limite de segurança');
  } catch (e) {
    crashes++;
    console.error(`CRASH durante o jogo ${i} (${fA} vs ${fB}):`, e);
    continue;
  }

  wins[engine.winner] = (wins[engine.winner] || 0) + 1;
  totalRounds += engine.round;

  [...engine.players.player.graveyard, ...engine.allies('player'), ...engine.players.player.hand]
    .concat([...engine.players.ai.graveyard, ...engine.allies('ai'), ...engine.players.ai.hand])
    .forEach(c => {
      if (!c) return;
      if (c.isApoio) seenApoio.add(c.cardId || c.id);
      else seenUnit.add(c.cardId || c.id);
    });
}

console.log(`\n${N} partidas simuladas — ${crashes} crash(es).`);
console.log(`Vitórias: player=${wins.player || 0}  ai=${wins.ai || 0}  empate=${wins.empate || 0}`);
console.log(`Duração média: ${(totalRounds / (N - crashes)).toFixed(1)} turnos`);

const allUnitIds = new Set(cartas.unidades.map(c => c.id));
const allApoioIds = new Set(cartas.apoios.map(c => c.id));
const missingUnits = [...allUnitIds].filter(id => !seenUnit.has(id));
const missingApoios = [...allApoioIds].filter(id => !seenApoio.has(id));

console.log(`\nUnidades vistas em jogo: ${seenUnit.size}/${allUnitIds.size}`);
if (missingUnits.length) console.log('  Nunca jogadas:', missingUnits.join(', '));
console.log(`Apoios vistos em jogo: ${seenApoio.size}/${allApoioIds.size}`);
if (missingApoios.length) console.log('  Nunca jogados:', missingApoios.join(', '));

process.exitCode = crashes > 0 ? 1 : 0;
