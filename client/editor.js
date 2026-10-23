import {onCanvasMouseDown, onCanvasMouseMove, onNodeMouseDown, onNodeMouseMove, onNodeMouseUp} from './modules/events.js';
import {render} from './modules/render.js';
import {applySimulationState, clearPetriNet, currentMode, deleteObject, findComment, findNode, fireTransition, getSimulation, getState, resetSimulation, selectedId, setMode, setSelectedId, toggleFilterColor, updateArcWeight, updateCommentText, updateElementColor, updateName, updateTokens} from './modules/state.js';
import {exportToFile, exportToSVG, importFromFile, loadFromLocalStorage} from './modules/storage.js';
import {loadToggleTheme, toggleTheme} from './modules/theme.js';


// --- ПАНЕЛЬ СВОЙСТВ (СПРАВА) ---
export function selectObject(id) {
    setSelectedId(id);
    render();

    const panel = document.getElementById('properties-panel');
    if (!id) {
        if (getSimulation().isSimMode) {
            const simulation = getSimulation();

            const filteredHistory = simulation.history.filter(item => {
                const itemColor = item.color || 'black';
                const chk = document.getElementById(`chk-filter-${itemColor}`);
                return chk ? chk.checked : true;
            });

            if (filteredHistory.length === 0) {
                panel.innerHTML = `
                    <div class="property-group"><h3>История симуляции</h3></div>
                    <p style="color:#888;">История пуста или отфильтрована по цвету.</p>
                `;
                return;
            }

            const colorEmojis = {black: '⚫', red: '🔴', blue: '🔵', green: '🟢'};

            let historyHtml = `
                <div class="property-group"><h3>Совершенные переходы</h3></div>
                <div>
                    <ol style="padding-left: 20px; margin: 0;">
            `;

            filteredHistory.forEach(item => {
                const emoji = colorEmojis[item.color] || '⚫';
                historyHtml += `
                    <li>
                        <span>${emoji}</span> 
                        <b>${item.name}</b>
                    </li>
                `;
            });

            historyHtml += `
                    </ol>
                </div>
                <p style="font-size: 0.85em; color:#888;">Всего шагов: ${filteredHistory.length}</p>
            `;

            panel.innerHTML = historyHtml;
            return;
        }

        panel.innerHTML = `<p style="color:#888;">Выберите объект для редактирования</p>`;
        return;
    }

    const place = getState().places.find(p => p.uuid === id);
    const transition = getState().transitions.find(t => t.uuid === id);
    const arc = getState().arcs.find(a => a.uuid === id);
    const comment = getState().comments.find(a => a.uuid === id);

    if (place) {
        panel.innerHTML = `
            <div class="property-group"><h3>Позиция</h3></div>
            <div class="property-group"><label>Имя:</label><input type="text" value="${
            place.name}" oninput="updateName('${id}', this.value)"></div>
            <div class="property-group"><label>Маркеры (фишки):</label><input  id="property-tokens-input" type="number" min="0" value="${
            place.tokens}" oninput="updateTokens('${id}', this.value)"></div>
        `;
    } else if (transition) {
        panel.innerHTML = `
            <div class="property-group"><h3>Переход</h3></div>
            <div class="property-group"><label>Имя:</label><input type="text" value="${
            transition.name}" oninput="updateName('${id}', this.value)"></div>
        `;
    } else if (arc) {
        const srcNode = findNode(arc.sourceId);
        const tgtNode = findNode(arc.targetId);
        panel.innerHTML = `
            <div class="property-group"><h3>Дуга</h3></div>
            <div class="property-group"><p>Связывает: <b>${srcNode ? srcNode.name : '?'}</b> → <b>${
            tgtNode ? tgtNode.name : '?'}</b></p></div>
            <div class="property-group"><label>Кратность (Вес):</label><input type="number" min="1" value="${
            arc.weight}" oninput="updateArcWeight('${id}', this.value)"></div>
        `;
    } else if (comment) {
        panel.innerHTML = `
        <div class="property-group"><h3>Комментарий</h3></div>
        <div class="property-group">
            <label>Текст:</label>
            <textarea rows="4" style="resize: vertical; width: 100%;" 
                oninput="updateCommentText('${id}', this.value)"
            >${comment.text}</textarea>
        </div>
    `;
    }

    const currentObj = place || transition || arc || comment;
    panel.innerHTML += `
    <div class="property-group">
        <label>Цвет элемента:</label>
        <select onchange="updateElementColor('${id}', this.value)">
            <option value="black" ${
        currentObj.color === 'black' || !currentObj.color ? 'selected' : ''}>⚫ Черный</option>
            <option value="red" ${currentObj.color === 'red' ? 'selected' : ''}>🔴 Красный</option>
            <option value="blue" ${currentObj.color === 'blue' ? 'selected' : ''}>🔵 Синий</option>
            <option value="green" ${
        currentObj.color === 'green' ? 'selected' : ''}>🟢 Зеленый</option>
        </select>
    </div>
    <button class="btn-danger" onclick="deleteObject('${id}')">Удалить</button>
`;
}

// Чтобы HTML инлайн-события (onclick, onpointerdown) видели эти функции
window.selectObject = selectObject;
window.setMode = setMode;
window.resetSimulation = resetSimulation;
window.applySimulationState = applySimulationState;
window.fireTransition = fireTransition;
window.toggleFilterColor = toggleFilterColor;
window.updateElementColor = updateElementColor;
window.updateName = updateName;
window.updateTokens = updateTokens;
window.updateArcWeight = updateArcWeight;
window.updateCommentText = updateCommentText;
window.deleteObject = deleteObject;
window.clearPetriNet = clearPetriNet;

window.exportToFile = exportToFile;
window.importFromFile = importFromFile;
window.exportToSVG = exportToSVG;
window.toggleTheme = toggleTheme;

window.onCanvasMouseDown = onCanvasMouseDown;
window.onNodeMouseDown = onNodeMouseDown;

function init() {
    loadFromLocalStorage();  // Загружаем сохраненную сеть
    loadToggleTheme();       // Восстанавливаем тему оформления
    render();                // Делаем первичный рендеринг
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}