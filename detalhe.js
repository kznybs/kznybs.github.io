// Aguarda o documento HTML ser completamente carregado e analisado antes de executar o script.
document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO ---
    // Define um objeto constante com os tipos de fichas, seus valores monetários e a classe CSS para estilização.
    const CHIP_TYPES = {
        blue: { value: 400, class: 'chip-blue' },
        white: { value: 200, class: 'chip-white' },
        black: { value: 50, class: 'chip-black' },
        green: { value: 25, class: 'chip-green' },
        red: { value: 25, class: 'chip-red' },
    };
    // Define a quantidade inicial de fichas que cada jogador recebe no início do jogo.
    const INITIAL_CHIPS = { white: 8, red: 8, green: 8, black: 8, blue: 0 };
    // Define o número padrão de jogadores (atualmente não utilizado diretamente, o jogo começa com 6 jogadores no estado inicial).
    const NUM_PLAYERS = 6;
    // Define um array com os níveis de apostas obrigatórias (small e big blinds) para cada rodada do torneio.
    const BLIND_LEVELS = [
        { small: 25, big: 50 }, { small: 50, big: 100 }, { small: 75, big: 150 },
        { small: 100, big: 200 }, { small: 150, big: 300 }, { small: 200, big: 400 },
        { small: 250, big: 500 }, { small: 300, big: 600 }, { small: 400, big: 800 },
        { small: 500, big: 1000 }, { small: 600, big: 1200 }, { small: 800, big: 1600 },
        { small: 1000, big: 2000 }
    ];

    // --- ESTADO DO JOGO ---
    // Declara um objeto que guardará todas as informações dinâmicas do jogo (jogadores, pote, timer, etc.).
    let state = {};
    // Variável para armazenar a referência do intervalo do timer (setInterval), para que possa ser parado depois.
    let timerInterval = null;
    // Variável para armazenar o Contexto de Áudio da Web, usado para tocar sons.
    let audioCtx;

    // --- ELEMENTOS DO DOM ---
    // Objeto que armazena referências aos elementos HTML das diferentes telas da aplicação para fácil acesso.
    const screens = {
        home: document.getElementById('home-screen'),
        order: document.getElementById('order-screen'),
        bet: document.getElementById('bet-screen'),
        manage: document.getElementById('manage-screen'),
        settings: document.getElementById('settings-screen'),
    };
    
    // --- Lógica de Áudio ---
    // Função para tocar um som simples, usada para notificar o avanço de nível do timer.
    function playSound() {
        try {
            // Verifica se o contexto de áudio já foi inicializado. Se não, cria um novo.
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            // Cria um oscilador, que é a fonte que gera a onda sonora.
            const oscillator = audioCtx.createOscillator();
            // Cria um nó de ganho para controlar o volume do som.
            const gainNode = audioCtx.createGain();

            // Conecta o oscilador ao nó de ganho.
            oscillator.connect(gainNode);
            // Conecta o nó de ganho à saída de áudio do dispositivo (alto-falantes).
            gainNode.connect(audioCtx.destination);

            // Define o tipo de onda sonora para 'sine' (senoidal), que produz um tom puro.
            oscillator.type = 'sine';
            // Define a frequência (tom) do som para 880 Hz (nota Lá, 5ª oitava) no momento atual.
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
            // Define o volume inicial para 50%.
            gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            // Faz o volume diminuir exponencialmente para quase zero em 0.5 segundos, criando um efeito de "fade out".
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
            // Inicia a reprodução do som imediatamente.
            oscillator.start(audioCtx.currentTime);
            // Agenda a parada do som após 0.5 segundos.
            oscillator.stop(audioCtx.currentTime + 0.5);

        } catch(e) {
            // Se ocorrer um erro (ex: navegador não suporta a API), exibe uma mensagem no console.
            console.error("Web Audio API is not supported in this browser or could not be initialized.", e);
        }
    }

    // --- Lógica Principal ---
    // Salva o estado atual do jogo no localStorage do navegador para persistência de dados.
    function saveState() {
        // Converte o objeto 'state' para uma string JSON e a armazena com uma chave específica.
        localStorage.setItem('pokerMasterStateV12', JSON.stringify(state));
    }

    // Calcula o valor total das fichas (stack) de um jogador.
    function calculateStack(player) {
        // Retorna 0 se o jogador ou suas fichas não existirem, para evitar erros.
        if (!player || !player.chips) return 0;
        // Itera sobre as fichas do jogador, multiplica a quantidade pelo valor de cada tipo e soma tudo.
        return Object.entries(player.chips).reduce((sum, [type, count]) => sum + (CHIP_TYPES[type].value * count), 0);
    }
    
    // Calcula o valor total que um jogador apostou na rodada atual.
    function calculateRoundBetValue(player) {
        // Retorna 0 se o jogador ou sua aposta da rodada não existirem.
        if (!player || !player.roundBet) return 0;
        // Itera sobre as fichas na aposta da rodada, multiplica a quantidade pelo valor e soma tudo.
        return Object.entries(player.roundBet).reduce((sum, [type, count]) => sum + (CHIP_TYPES[type].value * count), 0);
    }

    // Calcula o valor total de todas as fichas no pote principal.
    function calculatePotValue() {
        // Retorna 0 se o pote não existir.
        if (!state.pot) return 0;
        // Itera sobre as fichas no pote, multiplica a quantidade pelo valor e soma tudo.
        return Object.entries(state.pot).reduce((sum, [type, count]) => sum + (CHIP_TYPES[type].value * count), 0);
    }

    // Soma o valor de todas as apostas feitas na rodada atual por todos os jogadores.
    function calculateTotalRoundBets() {
        // Retorna 0 se a lista de jogadores não existir.
        if (!state.players) return 0;
        // Usa reduce para somar o valor da aposta da rodada de cada jogador.
        return state.players.reduce((total, player) => {
            return total + calculateRoundBetValue(player);
        }, 0);
    }

    // Alterna a tela visível na interface do usuário.
    function switchScreen(screenName) {
        // Itera sobre todas as telas e remove a classe 'active', escondendo-as.
        Object.values(screens).forEach(s => s.classList.remove('active'));
        // Se a tela com o nome fornecido existir, adiciona a classe 'active' para torná-la visível.
        if (screens[screenName]) {
            screens[screenName].classList.add('active');
        }
    }
    
    // --- RENDERIZAÇÃO ---
    // Função principal que atualiza todas as partes visuais da aplicação.
    function renderAll() {
        // Atualiza a tela inicial.
        renderHomeScreen();
        // Atualiza o display do timer.
        renderTimer();
        // Salva o estado atual do jogo após qualquer mudança.
        saveState();
    }

    // Renderiza a tela inicial, mostrando a lista de jogadores, seus stacks e o pote.
    function renderHomeScreen() {
        // Cria uma cópia da lista de jogadores e a ordena em ordem decrescente de stack.
        const rankedPlayers = [...state.players].sort((a, b) => calculateStack(b) - calculateStack(a));
        
        // Obtém o elemento HTML que contém a lista de jogadores.
        const playerListEl = document.getElementById('player-list');
        // Limpa o conteúdo atual da lista para redesenhá-la.
        playerListEl.innerHTML = '';
        // Itera sobre cada jogador ordenado para criar seu elemento na lista.
        rankedPlayers.forEach((player, index) => {
            // Cria um novo elemento <div> para o jogador.
            const playerEl = document.createElement('div');
            // Define a classe CSS para o elemento do jogador.
            playerEl.className = 'player-item';
            // Calcula o valor da aposta do jogador na rodada atual.
            const roundBetValue = calculateRoundBetValue(player);
            // Cria o HTML para exibir a aposta da rodada, somente se for maior que zero.
            const betDisplay = roundBetValue > 0 ? `<div class="player-current-bet"><span class="bet-label">Bet</span><br>${roundBetValue}</div>` : '';

            // Define o conteúdo HTML do elemento do jogador usando um template string.
            playerEl.innerHTML = `
                <div class="player-position">${index + 1}º</div>
                <div class="player-info">
                    <button class="player-stack" data-player-id="${player.id}">${calculateStack(player).toLocaleString('pt-BR')}</button>
                    ${betDisplay}
                </div>
                <button class="player-name" data-player-id="${player.id}">${player.name}</button>
                <button class="select-winner-btn ${player.selectedForPot ? 'selected' : ''}" data-player-id="${player.id}">+</button>
            `;
            // Adiciona o elemento do jogador recém-criado à lista na tela.
            playerListEl.appendChild(playerEl);
        });
        // Atualiza o valor do pote exibido na tela inicial, formatado para o padrão brasileiro.
        document.getElementById('home-pot-value').textContent = calculatePotValue().toLocaleString('pt-BR');
    }

    // Renderiza a tela de ordenação dos jogadores, permitindo arrastar e soltar (drag & drop).
    function renderOrderScreen() {
        // Obtém o elemento da lista de jogadores na tela de ordenação.
        const playerListEl = document.getElementById('order-player-list');
        // Limpa a lista atual.
        playerListEl.innerHTML = '';
        // Itera sobre cada jogador no estado atual do jogo.
        state.players.forEach(player => {
            // Cria um <div> para o jogador.
            const playerEl = document.createElement('div');
            // Define a classe CSS.
            playerEl.className = 'player-item';
            // Torna o elemento arrastável.
            playerEl.draggable = true;
            // Armazena o ID do jogador no atributo 'data-player-id' para referência futura.
            playerEl.dataset.playerId = player.id;
            // Define o conteúdo HTML, incluindo o ícone para arrastar e o botão para remover.
            playerEl.innerHTML = `
                <span class="drag-handle">|||</span>
                <span class="player-name-order">${player.name}</span>
                <button class="remove-player-btn" data-player-id="${player.id}">✖</button>
            `;
            // Adiciona o elemento do jogador à lista.
            playerListEl.appendChild(playerEl);
        });
    }

    // Prepara e exibe a tela de apostas para um jogador específico.
    function renderBetScreen(playerId) {
        // Define qual jogador está ativo no estado do jogo.
        state.activePlayerId = playerId;
        // Reseta o objeto de aposta temporária (fichas que estão sendo selecionadas).
        state.currentBet = {};

        // Encontra o objeto do jogador com base no ID fornecido.
        const player = state.players.find(p => p.id === playerId);
        // Se o jogador não for encontrado, interrompe a função.
        if (!player) return;

        // Atualiza o nome do jogador na tela de aposta.
        document.getElementById('bet-player-name').textContent = player.name;
        
        // Chama a função para renderizar os detalhes visuais da aposta.
        renderBetVisuals(playerId);
        // Muda para a tela de aposta.
        switchScreen('bet');
    }

    // Renderiza os elementos visuais da tela de aposta (fichas, valores, etc.).
    function renderBetVisuals(playerId) {
        // Encontra o jogador ativo.
        const player = state.players.find(p => p.id === playerId);
        // Interrompe se o jogador não for encontrado.
        if (!player) return;

        // Calcula o total de apostas já comprometidas na rodada e exibe na tela.
        const totalCommittedRoundBets = calculateTotalRoundBets();
        document.getElementById('bet-screen-pot-value').textContent = totalCommittedRoundBets.toLocaleString('pt-BR');
        // Exibe o número da rodada atual.
        document.getElementById('bet-screen-round-num').textContent = state.timer.round + 1;

        // Encontra a maior aposta feita por qualquer jogador nesta rodada.
        const highestBetInRound = Math.max(0, ...state.players.map(p => calculateRoundBetValue(p)));
        // Obtém o elemento que exibe a informação da aposta a ser coberta.
        const previousBetInfoEl = document.getElementById('previous-bet-info');
        // Se houver uma aposta maior e a aposta do jogador atual for menor, exibe o valor a ser coberto.
        if (highestBetInRound > 0 && calculateRoundBetValue(player) < highestBetInRound) {
            previousBetInfoEl.textContent = `Aposta a cobrir: ${highestBetInRound}`;
        } else {
            // Caso contrário, limpa o texto.
            previousBetInfoEl.textContent = '';
        }

        // Calcula o valor da aposta já feita pelo jogador na rodada.
        const playerRoundBetValue = calculateRoundBetValue(player);
        // Calcula o valor das fichas que o jogador está selecionando no momento (ainda não confirmadas).
        const currentBetChangeValue = Object.entries(state.currentBet).reduce((sum, [type, count]) => sum + (CHIP_TYPES[type].value * count), 0);
        // Exibe o valor total da aposta (já feita + sendo selecionada).
        document.getElementById('bet-total-value').textContent = (playerRoundBetValue + currentBetChangeValue).toLocaleString('pt-BR');

        // Obtém o container que visualiza as fichas da aposta.
        const visualizerEl = document.getElementById('bet-stack-visualizer');
        // Limpa o conteúdo anterior.
        visualizerEl.innerHTML = '';
        
        // Combina as fichas já apostadas na rodada com as que estão sendo selecionadas agora para visualização.
        const chipsToVisualize = {...player.roundBet, ...state.currentBet};
        // Itera sobre as fichas a serem visualizadas.
        Object.entries(chipsToVisualize).forEach(([type, count]) => {
            // Se a contagem de um tipo de ficha for positiva...
            if (count > 0) {
                // Pega a configuração da ficha (valor, classe).
                const config = CHIP_TYPES[type];
                // Cria um botão para representar a ficha.
                const chipBtn = document.createElement('button');
                // Adiciona as classes CSS.
                chipBtn.className = `btn chip-btn ${config.class}`;
                // Armazena o tipo da ficha no botão.
                chipBtn.dataset.chipType = type;
                // Define o HTML interno do botão com o valor e a quantidade da ficha.
                chipBtn.innerHTML = `<div class="value">${config.value}</div><div class="count">${count}</div>`;
                // Adiciona o botão ao visualizador.
                visualizerEl.appendChild(chipBtn);
            }
        });

        // Obtém o container das fichas que o jogador pode selecionar de seu stack.
        const selectorEl = document.getElementById('bet-chip-selector');
        // Limpa o conteúdo anterior.
        selectorEl.innerHTML = '';
        // Itera sobre todos os tipos de ficha disponíveis no jogo.
        Object.entries(CHIP_TYPES).forEach(([type, config]) => {
            // Calcula quantas fichas deste tipo já foram movidas para a aposta temporária.
            const chipsTakenFromHand = Math.max(0, state.currentBet[type] || 0);
            // Calcula quantas fichas deste tipo ainda restam na mão do jogador.
            const remainingInHand = player.chips[type] - chipsTakenFromHand;
            
            // Se o jogador ainda tiver fichas deste tipo...
            if (remainingInHand > 0) {
                 // Cria o botão da ficha para seleção.
                 const chipBtn = document.createElement('button');
                 chipBtn.className = `btn chip-btn ${config.class}`;
                 chipBtn.dataset.chipType = type;
                 chipBtn.innerHTML = `<div class="value">${config.value}</div><div class="count">${remainingInHand}</div>`;
                 // Adiciona o botão ao seletor.
                 selectorEl.appendChild(chipBtn);
            }
        });
    }
    
    // Prepara e exibe a tela de gerenciamento de fichas (adicionar/remover fichas do stack de um jogador).
    function renderManageScreen(playerId) {
        // Define o jogador ativo para gerenciamento.
        state.activePlayerId = playerId;
        // Reseta o objeto de alterações temporárias de fichas.
        state.manageChips = {};

        // Encontra o jogador.
        const player = state.players.find(p => p.id === playerId);
        if (!player) return;
        
        // Exibe o nome do jogador com um ícone de edição.
        document.getElementById('manage-player-name').innerHTML = `${player.name} <span class="edit-icon">✎</span>`;
        
        // Obtém o container para o seletor de fichas.
        const selectorEl = document.getElementById('manage-chip-selector');
        // Limpa o conteúdo.
        selectorEl.innerHTML = '';
        // Itera sobre todos os tipos de ficha.
        Object.entries(CHIP_TYPES).forEach(([type, config]) => {
             // Cria um botão para cada tipo de ficha.
             const chipBtn = document.createElement('button');
             chipBtn.className = `btn chip-btn ${config.class}`;
             chipBtn.dataset.chipType = type;
             // Na tela de gerenciamento, a quantidade é "infinita" (∞), pois se trata de adicionar fichas ao jogo.
             chipBtn.innerHTML = `<div class="value">${config.value}</div><div class="count">∞</div>`;
             selectorEl.appendChild(chipBtn);
        });
        // Chama a função para renderizar os visuais do stack do jogador.
        renderManageVisuals(playerId);
        // Muda para a tela de gerenciamento.
        switchScreen('manage');
    }

    // Renderiza os visuais da tela de gerenciamento de fichas.
    function renderManageVisuals(playerId) {
        // Encontra o jogador.
        const player = state.players.find(p => p.id === playerId);
        if (!player) return;
        // Calcula o stack atual do jogador.
        let currentStack = calculateStack(player);
        // Inicializa o valor da alteração em 0.
        let changeValue = 0;
        
        // Obtém o container do visualizador de stack.
        const visualizerEl = document.getElementById('manage-stack-visualizer');
        // Limpa o conteúdo.
        visualizerEl.innerHTML = '';

        // Cria uma cópia temporária das fichas do jogador para simular as alterações.
        const tempChips = { ...player.chips };
        // Itera sobre as alterações de fichas que estão sendo feitas.
        Object.entries(state.manageChips).forEach(([type, count]) => {
            // Adiciona (ou subtrai) a quantidade de fichas na cópia temporária.
            tempChips[type] = (tempChips[type] || 0) + count;
            // Acumula o valor monetário da alteração.
            changeValue += CHIP_TYPES[type].value * count;
        });

        // Itera sobre a contagem de fichas temporária (com as alterações).
        Object.entries(tempChips).forEach(([type, count]) => {
            // Se a contagem for positiva, cria e exibe o botão da ficha.
            if(count > 0) {
                const config = CHIP_TYPES[type];
                const chipBtn = document.createElement('button');
                chipBtn.className = `btn chip-btn ${config.class}`;
                chipBtn.dataset.chipType = type;
                chipBtn.innerHTML = `<div class="value">${config.value}</div><div class="count">${count}</div>`;
                visualizerEl.appendChild(chipBtn);
            }
        });
        
        // Exibe o valor total do stack (atual + alterações).
        document.getElementById('manage-total-value').textContent = (currentStack + changeValue).toLocaleString('pt-BR');
    }

    // Retorna o ID do próximo jogador na ordem da mesa.
    function getNextPlayerId(currentId) {
        // Encontra o índice do jogador atual na lista de jogadores.
        const currentIndex = state.players.findIndex(p => p.id === currentId);
        // Calcula o índice do próximo jogador, usando o operador de módulo (%) para dar a volta na lista (do último para o primeiro).
        const nextIndex = (currentIndex + 1) % state.players.length;
        // Retorna o ID do próximo jogador.
        return state.players[nextIndex].id;
    }

    // Retorna o ID do jogador anterior na ordem da mesa.
    function getPrevPlayerId(currentId) {
        // Encontra o índice do jogador atual.
        const currentIndex = state.players.findIndex(p => p.id === currentId);
        // Calcula o índice do jogador anterior, garantindo que o resultado seja sempre positivo.
        const prevIndex = (currentIndex - 1 + state.players.length) % state.players.length;
        // Retorna o ID do jogador anterior.
        return state.players[prevIndex].id;
    }

    // --- Lógica do Timer ---
    // Formata um tempo em segundos para uma string no formato "MM:SS".
    function formatTime(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

    // Renderiza o timer e as informações de blinds em todas as telas relevantes.
    function renderTimer() {
        // Pega o objeto do timer do estado do jogo.
        const timer = state.timer;
        // Pega o nível de blind atual com base na rodada do timer.
        const level = BLIND_LEVELS[timer.round];
        // Formata o texto do blind. Se não houver mais níveis, exibe 'FIM'.
        const blindsText = level ? `${level.small}/${level.big}` : 'FIM';

        // Atualiza o display do tempo na tela inicial.
        document.getElementById('home-timer-display').textContent = formatTime(timer.time);
        // Atualiza o número da rodada na tela inicial.
        document.getElementById('home-round-num').textContent = timer.round + 1;
        // Atualiza o valor dos blinds na tela inicial.
        document.getElementById('home-blinds-display').textContent = blindsText;
        
        // Atualiza o número da rodada na tela de configurações.
        document.getElementById('settings-round-num').textContent = timer.round + 1;
        // Atualiza o valor dos blinds na tela de configurações.
        document.getElementById('settings-blinds-display').textContent = blindsText;
        
        // Obtém o botão de iniciar/pausar.
        const startPauseBtn = document.getElementById('timer-start-pause-btn');
        // Altera o texto do botão para 'PAUSAR' ou 'INICIAR' dependendo do estado do timer.
        startPauseBtn.textContent = timer.isRunning ? 'PAUSAR' : 'INICIAR';
        // Adiciona ou remove a classe 'paused' para mudar a aparência do botão.
        startPauseBtn.classList.toggle('paused', !timer.isRunning);
        
        // Define o valor do input da duração do timer.
        document.getElementById('timer-input').value = timer.duration;
        // Desabilita o input se o timer estiver rodando.
        document.getElementById('timer-input').disabled = timer.isRunning;
        // Desabilita o botão de nível anterior se o timer estiver rodando.
        document.getElementById('timer-prev-level-btn').disabled = timer.isRunning;
        // Desabilita o botão de próximo nível se o timer estiver rodando.
        document.getElementById('timer-next-level-btn').disabled = timer.isRunning;
    }

    // Lida com o clique no botão de iniciar ou pausar o timer.
    function handleStartPause() {
        // Inicializa o contexto de áudio na primeira interação do usuário, como exigido por muitos navegadores.
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Inverte o estado de 'rodando' do timer.
        state.timer.isRunning = !state.timer.isRunning;
        // Se o timer estiver rodando agora...
        if (state.timer.isRunning) {
            // Calcula o timestamp exato de quando o timer deve terminar, para evitar desvios.
            state.timer.endTime = Date.now() + state.timer.time * 1000;
            // Inicia um intervalo que chama a função 'tick' a cada 1000ms (1 segundo).
            timerInterval = setInterval(tick, 1000);
        } else {
            // Se o timer foi pausado, para o intervalo.
            clearInterval(timerInterval);
            // Limpa a referência do intervalo.
            timerInterval = null;
            // Limpa o tempo final.
            state.timer.endTime = null;
        }
        // Atualiza a exibição do timer.
        renderTimer();
        // Salva o novo estado.
        saveState();
    }

    // Função chamada a cada segundo pelo setInterval para atualizar a contagem regressiva do timer.
    function tick() {
        // Se o timer não estiver rodando ou não tiver um tempo final definido, não faz nada.
        if (!state.timer.isRunning || !state.timer.endTime) return;
        
        // Recalcula o tempo restante com base na diferença entre o tempo final e o tempo atual.
        let newTime = Math.round((state.timer.endTime - Date.now()) / 1000);
        // Garante que o tempo não fique negativo.
        if (newTime < 0) newTime = 0;

        // Se o tempo chegou a zero e antes era maior que zero (ou seja, acabou de zerar)...
        if (newTime === 0 && state.timer.time > 0) {
            // Avança para o próximo nível de blind.
            levelUp();
        }
        // Atualiza o tempo no estado do jogo.
        state.timer.time = newTime;
        // Atualiza a exibição do timer.
        renderTimer();
        // Salva o estado.
        saveState();
    }

    // Avança para o próximo nível de blind.
    function levelUp() {
        // Verifica se ainda não chegou ao último nível.
        if (state.timer.round < BLIND_LEVELS.length - 1) {
            // Incrementa a rodada.
            state.timer.round++;
            // Reseta o tempo do timer para a duração configurada (em minutos * 60).
            state.timer.time = state.timer.duration * 60;
            // Se o timer estava rodando, recalcula o tempo final.
            if(state.timer.isRunning) {
                state.timer.endTime = Date.now() + state.timer.time * 1000;
            }
            // Toca um som para notificar a mudança de nível.
            playSound();
        } else {
            // Se chegou ao último nível, para o timer.
            state.timer.isRunning = false;
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }
    
    // Volta para o nível anterior de blind.
    function levelDown() {
        // Verifica se não está no primeiro nível.
        if (state.timer.round > 0) {
            // Decrementa a rodada.
            state.timer.round--;
            // Reseta o tempo do timer.
            state.timer.time = state.timer.duration * 60;
        }
    }
    
    // Reseta o timer para o início (primeiro nível, tempo cheio).
    function resetTimer() {
         // Volta para a rodada 0.
         state.timer.round = 0;
         // Reseta o tempo.
         state.timer.time = state.timer.duration * 60;
         // Se o timer estava rodando, pausa-o.
         if (state.timer.isRunning) {
             handleStartPause();
         }
         // Atualiza a exibição.
         renderTimer();
         // Salva o estado.
         saveState();
    }

    // --- MANIPULADORES DE EVENTOS ---
    // Lógica de arrastar e soltar (drag & drop) para ordenar jogadores.
    // Variável para guardar a referência do elemento que está sendo arrastado.
    let draggedItem = null;

    // Adiciona um ouvinte para o evento 'dragstart', que ocorre quando o usuário começa a arrastar um elemento.
    document.body.addEventListener('dragstart', e => {
        // Verifica se o elemento alvo do evento tem a classe 'player-item'.
        if (e.target.classList.contains('player-item')) {
            // Armazena o elemento que está sendo arrastado.
            draggedItem = e.target;
            // Usa setTimeout para adicionar a classe 'dragging' após um pequeno atraso, permitindo que o navegador crie a "imagem fantasma" do elemento.
            setTimeout(() => {
                e.target.classList.add('dragging');
            }, 0);
        }
    });

    // Adiciona um ouvinte para o evento 'dragend', que ocorre quando o usuário solta o elemento arrastado.
    document.body.addEventListener('dragend', e => {
        // Se havia um item sendo arrastado...
        if (draggedItem) {
            // Remove a classe 'dragging' para que ele volte a ser visível normalmente.
            draggedItem.classList.remove('dragging');
            // Limpa a referência ao item arrastado.
            draggedItem = null;
        }
    });

    // Adiciona um ouvinte para o evento 'dragover', que ocorre continuamente enquanto um elemento é arrastado sobre uma área válida.
    document.body.addEventListener('dragover', e => {
        // Previne o comportamento padrão do navegador, que é não permitir soltar (drop) elementos.
        e.preventDefault();
        // Pega a lista de jogadores onde o drop pode ocorrer.
        const list = document.getElementById('order-player-list');
        // Se a lista não existir na tela atual, não faz nada.
        if (!list) return;
        // Calcula qual elemento da lista está logo após a posição vertical do mouse.
        const afterElement = getDragAfterElement(list, e.clientY);
        // Pega o elemento que está sendo arrastado no momento.
        const currentDragged = document.querySelector('.dragging');
        // Se houver um elemento sendo arrastado...
        if(currentDragged){
            // Se não houver nenhum elemento "depois", significa que o item deve ser colocado no final da lista.
            if (afterElement == null) {
                list.appendChild(currentDragged);
            } else {
                // Caso contrário, insere o item arrastado antes do 'afterElement'.
                list.insertBefore(currentDragged, afterElement);
            }
        }
    });

    // Função auxiliar para a lógica de drag & drop. Determina qual elemento da lista está logo após a posição Y do mouse.
    function getDragAfterElement(container, y) {
        // Pega todos os elementos arrastáveis dentro do container, exceto o que está sendo arrastado no momento.
        const draggableElements = [...container.querySelectorAll('.player-item:not(.dragging)')];

        // Usa 'reduce' para encontrar o elemento mais próximo.
        return draggableElements.reduce((closest, child) => {
            // Pega as dimensões e a posição do elemento filho.
            const box = child.getBoundingClientRect();
            // Calcula a distância vertical entre a posição do mouse e o centro do elemento filho.
            const offset = y - box.top - box.height / 2;
            // Se o offset for negativo (mouse está acima do centro do filho) e for maior que o offset mais próximo encontrado até agora...
            if (offset < 0 && offset > closest.offset) {
                // ...então este filho é o novo mais próximo.
                return { offset: offset, element: child };
            } else {
                // ...caso contrário, mantém o mais próximo já encontrado.
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element; // O valor inicial é o elemento encontrado pelo reduce.
    }

    // Finaliza a rodada de apostas, movendo todas as fichas apostadas para o pote principal.
    function handleEndBetting() {
        // Itera sobre cada jogador.
        state.players.forEach(player => {
            // Itera sobre as fichas na aposta da rodada do jogador.
            Object.entries(player.roundBet).forEach(([type, count]) => {
                // Adiciona essas fichas ao pote principal.
                state.pot[type] = (state.pot[type] || 0) + count;
            });
            // Zera a aposta da rodada do jogador para a próxima rodada de apostas.
            player.roundBet = { white: 0, red: 0, green: 0, black: 0, blue: 0 };
        });
        // Renderiza tudo para atualizar a UI.
        renderAll();
        // Volta para a tela inicial.
        switchScreen('home');
    }

    // Manipulador principal de cliques para toda a aplicação (usando delegação de eventos).
    document.body.addEventListener('click', (e) => {
        // Pega o elemento exato que foi clicado.
        const target = e.target;
        
        // --- Navegação e Ações na Tela Home ---
        // Se o clique foi no stack de um jogador, abre a tela de aposta para ele.
        if (target.closest('.player-stack')) { renderBetScreen(parseInt(target.closest('.player-stack').dataset.playerId)); return; }
        // Se o clique foi no nome de um jogador, abre a tela de gerenciamento de fichas para ele.
        if (target.closest('.player-name')) { renderManageScreen(parseInt(target.closest('.player-name').dataset.playerId)); return; }
        // Se o clique foi no botão de selecionar vencedor (+)...
        if (target.closest('.select-winner-btn')) {
            // Encontra o jogador correspondente.
            const player = state.players.find(p => p.id === parseInt(target.closest('.select-winner-btn').dataset.playerId));
            // Inverte o estado de seleção do jogador.
            player.selectedForPot = !player.selectedForPot;
            // Re-renderiza a tela inicial para mostrar a mudança visual.
            renderHomeScreen();
            // Salva o estado.
            saveState();
            return;
        }
        // Se o clique foi no botão de distribuir o pote...
        if (target.closest('#distribute-btn')) {
            // Filtra para obter a lista de jogadores selecionados como vencedores.
            const winners = state.players.filter(p => p.selectedForPot);
            // Se houver vencedores e o pote tiver valor...
            if (winners.length > 0 && calculatePotValue() > 0) {
                // Se for apenas um vencedor...
                if (winners.length === 1) {
                    const winner = winners[0];
                    // Adiciona todas as fichas do pote diretamente ao stack do vencedor.
                    Object.keys(state.pot).forEach(chipType => {
                        winner.chips[chipType] = (winner.chips[chipType] || 0) + state.pot[chipType];
                    });
                } else { // Se houver múltiplos vencedores (split pot)...
                    const totalPotValue = calculatePotValue();
                    // Calcula o valor que cada vencedor receberá (arredondando para baixo, sobras ficam no pote).
                    const valuePerWinner = Math.floor(totalPotValue / winners.length);
                    // Itera sobre cada vencedor.
                    winners.forEach(winner => {
                        let valueToDistribute = valuePerWinner;
                        // Ordena os tipos de ficha do maior valor para o menor, para otimizar a distribuição.
                        const sortedChipTypes = Object.keys(CHIP_TYPES).sort((a, b) => CHIP_TYPES[b].value - CHIP_TYPES[a].value);
                        // Itera sobre os tipos de ficha para dar ao jogador as fichas correspondentes ao valor ganho.
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
                // Zera o pote.
                state.pot = { white: 0, red: 0, green: 0, black: 0, blue: 0 };
                // Desmarca todos os jogadores como vencedores.
                state.players.forEach(p => p.selectedForPot = false);
                // Atualiza toda a UI.
                renderAll();
            }
            return;
        }
        // Se o clique foi no botão de resetar o jogo...
        if (target.closest('#reset-btn')) {
            // Pede confirmação ao usuário antes de uma ação destrutiva.
            if (confirm('Tem certeza que deseja limpar todos os jogadores e reiniciar o jogo?')) {
                // Limpa a lista de jogadores.
                state.players = [];
                // Zera o pote.
                state.pot = { white: 0, red: 0, green: 0, black: 0, blue: 0 };
                // Reseta o timer para o estado inicial.
                state.timer = { round: 0, time: 15 * 60, isRunning: false, duration: 15, endTime: null };
                // Se o timer estava rodando, para o intervalo.
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
                // Atualiza a UI.
                renderAll();
                renderOrderScreen();
                saveState();
            }
            return;
        }
        // Botões de navegação entre telas.
        if (target.closest('#settings-btn')) { switchScreen('settings'); return; }
        if (target.closest('#go-to-order-btn')) { 
            renderOrderScreen();
            switchScreen('order'); 
            return;
        }
        if (target.closest('#go-to-home-btn')) { 
            switchScreen('home'); 
            return;
        }

        // --- Ações na Tela de Ordem de Jogo ---
        if (target.closest('#add-player-btn')) {
            // Pede o nome do novo jogador ao usuário.
            const newName = prompt("Digite o nome do novo jogador:");
            // Se um nome foi digitado...
            if (newName && newName.trim() !== "") {
                // Gera um ID único para o novo jogador.
                const newId = state.players.length > 0 ? Math.max(...state.players.map(p => p.id)) + 1 : 1;
                // Adiciona o novo jogador à lista de jogadores com o estado inicial.
                state.players.push({
                    id: newId,
                    name: newName,
                    chips: { ...INITIAL_CHIPS },
                    roundBet: { white: 0, red: 0, green: 0, black: 0, blue: 0 },
                    selectedForPot: false
                });
                // Re-renderiza a tela de ordem.
                renderOrderScreen();
            }
            return;
        }
        if (target.closest('.remove-player-btn')) {
            // Pega o ID do jogador a ser removido.
            const playerId = parseInt(target.closest('.remove-player-btn').dataset.playerId);
            // Encontra o índice do jogador na lista.
            const playerIndex = state.players.findIndex(p => p.id === playerId);
            // Se o jogador foi encontrado, remove-o da lista.
            if (playerIndex > -1) {
                state.players.splice(playerIndex, 1);
                renderOrderScreen();
            }
            return;
        }
        if (target.closest('#save-order-btn')) {
            // Pega todos os elementos dos jogadores na ordem em que estão na tela após o drag & drop.
            const playerNodes = document.querySelectorAll('#order-player-list .player-item');
            // Cria um novo array de jogadores na ordem correta, buscando cada jogador pelo ID.
            const newOrder = Array.from(playerNodes).map(node => {
                const playerId = parseInt(node.dataset.playerId);
                return state.players.find(p => p.id === playerId);
            });
            // Atualiza a lista de jogadores no estado com a nova ordem.
            state.players = newOrder;
            // Salva, renderiza tudo e volta para a tela inicial.
            saveState();
            renderAll();
            switchScreen('home');
            return;
        }

        // --- Ações na Tela de Aposta ---
        if (target.closest('#bet-chip-selector .chip-btn')) {
            // Pega o tipo da ficha clicada no seletor.
            const type = target.closest('.chip-btn').dataset.chipType;
            // Encontra o jogador ativo.
            const player = state.players.find(p => p.id === state.activePlayerId);
            // Conta quantas fichas deste tipo já foram selecionadas para a aposta.
            const betCount = state.currentBet[type] || 0;
            // Se o jogador ainda tiver fichas deste tipo disponíveis...
            if (player.chips[type] > betCount) { 
                // Incrementa a contagem da ficha na aposta temporária.
                state.currentBet[type] = (state.currentBet[type] || 0) + 1;
                // Re-renderiza os visuais da aposta para refletir a mudança.
                renderBetVisuals(state.activePlayerId); 
            }
            return;
        }
        if (target.closest('#bet-stack-visualizer .chip-btn')) {
            // Pega o tipo da ficha clicada no visualizador da aposta.
            const type = target.closest('.chip-btn').dataset.chipType;
            // Encontra o jogador ativo.
            const player = state.players.find(p => p.id === state.activePlayerId);
            // Calcula o total de fichas deste tipo na aposta (já confirmadas + temporárias).
            const totalBetChips = (player.roundBet[type] || 0) + (state.currentBet[type] || 0);
            // Se houver fichas para remover...
            if (totalBetChips > 0) {
                // Decrementa a contagem na aposta temporária (devolvendo a ficha para o seletor).
                state.currentBet[type] = (state.currentBet[type] || 0) - 1;
                renderBetVisuals(state.activePlayerId); 
            }
            return;
        }
        if (target.closest('#bet-confirm-btn')) {
            const currentPlayerId = state.activePlayerId;
            const player = state.players.find(p => p.id === currentPlayerId);
            
            // Itera sobre as fichas na aposta temporária.
            Object.entries(state.currentBet).forEach(([type, count]) => {
                // Remove as fichas do stack do jogador.
                player.chips[type] -= count;
                // Adiciona as fichas à aposta da rodada do jogador.
                player.roundBet[type] = (player.roundBet[type] || 0) + count;
            });
            
            // Limpa a aposta temporária.
            state.currentBet = {};
            // Atualiza toda a UI.
            renderAll(); 

            // Pega o ID do próximo jogador.
            const nextPlayerId = getNextPlayerId(currentPlayerId);
            // Abre a tela de aposta para o próximo jogador.
            renderBetScreen(nextPlayerId);
            return;
        }
        if (target.closest('#clear-bet-btn')) {
            // Limpa a aposta temporária.
            state.currentBet = {};
            // Atualiza os visuais da aposta.
            renderBetVisuals(state.activePlayerId);
            return;
        }
        if (target.closest('#end-betting-btn') || target.closest('#end-betting-btn-home')) {
            // Chama a função para finalizar a rodada de apostas.
            handleEndBetting();
            return;
        }
        // Botão para passar para o próximo jogador na tela de aposta.
        if (target.closest('#bet-next-player')) { renderBetScreen(getNextPlayerId(state.activePlayerId)); return; }
        
        // Botão "Anterior" genérico.
        if (target.closest('.prev-btn')) {
            const button = target.closest('.prev-btn');
            // Pega a tela alvo do botão.
            const targetScreen = button.dataset.target;
            // Se for a tela de aposta, abre para o jogador anterior.
            if (targetScreen === 'bet') {
                renderBetScreen(getPrevPlayerId(state.activePlayerId));
            } else if (targetScreen === 'manage') { // Se for a de gerenciamento, abre para o jogador anterior.
                renderManageScreen(getPrevPlayerId(state.activePlayerId));
            }
            return;
        }

        // --- Ações na Tela de Gerenciamento ---
        if (target.closest('#manage-player-name .edit-icon')) {
            const player = state.players.find(p => p.id === state.activePlayerId);
            // Pede um novo nome para o jogador.
            const newName = prompt('Digite o novo nome:', player.name);
            // Se um novo nome válido for fornecido...
            if (newName && newName.trim()) {
                // Atualiza o nome do jogador.
                player.name = newName.trim();
                // Re-renderiza as telas relevantes.
                renderManageScreen(player.id);
                renderHomeScreen();
                saveState();
            }
            return;
        }
        if (target.closest('#manage-chip-selector .chip-btn')) {
            // Pega o tipo da ficha clicada para adicionar.
            const type = target.closest('.chip-btn').dataset.chipType;
            // Incrementa a contagem de alteração para este tipo de ficha.
            state.manageChips[type] = (state.manageChips[type] || 0) + 1;
            renderManageVisuals(state.activePlayerId);
            return;
        }
        if (target.closest('#manage-stack-visualizer .chip-btn')) {
            // Pega o tipo da ficha clicada para remover.
            const type = target.closest('.chip-btn').dataset.chipType;
            const player = state.players.find(p => p.id === state.activePlayerId);
            // Verifica se o jogador tem fichas para remover (considerando as alterações temporárias).
            if(player.chips[type] + (state.manageChips[type] || 0) > 0) {
                // Decrementa a contagem de alteração.
                state.manageChips[type] = (state.manageChips[type] || 0) - 1;
                renderManageVisuals(state.activePlayerId);
            }
            return;
        }
        if (target.closest('#manage-save-btn')) {
            const player = state.players.find(p => p.id === state.activePlayerId);
            // Aplica as alterações de fichas ao stack real do jogador.
            Object.entries(state.manageChips).forEach(([type, count]) => { player.chips[type] += count; });
            // Atualiza a UI e volta para a home.
            renderAll();
            switchScreen('home');
            return;
        }
        // Botão para passar para o próximo jogador na tela de gerenciamento.
        if (target.closest('#manage-next-player')) { renderManageScreen(getNextPlayerId(state.activePlayerId)); return; }
        
        // --- Ações na Tela de Configurações do Timer ---
        if (target.closest('#timer-start-pause-btn')) { handleStartPause(); return; }
        if (target.closest('#timer-reset-btn')) { resetTimer(); return; }
        if (target.closest('#timer-next-level-btn')) { levelUp(); renderTimer(); saveState(); return; }
        if (target.closest('#timer-prev-level-btn')) { levelDown(); renderTimer(); saveState(); return; }

        // Ações genéricas de cancelar/voltar para a home.
        if(target.closest('.home-btn')) { 
            switchScreen('home'); 
            return; 
        }
    });

    // Adiciona um ouvinte para o evento 'change' no input da duração do timer.
    document.getElementById('timer-input').addEventListener('change', (e) => {
        // Só permite alterar se o timer não estiver rodando.
        if (!state.timer.isRunning) {
            // Atualiza a duração no estado do jogo.
            state.timer.duration = parseInt(e.target.value);
            // Atualiza o tempo atual para a nova duração.
            state.timer.time = state.timer.duration * 60;
            renderTimer();
            saveState();
        }
    });

    // --- INICIALIZAÇÃO ---
    // Função que inicializa o estado do jogo ao abrir a página.
    function init() {
        // Tenta carregar um estado de jogo salvo do localStorage.
        const savedState = localStorage.getItem('pokerMasterStateV12');
        // Se encontrou um estado salvo...
        if (savedState) {
            // Converte a string JSON de volta para um objeto.
            state = JSON.parse(savedState);
            // Garante que as propriedades 'chips' e 'roundBet' existam em cada jogador, para compatibilidade com versões antigas.
            state.players.forEach(p => {
                p.chips = p.chips || {};
                p.roundBet = p.roundBet || { white: 0, red: 0, green: 0, black: 0, blue: 0 };
            });
            // Garante que a propriedade 'pot' exista.
            state.pot = state.pot || { white: 0, red: 0, green: 0, black: 0, blue: 0 };

            // Lógica para recuperar o estado do timer corretamente se a página foi fechada enquanto ele rodava.
            if (state.timer.isRunning && state.timer.endTime) {
                const now = Date.now();
                // Recalcula o tempo restante.
                const newTime = Math.round((state.timer.endTime - now) / 1000);
                
                // Se o tempo já passou...
                if (newTime <= 0) {
                    // Calcula quanto tempo se passou desde que o timer deveria ter zerado.
                    let timePassed = (now - state.timer.endTime) / 1000;
                    // Avança os níveis de blind de acordo com o tempo que passou.
                    while(timePassed > 0 && state.timer.round < BLIND_LEVELS.length - 1) {
                        levelUp();
                        timePassed -= state.timer.duration * 60;
                    }
                    // Ajusta o tempo restante.
                    state.timer.time = Math.max(0, state.timer.time + timePassed);
                } else {
                    // Se o tempo ainda não passou, apenas atualiza a contagem.
                    state.timer.time = newTime;
                }
            }
        } else {
            // Se não há estado salvo, cria um estado inicial padrão.
            state = {
                players: [],
                pot: { white: 0, red: 0, green: 0, black: 0, blue: 0 },
                activePlayerId: null,
                currentBet: {},
                manageChips: {},
                timer: { round: 0, time: 15 * 60, isRunning: false, duration: 15, endTime: null }
            };
            // Cria 6 jogadores de exemplo.
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
        // Renderiza a aplicação com o estado carregado ou inicial.
        renderAll();
        // Se o timer estava rodando, reinicia o intervalo 'tick'.
        if (state.timer.isRunning) {
            timerInterval = setInterval(tick, 1000);
        }
    }

    // Chama a função de inicialização para começar a aplicação.
    init();
});