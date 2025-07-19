document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO ---
    const CHIP_TYPES = {
        blue: { value: 400, imgSrc: 'img-chip-blue.png' },
        white: { value: 200, imgSrc: 'img-chip-white.png' },
        black: { value: 50, imgSrc: 'img-chip-black.png' },
        greenRed: { value: 25, imgSrc: 'img-chip-green-red.png' }
    };
    const INITIAL_STACK = 2400;
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
        } catch(e) { console.error("Web Audio API is not supported.", e); }
    }

    // --- Lógica Principal ---
    function saveState() {
        localStorage.setItem('pokerMasterStateV19', JSON.stringify(state));
    }

    function calculateTotalRoundBets() {
        return state.players.reduce((total, player) => total + player.roundBetValue, 0);
    }
    
    // Converte um valor numérico em uma representação de fichas (ex: 425 -> {blue: 1, greenRed: 1})
    function valueToChips(value) {
        const chips = {};
        const sortedChipTypes = Object.keys(CHIP_TYPES).sort((a, b) => CHIP_TYPES[b].value - CHIP_TYPES[a].value);
        let remainingValue = value;
        for (const type of sortedChipTypes) {
            const chipValue = CHIP_TYPES[type].value;
            const count = Math.floor(remainingValue / chipValue);
            if (count > 0) {
                chips[type] = count;
                remainingValue -= count * chipValue;
            }
        }
        return chips;
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
        const rankedPlayers = [...state.players].sort((a, b) => a.stack - b.stack);
        const playerListEl = document.getElementById('player-list');
        playerListEl.innerHTML = '';
        rankedPlayers.forEach((player, index) => {
            const playerEl = document.createElement('div');
            playerEl.className = 'player-item';
            const betDisplay = player.roundBetValue > 0 ? `
                <div class="player-current-bet">
                    <span class="bet-label">Bet</span>
                    <span class="bet-value">${player.roundBetValue}</span>
                </div>` : '';

            playerEl.innerHTML = `
                <div class="player-info-wrapper" data-player-id="${player.id}">
                    <div class="player-position">${index + 1}º</div>
                    <div class="player-stack">${player.stack.toLocaleString('pt-BR')}</div>
                    ${betDisplay}
                    <div class="player-name">${player.name}</div>
                </div>
                <button class="select-winner-btn ${player.selectedForPot ? 'selected' : ''}" data-player-id="${player.id}">+</button>
            `;
            playerListEl.appendChild(playerEl);
        });
    }

    function renderOrderScreen(listId = 'settings-player-list') {
        const playerListEl = document.getElementById(listId);
        if (!playerListEl) return;
        playerListEl.innerHTML = '';
        state.players.forEach(player => {
            const playerEl = document.createElement('div');
            playerEl.className = 'player-item';
            playerEl.draggable = true;
            playerEl.dataset.playerId = player.id;
            playerEl.innerHTML = `
                <span class="drag-handle">≡</span>
                <span class="player-name-order">${player.name}</span>
                <button class="remove-player-btn" data-player-id="${player.id}">✖</button>
            `;
            playerListEl.appendChild(playerEl);
        });
    }

    function renderBetScreen(playerId) {
        state.activePlayerId = playerId;
        state.currentBetValue = 0;
        const player = state.players.find(p => p.id === playerId);
        if (!player) return;
        document.getElementById('bet-player-name').textContent = player.name;
        renderBetVisuals(playerId);
        switchScreen('bet');
    }

    function renderBetVisuals(playerId) {
        const player = state.players.find(p => p.id === playerId);
        if (!player) return;

        document.getElementById('bet-screen-pot-value').textContent = (state.potValue + calculateTotalRoundBets()).toLocaleString('pt-BR');
        
        const currentLevel = BLIND_LEVELS[state.timer.round];
        document.getElementById('bet-screen-round-num').textContent = state.timer.round + 1;
        document.getElementById('bet-screen-blinds-display').textContent = currentLevel ? `${currentLevel.small}/${currentLevel.big}` : 'FIM';

        const stackAfterBet = player.stack - player.roundBetValue - state.currentBetValue;
        document.getElementById('bet-player-stack').textContent = stackAfterBet.toLocaleString('pt-BR');
        document.getElementById('bet-current-value').textContent = (player.roundBetValue + state.currentBetValue).toLocaleString('pt-BR');

        const visualizerEl = document.getElementById('bet-stack-visualizer');
        visualizerEl.innerHTML = '';
        const chipsToVisualize = valueToChips(player.roundBetValue + state.currentBetValue);
        
        Object.keys(chipsToVisualize).forEach(type => {
            const img = document.createElement('img');
            img.src = CHIP_TYPES[type].imgSrc;
            img.className = 'chip-img';
            img.dataset.chipType = type;
            visualizerEl.appendChild(img);
        });

        const selectorEl = document.getElementById('bet-chip-selector');
        selectorEl.innerHTML = '';
        Object.entries(CHIP_TYPES).forEach(([type, config]) => {
            if (stackAfterBet >= config.value) {
                const img = document.createElement('img');
                img.src = config.imgSrc;
                img.className = 'chip-img';
                img.dataset.chipType = type;
                selectorEl.appendChild(img);
            }
        });
    }
    
    function renderManageScreen(playerId) {
        state.activePlayerId = playerId;
        state.manageChangeValue = 0;
        const player = state.players.find(p => p.id === playerId);
        if (!player) return;
        document.getElementById('manage-player-name').innerHTML = `${player.name} <span class="edit-icon">✏️</span>`;
        
        const selectorEl = document.getElementById('manage-chip-selector');
        selectorEl.innerHTML = '';
        Object.entries(CHIP_TYPES).forEach(([type, config]) => {
             const img = document.createElement('img');
             img.src = config.imgSrc;
             img.className = 'chip-img';
             img.dataset.chipType = type;
             selectorEl.appendChild(img);
        });
        renderManageVisuals(playerId);
        switchScreen('manage');
    }

    function renderManageVisuals(playerId) {
        const player = state.players.find(p => p.id === playerId);
        if (!player) return;
        
        const visualizerEl = document.getElementById('manage-stack-visualizer');
        visualizerEl.innerHTML = '';
        const currentStack = player.stack + state.manageChangeValue;

        Object.entries(CHIP_TYPES).forEach(([type, config]) => {
            if (currentStack >= config.value) {
                const img = document.createElement('img');
                img.src = config.imgSrc;
                img.className = 'chip-img';
                img.dataset.chipType = type;
                visualizerEl.appendChild(img);
            }
        });
        
        document.getElementById('manage-total-value').textContent = currentStack.toLocaleString('pt-BR');
        document.getElementById('manage-change-value').textContent = `${state.manageChangeValue >= 0 ? '+' : ''}${state.manageChangeValue.toLocaleString('pt-BR')}`;
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
        document.getElementById('home-round-label').textContent = `Nível ${timer.round + 1}`;
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
        if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
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
        if (e.target.closest('.player-item')) {
            draggedItem = e.target.closest('.player-item');
            setTimeout(() => draggedItem.classList.add('dragging'), 0);
        }
    });
    document.body.addEventListener('dragend', e => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
        }
    });
    document.body.addEventListener('dragover', e => {
        e.preventDefault();
        const list = e.target.closest('.player-list');
        if (!list || !draggedItem) return;
        const afterElement = getDragAfterElement(list, e.clientY);
        if (afterElement == null) { list.appendChild(draggedItem); } 
        else { list.insertBefore(draggedItem, afterElement); }
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.player-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
            else return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function handleEndBetting() {
        state.players.forEach(player => {
            if (player.roundBetValue > 0) {
                player.stack -= player.roundBetValue;
                state.potValue += player.roundBetValue;
                player.roundBetValue = 0;
            }
        });
        renderAll();
        switchScreen('home');
    }

    document.body.addEventListener('click', (e) => {
        const target = e.target;
        
        if (target.closest('.player-info-wrapper')) { 
            const playerId = parseInt(target.closest('.player-info-wrapper').dataset.playerId);
            renderManageScreen(playerId);
            return; 
        }

        if (target.closest('#betting-btn-home')) {
            if (state.players.length > 0) {
                renderBetScreen(state.players[0].id);
            }
            return;
        }

        if (target.closest('.select-winner-btn')) {
            const player = state.players.find(p => p.id === parseInt(target.closest('.select-winner-btn').dataset.playerId));
            player.selectedForPot = !player.selectedForPot;
            renderHomeScreen();
            saveState();
            return;
        }
        if (target.closest('#distribute-btn')) {
            const winners = state.players.filter(p => p.selectedForPot);
            if (winners.length > 0 && state.potValue > 0) {
                const valuePerWinner = Math.floor(state.potValue / winners.length);
                const remainder = state.potValue % winners.length;
                winners.forEach((winner, index) => {
                    winner.stack += valuePerWinner + (index < remainder ? 1 : 0);
                });
                state.potValue = 0;
                state.players.forEach(p => p.selectedForPot = false);
                renderAll();
            }
            return;
        }
        if (target.closest('#reset-btn')) {
            init(true);
            return;
        }
        if (target.closest('#settings-btn')) { renderOrderScreen(); switchScreen('settings'); return; }
        
        if (target.closest('.remove-player-btn')) {
            const playerId = parseInt(target.dataset.playerId);
            state.players = state.players.filter(p => p.id !== playerId);
            renderOrderScreen();
            return;
        }

        // Tela de Aposta
        if (target.closest('#bet-chip-selector .chip-img')) {
            const type = target.dataset.chipType;
            const player = state.players.find(p => p.id === state.activePlayerId);
            const chipValue = CHIP_TYPES[type].value;
            if (player.stack >= player.roundBetValue + state.currentBetValue + chipValue) {
                state.currentBetValue += chipValue;
                renderBetVisuals(state.activePlayerId);
            }
            return;
        }
        if (target.closest('#bet-stack-visualizer .chip-img')) {
            const type = target.dataset.chipType;
            const chipValue = CHIP_TYPES[type].value;
            if (state.currentBetValue + player.roundBetValue >= chipValue) {
                 state.currentBetValue -= chipValue;
                 if (state.currentBetValue < 0) state.currentBetValue = 0; // Prevent negative values
                 renderBetVisuals(state.activePlayerId);
            }
            return;
        }
        if (target.closest('#bet-confirm-btn')) {
            const player = state.players.find(p => p.id === state.activePlayerId);
            player.roundBetValue += state.currentBetValue;
            state.currentBetValue = 0;
            renderAll(); 
            renderBetScreen(getNextPlayerId(state.activePlayerId));
            return;
        }
        if (target.closest('#end-betting-btn')) { handleEndBetting(); return; }
        if (target.closest('#bet-next-player')) { renderBetScreen(getNextPlayerId(state.activePlayerId)); return; }
        
        if (target.closest('.prev-btn')) {
            const screen = target.dataset.target;
            const prevId = getPrevPlayerId(state.activePlayerId);
            if (screen === 'bet') renderBetScreen(prevId);
            else if (screen === 'manage') renderManageScreen(prevId);
            return;
        }

        // Tela de Gerenciamento
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
        if (target.closest('#manage-chip-selector .chip-img')) {
            const type = target.dataset.chipType;
            state.manageChangeValue += CHIP_TYPES[type].value;
            renderManageVisuals(state.activePlayerId);
            return;
        }
        if (target.closest('#manage-stack-visualizer .chip-img')) {
            const type = target.dataset.chipType;
            const player = state.players.find(p => p.id === state.activePlayerId);
            if (player.stack + state.manageChangeValue >= CHIP_TYPES[type].value) {
                state.manageChangeValue -= CHIP_TYPES[type].value;
                renderManageVisuals(state.activePlayerId);
            }
            return;
        }
        if (target.closest('#manage-save-btn')) {
            const player = state.players.find(p => p.id === state.activePlayerId);
            player.stack += state.manageChangeValue;
            state.manageChangeValue = 0;
            renderAll();
            switchScreen('home');
            return;
        }
        if (target.closest('#manage-next-player')) { renderManageScreen(getNextPlayerId(state.activePlayerId)); return; }
        
        // --- Tela de Configurações ---
        if (target.closest('#settings-add-player-btn')) {
            const newName = prompt("Digite o nome do novo jogador:");
            if (newName && newName.trim() !== "") {
                const newId = state.players.length > 0 ? Math.max(...state.players.map(p => p.id)) + 1 : 1;
                state.players.push({ id: newId, name: newName, stack: INITIAL_STACK, roundBetValue: 0, selectedForPot: false });
                renderOrderScreen();
            }
            return;
        }
        if (target.closest('#settings-save-order-btn')) {
            const playerNodes = document.querySelectorAll('#settings-player-list .player-item');
            const newOrder = Array.from(playerNodes).map(node => state.players.find(p => p.id === parseInt(node.dataset.playerId)));
            state.players = newOrder;
            saveState();
            renderAll();
            switchScreen('home');
            return;
        }
        if (target.closest('#timer-start-pause-btn')) { handleStartPause(); return; }
        if (target.closest('#timer-reset-btn')) { resetTimer(); return; }
        if (target.closest('#timer-next-level-btn')) { levelUp(); renderTimer(); saveState(); return; }
        if (target.closest('#timer-prev-level-btn')) { levelDown(); renderTimer(); saveState(); return; }

        if(target.closest('.home-btn')) { switchScreen('home'); return; }
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
    function init(forceReset = false) {
        const savedState = localStorage.getItem('pokerMasterStateV19');
        if (savedState && !forceReset) {
            state = JSON.parse(savedState);
        } else {
            state = {
                players: [],
                potValue: 0,
                activePlayerId: null,
                currentBetValue: 0,
                manageChangeValue: 0,
                timer: { round: 0, time: 15 * 60, isRunning: false, duration: 15, endTime: null }
            };
            if (!forceReset) {
                for (let i = 1; i <= 6; i++) {
                    state.players.push({ 
                        id: i, name: `Jogador ${i}`, stack: INITIAL_STACK, 
                        roundBetValue: 0, selectedForPot: false 
                    });
                }
            }
        }
        renderAll();
        if (state.timer?.isRunning) {
            timerInterval = setInterval(tick, 1000);
        }
    }

    init();
});
