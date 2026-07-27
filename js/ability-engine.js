'use strict';
(function () {
/*
 * Motor de habilidades — CORREDOR
 *
 * Mapeia cada um dos 86 textos distintos de habilidade de unidade (100 cartas)
 * e os 27 efeitos de apoio para uma função executável. A arte das cartas já
 * tem o texto impresso (não pode ser editado), por isso os textos aqui têm de
 * bater certo com o que está desenhado na carta — incluindo textos antigos que
 * ainda mencionam "Energia" e "Nexus", mecânicas que este prototipo já não usa.
 *
 * Remapeamento de mecânicas descontinuadas (para as cartas continuarem a
 * funcionar sem reimprimir arte):
 *   "ganha(s) X de Energia"        -> compra X carta(s) do baralho
 *   "custa(m) -N de Energia"       -> não conta para o limite de unidades do turno
 *   "cura X ao teu Nexus"          -> empurra a barra X casas a favor do dono
 *   "causa X de dano ao Nexus inimigo" -> empurra a barra X casas a favor do dono
 */

const UNIT_ABILITIES = new Map();
const APOIO_ABILITIES = new Map();

function unit(text, def) { UNIT_ABILITIES.set(text, def); }
function apoio(id, def) { APOIO_ABILITIES.set(id, def); }

// ---------------------------------------------------------------------------
// Unidades — gatilhos: onEnter, onDeath, onAllyDeath, onKill, turnStart,
// turnEnd, onAttacked, static (recomputado antes de cada combate),
// combatMod (modifica ataque efetivo contra um alvo específico), special.
// ---------------------------------------------------------------------------

unit('Ganha +1 de Ataque por cada outro Guerreiro em jogo.', {
  trigger: 'static',
  run(engine, card) {
    const n = engine.allies(card.ownerId).filter(c => c.papel === 'GUERREIRO' && c.uid !== card.uid).length;
    card.staticBonusAtk += n;
  }
});

unit('Reduz 1 de dano a todas as tuas cartas neste corredor.', {
  trigger: 'damageReductionLane',
  amount: 1
});

unit('Ao entrar, cura 2 a todas as tuas cartas.', {
  trigger: 'onEnter',
  run(engine, card) { engine.allies(card.ownerId).forEach(a => engine.heal(a, 2)); }
});

unit('Se não levou dano este turno, ganha +2 de Ataque.', {
  trigger: 'combatMod',
  run(engine, card) { return card.tookDamageThisRound ? 0 : 2; }
});

unit('No início de cada turno, dá −1 de Ataque a uma carta inimiga.', {
  trigger: 'turnStart',
  run(engine, card) {
    const t = engine.pickHighestAtaqueEnemy(card.ownerId);
    if (t) engine.addAtkMod(t, -1);
  }
});

unit('Sempre que uma carta tua morre, cura 2 ao teu Nexus.', {
  trigger: 'onAllyDeath',
  run(engine, card) { engine.healTower(card.ownerId, 2); }
});

unit('Ao matar uma carta inimiga, ganhas 1 de Energia.', {
  trigger: 'onKill',
  run(engine, card) { engine.drawCard(card.ownerId, 1); }
});

unit('As tuas cartas custam −1 de Energia (mínimo 1). Ao entrar, ganhas 2 de Energia.', {
  trigger: 'onEnter',
  run(engine, card) { engine.grantExtraUnitCap(card.ownerId, 1); engine.drawCard(card.ownerId, 2); }
});

unit('Todos os teus Guerreiros ganham +1/+1. Quando o Muro morre, o bónus mantém-se até ao fim.', {
  trigger: 'onEnter',
  run(engine, card) {
    engine.allies(card.ownerId).filter(c => c.papel === 'GUERREIRO').forEach(c => engine.permBuff(c, 1, 1));
  }
});

unit('Ganha +1 de Vida por cada outro Guerreiro em jogo.', {
  trigger: 'static',
  run(engine, card) {
    const n = engine.allies(card.ownerId).filter(c => c.papel === 'GUERREIRO' && c.uid !== card.uid).length;
    card.staticBonusVida += n;
  }
});

unit('Ao entrar, dá +1 de Vida a todos os teus Guerreiros.', {
  trigger: 'onEnter',
  run(engine, card) { engine.allies(card.ownerId).filter(c => c.papel === 'GUERREIRO').forEach(c => engine.permBuff(c, 0, 1)); }
});

unit('Os teus Guerreiros custam −1 de Energia (mínimo 1).', {
  trigger: 'onEnter',
  run(engine, card) { engine.grantExtraUnitCap(card.ownerId, 1); }
});

unit('Ao entrar, ganhas 1 de Energia.', {
  trigger: 'onEnter',
  run(engine, card) { engine.drawCard(card.ownerId, 1); }
});

unit('Ao entrar, cura 3 ao teu Nexus.', {
  trigger: 'onEnter',
  run(engine, card) { engine.healTower(card.ownerId, 3); }
});

unit('No início de cada turno, dá +1 de Ataque a uma carta tua.', {
  trigger: 'turnStart',
  run(engine, card) {
    const t = engine.pickMostWoundedAlly(card.ownerId) || engine.allies(card.ownerId)[0];
    if (t) engine.addAtkMod(t, 1);
  }
});

unit('Ao entrar, a próxima carta que jogares custa −2 de Energia.', {
  trigger: 'onEnter',
  run(engine, card) { engine.grantFreeNextUnit(card.ownerId); }
});

unit('Cartas inimigas que entrem neste corredor perdem 1 de Ataque.', {
  trigger: 'onEnterLaneDebuff',
  amount: 1
});

unit('Cartas inimigas neste corredor perdem 1 de Ataque enquanto esta carta viver.', {
  trigger: 'staticLaneDebuff',
  amount: 1
});

unit('Ganha +1 de Ataque contra cartas de tipo Sombra.', {
  trigger: 'combatMod',
  run(engine, card, defender) { return defender && defender.tipo.includes('SOMBRA') ? 1 : 0; }
});

unit('Ao morrer, cura 1 ao teu Nexus.', {
  trigger: 'onDeath',
  run(engine, card) { engine.healTower(card.ownerId, 1); }
});

unit('Ganha +1/+1 por cada outra carta de tipo Ancestral em jogo.', {
  trigger: 'static',
  run(engine, card) {
    const n = engine.allies(card.ownerId).filter(c => c.tipo.includes('ANCESTRAL') && c.uid !== card.uid).length;
    card.staticBonusAtk += n; card.staticBonusVida += n;
  }
});

unit('No início de cada turno, cura 1 a todas as tuas cartas.', {
  trigger: 'turnStart',
  run(engine, card) { engine.allies(card.ownerId).forEach(a => engine.heal(a, 1)); }
});

unit('Reduz 2 de dano a todas as tuas cartas neste corredor.', {
  trigger: 'damageReductionLane',
  amount: 2
});

unit('Sempre que uma carta tua morre, dá −1 de Ataque a uma carta inimiga.', {
  trigger: 'onAllyDeath',
  run(engine, card) {
    const t = engine.pickHighestAtaqueEnemy(card.ownerId);
    if (t) engine.addAtkMod(t, -1);
  }
});

unit('Sempre que uma carta tua morre, ganha +1/+1 permanente.', {
  trigger: 'onAllyDeath',
  run(engine, card) { engine.permBuff(card, 1, 1); }
});

unit('Ao morrer, cura 3 ao teu Nexus e todos os teus Anjos ganham +1 de Ataque.', {
  trigger: 'onDeath',
  run(engine, card) {
    engine.healTower(card.ownerId, 3);
    engine.allies(card.ownerId).forEach(c => { if (c.tipo.includes('ANJO')) engine.permBuff(c, 1, 0); });
  }
});

unit('Cartas inimigas de tipo Demónio e Sombra não recebem bónus de Alinhamento. As tuas mortes curam 2 em vez de 1.', {
  trigger: 'static',
  run(engine, card) {
    engine.setFlag(card.ownerId === 'player' ? 'ai' : 'player', 'alignmentBlockedTipos', ['DEMÓNIO', 'SOMBRA']);
    engine.setFlag(card.ownerId, 'deathHealBonus', true);
  }
});

unit('No fim de cada turno, cura 1 ao teu Nexus.', {
  trigger: 'turnEnd',
  run(engine, card) { engine.healTower(card.ownerId, 1); }
});

unit('Quando uma carta tua morre, cura 2 à tua carta mais ferida.', {
  trigger: 'onAllyDeath',
  run(engine, card) {
    const t = engine.pickMostWoundedAlly(card.ownerId);
    if (t) engine.heal(t, engine.getFlag(card.ownerId, 'deathHealBonus') ? 3 : 2);
  }
});

unit('Cartas inimigas de tipo Demónio perdem 1 de Ataque.', {
  trigger: 'static',
  run(engine, card) {
    engine.enemies(card.ownerId).forEach(e => { if (e.tipo.includes('DEMÓNIO')) e.staticBonusAtk -= 1; });
  }
});

unit('Ganha +2 de Ataque contra cartas de tipo Sombra.', {
  trigger: 'combatMod',
  run(engine, card, defender) { return defender && defender.tipo.includes('SOMBRA') ? 2 : 0; }
});

unit('Reduz 1 de dano a todas as tuas cartas.', {
  trigger: 'damageReductionGlobal',
  amount: 1
});

unit('Ao morrer, dá +1/+1 a uma carta tua.', {
  trigger: 'onDeath',
  run(engine, card) {
    const t = engine.pickMostWoundedAlly(card.ownerId) || engine.allies(card.ownerId)[0];
    if (t) engine.permBuff(t, 1, 1);
  }
});

unit('Sempre que uma carta tua morre, cura 1 a todas as tuas cartas.', {
  trigger: 'onAllyDeath',
  run(engine, card) {
    const bonus = engine.getFlag(card.ownerId, 'deathHealBonus') ? 1 : 0;
    engine.allies(card.ownerId).forEach(a => engine.heal(a, 1 + bonus));
  }
});

unit('Ganha +1 de Ataque por cada carta tua que já morreu.', {
  trigger: 'static',
  run(engine, card) { card.staticBonusAtk += engine.getGraveyardCount(card.ownerId); }
});

unit('Ganha +1/+1 sempre que uma carta tua morre.', {
  trigger: 'onAllyDeath',
  run(engine, card) { engine.permBuff(card, 1, 1); }
});

unit('Ao entrar, todas as tuas cartas de tipo Ancestral ganham +1/+1.', {
  trigger: 'onEnter',
  run(engine, card) { engine.allies(card.ownerId).forEach(c => { if (c.tipo.includes('ANCESTRAL')) engine.permBuff(c, 1, 1); }); }
});

unit('Ganha +1 de Vida no fim de cada turno.', {
  trigger: 'turnEnd',
  run(engine, card) { engine.permBuff(card, 0, 1); }
});

unit('Ao entrar, dá −1 de Ataque a uma carta inimiga.', {
  trigger: 'onEnter',
  run(engine, card) {
    const t = engine.pickHighestAtaqueEnemy(card.ownerId);
    if (t) engine.addAtkMod(t, -1);
  }
});

unit('Não pode ser alvo de efeitos no turno em que entra.', {
  trigger: 'onEnter',
  run(engine, card) { card.cannotBeTargeted = true; card.cannotBeTargetedUntilRound = card.enteredRound + 1; }
});

unit('Ganha +1 de Ataque por cada turno que sobreviveu.', {
  trigger: 'static',
  run(engine, card) { card.staticBonusAtk += card.turnosEmCampo; }
});

unit('Ao entrar, causa 2 de dano a uma carta inimiga.', {
  trigger: 'onEnter',
  run(engine, card) {
    const t = engine.pickLowestVidaEnemy(card.ownerId);
    if (t) engine.dealDamage(t, 2, card);
  }
});

unit('No início de cada turno, dá +1 de Vida a todas as tuas cartas.', {
  trigger: 'turnStart',
  run(engine, card) { engine.allies(card.ownerId).forEach(a => engine.permBuff(a, 0, 1)); }
});

unit('Cartas inimigas de tipo Metal perdem 1 de Ataque.', {
  trigger: 'static',
  run(engine, card) { engine.enemies(card.ownerId).forEach(e => { if (e.tipo.includes('METAL')) e.staticBonusAtk -= 1; }); }
});

unit('Ganha +1/+1 no fim de cada turno.', {
  trigger: 'turnEnd',
  run(engine, card) { engine.permBuff(card, 1, 1); }
});

unit('No início de cada turno, todas as tuas cartas ganham +1 de Vida (máx. +3).', {
  trigger: 'turnStart',
  run(engine, card) {
    engine.allies(card.ownerId).forEach(a => {
      a._raizProfundaStacks = a._raizProfundaStacks || 0;
      if (a._raizProfundaStacks < 3) { engine.permBuff(a, 0, 1); a._raizProfundaStacks++; }
    });
  }
});

unit('No início de cada turno, dá +1/+1 permanente a outra carta tua. Ao morrer, transfere todo o seu Ataque e Vida à carta aliada mais próxima.', {
  trigger: 'turnStart',
  run(engine, card) {
    const others = engine.allies(card.ownerId).filter(c => c.uid !== card.uid);
    if (others.length) engine.permBuff(others[0], 1, 1);
  },
  onDeath(engine, card) {
    const near = engine.pickNearestAlly(card);
    if (near) engine.permBuff(near, card.ataque, card.vidaAtual > 0 ? card.vidaAtual : 0);
  }
});

unit('No fim de cada turno, dá +1 de Vida a uma carta tua.', {
  trigger: 'turnEnd',
  run(engine, card) {
    const t = engine.pickMostWoundedAlly(card.ownerId);
    if (t) engine.permBuff(t, 0, 1);
  }
});

unit('Reduz 1 de dano recebido por esta carta.', {
  trigger: 'damageReductionSelf',
  amount: 1
});

unit('Ganha +2 de Ataque no turno em que entra.', {
  trigger: 'onEnter',
  run(engine, card) { engine.addAtkMod(card, 2); }
});

unit('Ganha +1 de Vida por cada turno que sobreviveu.', {
  trigger: 'static',
  run(engine, card) { card.staticBonusVida += card.turnosEmCampo; }
});

unit('No início de cada turno, causa 1 de dano a uma carta inimiga.', {
  trigger: 'turnStart',
  run(engine, card) {
    const t = engine.pickLowestVidaEnemy(card.ownerId);
    if (t) engine.dealDamage(t, 1, card);
  }
});

unit('Não pode ser alvo de efeitos inimigos.', {
  trigger: 'static',
  run(engine, card) { card.cannotBeTargetedByEnemies = true; }
});

unit('Ao entrar, causa 1 de dano a uma carta inimiga.', {
  trigger: 'onEnter',
  run(engine, card) {
    const t = engine.pickLowestVidaEnemy(card.ownerId);
    if (t) engine.dealDamage(t, 1, card);
  }
});

unit('Ao ser atacada, causa 1 de dano ao atacante.', {
  trigger: 'onAttacked',
  run(engine, card, attacker) { if (attacker) engine.dealDamage(attacker, 1, card); }
});

unit('As tuas cartas de tipo Plantas ganham +1/+1.', {
  trigger: 'static',
  run(engine, card) { engine.allies(card.ownerId).forEach(a => { if (a.tipo.includes('PLANTAS')) { a.staticBonusAtk += 1; a.staticBonusVida += 1; } }); }
});

unit('Sem habilidade. Não pede nada e não recusa nada.', { trigger: 'none' });

unit('Se atacou no turno anterior, ganha +1 de Ataque.', {
  trigger: 'combatMod',
  run(engine, card) { return card.attackedLastRound ? 1 : 0; }
});

unit('Ao morrer, dá +1 de Ataque a um Monstro teu.', {
  trigger: 'onDeath',
  run(engine, card) {
    const m = engine.allies(card.ownerId).find(c => c.tipo.includes('MONSTRO'));
    if (m) engine.permBuff(m, 1, 0);
  }
});

unit('Ganha +1 de Ataque por cada outro Monstro em jogo.', {
  trigger: 'static',
  run(engine, card) {
    const n = engine.allInPlay().filter(c => c.tipo.includes('MONSTRO') && c.uid !== card.uid).length;
    card.staticBonusAtk += n;
  }
});

unit('Ao entrar, retira 1 de Vida máxima a uma carta inimiga.', {
  trigger: 'onEnter',
  run(engine, card) {
    const t = engine.pickLowestVidaEnemy(card.ownerId);
    if (t) engine.reduceVidaMaxima(t, 1);
  }
});

unit('Ao morrer, causa 2 de dano a todas as cartas inimigas neste corredor.', {
  trigger: 'onDeath',
  run(engine, card) { engine.laneEnemiesOf(card).forEach(e => engine.dealDamage(e, 2, card)); }
});

unit('Ao matar uma carta inimiga, rouba 1 de Vida.', {
  trigger: 'onKill',
  run(engine, card) { engine.permBuff(card, 0, 1); }
});

unit('Enquanto estiver em jogo, cartas inimigas de tipo Anjo perdem 1 de Ataque.', {
  trigger: 'static',
  run(engine, card) { engine.enemies(card.ownerId).forEach(e => { if (e.tipo.includes('ANJO')) e.staticBonusAtk -= 1; }); }
});

unit('Cada Monstro em jogo dá +1 de Ataque a todos os Monstros. Ao matar, rouba 1 de Vida.', {
  trigger: 'static',
  run(engine, card) {
    if (!card.tipo.includes('MONSTRO')) return;
    const n = engine.allInPlay().filter(c => c.tipo.includes('MONSTRO')).length;
    card.staticBonusAtk += n - 1;
  },
  onKill(engine, card) { engine.permBuff(card, 0, 1); }
});

unit('Cada Cultista ou Demónio em jogo dá +1 de Ataque a todos os Monstros. Quando um Monstro teu morre, causa 1 de dano ao Nexus inimigo.', {
  trigger: 'static',
  run(engine, card) {
    if (!card.tipo.includes('MONSTRO')) return;
    const n = engine.allInPlay().filter(c => c.subgrupo === 'CULTISTAS' || c.tipo.includes('DEMÓNIO')).length;
    card.staticBonusAtk += n;
  },
  onAllyDeath(engine, card, deadCard) {
    if (deadCard.tipo.includes('MONSTRO')) engine.damageTower(engine.opponentOf(card.ownerId), 1);
  }
});

unit('Ganha +1 de Ataque por cada outro Monstro teu em jogo.', {
  trigger: 'static',
  run(engine, card) {
    const n = engine.allies(card.ownerId).filter(c => c.tipo.includes('MONSTRO') && c.uid !== card.uid).length;
    card.staticBonusAtk += n;
  }
});

unit('Ganha +2 de Ataque contra cartas com 3 ou menos de Vida.', {
  trigger: 'combatMod',
  run(engine, card, defender) { return defender && defender.vidaAtual <= 3 ? 2 : 0; }
});

unit('Todas as tuas cartas de tipo Besta ganham +1 de Ataque.', {
  trigger: 'static',
  run(engine, card) { engine.allies(card.ownerId).forEach(a => { if (a.tipo.includes('BESTA')) a.staticBonusAtk += 1; }); }
});

unit('Podes destruir outra carta tua para dar +2/+2 a uma carta tua.', {
  trigger: 'activated',
  run(engine, card, sacrificeUid, targetUid) {
    const sac = engine.getCard(sacrificeUid);
    const target = engine.getCard(targetUid);
    if (!sac || !target || sac.uid === card.uid) return;
    engine.destroyCard(sac, card);
    engine.permBuff(target, 2, 2);
  }
});

unit('Cartas inimigas perdem 1 de Vida máxima ao entrar em jogo.', {
  trigger: 'onEnterLaneDebuff_special',
  run(engine, card) { /* aplicado globalmente via hook onEnemyEnter */ }
});

unit('Ganha +3 de Ataque contra cartas com 2 ou menos de Vida.', {
  trigger: 'combatMod',
  run(engine, card, defender) { return defender && defender.vidaAtual <= 2 ? 3 : 0; }
});

unit('Ao matar uma carta inimiga, todos os teus Monstros ganham +1 de Ataque.', {
  trigger: 'onKill',
  run(engine, card) { engine.allies(card.ownerId).forEach(c => { if (c.tipo.includes('MONSTRO')) engine.permBuff(c, 1, 0); }); }
});

unit('Não ataca no turno em que entra. A partir daí, causa 2 de dano extra.', {
  trigger: 'combatMod',
  run(engine, card) { return card.turnosEmCampo > 0 ? 2 : 0; }
});

unit('Não ataca durante 2 turnos. No terceiro, dispara 6 de dano ao corredor inimigo.', {
  trigger: 'special_countdown',
  run(engine, card) {
    if (card.turnosEmCampo >= 2) {
      engine.laneEnemiesOf(card).forEach(e => engine.dealDamage(e, 6, card));
      if (engine.laneEnemiesOf(card).length === 0) engine.damageTower(engine.opponentOf(card.ownerId), 6);
      return true; // dispara e consome a habilidade
    }
    return false;
  }
});

unit('Não recebe bónus de Alinhamento. Enquanto estiver em jogo, o teu baralho não perde bónus por misturar Fiéis e Convertidos.', {
  trigger: 'static',
  run(engine, card) { card.noAlignmentBonus = true; engine.setFlag(card.ownerId, 'deckCohesionIgnored', true); }
});

unit('Ao entrar, dá +1 de Vida a todas as tuas cartas de tipo Metal.', {
  trigger: 'onEnter',
  run(engine, card) { engine.allies(card.ownerId).forEach(c => { if (c.tipo.includes('METAL')) engine.permBuff(c, 0, 1); }); }
});

unit('Ganha +1 de Ataque contra cartas de tipo Plantas.', {
  trigger: 'combatMod',
  run(engine, card, defender) { return defender && defender.tipo.includes('PLANTAS') ? 1 : 0; }
});

unit('Cartas inimigas neste corredor perdem 1 de Ataque.', {
  trigger: 'staticLaneDebuff',
  amount: 1
});

unit('Ganha +1 de Ataque no fim de cada turno e perde 1 de Vida.', {
  trigger: 'turnEnd',
  run(engine, card) { engine.permBuff(card, 1, 0); engine.dealDamage(card, 1, card, { trueDamage: true }); }
});

unit('Ao entrar, causa 1 de dano a todas as cartas inimigas neste corredor.', {
  trigger: 'onEnter',
  run(engine, card) { engine.laneEnemiesOf(card).forEach(e => engine.dealDamage(e, 1, card)); }
});

unit('Ao entrar, cura 3 a uma carta tua.', {
  trigger: 'onEnter',
  run(engine, card) {
    const t = engine.pickMostWoundedAlly(card.ownerId) || card;
    engine.heal(t, 3);
  }
});

unit('Ganha +1/+1 sempre que outra carta tua ganha Vida.', {
  trigger: 'onAllyHealed',
  run(engine, card, healedCard) { if (healedCard.uid !== card.uid) engine.permBuff(card, 1, 1); }
});

unit('No fim de cada turno, cura 1 a uma carta tua.', {
  trigger: 'turnEnd',
  run(engine, card) {
    const t = engine.pickMostWoundedAlly(card.ownerId) || card;
    engine.heal(t, 1);
  }
});

unit('Não pode ser curado. Ganha +1 de Ataque no fim de cada turno.', {
  trigger: 'turnEnd',
  run(engine, card) { card.cannotBeHealed = true; engine.permBuff(card, 1, 0); }
});

unit('Uma vez por partida, ao morrer volta ao corredor com 1 de Vida.', {
  trigger: 'onDeath',
  run(engine, card) {
    if (card.usedSecondLife) return false;
    card.usedSecondLife = true;
    return 'revive';
  }
});

// ---------------------------------------------------------------------------
// Apoios — todos custo 0, sem limite por turno, repõem (compram 1 carta).
// Todos exigem alvo explícito do jogador quando afetam "uma carta".
// ---------------------------------------------------------------------------

apoio('AP-01', { needsTarget: 'ally', run(engine, ownerId, target) { engine.addShield(target, 3 * engine.apoioMult(ownerId)); } });
apoio('AP-02', { needsTarget: 'ally', run(engine, ownerId, target) { engine.heal(target, 3 * engine.apoioMult(ownerId)); } });
apoio('AP-03', { needsTarget: null, run(engine, ownerId) { engine.allies(ownerId).forEach(a => { a.tempDamageReduction += 2 * engine.apoioMult(ownerId); }); } });
apoio('AP-04', { needsTarget: 'ally', run(engine, ownerId, target) { target.readyToAttack = true; } });
apoio('AP-05', { needsTarget: null, run(engine, ownerId) { engine.allies(ownerId).forEach(a => engine.addPressureMark(a, 1)); } });
apoio('AP-06', { needsTarget: null, run(engine, ownerId) { engine.setApoioDouble(ownerId); } });
apoio('AP-07', { needsTarget: 'ally', run(engine, ownerId, target) { engine.heal(target, 4 * engine.apoioMult(ownerId)); } });
apoio('AP-08', { needsTarget: 'ally', run(engine, ownerId, target) { engine.heal(target, 2 * engine.apoioMult(ownerId)); engine.clearNegativeEffects(target); } });
apoio('AP-09', { needsTarget: null, run(engine, ownerId) { engine.allies(ownerId).forEach(a => engine.heal(a, 2 * engine.apoioMult(ownerId))); } });
apoio('AP-10', { needsTarget: 'enemy', requireFn(engine, ownerId, target) { return target.vidaAtual <= 2; }, run(engine, ownerId, target) { engine.destroyCard(target, null); } });
apoio('AP-11', { needsTarget: null, run(engine, ownerId) { engine.allies(ownerId).forEach(a => { a.cannotDieThisRound = true; }); } });
apoio('AP-12', { needsTarget: null, run(engine, ownerId) {
  const t = engine.pickMostWoundedAlly(ownerId); if (t) { engine.heal(t, 4 * engine.apoioMult(ownerId)); engine.addShield(t, 2 * engine.apoioMult(ownerId)); }
} });
apoio('AP-13', { needsTarget: 'ally', run(engine, ownerId, target) { engine.permBuff(target, 1, 1); } });
apoio('AP-14', { needsTarget: 'ally', run(engine, ownerId, target, extra) {
  if (extra && extra.slotType && typeof extra.slotIndex === 'number') engine.moveCard(target, extra.slotType, extra.slotIndex);
  engine.addShield(target, 2);
} });
apoio('AP-15', { needsTarget: 'enemy', run(engine, ownerId, target) { target.pressureLocked = 2; } });
apoio('AP-16', { needsTarget: null, run(engine, ownerId) { engine.allies(ownerId).forEach(a => { engine.heal(a, 2 * engine.apoioMult(ownerId)); engine.permBuff(a, 1, 0); }); } });
apoio('AP-17', { needsTarget: 'allyPair', run(engine, ownerId, from, to) {
  const amt = Math.floor(from.vidaAtual / 2);
  engine.dealDamage(from, amt, null, { trueDamage: true });
  engine.heal(to, amt);
  engine.permBuff(to, 2, 0);
} });
apoio('AP-18', { needsTarget: 'ally', run(engine, ownerId, target) { engine.addAtkMod(target, 2 * engine.apoioMult(ownerId)); } });
apoio('AP-19', { needsTarget: 'enemy', run(engine, ownerId, target) { engine.addPressureMark(target, -1); } });
apoio('AP-20', { needsTarget: 'enemy', run(engine, ownerId, target) { engine.reduceVidaMaxima(target, 1); } });
apoio('AP-21', { needsTarget: 'ally', run(engine, ownerId, target) {
  engine.destroyCard(target, null);
  engine.allies(ownerId).forEach(a => engine.permBuff(a, 2, 2));
} });
apoio('AP-22', { needsTarget: null, run(engine, ownerId) {
  const t = engine.pickHighestAtaqueEnemy(ownerId); if (t) engine.dealDamage(t, 3, null, { trueDamage: true });
} });
apoio('AP-23', { needsTarget: null, run(engine, ownerId) { engine.blockApoios(ownerId === 'player' ? 'ai' : 'player'); } });
apoio('AP-24', { needsTarget: null, run(engine, ownerId) { engine.allies(ownerId).forEach(a => engine.addShield(a, 2 * engine.apoioMult(ownerId))); } });
apoio('AP-25', { needsTarget: 'ally', run(engine, ownerId, target) { engine.addAtkMod(target, 3); engine.dealDamage(target, 1, null, { trueDamage: true }); } });
apoio('AP-26', { needsTarget: null, run(engine, ownerId) { engine.returnLastDeadToHand(ownerId); } });
apoio('AP-27', { needsTarget: 'ally', run(engine, ownerId, target) { engine.forceRupture(target); } });

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UNIT_ABILITIES, APOIO_ABILITIES };
} else {
  window.AbilityEngine = { UNIT_ABILITIES, APOIO_ABILITIES };
}

})();
