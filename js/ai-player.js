'use strict';
(function () {
const AbilityEngineRef2 = (typeof module !== 'undefined' && module.exports) ? require('./ability-engine.js') : window.AbilityEngine;
const { APOIO_ABILITIES } = AbilityEngineRef2;
const GameEngineRef = (typeof module !== 'undefined' && module.exports) ? require('./game-engine.js') : window;
const FRONT_ROLES = GameEngineRef.FRONT_ROLES;
const BACK_LANES = GameEngineRef.BACK_LANES;

function scoreUnit(engine, cardDef) {
  return cardDef.ataque * 2 + cardDef.vida + cardDef.escudo - cardDef.custo * 0.2;
}

function findOpenSlot(engine, ownerId, cardDef) {
  const p = engine.players[ownerId];
  const isFront = FRONT_ROLES.has(cardDef.papel);
  const arr = isFront ? p.front : p.back;
  // preferência pelo centro do tabuleiro para dentro para fora
  const order = isFront ? [2, 3, 1, 4, 0, 5] : BACK_LANES.slice().sort((a, b) => Math.abs(a - 2.5) - Math.abs(b - 2.5));
  for (const i of order) {
    if (!arr[i]) return { slotType: isFront ? 'frente' : 'retaguarda', slotIndex: i };
  }
  return null;
}

function pickApoioTarget(engine, ownerId, def, id) {
  const allies = engine.allies(ownerId);
  const enemies = engine.enemies(ownerId);
  const woundedAllies = allies.filter(c => c.vidaAtual < c.vidaMaxima);
  const mostWoundedAlly = woundedAllies.length
    ? woundedAllies.reduce((a, b) => (b.vidaAtual < a.vidaAtual ? b : a))
    : (allies[0] || null);
  const strongestAlly = allies.length ? allies.reduce((a, b) => (engine.getEffectiveAtaque(b) > engine.getEffectiveAtaque(a) ? b : a)) : null;
  const threatEnemy = enemies.length ? enemies.reduce((a, b) => (engine.getEffectiveAtaque(b) > engine.getEffectiveAtaque(a) ? b : a)) : null;
  const killableEnemy = enemies.filter(e => e.vidaAtual <= 2).sort((a, b) => a.vidaAtual - b.vidaAtual)[0] || null;

  switch (id) {
    case 'AP-10': return killableEnemy ? { target: killableEnemy } : null;
    case 'AP-15': case 'AP-19': case 'AP-20': case 'AP-22':
      return threatEnemy ? { target: threatEnemy } : null;
    case 'AP-17': {
      if (allies.length < 2) return null;
      const sorted = allies.slice().sort((a, b) => b.vidaAtual - a.vidaAtual);
      return { from: sorted[0], to: sorted[sorted.length - 1] };
    }
    case 'AP-21':
      return allies.length > 1 ? { target: allies.reduce((a, b) => (b.vidaAtual < a.vidaAtual ? b : a)) } : null;
    case 'AP-14':
      return strongestAlly ? { target: strongestAlly } : null;
    default:
      if (def.needsTarget === 'ally') return mostWoundedAlly ? { target: mostWoundedAlly } : null;
      if (def.needsTarget === 'enemy') return threatEnemy ? { target: threatEnemy } : null;
      return { target: null };
  }
}

class AIPlayer {
  constructor(ownerId = 'ai') {
    this.ownerId = ownerId;
  }

  act(engine) {
    let guard = 0;
    while (engine.phase === 'placement' && engine.activePlayer === this.ownerId && guard++ < 30) {
      if (!this._tryPlayApoio(engine) && !this._tryPlayUnit(engine)) {
        engine.pass(this.ownerId);
      }
    }
  }

  // Uma única acção (para a UI poder animar jogada a jogada em vez de
  // despejar o turno inteiro da IA de uma vez).
  step(engine) {
    if (engine.phase !== 'placement' || engine.activePlayer !== this.ownerId) return false;
    if (!this._tryPlayApoio(engine) && !this._tryPlayUnit(engine)) engine.pass(this.ownerId);
    return true;
  }

  _tryPlayApoio(engine) {
    const owner = this.ownerId;
    const p = engine.players[owner];
    if (p.apoiosBlocked) return false;
    const idx = p.hand.findIndex(c => c.isApoio);
    if (idx === -1) return false;
    const cardDef = p.hand[idx];
    const def = APOIO_ABILITIES.get(cardDef.id);
    if (!def) return false;

    if (def.needsTarget) {
      const spec = pickApoioTarget(engine, owner, def, cardDef.id);
      if (!spec || (def.needsTarget !== 'allyPair' && !spec.target)) return false;
      if (def.requireFn && spec.target && !def.requireFn(engine, owner, spec.target)) return false;
      engine.playApoio(owner, idx, spec);
    } else {
      engine.playApoio(owner, idx, {});
    }
    p.lastApoio = cardDef;
    return true;
  }

  _tryPlayUnit(engine) {
    const owner = this.ownerId;
    const p = engine.players[owner];
    if (!p.freeNextUnit && p.unitPlaysThisRound >= engine.getUnitCap(owner)) return false;
    const candidates = p.hand
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !c.isApoio)
      .filter(({ c }) => findOpenSlot(engine, owner, c))
      .sort((a, b) => scoreUnit(engine, b.c) - scoreUnit(engine, a.c));
    if (!candidates.length) return false;
    const { c, i } = candidates[0];
    const slot = findOpenSlot(engine, owner, c);
    engine.playUnit(owner, i, slot.slotType, slot.slotIndex);
    return true;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AIPlayer };
} else {
  window.AIPlayer = AIPlayer;
}

})();
