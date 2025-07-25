document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO ---
    const CHIP_TYPES = {
        blue: { value: 400, image: 'img/chip-blue.png' },
        white: { value: 200, image: 'img/chip-white.png' },
        black: { value: 50, image: 'img/chip-black.png' },
        green: { value: 25, image: 'img/chip-green-red.png' },
        // A ficha 'red' usará a mesma imagem que a 'green' conforme os nomes de arquivo fornecidos.
        red: { value: 25, image: 'img/chip-green-red.png' },
    };
    const INITIAL_CHIPS = { white: 8, red: 8, green: 8, black: 8, blue: 0 };
    const BLIND_LEVELS = [
        { small: 25, big: 50 }, { small: 50, big: 100 }, { small: 75, big: 150 },
        { small: 100, big: 200 }, { small: 150, big: 300 }, { small: 200, big: 400 },
        { small: 250, big: 500 }, { small: 300, big: 600 }, { small: 400, big: 800 },
        { small: 500, big: 1000 }, { small: 600, big: 1200 }, { small: 800, big: 1600 },
        { small: 1000, big: 2000 }
    ];

    // --- ESTADO DO JOGO ---
    let state = {};
    let timerInterval = null;
    let audioCtx;

    // --- ELEMENTOS DO DOM ---
    const screens = {
        home: document.getElementById('home-screen'),
        order: document.getElementById('order-screen'),
        bet: document.getElementById('bet-screen'),
        manage: document.getElementById('manage-screen'),
        settings: document.getElementById('settings-screen'),
    };
    
    // --- Lógica de Áudio ---
    function playSound() {
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.5);
        } catch(e) {
            console.error("Web Audio API is not supported.", e);
        }
    }

    // --- Lógica Principal ---
    function saveState() {
        localStorage.setItem('pokerMasterStateV13', JSON.stringify(state));
    }

    function calculateStack(player) {
        if (!player || !player.chips) return 0;
        return Object.entries(player.chips).reduce((sum, [type, count]) => sum + (CHIP_TYPES[type].value * count), 0);
    }
    
    function calculateCurrentBetValue() {
        if (!state.currentBet) return 0;
        return Object.entries(state.currentBet).reduce((sum, [type, count]) => sum + (CHIP_TYPES[type].value * count), 0);
    }

    function calculatePotValue() {
        if (!state.pot) return 0;
        return Object.entries(state.pot).reduce((sum, [type, count]) => sum + (CHIP_TYPES[type].value * count), 0);
    }

    function switchScreen(screenName) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        if (screens[screenName]) {
            screens[screenName].classList.add('active');
        }
    }
    
    // --- RENDERIZAÇÃO ---
    function renderAll() {
        renderHomeScreen();
        renderTimer();
        saveState();
    }

    function renderHomeScreen() {
        if (!screens.home.classList.contains('active')) return; // Otimização
        const rankedPlayers = [...state.players].sort((a, b) => calculateStack(b) - calculateStack(a));
        
        const playerListEl = document.getElementById('player-list');
        playerListEl.innerHTML = '';
        rankedPlayers.forEach((player, index) => {
            const playerEl = document.createElement('div');
            playerEl.className = 'player-item';
            const roundBetValue = Object.entries(player.roundBet).reduce((s, [t, c]) => s + (CHIP_TYPES[t].value * c), 0);
            const betDisplay = roundBetValue > 0 ? `<div class="player-current-bet"><span class="bet-label">Bet</span><br>${roundBetValue}</div>` : '';

            playerEl.innerHTML = `
                <div class="player-position">${index + 1}º</div>
                <div class="player-info">
                    <button class="player-stack" data-player-id="${player.id}">${calculateStack(player).toLocaleString('pt-BR')}</button>
                    ${betDisplay}
                </div>
                <button class="player-name" data-player-id="${player.id}">${player.name}</button>
                <button class="select-winner-btn ${player.selectedForPot ? 'selected' : ''}" data-player-id="${player.id}">+</button>
            `;
            playerListEl.appendChild(playerEl);
        });
        document.getElementById('home-pot-value').textContent = calculatePotValue().toLocaleString('pt-BR');
    }

    function renderOrderScreen() {
        const playerListEl = document.getElementById('order-player-list');
        playerListEl.innerHTML = '';
        state.players.forEach(player => {
            const playerEl = document.createElement('div');
            playerEl.className = 'player-item';
            playerEl.draggable = true;
            playerEl.dataset.playerId = player.id;
            playerEl.innerHTML = `
                <span class="drag-handle">|||</span>
                <span class="player-name-order">${player.name}</span>
                <button class="remove-player-btn" data-player-id="${player.id}">✖</button>
            `;
            playerListEl.appendChild(playerEl);
        });
    }

    function renderBetScreen(playerId) {
        state.activePlayerId = playerId;
        state.currentBet = {}; // Reseta a aposta atual ao trocar de jogador

        const player = state.players.find(p => p.id === playerId);
        if (!player) return;

        document.getElementById('bet-player-name').textContent = player.name;
        
        renderBetVisuals(player);
        switchScreen('bet');
    }

    function renderBetVisuals(player) {
        if (!player) return;
        
        // Atualiza Pote e Nível
        const level = BLIND_LEVELS[state.timer.round];
        document.getElementById('bet-screen-pot-value').textContent = calculatePotValue().toLocaleString('pt-BR');
        document.getElementById('bet-screen-level-label').textContent = `Nível ${state.timer.round + 1}`;
        document.getElementById('bet-screen-blinds-display').textContent = level ? `${level.small}/${level.big}` : 'FIM';

        // Atualiza valores de aposta e stack
        const currentBetValue = calculateCurrentBetValue();
        document.getElementById('bet-player-stack').textContent = (calculateStack(player) - currentBetValue).toLocaleString('pt-BR');
        document.getElementById('bet-total-value').textContent = currentBetValue.toLocaleString('pt-BR');

        // Renderiza fichas para ADICIONAR
        const addSelectorEl = document.getElementById('bet-chip-selector');
        addSelectorEl.innerHTML = '';
        Object.entries(CHIP_TYPES).forEach(([type, config]) => {
            const chipBtn = document.createElement('button');
            chipBtn.className = `btn chip-btn`;
            chipBtn.dataset.chipType = type;
            chipBtn.innerHTML = `
                <img src="${config.image}" alt="${type} chip" class="chip-image">
                <div class="text-overlay">
                    <div class="value">${config.value}</div>
                    <div class="count"></div>
                </div>`;
            addSelectorEl.appendChild(chipBtn);
        });

        // Renderiza fichas para REMOVER
        const removeSelectorEl = document.getElementById('bet-remove-selector');
        removeSelectorEl.innerHTML = '';
        Object.entries(state.currentBet).forEach(([type, count]) => {
            if (count > 0) {
                const config = CHIP_TYPES[type];
                for (let i = 0; i < count; i++) {
                    const chipBtn = document.createElement('button');
                    chipBtn.className = `btn chip-btn`;
                    chipBtn.dataset.chipType = type;
                    chipBtn.innerHTML = `
                        <img src="${config.image}" alt="${type} chip" class="chip-image">
                        <div class="text-overlay">
                            <div class="value">${config.value}</div>
                            <div class="count"></div>
                        </div>`;
                    removeSelectorEl.appendChild(chipBtn);
                }
            }
        });
    }
    
    function renderManageScreen(playerId) {
        state.activePlayerId = playerId;
        state.manageChips = {};

        const player = state.players.find(p => p.id === playerId);
        if (!player) return;
        
        document.getElementById('manage-player-name').innerHTML = `${player.name} <span class="edit-icon">✎</span>`;
        
        const selectorEl = document.getElementById('manage-chip-selector');
        selectorEl.innerHTML = '';
        Object.entries(CHIP_TYPES).forEach(([type, config]) => {
             const chipBtn = document.createElement('button');
             chipBtn.className = `btn chip-btn`;
             chipBtn.dataset.chipType = type;
             chipBtn.innerHTML = `
                <img src="${config.image}" alt="${type} chip" class="chip-image">
                <div class="text-overlay">
                    <div class="value">${config.value}</div>
                    <div class="count"></div>
                </div>`;
             selectorEl.appendChild(chipBtn);
        });
        renderManageVisuals(playerId);
        switchScreen('manage');
    }

    function renderManageVisuals(playerId) {
        const player = state.players.find(p => p.id === playerId);
        if (!player) return;
        let currentStack = calculateStack(player);
        let changeValue = 0;
        
        const visualizerEl = document.getElementById('manage-stack-visualizer');
        visualizerEl.innerHTML = '';

        const tempChips = { ...player.chips };
        Object.entries(state.manageChips).forEach(([type, count]) => {
            tempChips[type] = (tempChips[type] || 0) + count;
            changeValue += CHIP_TYPES[type].value * count;
        });

        Object.entries(tempChips).forEach(([type, count]) => {
            if(count > 0) {
                const config = CHIP_TYPES[type];
                const chipBtn = document.createElement('button');
                chipBtn.className = `btn chip-btn`;
                chipBtn.dataset.chipType = type;
                chipBtn.innerHTML = `
                    <img src="${config.image}" alt="${type} chip" class="chip-image">
                    <div class="text-overlay">
                        <div class="value">${config.value}</div>
                        <div class="count">${count}</div>
                    </div>`;
                visualizerEl.appendChild(chipBtn);
            }
        });
        
        document.getElementById('manage-total-value').textContent = (currentStack + changeValue).toLocaleString('pt-BR');
    }

    function getNextPlayerId(currentId) {
        const currentIndex = state.players.findIndex(p => p.id === currentId);
        const nextIndex = (currentIndex + 1) % state.players.length;
        return state.players[nextIndex].id;
    }

    function getPrevPlayerId(currentId) {
        const currentIndex = state.players.findIndex(p => p.id === currentId);
        const prevIndex = (currentIndex - 1 + state.players.length) % state.players.length;
        return state.players[prevIndex].id;
    }

    // --- Lógica do Timer ---
    function formatTime(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

    function renderTimer() {
        const timer = state.timer;
        const level = BLIND_LEVELS[timer.round];
        const blindsText = level ? `${level.small}/${level.big}` : 'FIM';

        document.getElementById('home-timer-display').textContent = formatTime(timer.time);
        document.getElementById('home-round-num').textContent = timer.round + 1;
        document.getElementById('home-blinds-display').textContent = blindsText;
        
        document.getElementById('settings-round-num').textContent = timer.round + 1;
        document.getElementById('settings-blinds-display').textContent = blindsText;
        
        const startPauseBtn = document.getElementById('timer-start-pause-btn');
        startPauseBtn.textContent = timer.isRunning ? 'PAUSAR' : 'INICIAR';
        startPauseBtn.classList.toggle('paused', !timer.isRunning);
        
        document.getElementById('timer-input').value = timer.duration;
        document.getElementById('timer-input').disabled = timer.isRunning;
        document.getElementById('timer-prev-level-btn').disabled = timer.isRunning;
        document.getElementById('timer-next-level-btn').disabled = timer.isRunning;
    }

    function handleStartPause() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        state.timer.isRunning = !state.timer.isRunning;
        if (state.timer.isRunning) {
            state.timer.endTime = Date.now() + state.timer.time * 1000;
            timerInterval = setInterval(tick, 1000);
        } else {
            clearInterval(timerInterval);
            timerInterval = null;
            state.timer.endTime = null;
        }
        renderTimer();
        saveState();
    }

    function tick() {
        if (!state.timer.isRunning || !state.timer.endTime) return;
        let newTime = Math.round((state.timer.endTime - Date.now()) / 1000);
        if (newTime < 0) newTime = 0;

        if (newTime === 0 && state.timer.time > 0) {
            levelUp();
        }
        state.timer.time = newTime;
        renderTimer();
        saveState();
    }

    function levelUp() {
        if (state.timer.round < BLIND_LEVELS.length - 1) {
            state.timer.round++;
            state.timer.time = state.timer.duration * 60;
            if(state.timer.isRunning) {
                state.timer.endTime = Date.now() + state.timer.time * 1000;
            }
            playSound();
        } else {
            state.timer.isRunning = false;
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }
    
    function levelDown() {
        if (state.timer.round > 0) {
            state.timer.round--;
            state.timer.time = state.timer.duration * 60;
        }
    }
    
    function resetTimer() {
         state.timer.round = 0;
         state.timer.time = state.timer.duration * 60;
         if (state.timer.isRunning) {
             handleStartPause();
         }
         renderTimer();
         saveState();
    }

    // --- MANIPULADORES DE EVENTOS ---
    let draggedItem = null;
    document.body.addEventListener('dragstart', e => {
        if (e.target.classList.contains('player-item')) {
            draggedItem = e.target;
            setTimeout(() => e.target.classList.add('dragging'), 0);
        }
    });
    document.body.addEventListener('dragend', () => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
        }
    });
    document.body.addEventListener('dragover', e => {
        e.preventDefault();
        const list = document.getElementById('order-player-list');
        if (!list || !draggedItem) return;
        const afterElement = getDragAfterElement(list, e.clientY);
        if (afterElement == null) {
            list.appendChild(draggedItem);
        } else {
            list.insertBefore(draggedItem, afterElement);
        }
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.player-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function handleEndBetting() {
        state.players.forEach(player => {
            Object.entries(player.roundBet).forEach(([type, count]) => {
                state.pot[type] = (state.pot[type] || 0) + count;
            });
            player.roundBet = Object.fromEntries(Object.keys(CHIP_TYPES).map(key => [key, 0]));
        });
        renderAll();
        switchScreen('home');
    }

    document.body.addEventListener('click', (e) => {
        const target = e.target;
        
        // Home
        if (target.closest('.player-stack')) { renderBetScreen(parseInt(target.closest('.player-stack').dataset.playerId)); return; }
        if (target.closest('.player-name')) { renderManageScreen(parseInt(target.closest('.player-name').dataset.playerId)); return; }
        if (target.closest('.select-winner-btn')) {
            const player = state.players.find(p => p.id === parseInt(target.closest('.select-winner-btn').dataset.playerId));
            player.selectedForPot = !player.selectedForPot;
            renderHomeScreen();
            saveState();
            return;
        }
        if (target.closest('#distribute-btn')) {
            const winners = state.players.filter(p => p.selectedForPot);
            if (winners.length > 0 && calculatePotValue() > 0) {
                const totalPotValue = calculatePotValue();
                const valuePerWinner = Math.floor(totalPotValue / winners.length);
                const remainder = totalPotValue % winners.length;

                winners.forEach((winner, index) => {
                    let valueToDistribute = valuePerWinner + (index < remainder ? 1 : 0);
                    const sortedChipTypes = Object.keys(CHIP_TYPES).sort((a, b) => CHIP_TYPES[b].value - CHIP_TYPES[a].value);
                    
                    sortedChipTypes.forEach(type => {
                        const chipValue = CHIP_TYPES[type].value;
                        if (valueToDistribute >= chipValue) {
                            const numChips = Math.floor(valueToDistribute / chipValue);
                            winner.chips[type] = (winner.chips[type] || 0) + numChips;
                            valueToDistribute -= numChips * chipValue;
                        }
                    });
                });
                state.pot = Object.fromEntries(Object.keys(CHIP_TYPES).map(key => [key, 0]));
                state.players.forEach(p => p.selectedForPot = false);
                renderAll();
            }
            return;
        }
        if (target.closest('#reset-btn')) {
            if (confirm('Tem certeza que deseja resetar as fichas de todos os jogadores?')) {
                state.players.forEach(p => {
                    p.chips = { ...INITIAL_CHIPS };
                    p.roundBet = Object.fromEntries(Object.keys(CHIP_TYPES).map(key => [key, 0]));
                });
                state.pot = Object.fromEntries(Object.keys(CHIP_TYPES).map(key => [key, 0]));
                renderAll();
            }
            return;
        }
        if (target.closest('#settings-btn')) { switchScreen('settings'); return; }
        if (target.closest('#go-to-order-btn')) { renderOrderScreen(); switchScreen('order'); return; }
        if (target.closest('#go-to-home-btn')) { switchScreen('home'); return; }

        // Ordem de Jogo
        if (target.closest('#add-player-btn')) {
            const newName = prompt("Digite o nome do novo jogador:");
            if (newName && newName.trim() !== "") {
                const newId = state.players.length > 0 ? Math.max(...state.players.map(p => p.id)) + 1 : 1;
                state.players.push({
                    id: newId, name: newName,
                    chips: { ...INITIAL_CHIPS },
                    roundBet: Object.fromEntries(Object.keys(CHIP_TYPES).map(key => [key, 0])),
                    selectedForPot: false
                });
                renderOrderScreen();
            }
            return;
        }
        if (target.closest('.remove-player-btn')) {
            const playerId = parseInt(target.dataset.playerId);
            state.players = state.players.filter(p => p.id !== playerId);
            renderOrderScreen();
            return;
        }
        if (target.closest('#save-order-btn')) {
            const playerNodes = document.querySelectorAll('#order-player-list .player-item');
            state.players = Array.from(playerNodes).map(node => state.players.find(p => p.id === parseInt(node.dataset.playerId)));
            saveState();
            renderAll();
            switchScreen('home');
            return;
        }

        // Tela de Aposta (NOVO)
        if (target.closest('#bet-chip-selector .chip-btn')) {
            const type = target.closest('.chip-btn').dataset.chipType;
            const player = state.players.find(p => p.id === state.activePlayerId);
            
            const potentialBetValue = calculateCurrentBetValue() + CHIP_TYPES[type].value;
            const playerStack = calculateStack(player);

            if (potentialBetValue <= playerStack) {
                state.currentBet[type] = (state.currentBet[type] || 0) + 1;
                renderBetVisuals(player);
            }
            return;
        }
        if (target.closest('#bet-remove-selector .chip-btn')) {
            const type = target.closest('.chip-btn').dataset.chipType;
            if ((state.currentBet[type] || 0) > 0) {
                state.currentBet[type]--;
                if (state.currentBet[type] === 0) {
                    delete state.currentBet[type];
                }
                const player = state.players.find(p => p.id === state.activePlayerId);
                renderBetVisuals(player);
            }
            return;
        }
        if (target.closest('#bet-confirm-btn')) {
            const player = state.players.find(p => p.id === state.activePlayerId);
            Object.entries(state.currentBet).forEach(([type, count]) => {
                player.chips[type] -= count;
                player.roundBet[type] = (player.roundBet[type] || 0) + count;
            });
            renderAll();
            renderBetScreen(getNextPlayerId(state.activePlayerId));
            return;
        }
        if (target.closest('#end-betting-btn') || target.closest('#end-betting-btn-home')) {
            handleEndBetting();
            return;
        }
        if (target.closest('#bet-next-player')) { renderBetScreen(getNextPlayerId(state.activePlayerId)); return; }
        if (target.closest('#bet-prev-player') || (target.closest('.footer-nav-btn') && target.closest('.footer-nav-btn').dataset.target === 'bet-prev')) {
            renderBetScreen(getPrevPlayerId(state.activePlayerId));
            return;
        }

        // Gerenciamento
        if (target.closest('#manage-player-name .edit-icon')) {
            const player = state.players.find(p => p.id === state.activePlayerId);
            const newName = prompt('Digite o novo nome:', player.name);
            if (newName && newName.trim()) {
                player.name = newName.trim();
                renderManageScreen(player.id);
                renderHomeScreen();
                saveState();
            }
            return;
        }
        if (target.closest('#manage-chip-selector .chip-btn')) {
            const type = target.closest('.chip-btn').dataset.chipType;
            state.manageChips[type] = (state.manageChips[type] || 0) + 1;
            renderManageVisuals(state.activePlayerId);
            return;
        }
        if (target.closest('#manage-stack-visualizer .chip-btn')) {
            const type = target.closest('.chip-btn').dataset.chipType;
            const player = state.players.find(p => p.id === state.activePlayerId);
            if(player.chips[type] + (state.manageChips[type] || 0) > 0) {
                state.manageChips[type] = (state.manageChips[type] || 0) - 1;
                renderManageVisuals(state.activePlayerId);
            }
            return;
        }
        if (target.closest('#manage-save-btn')) {
            const player = state.players.find(p => p.id === state.activePlayerId);
            Object.entries(state.manageChips).forEach(([type, count]) => { player.chips[type] = (player.chips[type] || 0) + count; });
            renderAll();
            switchScreen('home');
            return;
        }
        if (target.closest('#manage-next-player')) { renderManageScreen(getNextPlayerId(state.activePlayerId)); return; }
        if (target.closest('.prev-btn[data-target="manage"]')) { renderManageScreen(getPrevPlayerId(state.activePlayerId)); return; }
        
        // Timer
        if (target.closest('#timer-start-pause-btn')) { handleStartPause(); return; }
        if (target.closest('#timer-reset-btn')) { resetTimer(); return; }
        if (target.closest('#timer-next-level-btn')) { levelUp(); renderTimer(); saveState(); return; }
        if (target.closest('#timer-prev-level-btn')) { levelDown(); renderTimer(); saveState(); return; }

        // Genérico
        if(target.closest('.home-btn')) { 
            switchScreen('home'); 
            return; 
        }
    });

    document.getElementById('timer-input').addEventListener('change', (e) => {
        if (!state.timer.isRunning) {
            state.timer.duration = parseInt(e.target.value);
            state.timer.time = state.timer.duration * 60;
            renderTimer();
            saveState();
        }
    });

    // --- INICIALIZAÇÃO ---
    function init() {
        const savedState = localStorage.getItem('pokerMasterStateV13');
        if (savedState) {
            state = JSON.parse(savedState);
            // Garantir que a estrutura de dados está correta após carregar
            state.players.forEach(p => {
                p.chips = p.chips || { ...INITIAL_CHIPS };
                p.roundBet = p.roundBet || Object.fromEntries(Object.keys(CHIP_TYPES).map(key => [key, 0]));
                p.selectedForPot = p.selectedForPot || false;
            });
            state.pot = state.pot || Object.fromEntries(Object.keys(CHIP_TYPES).map(key => [key, 0]));
            state.timer = state.timer || { round: 0, time: 15 * 60, isRunning: false, duration: 15, endTime: null };
            
            if (state.timer.isRunning && state.timer.endTime) {
                const now = Date.now();
                let newTime = Math.round((state.timer.endTime - now) / 1000);
                
                if (newTime <= 0) {
                    // Lógica para atualizar rounds perdidos enquanto a aba estava fechada
                    let timePassedSinceEnd = (now - state.timer.endTime) / 1000;
                    state.timer.time = 0;
                    while(timePassedSinceEnd > 0 && state.timer.round < BLIND_LEVELS.length - 1) {
                        levelUp();
                        timePassedSinceEnd -= state.timer.duration * 60;
                    }
                    state.timer.time = Math.max(0, state.timer.time + timePassedSinceEnd);
                } else {
                    state.timer.time = newTime;
                }
            }
        } else {
            // Estado inicial padrão
            state = {
                players: [],
                pot: Object.fromEntries(Object.keys(CHIP_TYPES).map(key => [key, 0])),
                activePlayerId: null,
                currentBet: {},
                manageChips: {},
                timer: { round: 0, time: 15 * 60, isRunning: false, duration: 15, endTime: null }
            };
            for (let i = 1; i <= 6; i++) {
                state.players.push({ 
                    id: i, 
                    name: `Jogador ${i}`, 
                    chips: { ...INITIAL_CHIPS }, 
                    roundBet: Object.fromEntries(Object.keys(CHIP_TYPES).map(key => [key, 0])),
                    selectedForPot: false 
                });
            }
        }
        renderAll();
        switchScreen('home'); // Sempre começa na tela home
        if (state.timer.isRunning) {
            timerInterval = setInterval(tick, 1000);
        }
    }

    init();
});
