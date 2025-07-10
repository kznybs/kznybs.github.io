document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO ---
    const CHIP_TYPES = {
        blue: { value: 400, class: 'chip-blue' },
        white: { value: 200, class: 'chip-white' },
        black: { value: 50, class: 'chip-black' },
        green: { value: 25, class: 'chip-green' },
        red: { value: 25, class: 'chip-red' },
    };
    const INITIAL_CHIPS = { white: 8, red: 8, green: 8, black: 8, blue: 0 };
    const NUM_PLAYERS = 6;
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

    // --- ELEMENTOS DO DOM ---
    const screens = {
        home: document.getElementById('home-screen'),
        bet: document.getElementById('bet-screen'),
        manage: document.getElementById('manage-screen'),
        settings: document.getElementById('settings-screen'),
    };
    
    // --- Lógica Principal ---
    function saveState() {
        localStorage.setItem('pokerMasterStateV12', JSON.stringify(state));
    }

    function calculateStack(player) {
        if (!player || !player.chips) return 0;
        return Object.entries(player.chips).reduce((sum, [type, count]) => sum + (CHIP_TYPES[type].value * count), 0);
    }
    
    function calculateRoundBetValue(player) {
        if (!player || !player.roundBet) return 0;
        return Object.entries(player.roundBet).reduce((sum, [type, count]) => sum + (CHIP_TYPES[type].value * count), 0);
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
        state.players.sort((a, b) => calculateStack(b) - calculateStack(a));
        
        const playerListEl = document.getElementById('player-list');
        playerListEl.innerHTML = '';
        state.players.forEach((player, index) => {
            const playerEl = document.createElement('div');
            playerEl.className = 'player-item';
            const roundBetValue = calculateRoundBetValue(player);
            const betDisplay = roundBetValue > 0 ? `<div class="player-current-bet">Aposta: ${roundBetValue}</div>` : '';

            playerEl.innerHTML = `
                <div class="player-position">${index + 1}º</div>
                <div style="text-align: center;">
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

    function renderBetScreen(playerId) {
        state.activePlayerId = playerId;
        state.currentBet = {};

        const player = state.players.find(p => p.id === playerId);
        if (!player) return;

        document.getElementById('bet-player-name').textContent = player.name;
        
        renderBetVisuals(playerId);
        switchScreen('bet');
    }

    function renderBetVisuals(playerId) {
        const player = state.players.find(p => p.id === playerId);
        if (!player) return;

        const roundBetValue = calculateRoundBetValue(player);
        const currentBetChangeValue = Object.entries(state.currentBet).reduce((sum, [type, count]) => sum + (CHIP_TYPES[type].value * count), 0);
        document.getElementById('bet-total-value').textContent = (roundBetValue + currentBetChangeValue).toLocaleString('pt-BR');

        const visualizerEl = document.getElementById('bet-stack-visualizer');
        visualizerEl.innerHTML = '';
        
        const chipsToVisualize = {...player.roundBet};
        Object.entries(state.currentBet).forEach(([type, count]) => {
            chipsToVisualize[type] = (chipsToVisualize[type] || 0) + count;
        });

        Object.entries(chipsToVisualize).forEach(([type, count]) => {
            if (count > 0) {
                const config = CHIP_TYPES[type];
                const chipBtn = document.createElement('button');
                chipBtn.className = `btn chip-btn ${config.class}`;
                chipBtn.dataset.chipType = type;
                chipBtn.innerHTML = `<div class="value">${config.value}</div><div class="count">${count}</div>`;
                visualizerEl.appendChild(chipBtn);
            }
        });

        const selectorEl = document.getElementById('bet-chip-selector');
        selectorEl.innerHTML = '';
        Object.entries(CHIP_TYPES).forEach(([type, config]) => {
            const chipsTakenFromHand = Math.max(0, state.currentBet[type] || 0);
            const remainingInHand = player.chips[type] - chipsTakenFromHand;
            
            if (remainingInHand > 0) {
                 const chipBtn = document.createElement('button');
                 chipBtn.className = `btn chip-btn ${config.class}`;
                 chipBtn.dataset.chipType = type;
                 chipBtn.innerHTML = `<div class="value">${config.value}</div><div class="count">${remainingInHand}</div>`;
                 selectorEl.appendChild(chipBtn);
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
             chipBtn.className = `btn chip-btn ${config.class}`;
             chipBtn.dataset.chipType = type;
             chipBtn.innerHTML = `<div class="value">${config.value}</div><div class="count">∞</div>`;
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
                chipBtn.className = `btn chip-btn ${config.class}`;
                chipBtn.dataset.chipType = type;
                chipBtn.innerHTML = `<div class="value">${config.value}</div><div class="count">${count}</div>`;
                visualizerEl.appendChild(chipBtn);
            }
        });
        
        document.getElementById('manage-total-value').textContent = (currentStack + changeValue).toLocaleString('pt-BR');
    }

    function getNextPlayerId(currentId) {
        const numericallySortedPlayers = [...state.players].sort((a, b) => a.id - b.id);
        const currentIndex = numericallySortedPlayers.findIndex(p => p.id === currentId);
        const nextIndex = (currentIndex + 1) % numericallySortedPlayers.length;
        return numericallySortedPlayers[nextIndex].id;
    }

    function getPrevPlayerId(currentId) {
        const numericallySortedPlayers = [...state.players].sort((a, b) => a.id - b.id);
        const currentIndex = numericallySortedPlayers.findIndex(p => p.id === currentId);
        const prevIndex = (currentIndex - 1 + numericallySortedPlayers.length) % numericallySortedPlayers.length;
        return numericallySortedPlayers[prevIndex].id;
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

        if (newTime === 0 && state.timer.time > 0) { // Time just ran out
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
            try { if (navigator.vibrate) navigator.vibrate(200); } catch(e){}
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
             handleStartPause(); // Pausa o timer
         }
         renderTimer();
         saveState();
    }


    // --- MANIPULADORES DE EVENTOS ---
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        
        // Navegação Home
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
                if (winners.length === 1) {
                    const winner = winners[0];
                    Object.keys(state.pot).forEach(chipType => {
                        winner.chips[chipType] = (winner.chips[chipType] || 0) + state.pot[chipType];
                    });
                } else {
                    const totalPotValue = calculatePotValue();
                    const valuePerWinner = Math.floor(totalPotValue / winners.length);
                    winners.forEach(winner => {
                        let valueToDistribute = valuePerWinner;
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
                }
                state.pot = { white: 0, red: 0, green: 0, black: 0, blue: 0 };
                state.players.forEach(p => p.selectedForPot = false);
                renderAll();
            }
            return;
        }
        if (target.closest('#reset-btn')) {
            if (confirm('Tem certeza que deseja resetar todas as fichas?')) {
                localStorage.removeItem('pokerMasterStateV12');
                init();
            }
            return;
        }
        if (target.closest('#settings-btn')) { switchScreen('settings'); return; }

        // Tela de Aposta
        if (target.closest('#bet-chip-selector .chip-btn')) {
            const type = target.closest('.chip-btn').dataset.chipType;
            const player = state.players.find(p => p.id === state.activePlayerId);
            const betCount = state.currentBet[type] || 0;
            if (player.chips[type] > betCount) { 
                state.currentBet[type] = (state.currentBet[type] || 0) + 1;
                renderBetVisuals(state.activePlayerId); 
            }
            return;
        }
        if (target.closest('#bet-stack-visualizer .chip-btn')) {
            const type = target.closest('.chip-btn').dataset.chipType;
            const player = state.players.find(p => p.id === state.activePlayerId);
            const totalBetChips = (player.roundBet[type] || 0) + (state.currentBet[type] || 0);
            if (totalBetChips > 0) {
                state.currentBet[type] = (state.currentBet[type] || 0) - 1;
                renderBetVisuals(state.activePlayerId); 
            }
            return;
        }
        if (target.closest('#bet-confirm-btn')) {
            const currentPlayerId = state.activePlayerId;
            const player = state.players.find(p => p.id === currentPlayerId);
            
            Object.entries(state.currentBet).forEach(([type, count]) => {
                player.chips[type] -= count;
                player.roundBet[type] += count;
            });
            
            renderAll(); 

            const nextPlayerId = getNextPlayerId(currentPlayerId);
            renderBetScreen(nextPlayerId);
            return;
        }
        if (target.closest('#end-betting-btn')) {
            state.players.forEach(player => {
                Object.entries(player.roundBet).forEach(([type, count]) => {
                    state.pot[type] = (state.pot[type] || 0) + count;
                });
                player.roundBet = { white: 0, red: 0, green: 0, black: 0, blue: 0 };
            });
            renderAll();
            switchScreen('home');
            return;
        }
        if (target.closest('#bet-next-player')) { renderBetScreen(getNextPlayerId(state.activePlayerId)); return; }
        
        // Botão "Anterior"
        if (target.closest('.prev-btn')) {
            const button = target.closest('.prev-btn');
            const targetScreen = button.dataset.target;
            if (targetScreen === 'bet') {
                renderBetScreen(getPrevPlayerId(state.activePlayerId));
            } else if (targetScreen === 'manage') {
                renderManageScreen(getPrevPlayerId(state.activePlayerId));
            }
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
            Object.entries(state.manageChips).forEach(([type, count]) => { player.chips[type] += count; });
            renderAll();
            switchScreen('home');
            return;
        }
        if (target.closest('#manage-next-player')) { renderManageScreen(getNextPlayerId(state.activePlayerId)); return; }
        
        // Tela de Configurações do Timer
        if (target.closest('#timer-start-pause-btn')) { handleStartPause(); return; }
        if (target.closest('#timer-reset-btn')) { resetTimer(); return; }
        if (target.closest('#timer-next-level-btn')) { levelUp(); renderTimer(); saveState(); return; }
        if (target.closest('#timer-prev-level-btn')) { levelDown(); renderTimer(); saveState(); return; }

        // Ações genéricas de cancelar/voltar
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
        const savedState = localStorage.getItem('pokerMasterStateV12');
        if (savedState) {
            state = JSON.parse(savedState);
            state.players.forEach(p => {
                p.chips = p.chips || {};
                p.roundBet = p.roundBet || { white: 0, red: 0, green: 0, black: 0, blue: 0 };
            });
            state.pot = state.pot || { white: 0, red: 0, green: 0, black: 0, blue: 0 };

            if (state.timer.isRunning && state.timer.endTime) {
                const now = Date.now();
                const newTime = Math.round((state.timer.endTime - now) / 1000);
                
                if (newTime <= 0) {
                    let timePassed = (now - state.timer.endTime) / 1000;
                    while(timePassed > 0 && state.timer.round < BLIND_LEVELS.length - 1) {
                        levelUp();
                        timePassed -= state.timer.duration * 60;
                    }
                    state.timer.time = Math.max(0, state.timer.time + timePassed);
                } else {
                    state.timer.time = newTime;
                }
            }
        } else {
            state = {
                players: [],
                pot: { white: 0, red: 0, green: 0, black: 0, blue: 0 },
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
                    roundBet: { white: 0, red: 0, green: 0, black: 0, blue: 0 },
                    selectedForPot: false 
                });
            }
        }
        renderAll();
        if (state.timer.isRunning) {
            timerInterval = setInterval(tick, 1000);
        }
    }

    init();
});
