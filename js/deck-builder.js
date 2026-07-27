'use strict';
(function () {
/*
 * Constrói um baralho de 20 cartas para uma facção: todos os Apoios dessa
 * facção (variedade é pouca, 4-6, vale sempre incluir todos) + unidades por
 * ordem de custo crescente até completar 20. Cada carta entra só 1 vez, o que
 * já respeita à partida "máx. 2 cópias" e "Lendárias/Heróis só 1 cópia".
 */
function buildFactionDeck(cartas, faccaoSlug) {
  const apoiosF = cartas.apoios.filter(c => c.faccao_slug === faccaoSlug).map(c => ({ ...c, isApoio: true }));
  const unidadesF = cartas.unidades
    .filter(c => c.faccao_slug === faccaoSlug)
    .slice()
    .sort((a, b) => a.custo - b.custo)
    .map(c => ({ ...c, isApoio: false }));

  const remaining = Math.max(0, 20 - apoiosF.length);
  const deck = [...apoiosF, ...unidadesF.slice(0, remaining)];
  return deck;
}

function listFactions(cartas) {
  return [...new Set(cartas.unidades.map(c => c.faccao_slug))];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildFactionDeck, listFactions };
} else {
  window.buildFactionDeck = buildFactionDeck;
  window.listFactions = listFactions;
}

})();
