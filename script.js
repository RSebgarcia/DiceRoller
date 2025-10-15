document.addEventListener('DOMContentLoaded', () => {

    // 1. Elementos del DOM y Gestión de Estado
    const diceTray = document.getElementById('diceTray');
    const rollResultsDiv = document.getElementById('rollResults');
    const resultsArea = document.getElementById('resultsArea');
    const rollAllBtn = document.getElementById('rollAllBtn');
    const rollOneBtn = document.getElementById('rollOneBtn');
    const addManualBtn = document.getElementById('addManualBtn');
    const statBoxes = document.querySelectorAll('.stat-score');
    const appModal = document.getElementById('appModal');
    const modalForm = document.getElementById('modalForm'),
        modalTitle = document.getElementById('modalTitle'),
        modalMessage = document.getElementById('modalMessage'),
        modalInput = document.getElementById('modalInput'),
        modalConfirmBtn = document.getElementById('modalConfirmBtn'),
        modalCancelBtn = document.getElementById('modalCancelBtn');
    
    // Panel de Análisis
    const statAnalysisBox = document.getElementById('statAnalysisBox');
    const totalSumEl = document.getElementById('totalSum');
    const avgSuccessEl = document.getElementById('avgSuccess');
    const recommendationEl = document.getElementById('statRecommendation');

    // -- Nuestras Fuentes de la Verdad --
    let availableResults = []; // Almacena los objetos de stats en la bandeja
    let assignedStats = {};    // Almacena los objetos de stats en las casillas { str: {id, sum,...}, dex: ... }
    
    let isRolling = false;

    // 2. Lógica de Tirada con ID
    function secureRollD6() {
        const r = new Uint32Array(1);
        window.crypto.getRandomValues(r);
        return (r[0] % 6) + 1;
    }

    function get4d6DropLowestResult() {
        let rolls = [secureRollD6(), secureRollD6(), secureRollD6(), secureRollD6()];
        rolls.sort((a, b) => a - b);
        return {
            id: crypto.randomUUID(),
            rolls: rolls,
            sum: rolls[1] + rolls[2] + rolls[3],
            lowest: rolls[0],
            manual: false
        };
    }

    function calculateModifier(score) {
        const n = parseInt(score);
        if (n === 0 || isNaN(n)) {
            return "+0";
        }
        const m = Math.floor((n - 10) / 2);
        return (m >= 0 ? "+" : "") + m;
    }
    
    // 3. Lógica de UI (Renderiza desde el estado)
    function updateStatBox(statName, resultObject) {
        const box = document.querySelector(`.stat-score[data-stat="${statName}"]`);
        if (box) {
            if (resultObject) {
                box.textContent = resultObject.sum;
                box.dataset.resultId = resultObject.id;
            } else {
                box.textContent = '0';
                delete box.dataset.resultId;
            }
            box.nextElementSibling.textContent = calculateModifier(box.textContent);
        }
    }

    function renderResultsUI(isInitialRender = false) {
        const existingElements = new Set(Array.from(rollResultsDiv.children).map(el => el.dataset.resultId));
        rollResultsDiv.innerHTML = '';
        availableResults.forEach(result => {
            const el = document.createElement('div');
            el.className = 'roll-result';
            if (!existingElements.has(result.id) && !isInitialRender) {
                el.classList.add('bounce-in');
            }
            el.draggable = true;
            el.textContent = result.sum;
            el.dataset.resultId = result.id;
            el.addEventListener('click', () => {
                document.querySelectorAll('.roll-result.selected').forEach(e => e.classList.remove('selected'));
                el.classList.add('selected');
                showRollDetails(result.id);
            });
            el.addEventListener('dragstart', handleDragStart);
            rollResultsDiv.appendChild(el);
        });
    }

    function showRollDetails(resultId) {
        const result = [...availableResults, ...Object.values(assignedStats)].find(r => r && r.id === resultId);
        diceTray.innerHTML = '';
        if (!result) return;
        if (result.manual) {
            diceTray.innerHTML = `<p class="tray-placeholder">Valor añadido manualmente (${result.sum})</p>`;
            return;
        }
        let discardedSet = false;
        result.rolls.sort((a, b) => b - a).forEach(roll => {
            const die = document.createElement('div');
            die.className = 'die no-animation';
            die.textContent = roll;
            if (roll === result.lowest && !discardedSet) {
                die.classList.add('discarded');
                discardedSet = true;
            }
            diceTray.appendChild(die);
        });
    }
    
    function updateUIWithAnimation(updateStateFunction) {
        const firstPositions = new Map();
        rollResultsDiv.childNodes.forEach(child => {
            if (child.nodeType === 1) {
                firstPositions.set(child.dataset.resultId, child.getBoundingClientRect());
            }
        });

        updateStateFunction();
        renderResultsUI();
        
        rollResultsDiv.childNodes.forEach(child => {
            if (child.nodeType === 1) {
                const last = child.getBoundingClientRect();
                const first = firstPositions.get(child.dataset.resultId);
                
                if (first) {
                    const deltaX = first.left - last.left;
                    const deltaY = first.top - last.top;
                    
                    child.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                    
                    requestAnimationFrame(() => {
                        child.style.transform = '';
                    });
                }
            }
        });
    }

    // 4. Lógica de Animación
    async function animateDiceRoll(resultData) {
        diceTray.innerHTML = '';
        const { rolls } = resultData;
        const diceElements = rolls.map(() => {
            const d = document.createElement('div');
            d.className = 'die';
            d.style.animationDelay = `${Math.random() * 0.2}s`;
            diceTray.appendChild(d);
            return d;
        });
        await new Promise(r => setTimeout(r, 1200));
        let discardedSet = false;
        rolls.sort((a, b) => b - a).forEach((roll, i) => {
            const d = diceElements[i];
            d.textContent = roll;
            if (roll === resultData.lowest && !discardedSet) {
                d.classList.add('discarded');
                discardedSet = true;
            }
        });
        await new Promise(r => setTimeout(r, 1500));
        
        updateUIWithAnimation(() => {
            availableResults.push(resultData);
        });

        updateButtonState();
    }

    // 5. Lógica de Modal y Controles
    function showModal({ type, title, message }) {
        return new Promise((resolve, reject) => {
            modalTitle.textContent = title;
            modalMessage.textContent = message;
            modalInput.value = '';
            modalInput.style.display = type === 'prompt' ? 'block' : 'none';
            modalCancelBtn.style.display = type === 'alert' ? 'none' : 'inline-flex';
            modalConfirmBtn.textContent = type === 'alert' ? 'OK' : 'Confirmar';
            appModal.showModal();
            const closeListener = () => { appModal.close(); reject('Modal cerrado'); };
            const cancelListener = () => { appModal.close(); reject('Acción cancelada'); };
            const submitListener = (e) => {
                e.preventDefault();
                if (type === 'prompt' && !modalInput.checkValidity()) {
                    modalInput.reportValidity();
                    return;
                }
                const value = type === 'prompt' ? parseInt(modalInput.value) : true;
                appModal.close();
                resolve(value);
            };
            appModal.addEventListener('close', closeListener, { once: true });
            modalCancelBtn.addEventListener('click', cancelListener, { once: true });
            modalForm.addEventListener('submit', submitListener, { once: true });
        });
    }

    async function addManualStatFlow() {
        let newStats = [];
        while (getTotalStatsCount() + newStats.length < 6) {
            try {
                const v = await showModal({ type: 'prompt', title: `Añadir Valor (${getTotalStatsCount() + newStats.length + 1} de 6)`, message: 'Introduce el valor o cancela.' });
                newStats.push({ id: crypto.randomUUID(), sum: v, rolls: [], lowest: null, manual: true });
            } catch (e) {
                break;
            }
        }
        if (newStats.length > 0) {
            updateUIWithAnimation(() => {
                availableResults.push(...newStats);
            });
            updateButtonState();
        }
        if (getTotalStatsCount() >= 6 && newStats.length > 0) {
            showModal({ type: 'alert', title: 'Límite alcanzado', message: 'Has generado 6 estadísticas.' });
        }
    }
    
    async function rollOneStat() {
        if (isRolling || getTotalStatsCount() >= 6) return;
        isRolling = true;
        await animateDiceRoll(get4d6DropLowestResult());
        isRolling = false;
    }

    async function handleSmartRollAll() {
        if (isRolling) return;
        isRolling = true;
        const currentCount = getTotalStatsCount();
        if (currentCount >= 6) {
            try {
                await showModal({ type: 'confirm', title: '¿Empezar de Nuevo?', message: 'Ya tienes 6 estadísticas. ¿Quieres borrarlas y tirar 6 nuevas?' });
                await resetAll(true);
                for (let i = 0; i < 6; i++) {
                    await animateDiceRoll(get4d6DropLowestResult());
                }
            } catch (error) {
                // User cancelled
            }
        } else {
            const remaining = 6 - currentCount;
            for (let i = 0; i < remaining; i++) {
                await animateDiceRoll(get4d6DropLowestResult());
            }
        }
        isRolling = false;
    }

    // 6. Lógica de Análisis
    function analyzeStats() {
        const scores = Object.values(assignedStats).map(stat => stat.sum);
        if (scores.length !== 6) return;

        const totalSum = scores.reduce((sum, score) => sum + score, 0);
        const successChances = scores.map(score => {
            const modifier = Math.floor((score - 10) / 2);
            const rollNeeded = 12 - modifier;
            const successOutcomes = Math.max(0, 20 - rollNeeded + 1);
            return (successOutcomes / 20) * 100;
        });
        const avgSuccess = successChances.reduce((sum, chance) => sum + chance, 0) / 6;

        let recommendation = "";
        let recClass = "";

        if (avgSuccess >= 60) {
            recommendation = "¡Estadísticas heroicas! Este personaje es excepcionalmente poderoso. ¡Ideal para campañas difíciles!";
            recClass = "rec-heroic";
        } else if (avgSuccess >= 55) {
            recommendation = "Un conjunto de estadísticas muy sólido y por encima de la media. ¡Un gran punto de partida!";
            recClass = "rec-strong";
        } else if (avgSuccess >= 50) {
            recommendation = "¡Perfectamente balanceado! Este personaje se alinea con el estándar de D&D, ideal para cualquier aventura.";
            recClass = "rec-standard";
        } else if (avgSuccess >= 45) {
            recommendation = "Un personaje con algunos desafíos. Ofrece una experiencia de juego interesante y con oportunidades de superación.";
            recClass = "rec-challenging";
        } else {
            recommendation = "Estas estadísticas son bastante bajas. Será un desafío considerable. Podrías considerar volver a tirar.";
            recClass = "rec-low";
        }

        totalSumEl.textContent = totalSum;
        avgSuccessEl.textContent = `${Math.round(avgSuccess)}%`;
        recommendationEl.textContent = recommendation;
        recommendationEl.className = `recommendation ${recClass}`;
        statAnalysisBox.hidden = false;
    }

    function hideStatAnalysis() {
        statAnalysisBox.hidden = true;
    }

    // 7. Lógica de Drag & Drop
    function handleDragStart(e) {
        e.target.classList.add('dragging');
        const resultId = e.target.dataset.resultId;
        const origin = e.target.classList.contains('roll-result') ? 'tray' : 'stat-box';
        let data = { resultId, origin };
        if (origin === 'stat-box') {
            data.originStat = e.target.dataset.stat;
        }
        e.dataTransfer.setData('text/plain', JSON.stringify(data));
        e.target.addEventListener('dragend', () => e.target.classList.remove('dragging'), { once: true });
    }

    function handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        updateUIWithAnimation(() => {
            const originData = JSON.parse(e.dataTransfer.getData('text/plain'));
            const targetElement = e.currentTarget;
            const movingObject = [...availableResults, ...Object.values(assignedStats)].find(r => r && r.id === originData.resultId);
            if (!movingObject) return;

            if (targetElement.id === 'resultsArea' || targetElement.id === 'rollResults') {
                if (originData.origin === 'stat-box') {
                    delete assignedStats[originData.originStat];
                    availableResults.push(movingObject);
                    updateStatBox(originData.originStat, null);
                }
            } else if (targetElement.classList.contains('stat-score')) {
                const targetStat = targetElement.dataset.stat;
                const targetObject = assignedStats[targetStat];
                if (originData.origin === 'tray') {
                    if (!targetObject) {
                        assignedStats[targetStat] = movingObject;
                        availableResults = availableResults.filter(r => r.id !== movingObject.id);
                    } else {
                        assignedStats[targetStat] = movingObject;
                        availableResults = availableResults.filter(r => r.id !== movingObject.id);
                        availableResults.push(targetObject);
                    }
                    updateStatBox(targetStat, movingObject);
                } else if (originData.origin === 'stat-box' && originData.originStat !== targetStat) {
                    assignedStats[targetStat] = movingObject;
                    if (targetObject) {
                        assignedStats[originData.originStat] = targetObject;
                    } else {
                        delete assignedStats[originData.originStat];
                    }
                    updateStatBox(targetStat, movingObject);
                    updateStatBox(originData.originStat, targetObject);
                }
            }
        });
        
        updateButtonState();

        if (availableResults.length === 0 && Object.keys(assignedStats).length === 6) {
            analyzeStats();
        } else {
            hideStatAnalysis();
        }
    }
    
    // 8. Funciones Auxiliares y Eventos
    function getTotalStatsCount() {
        return availableResults.length + Object.keys(assignedStats).length;
    }

    function updateButtonState() {
        if (getTotalStatsCount() >= 6) {
            rollOneBtn.textContent = 'Reiniciar';
            rollOneBtn.classList.add('btn-reset');
        } else {
            rollOneBtn.textContent = 'Tirar 1 Estadística';
            rollOneBtn.classList.remove('btn-reset');
        }
    }

    async function handleRollOneOrReset() {
        if (rollOneBtn.textContent === 'Reiniciar') {
            try {
                await showModal({ type: 'confirm', title: 'Confirmar Reinicio', message: '¿Estás seguro? Se borrarán todas las estadísticas.' });
                await resetAll();
            } catch (e) {
                // User cancelled
            }
        } else {
            await rollOneStat();
        }
    }

    async function resetAll(isInitialRender = false) {
        availableResults = [];
        assignedStats = {};
        statBoxes.forEach(box => updateStatBox(box.dataset.stat, null));
        diceTray.innerHTML = '<p class="tray-placeholder">Presiona un botón para tirar...</p>';
        hideStatAnalysis();
        renderResultsUI(isInitialRender);
        updateButtonState();
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }
    
    // Inicialización
    rollAllBtn.addEventListener('click', handleSmartRollAll);
    rollOneBtn.addEventListener('click', handleRollOneOrReset);
    addManualBtn.addEventListener('click', addManualStatFlow);
    statBoxes.forEach(box => {
        box.addEventListener('dragstart', handleDragStart);
        box.addEventListener('dragover', handleDragOver);
        box.addEventListener('dragleave', handleDragLeave);
        box.addEventListener('drop', handleDrop);
    });
    resultsArea.addEventListener('dragover', handleDragOver);
    resultsArea.addEventListener('dragleave', handleDragLeave);
    resultsArea.addEventListener('drop', handleDrop);
    
    resetAll(true);
});