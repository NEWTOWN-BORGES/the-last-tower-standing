'use strict';
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const menuScreen = $('#menu-screen');
  const gameScreen = $('#game-screen');
  const boardEl = $('.board');
  const factionListEl = $('#faction-list');
  const btnStart = $('#btn-start');
  const handCardsEl = $('#hand-cards');
  const tacticoCardsEl = $('#tactico-cards');
  const btnPass = $('#btn-pass');
  const roundNumEl = $('#round-num');
  const turnIndicatorEl = $('#turn-indicator');
  const unitCapEl = $('#unit-cap-num');
  const towerFillAi = $('#tower-fill-ai');
  const towerFillPlayer = $('#tower-fill-player');
  const towerHpAi = $('#tower-hp-ai');
  const towerHpPlayer = $('#tower-hp-player');
  const towerBarAi = $('.tower-ai');
  const towerBarPlayer = $('.tower-player');
  const btnLog = $('#btn-log');
  const logPanel = $('#log-panel');
  const zoomOverlay = $('#zoom-overlay');
  const zoomImg = $('#zoom-img');
  const zoomActions = $('#zoom-actions');
  const zoomPlayBtn = $('#zoom-play');
  const zoomCancelBtn = $('#zoom-cancel');
  const targetOverlay = $('#target-overlay');
  const targetPromptText = $('#target-prompt-text');
  const targetCancelBtn = $('#target-cancel');
  const gameoverOverlay = $('#gameover-overlay');
  const gameoverTitle = $('#gameover-title');
  const gameoverSub = $('#gameover-sub');
  const btnRestart = $('#btn-restart');

  const FRONT_LANE_COUNT = 6;

  let cartas = null;
  let engine = null;
  let aiPlayer = null;
  let selectedHandIndex = null;
  let pendingApoio = null; // { handIndex, def, cardDef, pairFrom }
  let logLines = [];
  let prevRenderedUids = new Set();
  let busy = false; // bloqueia input durante animações
  let gameoverShown = false;

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  buildBoardSlots();

  fetch('cartas.json').then((r) => r.json()).then((data) => {
    cartas = data;
    buildFactionMenu();
  });

  // ---------------------------------------------------------------- montagem estática do tabuleiro

  function buildBoardSlots() {
    buildRank('rank-enemy-back', 'ai', 'retaguarda');
    buildRank('rank-enemy-front', 'ai', 'frente');
    buildRank('rank-player-front', 'player', 'frente');
    buildRank('rank-player-back', 'player', 'retaguarda');
  }

  function buildRank(containerId, owner, slotType) {
    const container = document.getElementById(containerId);
    for (let i = 0; i < FRONT_LANE_COUNT; i++) {
      const isApoioEdge = slotType === 'retaguarda' && (i === 0 || i === FRONT_LANE_COUNT - 1);
      const div = document.createElement('div');
      div.className = 'slot' + (isApoioEdge ? ' slot-apoio' : '');
      div.dataset.owner = owner;
      div.dataset.slotType = slotType;
      div.dataset.slotIndex = String(i);
      div.innerHTML = `<div class="slot-icon">${isApoioEdge ? '🧪' : (slotType === 'frente' ? '⚔' : '🏹')}</div>`;
      div.addEventListener('click', () => onSlotClick(div));
      container.appendChild(div);
    }
  }

  function slotEl(owner, slotType, slotIndex) {
    return $(`.slot[data-owner="${owner}"][data-slot-type="${slotType}"][data-slot-index="${slotIndex}"]`);
  }

  // ---------------------------------------------------------------- menu

  function buildFactionMenu() {
    const slugs = listFactions(cartas);
    factionListEl.innerHTML = '';
    let chosen = null;
    slugs.forEach((slug) => {
      const sample = cartas.unidades.find((c) => c.faccao_slug === slug);
      const aligns = [...new Set(cartas.unidades.filter((c) => c.faccao_slug === slug).map((c) => c.alinhamento))];
      const opt = document.createElement('div');
      opt.className = 'faction-option';
      opt.innerHTML = `<div><div class="fx-name">${sample.faccao}</div><div class="fx-align">${aligns.join(' / ')}</div></div>`;
      opt.addEventListener('click', () => {
        Sound.click();
        $$('.faction-option').forEach((e) => e.classList.remove('selected'));
        opt.classList.add('selected');
        chosen = slug;
        btnStart.disabled = false;
        btnStart.onclick = () => { Sound.click(); startGame(chosen, slugs); };
      });
      factionListEl.appendChild(opt);
    });
  }

  const btnMusic = $('#btn-music');
  btnMusic?.addEventListener('click', () => {
    const isMuted = Sound.isMuted();
    Sound.setMuted(!isMuted);
    btnMusic.textContent = !isMuted ? '🔇 Muto' : '🎵 Música';
  });

  function startGame(playerSlug, allSlugs) {
    const others = allSlugs.filter((s) => s !== playerSlug);
    const aiSlug = others[Math.floor(Math.random() * others.length)];
    const playerDeck = buildFactionDeck(cartas, playerSlug);
    const aiDeck = buildFactionDeck(cartas, aiSlug);

    logLines = [];
    prevRenderedUids = new Set();
    gameoverShown = false;
    engine = new GameEngine({
      playerDeck, aiDeck,
      log: (msg) => { logLines.push(msg); renderLog(); }
    });
    aiPlayer = new AIPlayer('ai');

    menuScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    Sound.startMusic();
    render();
    maybeAdvanceAI();
  }

  // ---------------------------------------------------------------- render

  function cardHtml(card) {
    const marks = [0, 1].map((i) => `<div class="pressure-dot ${i < card.pressaoMarcas ? 'lit' : ''}"></div>`).join('');
    const atk = engine.getEffectiveAtaque(card) + engine.getAlignmentAtkBonus(card);
    const equipHtml = card.equipamentos.map((eq, idx) =>
      `<div class="equipment-badge equipment-${card.uid}-${idx}" style="right: ${idx * 50}px;" data-uid="${card.uid}" data-equip-idx="${idx}"><img src="assets/taticos-3d/${eq.imagem}" alt="${eq.nome}"><span>⚔</span></div>`
    ).join('');
    return `
      <img src="${card.imagem}" alt="${card.nome}" draggable="false">
      <div class="pressure-marks">${marks}</div>
      <div class="cstat-bar">
        <span class="cstat atk">⚔${atk}</span>
        ${card.escudoAtual > 0 ? `<span class="cstat escudo">🛡${card.escudoAtual}</span>` : ''}
        <span class="cstat vida">❤${Math.max(0, card.vidaAtual)}</span>
      </div>
      ${equipHtml ? `<div class="equipment-container">${equipHtml}</div>` : ''}`;
  }

  function apoioThumbHtml(cardDef) {
    return `<img src="${cardDef.imagem}" alt="${cardDef.nome}" draggable="false">`;
  }

  function render() {
    const currentUids = new Set();
    ['player', 'ai'].forEach((owner) => {
      ['frente', 'retaguarda'].forEach((slotType) => {
        const arr = engine.players[owner][slotType === 'frente' ? 'front' : 'back'];
        arr.forEach((card, idx) => {
          const el = slotEl(owner, slotType, idx);
          if (!el) return;
          const existingCardEl = el.querySelector('.card-el');
          if (existingCardEl) existingCardEl.remove();
          if (card) {
            currentUids.add(card.uid);
            const div = document.createElement('div');
            div.className = 'card-el';
            div.dataset.uid = card.uid;
            if (!prevRenderedUids.has(card.uid)) div.classList.add('entering');
            div.innerHTML = cardHtml(card);
            div.addEventListener('click', (ev) => { ev.stopPropagation(); onBoardCardClick(card); });
            el.appendChild(div);
          }
        });
      });
    });
    prevRenderedUids = currentUids;

    renderApoioEdges();
    renderHand();
    renderTacticoHand();
    renderHud();
    renderTowers();

    // Adicionar event listeners aos equipamentos
    $$('.equipment-badge').forEach((badgeEl) => {
      badgeEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const uid = badgeEl.dataset.uid;
        const equipIdx = parseInt(badgeEl.dataset.equipIdx, 10);
        removeEquipamentoFromCard(uid, equipIdx);
      });
    });
  }

  function removeEquipamentoFromCard(cardUid, equipIdx) {
    if (engine.phase !== 'placement' || engine.activePlayer !== 'player' || busy) {
      Sound.error();
      return;
    }
    const result = engine.removeEquipamento(cardUid, equipIdx);
    if (!result.ok) {
      Sound.error();
      return;
    }
    Sound.click();
    render();
  }

  function renderApoioEdges() {
    [['player', slotEl('player', 'retaguarda', 0)], ['ai', slotEl('ai', 'retaguarda', 0)]].forEach(([owner, el]) => {
      if (!el) return;
      const existing = el.querySelector('.card-el');
      if (existing) existing.remove();
      const last = engine.players[owner].lastApoio;
      if (last) {
        const div = document.createElement('div');
        div.className = 'card-el';
        div.innerHTML = apoioThumbHtml(last);
        div.addEventListener('click', (ev) => { ev.stopPropagation(); showZoomReadOnly(last.imagem); });
        el.appendChild(div);
      }
    });
  }

  function renderHand() {
    handCardsEl.innerHTML = '';
    const p = engine.players.player;
    const myTurn = engine.phase === 'placement' && engine.activePlayer === 'player' && !busy;
    p.hand.forEach((cardDef, idx) => {
      const div = document.createElement('div');
      div.className = 'hand-card' + (cardDef.isApoio ? ' apoio-card' : '');
      if (idx === selectedHandIndex) div.classList.add('selected');
      let playable = myTurn;
      if (myTurn && !cardDef.isApoio) {
        playable = anyOpenSlot(cardDef);
      } else if (myTurn && cardDef.isApoio && p.apoiosBlocked) {
        playable = false;
      }
      if (!playable) div.classList.add('disabled');
      div.innerHTML = `<img src="${cardDef.imagem}" alt="${cardDef.nome}" draggable="false">`;
      div.addEventListener('click', () => onHandCardClick(idx));
      handCardsEl.appendChild(div);
    });
  }

  function renderTacticoHand() {
    if (!tacticoCardsEl) return;
    tacticoCardsEl.innerHTML = '';
    const p = engine.players.player;
    const myTurn = engine.phase === 'placement' && engine.activePlayer === 'player' && !busy;
    p.tacticoHand.forEach((cardDef, idx) => {
      const div = document.createElement('div');
      div.className = 'tactico-card';
      div.innerHTML = `<img src="assets/taticos-3d/${cardDef.imagem}" alt="${cardDef.nome}" draggable="false">`;
      div.addEventListener('click', () => onTacticoCardClick(idx));
      if (myTurn) div.style.cursor = 'pointer';
      tacticoCardsEl.appendChild(div);
    });
  }

  function onTacticoCardClick(idx) {
    if (busy || engine.phase !== 'placement' || engine.activePlayer !== 'player') return;
    const p = engine.players.player;
    const cardDef = p.tacticoHand[idx];
    if (!cardDef) return;
    previewTacticoCard(cardDef, idx);
  }

  function previewTacticoCard(cardDef, idx) {
    Sound.click();
    const myTurn = engine.phase === 'placement' && engine.activePlayer === 'player' && !busy;
    zoomImg.src = `assets/taticos-3d/${cardDef.imagem}`;
    zoomActions.classList.remove('hidden');
    zoomPlayBtn.classList.toggle('hidden', !myTurn);
    zoomOverlay.classList.remove('hidden');
    zoomPlayBtn.onclick = (ev) => {
      ev.stopPropagation();
      zoomOverlay.classList.add('hidden');
      playTactico(idx, cardDef);
    };
    zoomCancelBtn.onclick = (ev) => { ev.stopPropagation(); zoomOverlay.classList.add('hidden'); };
  }

  let pendingTactico = null; // { idx, cardDef }

  function playTactico(idx, cardDef) {
    // Se é equipamento, pede alvo
    if (cardDef.tipo_tatico === 'Equipamento') {
      pendingTactico = { idx, cardDef };
      zoomOverlay.classList.add('hidden');
      beginTargetingForTactico();
      return;
    }

    // Outras cartas táticas (sem alvo por enquanto)
    const result = engine.playTacticoCard('player', idx, {});
    if (!result.ok) {
      console.warn('Erro ao jogar tática:', result.error);
      Sound.error();
      return;
    }
    Sound.apoioCast(); // som temporário, depois customizar por tipo
    render();
  }

  function beginTargetingForTactico() {
    const allCards = [];
    ['frente', 'retaguarda'].forEach(slotType => {
      const slots = slotType === 'frente' ? engine.players.player.front : engine.players.player.back;
      slots.forEach((card, idx) => {
        if (card) allCards.push({ card, slotType, idx });
      });
    });

    targetPromptText.textContent = `Escolhe uma unidade para equipar com ${pendingTactico.cardDef.nome}`;
    targetOverlay.classList.remove('hidden');

    allCards.forEach(({ card, slotType, idx }) => {
      const slotId = `${slotType}-${idx}`;
      const slotEl = $(`#${slotId}`);
      if (slotEl) {
        slotEl.classList.add('valid-target');
        slotEl.addEventListener('click', () => confirmTacticoTarget(card));
      }
    });
  }

  function confirmTacticoTarget(targetCard) {
    const result = engine.playTacticoCard('player', pendingTactico.idx, { targetCard });
    if (!result.ok) {
      console.warn('Erro ao equipar:', result.error);
      Sound.error();
      clearTargeting();
      return;
    }
    Sound.apoioCast();
    clearTargeting();
    pendingTactico = null;
    render();
  }

  function anyOpenSlot(cardDef) {
    for (let i = 0; i < FRONT_LANE_COUNT; i++) if (engine.canPlaceUnit('player', cardDef, 'frente', i)) return true;
    for (const i of BACK_LANES) if (engine.canPlaceUnit('player', cardDef, 'retaguarda', i)) return true;
    return false;
  }

  function renderHud() {
    roundNumEl.textContent = engine.round;
    const myTurn = engine.phase === 'placement' && engine.activePlayer === 'player';
    turnIndicatorEl.textContent = engine.phase === 'combat' ? 'Combate...' : (myTurn ? 'A tua vez' : 'Vez do adversário');
    turnIndicatorEl.classList.toggle('their-turn', !myTurn);
    const p = engine.players.player;
    unitCapEl.textContent = `${p.unitPlaysThisRound}/${engine.getUnitCap('player')}`;
    btnPass.disabled = !myTurn || busy;
  }

  function renderTowers() {
    setTower(towerFillAi, towerHpAi, engine.towers.ai);
    setTower(towerFillPlayer, towerHpPlayer, engine.towers.player);
    const ruined = engine.towers.player <= TOWER_MAX * 0.25 || engine.towers.ai <= TOWER_MAX * 0.25;
    boardEl.classList.toggle('ruined', ruined);
  }

  function setTower(fillEl, hpEl, hp) {
    const pct = Math.max(0, hp) / TOWER_MAX;
    fillEl.style.transform = `scaleX(${pct})`;
    fillEl.classList.toggle('low', hp <= TOWER_MAX * 0.25);
    hpEl.textContent = `${Math.max(0, hp)}/${TOWER_MAX}`;
  }

  function renderLog() {
    logPanel.innerHTML = logLines.slice(-40).reverse().map((l) => `<div>${l}</div>`).join('');
  }

  // ---------------------------------------------------------------- acções

  function clearTargeting() {
    pendingApoio = null;
    selectedHandIndex = null;
    $$('.slot.valid-target, .card-el.valid-target').forEach((e) => e.classList.remove('valid-target'));
    targetOverlay.classList.add('hidden');
    renderHand();
    renderTacticoHand();
  }

  function onHandCardClick(idx) {
    if (busy || engine.phase !== 'placement' || engine.activePlayer !== 'player') return;
    const p = engine.players.player;
    const cardDef = p.hand[idx];
    if (!cardDef) return;

    if (selectedHandIndex === idx) { clearTargeting(); return; }

    const playable = cardDef.isApoio ? !p.apoiosBlocked : anyOpenSlot(cardDef);
    previewHandCard(cardDef, idx, playable);
  }

  // Mostra a carta ampliada com "Jogar"/"Cancelar" — lê-se a carta toda antes
  // de decidir; só ao carregar em "Jogar" é que entra no modo de escolher slot/alvo.
  function previewHandCard(cardDef, idx, playable) {
    Sound.click();
    zoomImg.src = cardDef.imagem;
    zoomActions.classList.remove('hidden');
    zoomPlayBtn.classList.toggle('hidden', !playable);
    zoomOverlay.classList.remove('hidden');
    zoomPlayBtn.onclick = (ev) => {
      ev.stopPropagation();
      zoomOverlay.classList.add('hidden');
      commitHandSelection(idx, cardDef);
    };
    zoomCancelBtn.onclick = (ev) => { ev.stopPropagation(); zoomOverlay.classList.add('hidden'); };
  }

  function commitHandSelection(idx, cardDef) {
    const p = engine.players.player;
    if (!cardDef.isApoio) {
      clearTargeting();
      selectedHandIndex = idx;
      renderHand();
      highlightValidSlots(cardDef);
      return;
    }

    clearTargeting();
    selectedHandIndex = idx;
    if (p.apoiosBlocked) { clearTargeting(); return; }
    const def = APOIO_ABILITIES_REF()[cardDef.id];
    if (!def) { clearTargeting(); return; }
    if (!def.needsTarget) {
      playApoio(idx, {});
      return;
    }
    pendingApoio = { handIndex: idx, def, cardDef, pairFrom: null };
    renderHand();
    renderTacticoHand();
    beginTargeting();
  }

  function APOIO_ABILITIES_REF() {
    const map = {};
    for (const [k, v] of window.AbilityEngine.APOIO_ABILITIES.entries()) map[k] = v;
    return map;
  }

  function highlightValidSlots(cardDef) {
    for (let i = 0; i < FRONT_LANE_COUNT; i++) {
      if (engine.canPlaceUnit('player', cardDef, 'frente', i)) slotEl('player', 'frente', i).classList.add('valid-target');
    }
    BACK_LANES.forEach((i) => {
      if (engine.canPlaceUnit('player', cardDef, 'retaguarda', i)) slotEl('player', 'retaguarda', i).classList.add('valid-target');
    });
  }

  function beginTargeting() {
    const { def } = pendingApoio;
    targetOverlay.classList.remove('hidden');
    if (def.needsTarget === 'ally') {
      targetPromptText.textContent = 'Escolhe uma carta tua';
      engine.allies('player').forEach((c) => markValidCard(c, def));
    } else if (def.needsTarget === 'enemy') {
      targetPromptText.textContent = 'Escolhe uma carta inimiga';
      engine.enemies('player').forEach((c) => markValidCard(c, def));
    } else if (def.needsTarget === 'allyPair') {
      targetPromptText.textContent = 'Escolhe a carta de origem';
      engine.allies('player').forEach((c) => { $(`.card-el[data-uid="${c.uid}"]`)?.classList.add('valid-target'); });
    }
  }

  function markValidCard(card, def) {
    if (def.requireFn && !def.requireFn(engine, 'player', card)) return;
    const el = $(`.card-el[data-uid="${card.uid}"]`);
    if (el) el.classList.add('valid-target');
  }

  function onBoardCardClick(card) {
    if (busy) return;
    if (pendingApoio) {
      const { def, handIndex, pairFrom } = pendingApoio;
      if (def.needsTarget === 'allyPair') {
        if (!pairFrom) {
          if (card.ownerId !== 'player') return;
          pendingApoio.pairFrom = card;
          $$('.card-el').forEach((e) => e.classList.remove('valid-target'));
          engine.allies('player').filter((c) => c.uid !== card.uid).forEach((c) => {
            $(`.card-el[data-uid="${c.uid}"]`)?.classList.add('valid-target');
          });
          targetPromptText.textContent = 'Escolhe a carta que recebe';
          return;
        }
        if (card.uid === pairFrom.uid || card.ownerId !== 'player') return;
        playApoio(handIndex, { from: pairFrom, to: card });
        return;
      }
      const wantOwner = def.needsTarget === 'ally' ? 'player' : 'ai';
      if (card.ownerId !== wantOwner) return;
      if (def.requireFn && !def.requireFn(engine, 'player', card)) return;
      playApoio(handIndex, { target: card });
      return;
    }
    showZoomReadOnly(card.imagem);
  }

  function showZoomReadOnly(imgSrc) {
    zoomImg.src = imgSrc;
    zoomActions.classList.add('hidden');
    zoomOverlay.classList.remove('hidden');
  }

  function onSlotClick(el) {
    if (busy || selectedHandIndex === null || pendingApoio) return;
    const owner = el.dataset.owner;
    if (owner !== 'player') return;
    const p = engine.players.player;
    const cardDef = p.hand[selectedHandIndex];
    if (!cardDef || cardDef.isApoio) return;
    const slotType = el.dataset.slotType;
    const slotIndex = +el.dataset.slotIndex;
    if (!engine.canPlaceUnit('player', cardDef, slotType, slotIndex)) return;
    playUnit(selectedHandIndex, slotType, slotIndex);
  }

  zoomOverlay.addEventListener('click', () => zoomOverlay.classList.add('hidden'));
  targetCancelBtn.addEventListener('click', clearTargeting);

  btnPass.addEventListener('click', () => {
    if (busy || engine.phase !== 'placement' || engine.activePlayer !== 'player') return;
    Sound.pass();
    clearTargeting();
    runAction(() => engine.pass('player'));
  });

  btnLog.addEventListener('click', () => { Sound.click(); logPanel.classList.toggle('hidden'); });
  btnRestart.addEventListener('click', () => {
    Sound.click();
    gameoverOverlay.classList.add('hidden');
    gameScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    $$('.faction-option').forEach((e) => e.classList.remove('selected'));
    btnStart.disabled = true;
  });

  function handCardRect(idx) {
    const el = handCardsEl.children[idx];
    return el ? el.getBoundingClientRect() : null;
  }

  function playUnit(idx, slotType, slotIndex) {
    const cardDef = engine.players.player.hand[idx];
    const startRect = handCardRect(idx);
    clearTargeting();
    runAction(() => engine.playUnit('player', idx, slotType, slotIndex), {
      travel: startRect && { rect: startRect, img: cardDef.imagem, owner: 'player', slotType, slotIndex },
      sound: 'unit'
    });
  }

  function playApoio(idx, targetSpec) {
    const cardDef = engine.players.player.hand[idx];
    const startRect = handCardRect(idx);
    clearTargeting();
    runAction(() => {
      const res = engine.playApoio('player', idx, targetSpec);
      if (res.ok) engine.players.player.lastApoio = cardDef;
      return res;
    }, {
      travel: startRect && { rect: startRect, img: cardDef.imagem, owner: 'player', slotType: 'retaguarda', slotIndex: 0 },
      sound: 'apoio'
    });
  }

  // ---------------------------------------------------------------- fluxo pós-acção / animação

  async function animateTravel({ rect, img, owner, slotType, slotIndex }) {
    const targetEl = slotEl(owner, slotType, slotIndex);
    if (!targetEl) return;
    const endRect = targetEl.getBoundingClientRect();
    const clone = document.createElement('img');
    clone.src = img;
    clone.className = 'travel-clone';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    document.body.appendChild(clone);

    const midX = (rect.left + endRect.left) / 2;
    const midY = Math.min(rect.top, endRect.top) - 70;

    try {
      await clone.animate([
        { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px', transform: 'rotate(0deg)' },
        { left: midX + 'px', top: midY + 'px', transform: 'rotate(-8deg)', offset: 0.55 },
        { left: endRect.left + 'px', top: endRect.top + 'px', width: endRect.width + 'px', height: endRect.height + 'px', transform: 'rotate(0deg)' }
      ], { duration: 420, easing: 'ease-in-out' }).finished;
    } catch (e) { /* animação cancelada, ignora */ }
    clone.remove();
  }

  async function runAction(fn, opts = {}) {
    busy = true;
    const stepsBefore = engine.combatSteps;
    fn();
    if (opts.travel) {
      await animateTravel(opts.travel);
      if (opts.sound === 'unit') Sound.unitPlace(); else if (opts.sound === 'apoio') Sound.apoioCast();
    }
    const combatHappened = engine.combatSteps !== stepsBefore && engine.combatSteps.length > 0;
    if (combatHappened) {
      await animateCombat(engine.combatSteps);
    }
    render();
    flashApoioEdges();
    busy = false;
    checkGameOver();
    if (!engine.winner) maybeAdvanceAI();
  }

  function flashApoioEdges() {
    ['player', 'ai'].forEach((owner) => {
      const el = slotEl(owner, 'retaguarda', 0)?.querySelector('.card-el');
      if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 500); }
    });
  }

  async function animateCombat(steps) {
    for (const step of steps) {
      const attackerEl = $(`.card-el[data-uid="${step.attacker}"]`);

      if (step.type === 'attack') {
        const targetEl = $(`.card-el[data-uid="${step.target}"]`);
        if (attackerEl && targetEl) {
          const aRect = attackerEl.getBoundingClientRect();
          const tRect = targetEl.getBoundingClientRect();
          const dx = tRect.left - aRect.left;
          const dy = tRect.top - aRect.top;

          drawAttackTrail(aRect, tRect);
          Sound.attackSwing();

          try {
            await attackerEl.animate([
              { transform: 'translate(0, 0) scale(1)', zIndex: 90 },
              { transform: `translate(${dx * 0.65}px, ${dy * 0.65}px) scale(1.22)`, zIndex: 90, offset: 0.45 },
              { transform: 'translate(0, 0) scale(1)', zIndex: 1 }
            ], { duration: 550, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished;
          } catch (e) {}

          targetEl.closest('.slot')?.classList.add('attack-target');
          showFloat(targetEl, `-${step.amount}`, 'dmg');
          Sound.hit();

          await delay(350);
          targetEl.closest('.slot')?.classList.remove('attack-target');

          const stillAlive = engine.getCard(step.target);
          if (!stillAlive) {
            Sound.death();
            const skull = document.createElement('div');
            skull.className = 'skull-pop';
            skull.textContent = '💀';
            targetEl.appendChild(skull);
            targetEl.classList.add('dying');
            await delay(450);
          }
        }
      } else {
        const towerBar = step.towerOwner === 'player' ? towerBarPlayer : towerBarAi;
        const fillEl = step.towerOwner === 'player' ? towerFillPlayer : towerFillAi;
        const hpEl = step.towerOwner === 'player' ? towerHpPlayer : towerHpAi;

        if (attackerEl && towerBar) {
          const aRect = attackerEl.getBoundingClientRect();
          const twRect = towerBar.getBoundingClientRect();
          const dx = twRect.left - aRect.left;
          const dy = twRect.top - aRect.top;

          drawAttackTrail(aRect, twRect);
          Sound.attackSwing();

          try {
            await attackerEl.animate([
              { transform: 'translate(0, 0) scale(1)', zIndex: 90 },
              { transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(1.22)`, zIndex: 90, offset: 0.45 },
              { transform: 'translate(0, 0) scale(1)', zIndex: 1 }
            ], { duration: 550, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished;
          } catch (e) {}
        }

        towerBar.classList.add('siege-flash');
        setTower(fillEl, hpEl, step.towerAfter);
        Sound.siege();
        await delay(500);
        towerBarPlayer.classList.remove('siege-flash');
        towerBarAi.classList.remove('siege-flash');
      }
    }
  }

  function drawAttackTrail(rectA, rectB) {
    const ax = rectA.left + rectA.width / 2;
    const ay = rectA.top + rectA.height / 2;
    const bx = rectB.left + rectB.width / 2;
    const by = rectB.top + rectB.height / 2;

    const length = Math.hypot(bx - ax, by - ay);
    const angle = Math.atan2(by - ay, bx - ax) * (180 / Math.PI);

    const line = document.createElement('div');
    line.className = 'attack-trail-line';
    line.style.width = `${length}px`;
    line.style.left = `${ax}px`;
    line.style.top = `${ay}px`;
    line.style.transform = `rotate(${angle}deg)`;
    document.body.appendChild(line);
    setTimeout(() => line.remove(), 480);
  }

  function showFloat(el, text, kind) {
    const f = document.createElement('div');
    f.className = 'dmg-float' + (kind ? ' ' + kind : '');
    f.textContent = text;
    el.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  function checkGameOver() {
    if (engine.phase !== 'gameover' || gameoverShown) return;
    gameoverShown = true;
    const won = engine.winner === 'player';
    if (engine.winner === 'empate') { /* sem som próprio para empate */ }
    else if (won) Sound.victory(); else Sound.defeat();
    gameoverTitle.textContent = engine.winner === 'empate' ? 'Empate' : (won ? 'Vitória' : 'Derrota');
    gameoverSub.textContent = engine.winner === 'empate'
      ? 'Nenhuma Torre caiu antes do limite de turnos — venceu quem deixou a Torre do outro mais perto de cair.'
      : (won ? 'Derrubaste a Torre do adversário.' : 'O adversário derrubou a tua Torre.');
    gameoverOverlay.classList.remove('hidden');
  }

  async function maybeAdvanceAI() {
    while (engine.phase === 'placement' && engine.activePlayer === 'ai') {
      busy = true;
      renderHud();
      await delay(500);
      const stepsBefore = engine.combatSteps;
      aiPlayer.step(engine);
      const combatHappened = engine.combatSteps !== stepsBefore && engine.combatSteps.length > 0;
      if (combatHappened) {
        await animateCombat(engine.combatSteps);
      }
      render();
      flashApoioEdges();
      busy = false;
      checkGameOver();
      if (engine.winner) return;
    }
    render();
  }
})();
