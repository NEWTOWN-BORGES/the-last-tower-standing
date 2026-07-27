'use strict';
(function () {
/*
 * Motor de jogo — CORREDOR (v4, torres)
 *
 * Regras desta versão (pedidas em sessão):
 *   - Sem Energia/mana. Cada jogador pode jogar até 3 unidades por turno.
 *   - Jogo alternado, ao estilo Gwent: os jogadores alternam prioridade,
 *     jogando uma carta de cada vez (visível, não é revelação cega), até
 *     ambos passarem ou esgotarem o limite de unidades do turno.
 *   - Apoios continuam a custar 0 e sem limite — jogar um Apoio não passa a
 *     prioridade ao adversário.
 *   - Tabuleiro: 6 colunas na linha da frente (Tanque/Guerreiro). Retaguarda
 *     tem 4 colunas de combate (Assassino/Curador/Atirador) centradas sob as
 *     colunas 1-4; as colunas 0 e 5 da retaguarda são só para Apoios — nunca
 *     têm unidade nem são atacadas. Colunas 0 e 5 têm por isso 1 só camada de
 *     defesa (frente); as colunas 1-4 têm duas (frente + retaguarda).
 *   - Cada jogador tem a sua própria Torre (30 de vida). Quando a frente E a
 *     retaguarda de uma coluna estão vazias, os ataques nessa coluna atingem
 *     a Torre inimiga directamente. Primeiro a derrubar a Torre do outro
 *     lado vence. Sem barra partilhada — não há empurrar "para o teu lado".
 *   - Mantém-se Pressão/Ruptura e invocação lenta (Assassino ataca já ao
 *     entrar, ignora a frente inimiga e ataca a retaguarda directamente).
 */

const AbilityEngineRef = (typeof module !== 'undefined' && module.exports) ? require('./ability-engine.js') : window.AbilityEngine;
const { UNIT_ABILITIES, APOIO_ABILITIES } = AbilityEngineRef;

const FRONT_ROLES = new Set(['TANQUE', 'GUERREIRO']);
const BACK_ROLES = new Set(['ASSASSINO', 'CURADOR', 'ATIRADOR']);
const FRONT_LANES = 6;
const BACK_LANES = [1, 2, 3, 4]; // 0 e 5 são só para Apoio
const BASE_UNIT_CAP = 3;
const TOWER_MAX = 30;
const ROUND_LIMIT = 12;

const FAMILY_A = new Set(['ORDEM', 'PUREZA']);
const FAMILY_B = new Set(['SELVA', 'MAGIA']);

const STRONG_AGAINST = {
  FOGO: ['PLANTAS', 'METAL'],
  ÁGUA: ['FOGO', 'TERRA'],
  PLANTAS: ['ÁGUA', 'TERRA'],
  VENTO: ['PLANTAS', 'BESTA'],
  TERRA: ['METAL', 'FOGO'],
  ANJO: ['DEMÓNIO', 'SOMBRA'],
  DEMÓNIO: ['ANCESTRAL', 'NORMAL'],
  ANCESTRAL: ['ANJO', 'DEMÓNIO'],
  FADA: ['METAL', 'TERRA'],
  LUZ: ['SOMBRA', 'DEMÓNIO'],
  SOMBRA: ['LUZ', 'ANJO'],
  METAL: ['FADA', 'PLANTAS'],
  BESTA: ['PLANTAS', 'NORMAL'],
  NORMAL: []
};
const WEAK_TO = {
  FOGO: ['ÁGUA', 'TERRA'],
  ÁGUA: ['PLANTAS', 'VENTO'],
  PLANTAS: ['FOGO', 'VENTO'],
  VENTO: ['ÁGUA', 'TERRA'],
  TERRA: ['ÁGUA', 'PLANTAS'],
  ANJO: ['DEMÓNIO'],
  DEMÓNIO: ['ANJO', 'LUZ'],
  ANCESTRAL: ['FOGO'],
  FADA: ['METAL'],
  LUZ: ['SOMBRA'],
  SOMBRA: ['LUZ'],
  METAL: ['FOGO', 'TERRA', 'VENTO'],
  BESTA: ['VENTO', 'ANJO'],
  NORMAL: []
};

let uidCounter = 1;
function nextUid() { return 'c' + (uidCounter++); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class GameEngine {
  constructor({ playerDeck, aiDeck, log } = {}) {
    this.log = log || (() => {});
    this.towers = { player: TOWER_MAX, ai: TOWER_MAX };
    this.round = 1;
    this.phase = 'placement'; // placement | combat | gameover
    this.activePlayer = 'player';
    this.winner = null;
    this.combatSteps = []; // preenchido a cada resolução, para a UI animar

    // Separar decks militares e táticos (compatibilidade com velho formato)
    const playerMil = playerDeck.filter(c => !c.tipo_tatico);
    const playerTac = playerDeck.filter(c => c.tipo_tatico);
    const aiMil = aiDeck.filter(c => !c.tipo_tatico);
    const aiTac = aiDeck.filter(c => c.tipo_tatico);

    this.players = {
      player: this._makePlayerState(playerMil, playerTac),
      ai: this._makePlayerState(aiMil, aiTac)
    };
    this.players.player.hasSombra = playerMil.some(c => c.alinhamento === 'SOMBRA');
    this.players.ai.hasSombra = aiMil.some(c => c.alinhamento === 'SOMBRA');
    this.players.player.cohesionBroken = this._computeCohesionBroken(playerMil);
    this.players.ai.cohesionBroken = this._computeCohesionBroken(aiMil);
    this._drawInitialHand('player');
    this._drawInitialHand('ai');
    this._runTurnStartTriggers();
  }

  _computeCohesionBroken(deck) {
    let hasA = false, hasB = false;
    deck.forEach(c => {
      if (c.alinhamento && FAMILY_A.has(c.alinhamento)) hasA = true;
      if (c.alinhamento && FAMILY_B.has(c.alinhamento)) hasB = true;
    });
    return hasA && hasB;
  }

  _makePlayerState(militarDeck, tacticoDeck = []) {
    return {
      // Baralhos e mãos (militar)
      deck: shuffle(militarDeck),
      hand: [],
      graveyard: [],

      // Baralho tático (novo)
      tacticoDeck: shuffle(tacticoDeck),
      tacticoHand: [],
      tacticoGraveyard: [],

      // Tabuleiro (militar)
      front: [null, null, null, null, null, null],
      back: [null, null, null, null, null, null], // índices 0 e 5 nunca são usados para unidades (reservados a Apoio)

      // Cartas táticas ativas no campo (equipamentos, construções, etc)
      activeTactics: [], // array de cartas táticas em jogo

      // Estado do turno
      unitPlaysThisRound: 0,
      extraUnitCap: 0,
      freeNextUnit: false,
      apoioDoubleNext: false,
      apoiosBlocked: false,
      apoiosBlockedNextRound: false,
      donePlacing: false,
      lastDeadCard: null,
      lastApoio: null,
      flags: {}
    };
  }

  // -- utilitários gerais ----------------------------------------------------

  opponentOf(ownerId) { return ownerId === 'player' ? 'ai' : 'player'; }

  allInPlay() { return [...this.allies('player'), ...this.allies('ai')]; }

  allies(ownerId) {
    const p = this.players[ownerId];
    return [...p.front, ...p.back].filter(Boolean);
  }

  enemies(ownerId) { return this.allies(this.opponentOf(ownerId)); }

  getCard(uid) { return this.allInPlay().find(c => c.uid === uid) || null; }

  laneEnemiesOf(card) {
    return this.enemies(card.ownerId).filter(e => this._sameLane(card, e));
  }

  _sameLane(a, b) {
    // frente e retaguarda usam a mesma numeração de coluna (0-5) — colunas 0 e
    // 5 simplesmente nunca têm carta de retaguarda.
    return a.slotIndex === b.slotIndex;
  }

  _targetable(card, { byEnemy } = {}) {
    if (!card) return false;
    if (card.cannotBeTargeted && this.round <= (card.cannotBeTargetedUntilRound || 0)) return false;
    if (byEnemy && card.cannotBeTargetedByEnemies) return false;
    return true;
  }

  pickHighestAtaqueEnemy(ownerId) {
    const list = this.enemies(ownerId).filter(c => this._targetable(c, { byEnemy: true }));
    if (!list.length) return null;
    return list.reduce((a, b) => (this.getEffectiveAtaque(b) > this.getEffectiveAtaque(a) ? b : a));
  }

  pickLowestVidaEnemy(ownerId) {
    const list = this.enemies(ownerId).filter(c => this._targetable(c, { byEnemy: true }));
    if (!list.length) return null;
    return list.reduce((a, b) => (b.vidaAtual < a.vidaAtual ? b : a));
  }

  pickLowestVidaEnemyForCombat(ownerId) {
    const list = this.enemies(ownerId);
    if (!list.length) return null;
    return list.reduce((a, b) => (b.vidaAtual < a.vidaAtual ? b : a));
  }

  pickMostWoundedAlly(ownerId) {
    const list = this.allies(ownerId).filter(c => this._targetable(c));
    const wounded = list.filter(c => c.vidaAtual < c.vidaMaxima);
    if (wounded.length) return wounded.reduce((a, b) => (b.vidaAtual < a.vidaAtual ? b : a));
    return list[0] || null;
  }

  pickNearestAlly(card) {
    const list = this.allies(card.ownerId).filter(c => c.uid !== card.uid);
    if (!list.length) return null;
    return list.reduce((a, b) => (Math.abs(b.slotIndex - card.slotIndex) < Math.abs(a.slotIndex - card.slotIndex) ? b : a));
  }

  getGraveyardCount(ownerId) { return this.players[ownerId].graveyard.length; }

  setFlag(ownerId, key, value) { this.players[ownerId].flags[key] = value; }
  getFlag(ownerId, key) { return this.players[ownerId].flags[key]; }

  // -- construção / stats -----------------------------------------------------

  getEffectiveAtaque(card) {
    const v = card.baseAtaque + card.permBuffAtk + card.staticBonusAtk + card.tempBuffAtk;
    return Math.max(0, v);
  }

  getVidaMaxima(card) {
    return Math.max(1, card.baseVida + card.permBuffVida + card.staticBonusVida - card.permVidaMaxLoss);
  }

  recomputeStatics() {
    this.allInPlay().forEach(c => { c.staticBonusAtk = 0; c.staticBonusVida = 0; });
    this.allInPlay().forEach(c => {
      const def = UNIT_ABILITIES.get(c.habilidade_texto);
      if (def && def.trigger === 'static' && def.run) def.run(this, c);
      if (def && (def.trigger === 'staticLaneDebuff')) {
        this.laneEnemiesOf(c).forEach(e => { e._laneDebuffTemp = (e._laneDebuffTemp || 0) - def.amount; });
      }
    });
    this.allInPlay().forEach(c => { c.vidaMaxima = this.getVidaMaxima(c); if (c.vidaAtual > c.vidaMaxima) c.vidaAtual = c.vidaMaxima; });
  }

  hasAlignmentBonus(card) {
    if (card.noAlignmentBonus) return false;
    if (this.players[card.ownerId].cohesionBroken) return false;
    const blocked = this.getFlag(this.opponentOf(card.ownerId), 'alignmentBlockedTipos');
    if (blocked && card.tipo.some(t => blocked.includes(t))) return false;
    return true;
  }

  getAlignmentAtkBonus(card) {
    if (!this.hasAlignmentBonus(card)) return 0;
    if (card.alinhamento === 'ORDEM' && card.custo >= 3) return 1;
    return 0;
  }

  getMatchupMultiplier(attacker, defender) {
    let mult = 1;
    const weak = attacker.tipo.some(at => (WEAK_TO[defenderTypeKey(at)] || []).length === 0 ? false : true);
    // ataque é forte se algum tipo do defensor está na lista "fraco a" desse tipo do atacante
    const isWeak = defender.tipo.some(dt => attacker.tipo.some(at => (WEAK_TO[dt] || []).includes(at)));
    const isResisted = defender.tipo.some(dt => (STRONG_AGAINST[dt] || []).some(s => attacker.tipo.includes(s)));
    if (isWeak) mult += 0.4;
    if (isResisted) mult -= 0.4;
    return mult;
    function defenderTypeKey(x) { return x; }
  }

  getCombatModBonus(card, defender) {
    const def = UNIT_ABILITIES.get(card.habilidade_texto);
    if (def && def.trigger === 'combatMod' && def.run) return def.run(this, card, defender) || 0;
    return 0;
  }

  // -- ciclo de jogo ------------------------------------------------------

  _drawCard(ownerId, n) {
    const p = this.players[ownerId];
    for (let i = 0; i < n; i++) {
      if (!p.deck.length) break;
      if (p.hand.length >= 10) break;
      p.hand.push(p.deck.shift());
    }
  }
  drawCard(ownerId, n) { this._drawCard(ownerId, n); }

  _drawInitialHand(ownerId) {
    const p = this.players[ownerId];
    const frontIndices = [];
    for (let i = 0; i < p.deck.length && frontIndices.length < 4; i++) {
      if (FRONT_ROLES.has(p.deck[i].papel)) {
        frontIndices.push(i);
      }
    }

    const backIndices = [];
    for (let i = 0; i < p.deck.length && backIndices.length < 2; i++) {
      if (!frontIndices.includes(i) && BACK_ROLES.has(p.deck[i].papel)) {
        backIndices.push(i);
      }
    }

    const selectedIndices = new Set([...frontIndices, ...backIndices]);
    const selectedCards = [];
    const remainingDeck = [];
    p.deck.forEach((card, index) => {
      if (selectedIndices.has(index)) {
        selectedCards.push(card);
      } else {
        remainingDeck.push(card);
      }
    });

    p.hand.push(...selectedCards);
    p.deck = remainingDeck;

    if (p.hand.length < 6) {
      this._drawCard(ownerId, 6 - p.hand.length);
    }

    // Desenhar 5 cartas táticas inicialmente
    for (let i = 0; i < 5 && p.tacticoDeck.length > 0; i++) {
      p.tacticoHand.push(p.tacticoDeck.shift());
    }
  }

  grantExtraUnitCap(ownerId, n) { this.players[ownerId].extraUnitCap += n; }
  grantFreeNextUnit(ownerId) { this.players[ownerId].freeNextUnit = true; }
  getUnitCap(ownerId) {
    const baseCap = this.round === 1 ? 6 : BASE_UNIT_CAP;
    return baseCap + this.players[ownerId].extraUnitCap;
  }

  // Cura a Torre do PRÓPRIO dono (ex.: "cura ao teu Nexus" nas cartas antigas).
  healTower(ownerId, amount) {
    this.towers[ownerId] = Math.min(TOWER_MAX, this.towers[ownerId] + amount);
    this.log(`A Torre de ${ownerId === 'player' ? 'ti' : 'do adversário'} recupera ${amount}. (${this.towers[ownerId]}/${TOWER_MAX})`);
  }

  // Dano directo à Torre de targetOwnerId (quem leva o dano), vindo de um cerco
  // (coluna limpa) ou de um efeito de "dano ao Nexus inimigo".
  damageTower(targetOwnerId, amount) {
    this.towers[targetOwnerId] = Math.max(0, this.towers[targetOwnerId] - amount);
    this.log(`A Torre de ${targetOwnerId === 'player' ? 'ti' : 'do adversário'} leva ${amount} de dano. (${this.towers[targetOwnerId]}/${TOWER_MAX})`);
    this._checkWin();
  }

  addPressureMark(card, delta) {
    card.pressaoMarcas = Math.max(0, card.pressaoMarcas + delta);
  }

  addAtkMod(card, delta) { card.tempBuffAtk += delta; }

  permBuff(card, atk, vida) {
    card.permBuffAtk += atk;
    card.permBuffVida += vida;
    card.vidaAtual += vida;
  }

  reduceVidaMaxima(card, n) {
    card.permVidaMaxLoss += n;
    card.vidaMaxima = this.getVidaMaxima(card);
    if (card.vidaAtual > card.vidaMaxima) card.vidaAtual = card.vidaMaxima;
  }

  addShield(card, n) { card.escudoAtual += n; }

  heal(card, n) {
    if (!card || card.vidaAtual <= 0 || card.cannotBeHealed) return;
    card.vidaAtual = Math.min(card.vidaMaxima, card.vidaAtual + n);
    this._emitAllyHealed(card);
  }

  clearNegativeEffects(card) {
    card.tempBuffAtk = Math.max(0, card.tempBuffAtk);
    card.pressureLocked = 0;
    card._laneDebuffTemp = 0;
  }

  moveCard(card, slotType, slotIndex) {
    const p = this.players[card.ownerId];
    const fromArr = card.slotType === 'retaguarda' ? p.back : p.front;
    fromArr[card.slotIndex] = null;
    const toArr = slotType === 'retaguarda' ? p.back : p.front;
    if (toArr[slotIndex]) return; // ocupado, ignora
    card.slotType = slotType; card.slotIndex = slotIndex;
    toArr[slotIndex] = card;
  }

  setApoioDouble(ownerId) { this.players[ownerId].apoioDoubleNext = true; }
  apoioMult() { return this._currentApoioMult || 1; }
  blockApoios(ownerId) { this.players[ownerId].apoiosBlockedNextRound = true; }
  forceRupture(card) { card.forcedRupture = true; }

  returnLastDeadToHand(ownerId) {
    const p = this.players[ownerId];
    const last = p.lastDeadCard;
    if (last) { p.hand.push(last); p.lastDeadCard = null; this.log(`${last.nome} volta à mão.`); }
  }

  // -- entrada / morte --------------------------------------------------------

  _instantiate(cardDef, ownerId) {
    return {
      uid: nextUid(),
      cardId: cardDef.id,
      nome: cardDef.nome,
      faccao: cardDef.faccao,
      faccao_slug: cardDef.faccao_slug,
      subgrupo: cardDef.subgrupo,
      tipo: cardDef.tipo,
      papel: cardDef.papel,
      alinhamento: cardDef.alinhamento,
      raridade: cardDef.raridade,
      custo: cardDef.custo,
      imagem: cardDef.imagem,
      habilidade_nome: cardDef.habilidade_nome,
      habilidade_texto: cardDef.habilidade_texto,
      lore: cardDef.lore,
      baseAtaque: cardDef.ataque,
      baseVida: cardDef.vida,
      permBuffAtk: 0, permBuffVida: 0, permVidaMaxLoss: 0,
      tempBuffAtk: 0, tempDamageReduction: 0,
      staticBonusAtk: 0, staticBonusVida: 0,
      escudoAtual: cardDef.escudo || 0,
      vidaMaxima: cardDef.vida,
      vidaAtual: cardDef.vida,
      pressaoMarcas: 0,
      turnosEmCampo: 0,
      enteredRound: this.round,
      tookDamageThisRound: false,
      attackedThisRound: false,
      attackedLastRound: false,
      cannotBeTargeted: false, cannotBeTargetedByEnemies: false, cannotBeTargetedUntilRound: 0,
      cannotDieThisRound: false, pressureLocked: 0, forcedRupture: false, cannotBeHealed: false,
      noAlignmentBonus: false, readyToAttack: false,
      usedSecondLife: false,
      ownerId,
      isApoio: false,
      slotType: null, slotIndex: null,
      equipamentos: [] // cartas de equipamento acopladas
    };
  }

  canPlaceUnit(ownerId, cardDef, slotType, slotIndex) {
    const p = this.players[ownerId];
    const roles = slotType === 'frente' ? FRONT_ROLES : BACK_ROLES;
    if (!roles.has(cardDef.papel)) return false;
    if (slotType === 'retaguarda' && !BACK_LANES.includes(slotIndex)) return false; // 0 e 5 são só de Apoio
    const arr = slotType === 'frente' ? p.front : p.back;
    if (arr[slotIndex]) return false;
    if (!p.freeNextUnit && p.unitPlaysThisRound >= this.getUnitCap(ownerId)) return false;
    return true;
  }

  playUnit(ownerId, handIndex, slotType, slotIndex) {
    if (this.phase !== 'placement' || this.activePlayer !== ownerId) return { ok: false, error: 'não é a tua vez' };
    const p = this.players[ownerId];
    const cardDef = p.hand[handIndex];
    if (!cardDef || cardDef.isApoio) return { ok: false, error: 'carta inválida' };
    if (!this.canPlaceUnit(ownerId, cardDef, slotType, slotIndex)) return { ok: false, error: 'jogada inválida' };

    p.hand.splice(handIndex, 1);
    const card = this._instantiate(cardDef, ownerId);
    card.slotType = slotType; card.slotIndex = slotIndex;
    (slotType === 'frente' ? p.front : p.back)[slotIndex] = card;

    if (p.freeNextUnit) p.freeNextUnit = false; else p.unitPlaysThisRound++;

    this.log(`${ownerId === 'player' ? 'Tu' : 'Adversário'} colocaste ${card.nome}.`);
    this._onEnterLaneDebuffHooks(card);
    this._runTrigger(card, 'onEnter');

    this._advancePriority(ownerId);
    return { ok: true, card };
  }

  _onEnterLaneDebuffHooks(newCard) {
    this.enemies(newCard.ownerId).forEach(e => {
      const def = UNIT_ABILITIES.get(e.habilidade_texto);
      if (def && def.trigger === 'onEnterLaneDebuff' && this._sameLane(e, newCard)) {
        this.addAtkMod(newCard, -def.amount);
      }
      if (def && def.trigger === 'onEnterLaneDebuff_special') {
        this.reduceVidaMaxima(newCard, 1);
      }
    });
  }

  playApoio(ownerId, handIndex, targetSpec) {
    if (this.phase !== 'placement' || this.activePlayer !== ownerId) return { ok: false, error: 'não é a tua vez' };
    const p = this.players[ownerId];
    if (p.apoiosBlocked) return { ok: false, error: 'apoios bloqueados este turno' };
    const cardDef = p.hand[handIndex];
    if (!cardDef || !cardDef.isApoio) return { ok: false, error: 'carta inválida' };
    const def = APOIO_ABILITIES.get(cardDef.id);
    if (!def) return { ok: false, error: 'apoio desconhecido' };

    p.hand.splice(handIndex, 1);
    this._currentApoioMult = p.apoioDoubleNext ? 2 : 1;
    p.apoioDoubleNext = false;

    try {
      if (def.needsTarget === 'ally' || def.needsTarget === 'enemy') {
        def.run(this, ownerId, targetSpec && targetSpec.target, targetSpec && targetSpec.extra);
      } else if (def.needsTarget === 'allyPair') {
        def.run(this, ownerId, targetSpec.from, targetSpec.to);
      } else {
        def.run(this, ownerId);
      }
    } finally {
      this._currentApoioMult = 1;
    }

    this._drawCard(ownerId, 1);
    this.log(`${ownerId === 'player' ? 'Tu' : 'Adversário'} jogaste o Apoio ${cardDef.nome}.`);
    this._checkAutoAdvance(ownerId);
    return { ok: true };
  }

  playTacticoCard(ownerId, tacticoHandIndex, targetSpec) {
    if (this.phase !== 'placement' || this.activePlayer !== ownerId) return { ok: false, error: 'não é a tua vez' };
    const p = this.players[ownerId];
    const cardDef = p.tacticoHand[tacticoHandIndex];
    if (!cardDef) return { ok: false, error: 'carta tática inválida' };

    const tipo = cardDef.tipo_tatico;

    // Equipamentos precisam de alvo
    if (tipo === 'Equipamento') {
      if (!targetSpec || !targetSpec.targetCard) return { ok: false, error: 'escolhe uma unidade para equipar', needsTarget: 'card' };
      const targetCard = targetSpec.targetCard;
      if (targetCard.ownerId !== ownerId) return { ok: false, error: 'só podes equipar unidades amigas' };

      // Equipar
      p.tacticoHand.splice(tacticoHandIndex, 1);
      targetCard.equipamentos.push(cardDef);

      // Aplicar bônus
      if (cardDef.bonus_ataque) targetCard.permBuffAtk += cardDef.bonus_ataque;
      if (cardDef.bonus_vida) targetCard.vidaMaxima += cardDef.bonus_vida; targetCard.vidaAtual += cardDef.bonus_vida;

      this.log(`${ownerId === 'player' ? 'Tu' : 'Adversário'} equipaste ${cardDef.nome} em ${targetCard.nome}.`);

      // Recarrega baralho tático
      if (p.tacticoDeck.length > 0) {
        p.tacticoHand.push(p.tacticoDeck.shift());
      }
      this._checkAutoAdvance(ownerId);
      return { ok: true, card: cardDef, target: targetCard };
    }

    // Outras cartas táticas
    p.tacticoHand.splice(tacticoHandIndex, 1);

    // Tira uma nova carta tática do baralho (se houver)
    if (p.tacticoDeck.length > 0) {
      p.tacticoHand.push(p.tacticoDeck.shift());
    }

    // Estrutura para expansão futura:
    switch (tipo) {
      case 'Equipamento':
        // Nunca chega aqui (tratado acima)
        break;
      case 'Magia':
        // Magia com dano
        if (cardDef.dano) {
          const targets = this.enemies(ownerId);
          if (targets.length > 0) {
            const target = targets[0]; // simplificado: primeiro alvo
            target.vidaAtual -= cardDef.dano;
            this.log(`${ownerId === 'player' ? 'Tu' : 'Adversário'} lançaste ${cardDef.nome} (${cardDef.dano} dano).`);
          }
        }
        break;
      case 'Consumível':
        // Consumível com cura
        if (cardDef.cura) {
          const allies = this.allies(ownerId);
          if (allies.length > 0) {
            const target = allies[0]; // primeiro aliado
            const oldHp = target.vidaAtual;
            target.vidaAtual = Math.min(target.vidaMaxima, target.vidaAtual + cardDef.cura);
            const healed = target.vidaAtual - oldHp;
            this.log(`${ownerId === 'player' ? 'Tu' : 'Adversário'} usaste ${cardDef.nome} (+${healed} HP).`);
          }
        }
        p.tacticoGraveyard.push(cardDef);
        break;
      case 'Construção':
        // Construção com vida
        const construct = { ...cardDef, vidaAtual: cardDef.vida_construcao || 8, vidaMaxima: cardDef.vida_construcao || 8, ownerId, uid: nextUid() };
        p.activeTactics.push(construct);
        this.log(`${ownerId === 'player' ? 'Tu' : 'Adversário'} colocaste a Construção ${cardDef.nome}.`);
        break;
      case 'Clima':
        // Clima afeta ambos os jogadores (dano global reduzido)
        this.log(`${ownerId === 'player' ? 'Tu' : 'Adversário'} ativaste o Clima ${cardDef.nome} (reduz dano a ambos).`);
        break;
      case 'Bênção':
        // Bênção: buff temporário de ataque
        const alliesB = this.allies(ownerId);
        if (alliesB.length > 0) {
          alliesB[0].tempBuffAtk = (alliesB[0].tempBuffAtk || 0) + 2;
          this.log(`${ownerId === 'player' ? 'Tu' : 'Adversário'} invocaste ${cardDef.nome} (+2 ATK).`);
        }
        break;
      default:
        this.log(`${ownerId === 'player' ? 'Tu' : 'Adversário'} jogaste ${cardDef.nome}.`);
    }

    this._checkAutoAdvance(ownerId);
    return { ok: true, card: cardDef };
  }

  removeEquipamento(cardUid, equipamentoIdx) {
    const card = this.allCards().find(c => c.uid === cardUid);
    if (!card || !card.equipamentos || !card.equipamentos[equipamentoIdx]) return { ok: false };

    const equip = card.equipamentos[equipamentoIdx];
    card.equipamentos.splice(equipamentoIdx, 1);

    // Remover bônus
    if (equip.bonus_ataque) card.permBuffAtk -= equip.bonus_ataque;
    if (equip.bonus_vida) {
      card.vidaMaxima -= equip.bonus_vida;
      card.vidaAtual = Math.min(card.vidaAtual, card.vidaMaxima);
    }

    this.log(`${card.ownerId === 'player' ? 'Tu' : 'Adversário'} removeste ${equip.nome} de ${card.nome}.`);
    return { ok: true };
  }

  allCards() {
    const cards = [];
    ['player', 'ai'].forEach(id => {
      this.players[id].front.forEach(c => c && cards.push(c));
      this.players[id].back.forEach(c => c && cards.push(c));
      this.players[id].graveyard.forEach(c => c && cards.push(c));
    });
    return cards;
  }

  pass(ownerId) {
    if (this.phase !== 'placement' || this.activePlayer !== ownerId) return { ok: false };
    this.players[ownerId].donePlacing = true;
    this.log(`${ownerId === 'player' ? 'Tu' : 'Adversário'} passaste.`);
    this._advancePriority(ownerId, true);
    return { ok: true };
  }

  _advancePriority(actedOwnerId) {
    const other = this.opponentOf(actedOwnerId);
    const p = this.players[actedOwnerId];
    if (!p.freeNextUnit && p.unitPlaysThisRound >= this.getUnitCap(actedOwnerId) && !this._hasPlayableApoio(actedOwnerId)) {
      p.donePlacing = true;
    }
    if (this.players.player.donePlacing && this.players.ai.donePlacing) {
      this._resolveCombat();
      return;
    }
    this.activePlayer = this.players[other].donePlacing ? actedOwnerId : other;
  }

  _checkAutoAdvance(ownerId) {
    // jogar um Apoio não passa a prioridade, mas se o jogador ficou sem
    // jogadas possíveis, marca-o como pronto.
    const p = this.players[ownerId];
    if (!this._hasPlayableApoio(ownerId) && (p.freeNextUnit || p.unitPlaysThisRound < this.getUnitCap(ownerId)) && this._hasPlayableUnit(ownerId)) return;
    if (!this._hasPlayableApoio(ownerId) && !this._hasPlayableUnit(ownerId)) {
      p.donePlacing = true;
      if (this.players.player.donePlacing && this.players.ai.donePlacing) { this._resolveCombat(); return; }
      this.activePlayer = this.opponentOf(ownerId);
    }
  }

  _hasPlayableApoio(ownerId) {
    const p = this.players[ownerId];
    return !p.apoiosBlocked && p.hand.some(c => c.isApoio);
  }

  _hasPlayableUnit(ownerId) {
    const p = this.players[ownerId];
    return p.hand.some(c => !c.isApoio && (
      [0, 1, 2, 3, 4, 5].some(i => this.canPlaceUnit(ownerId, c, 'frente', i)) ||
      BACK_LANES.some(i => this.canPlaceUnit(ownerId, c, 'retaguarda', i))
    ));
  }

  destroyCard(card, killer) {
    if (!card || card.vidaAtual > 0 && card.escudoAtual > 0) { /* nunca chamado nesse estado */ }
    if (card.cannotDieThisRound) { card.vidaAtual = 1; return; }
    const p = this.players[card.ownerId];
    const arr = card.slotType === 'retaguarda' ? p.back : p.front;
    if (arr[card.slotIndex] === card) arr[card.slotIndex] = null;
    p.graveyard.push(card);
    p.lastDeadCard = card;
    this.log(`${card.nome} morreu.`);

    const def = UNIT_ABILITIES.get(card.habilidade_texto);
    if (def && def.trigger === 'onDeath') {
      const result = def.run(this, card);
      if (result === 'revive') {
        const idx = p.graveyard.indexOf(card);
        if (idx >= 0) p.graveyard.splice(idx, 1);
        card.vidaAtual = 1; card.escudoAtual = 0;
        (arr)[card.slotIndex] = card;
        this.log(`${card.nome} volta ao corredor com 1 de Vida.`);
        return;
      }
    }
    if (def && def.onDeath) def.onDeath(this, card);
    if (killer) this._runOnKill(killer);
    this._emitAllyDeath(card);
  }

  dealDamage(target, amount, source, opts = {}) {
    if (!target || amount <= 0) return;
    if (!opts.trueDamage) {
      amount = Math.max(0, amount - (target.tempDamageReduction || 0) - (target._laneReduction || 0));
    }
    if (amount <= 0) return;
    if (target.escudoAtual > 0) {
      const absorb = Math.min(target.escudoAtual, amount);
      target.escudoAtual -= absorb;
      amount -= absorb;
    }
    target.vidaAtual -= amount;
    target.tookDamageThisRound = true;
    if (target.vidaAtual <= 0) {
      if (target.cannotDieThisRound) target.vidaAtual = 1;
      else this.destroyCard(target, source);
    }
  }

  _runTrigger(card, trigger) {
    const def = UNIT_ABILITIES.get(card.habilidade_texto);
    if (def && def.trigger === trigger && def.run) def.run(this, card);
  }

  _runOnKill(card) {
    const def = UNIT_ABILITIES.get(card.habilidade_texto);
    if (def && def.trigger === 'onKill' && def.run) def.run(this, card);
    if (def && def.onKill) def.onKill(this, card);
  }

  _emitAllyDeath(deadCard) {
    this.allies(deadCard.ownerId).forEach(c => {
      const def = UNIT_ABILITIES.get(c.habilidade_texto);
      if (def && def.trigger === 'onAllyDeath' && def.run) def.run(this, c, deadCard);
      if (def && def.onAllyDeath) def.onAllyDeath(this, c, deadCard);
    });
  }

  _emitAllyHealed(healedCard) {
    this.allies(healedCard.ownerId).forEach(c => {
      const def = UNIT_ABILITIES.get(c.habilidade_texto);
      if (def && def.trigger === 'onAllyHealed' && def.run) def.run(this, c, healedCard);
    });
  }

  activatedAbility(ownerId, cardUid, ...args) {
    const card = this.getCard(cardUid);
    if (!card || card.ownerId !== ownerId) return { ok: false };
    const def = UNIT_ABILITIES.get(card.habilidade_texto);
    if (!def || def.trigger !== 'activated') return { ok: false };
    def.run(this, card, ...args);
    return { ok: true };
  }

  // -- turnos ------------------------------------------------------------

  _runTurnStartTriggers() {
    this.recomputeStatics();
    this.allInPlay().forEach(c => { c.tookDamageThisRound = false; c.attackedThisRound = false; });
    this.allInPlay().forEach(c => {
      const def = UNIT_ABILITIES.get(c.habilidade_texto);
      if (def && def.trigger === 'turnStart' && def.run) def.run(this, c);
    });
    ['player', 'ai'].forEach(id => {
      const p = this.players[id];
      p.apoiosBlocked = p.apoiosBlockedNextRound;
      p.apoiosBlockedNextRound = false;
      p.unitPlaysThisRound = 0;
      p.donePlacing = false;
    });
  }

  _resolveCombat() {
    this.phase = 'combat';
    this.combatSteps = [];
    this.recomputeStatics();

    const order = [];
    ['player', 'ai'].forEach(id => {
      this.allies(id).forEach(c => { if (c.papel === 'ASSASSINO' && this._canAct(c)) order.push({ kind: 'assassino', card: c }); });
    });
    ['player', 'ai'].forEach(id => {
      this.allies(id).forEach(c => { if (c.papel === 'ATIRADOR' && this._canAct(c)) order.push({ kind: 'atirador', card: c }); });
    });
    for (let lane = 0; lane < FRONT_LANES; lane++) {
      ['player', 'ai'].forEach(id => {
        const c = this.players[id].front[lane];
        if (c && this._canAct(c) && (c.papel === 'TANQUE' || c.papel === 'GUERREIRO')) order.push({ kind: 'frente', card: c });
      });
    }

    order.forEach(step => {
      if (step.card.vidaAtual <= 0) return; // já morreu
      this._resolveAttack(step.card, step.kind);
    });

    this._endOfRound();
  }

  _canAct(card) {
    if (card.papel === 'ASSASSINO' || card.readyToAttack) return true;
    return card.turnosEmCampo > 0;
  }

  _ruptureThreshold(card) {
    return this.players[this.opponentOf(card.ownerId)].hasSombra ? 3 : 2;
  }

  _resolveAttack(attacker, kind) {
    attacker.attackedThisRound = true;
    const threshold = this._ruptureThreshold(attacker);
    if (attacker.forcedRupture || attacker.pressaoMarcas >= threshold) {
      attacker.forcedRupture = false;
      attacker.pressaoMarcas = 0;
      const dmg = this.getEffectiveAtaque(attacker) + this.getAlignmentAtkBonus(attacker);
      const towerOwner = this.opponentOf(attacker.ownerId);
      this.damageTower(towerOwner, dmg);
      this.combatSteps.push({ type: 'rupture', attacker: attacker.uid, amount: dmg, towerOwner, towerAfter: this.towers[towerOwner] });
      return;
    }

    if (kind === 'assassino') {
      // ignora a linha da frente inimiga por completo, ataca a retaguarda directamente
      const back = BACK_LANES.map(i => this.players[this.opponentOf(attacker.ownerId)].back[i]).filter(Boolean);
      const target = back.length ? back.reduce((a, b) => (b.vidaAtual < a.vidaAtual ? b : a)) : null;
      this._strike(attacker, target, { siegeIfNoTarget: true });
      return;
    }
    if (kind === 'atirador') {
      const target = this.pickLowestVidaEnemyForCombat(attacker.ownerId);
      this._strike(attacker, target, { siegeIfNoTarget: true });
      return;
    }
    // frente: combate por coluna, progride para a retaguarda e depois para a Torre
    const opp = this.players[this.opponentOf(attacker.ownerId)];
    const lane = attacker.slotIndex;
    let target = opp.front[lane];
    if (!target && BACK_LANES.includes(lane)) target = opp.back[lane];
    this._strike(attacker, target, { siegeIfNoTarget: true });
  }

  _strike(attacker, target, { siegeIfNoTarget }) {
    if (!target) {
      if (siegeIfNoTarget) {
        const dmg = this.getEffectiveAtaque(attacker) + this.getAlignmentAtkBonus(attacker);
        const towerOwner = this.opponentOf(attacker.ownerId);
        this.damageTower(towerOwner, dmg);
        this.combatSteps.push({ type: 'siege', attacker: attacker.uid, amount: dmg, towerOwner, towerAfter: this.towers[towerOwner] });
      }
      return;
    }
    if (target.papel === 'TANQUE') this._runTrigger(target, 'none');
    const laneDef = UNIT_ABILITIES.get(target.habilidade_texto);
    let reduction = 0;
    if (laneDef && ['damageReductionLane', 'damageReductionGlobal', 'damageReductionSelf'].includes(laneDef.trigger)) {
      // aplicado abaixo via _laneReduction calculado antes do golpe
    }
    this._applyLaneReductions(target);

    let dmg = this.getEffectiveAtaque(attacker);
    dmg += this.getAlignmentAtkBonus(attacker);
    dmg += this.getCombatModBonus(attacker, target);
    dmg = Math.round(dmg * this.getMatchupMultiplier(attacker, target));
    dmg = Math.max(0, dmg);

    this._runOnAttacked(target, attacker);
    const wasAlive = target.vidaAtual > 0;
    this.dealDamage(target, dmg, attacker);
    if (wasAlive && target.vidaAtual <= 0) this._runOnKill(attacker);
    this.combatSteps.push({ type: 'attack', attacker: attacker.uid, target: target.uid, amount: dmg });
  }

  _applyLaneReductions(target) {
    target._laneReduction = 0;
    this.allies(target.ownerId).forEach(c => {
      const def = UNIT_ABILITIES.get(c.habilidade_texto);
      if (!def) return;
      if (def.trigger === 'damageReductionGlobal') target._laneReduction += def.amount;
      if (def.trigger === 'damageReductionLane' && this._sameLane(c, target)) target._laneReduction += def.amount;
      if (def.trigger === 'damageReductionSelf' && c.uid === target.uid) target._laneReduction += def.amount;
    });
  }

  _runOnAttacked(target, attacker) {
    const def = UNIT_ABILITIES.get(target.habilidade_texto);
    if (def && def.trigger === 'onAttacked' && def.run) def.run(this, target, attacker);
  }

  _endOfRound() {
    this.allInPlay().forEach(c => {
      const def = UNIT_ABILITIES.get(c.habilidade_texto);
      if (def && def.trigger === 'turnEnd' && def.run) def.run(this, c);
      if (def && def.trigger === 'special_countdown' && def.run) def.run(this, c);
    });
    this.allInPlay().forEach(c => {
      c.tempBuffAtk = 0;
      c.tempDamageReduction = 0;
      c._laneReduction = 0;
      c._laneDebuffTemp = 0;
      c.attackedLastRound = c.attackedThisRound;
      c.turnosEmCampo++;
      if (c.pressureLocked > 0) { c.pressureLocked--; }
      else { this.addPressureMark(c, 1); }
      c.cannotDieThisRound = false;
    });

    if (this._checkWin()) return;
    if (this.round >= ROUND_LIMIT) {
      // ganha quem deixou a Torre do outro mais perto de cair
      this.winner = this.towers.ai < this.towers.player ? 'player'
        : this.towers.player < this.towers.ai ? 'ai' : 'empate';
      this.phase = 'gameover';
      this.log(`Limite de turnos atingido. Vencedor: ${this.winner}.`);
      return;
    }

    this.round++;
    this.activePlayer = this.round % 2 === 0 ? 'ai' : 'player';
    this.phase = 'placement';
    this._drawCard('player', 1);
    this._drawCard('ai', 1);
    this._runTurnStartTriggers();
  }

  _checkWin() {
    if (this.towers.player <= 0) { this.winner = 'ai'; this.phase = 'gameover'; return true; }
    if (this.towers.ai <= 0) { this.winner = 'player'; this.phase = 'gameover'; return true; }
    return false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameEngine, FRONT_ROLES, BACK_ROLES, BACK_LANES, FRONT_LANES, BASE_UNIT_CAP, TOWER_MAX };
} else {
  window.GameEngine = GameEngine;
  window.FRONT_ROLES = FRONT_ROLES;
  window.BACK_ROLES = BACK_ROLES;
  window.BACK_LANES = BACK_LANES;
  window.FRONT_LANES = FRONT_LANES;
  window.BASE_UNIT_CAP = BASE_UNIT_CAP;
  window.TOWER_MAX = TOWER_MAX;
}

})();
