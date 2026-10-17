// --- КОРРЕКТНОЕ СОСТОЯНИЕ (STATE) ---
let state = {
    places: [],       // { uuid, name, x, y, tokens, initialTokens }
    transitions: [],  // { uuid, name, x, y }
    arcs: [],         // { uuid, sourceId, targetId, weight }
    comments: [],     // { uuid, text, x, y }
    counters: {P: 1, T: 1, C: 1},
    isSimMode: false  // Запоминаем статус запущенной симуляции
};

let currentMode = 'select';  // select, simulation, place, transition, arc, token, comment
let selectedId = null;
let dragTarget = null;
let arcSourceId = null;

let visibleColors = {black: true, red: true, blue: true, green: true};

const svg = document.getElementById('petri-svg');
const nodesGroup = document.getElementById('nodes-group');
const arcsGroup = document.getElementById('arcs-group');

// --- УПРАВЛЕНИЕ РЕЖИМАМИ ---
function setMode(mode) {
    // Автоматический сброс к начальной разметке при выходе из симуляции
    if (currentMode === 'simulation' && mode !== 'simulation') {
        resetSimulation();
        state.isSimMode = false;
    }

    // Вход в режим симуляции
    if (mode === 'simulation' && currentMode !== 'simulation') {
        state.places.forEach(p => p.initialTokens = p.tokens);
        state.isSimMode = true;
        selectObject(null);
    }

    currentMode = mode;
    document.querySelectorAll('#left-menu button').forEach(b => b.classList.remove('active'));

    const btn = document.getElementById(`btn-${mode}`);
    if (btn) btn.classList.add('active');

    // Поддержка фокуса на симуляции
    const isSim = currentMode === 'simulation' || state.isSimMode;
    if (isSim && currentMode !== 'simulation') {
        currentMode = 'simulation';
        if (btn) btn.classList.remove('active');
        document.getElementById('btn-simulation').classList.add('active');
    }

    document.getElementById('btn-reset-sim').style.display = isSim ? 'block' : 'none';
    document.body.classList.toggle('mode-simulation', isSim);

    arcSourceId = null;
    render();
}

function resetSimulation() {
    state.places.forEach(p => {
        if (p.initialTokens !== undefined) p.tokens = p.initialTokens;
    });
    render();
}

function generateUUID() {
    return 'uuid-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
}

function findNode(id) {
    return state.places.find(p => p.uuid === id) || state.transitions.find(t => t.uuid === id);
}

function findComment(id) {
    return state.comments.find(c => c.uuid === id);
}

// Проверка активности перехода
function isTransitionEnabled(transId) {
    const inArcs = state.arcs.filter(a => a.targetId === transId);
    if (inArcs.length === 0) return true;

    for (let arc of inArcs) {
        const srcPlace = state.places.find(p => p.uuid === arc.sourceId);
        if (!srcPlace || srcPlace.tokens < arc.weight) {
            return false;
        }
    }
    return true;
}

// Срабатывание перехода
function fireTransition(transId) {
    if (!isTransitionEnabled(transId)) return;

    const inArcs = state.arcs.filter(a => a.targetId === transId);
    const outArcs = state.arcs.filter(a => a.sourceId === transId);

    inArcs.forEach(arc => {
        const srcPlace = state.places.find(p => p.uuid === arc.sourceId);
        if (srcPlace) srcPlace.tokens -= arc.weight;
    });

    outArcs.forEach(arc => {
        const tgtPlace = state.places.find(p => p.uuid === arc.targetId);
        if (tgtPlace) tgtPlace.tokens += arc.weight;
    });

    render();
}

// --- ОБРАБОТКА КЛИКОВ НА ХОЛСТЕ ---
function onCanvasMouseDown(e) {
    if (e.target !== svg || currentMode === 'simulation') return;

    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentMode === 'place') {
        const name = `P${state.counters.P++}`;
        const newPlace = {uuid: generateUUID(), name, x, y, tokens: 0, initialTokens: 0};
        state.places.push(newPlace);
        selectObject(newPlace.uuid);
    } else if (currentMode === 'transition') {
        const name = `T${state.counters.T++}`;
        const newTrans = {uuid: generateUUID(), name, x, y};
        state.transitions.push(newTrans);
        selectObject(newTrans.uuid);
    } else if (currentMode === 'comment') {
        const text = `Комментарий ${state.counters.C++}`;
        const newComment = {uuid: generateUUID(), text, x, y};
        if (!state.comments) state.comments = [];
        state.comments.push(newComment);
        selectObject(newComment.uuid);
    } else {
        selectObject(null);
    }
    render();
}

function onNodeMouseDown(e, id) {
    e.stopPropagation();

    if (currentMode === 'simulation') {
        const isTrans = state.transitions.some(t => t.uuid === id);
        if (isTrans) fireTransition(id);
        return;
    }

    if (currentMode === 'select') {
        const node = findNode(id) || findComment(id);
        dragTarget = {id: id, node: node};
        selectObject(id);

        window.addEventListener('mousemove', onNodeMouseMove);
        window.addEventListener('mouseup', onNodeMouseUp);
    } else if (currentMode === 'arc') {
        if (findComment(id)) return;
        if (!arcSourceId) {
            arcSourceId = id;
        } else {
            const srcIsPlace = state.places.some(p => p.uuid === arcSourceId);
            const tgtIsPlace = state.places.some(p => p.uuid === id);

            if (srcIsPlace !== tgtIsPlace) {
                const existingArc =
                    state.arcs.find(arc => arc.sourceId === arcSourceId && arc.targetId === id);

                if (existingArc) {
                    existingArc.weight = (existingArc.weight || 1) + 1;
                    selectObject(existingArc.uuid);
                } else {
                    const newArc =
                        {uuid: generateUUID(), sourceId: arcSourceId, targetId: id, weight: 1};
                    state.arcs.push(newArc);
                    selectObject(newArc.uuid);
                }

                arcSourceId = null;
            } else {
                alert('Дуга должна соединять Позицию и Переход (или наоборот)!');
                arcSourceId = null;
            }
        }
    } else if (currentMode === 'token') {
        const place = state.places.find(p => p.uuid === id);
        if (place) {
            place.tokens++;
            place.initialTokens = place.tokens;
        }
    }
    render();
}

function onNodeMouseMove(e) {
    if (!dragTarget) return;
    const rect = svg.getBoundingClientRect();
    dragTarget.node.x = e.clientX - rect.left;
    dragTarget.node.y = e.clientY - rect.top;
    render();
}

function onNodeMouseUp() {
    dragTarget = null;
    window.removeEventListener('mousemove', onNodeMouseMove);
    window.removeEventListener('mouseup', onNodeMouseUp);
}

function toggleFilterColor(color) {
    if (visibleColors[color] !== undefined) {
        visibleColors[color] = document.getElementById(`chk-filter-${color}`).checked;
        render();
    }
}

function getColorDimClass(elementColor) {
    const itemColor = elementColor || 'black';  // Если цвет не задан, считаем черным
    if (!visibleColors[itemColor]) {
        return 'color-dimmed';
    }
    return '';
}

function updateElementColor(id, newColor) {
    const obj = state.places.find(p => p.uuid === id) ||
        state.transitions.find(t => t.uuid === id) || state.arcs.find(a => a.uuid === id) ||
        state.comments.find(c => c.uuid === id);

    if (obj) {
        obj.color = newColor;
        render();
    }
}

// --- ОТРИСОВКА В SVG ---
function render() {
    nodesGroup.innerHTML = '';
    arcsGroup.innerHTML = '';

    // 1. Рисуем ДУГИ
    state.arcs.forEach(arc => {
        const src = findNode(arc.sourceId);
        const tgt = findNode(arc.targetId);
        if (!src || !tgt) return;

        const hasReturn =
            state.arcs.some(a => a.sourceId === arc.targetId && a.targetId === arc.sourceId);
        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;

        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const len = Math.hypot(dx, dy) || 1;
        const curveIntensity = hasReturn ? 35 : 12;
        const qx = midX - (dy / len) * curveIntensity;
        const qy = midY + (dx / len) * curveIntensity;

        const pathData = `M ${src.x} ${src.y} Q ${qx} ${qy} ${tgt.x} ${tgt.y}`;
        const isSelected = selectedId === arc.uuid;

        const pointerEvents = currentMode === 'simulation' ? 'style="pointer-events: none;"' : '';

        const dimClass = getColorDimClass(arc.color);
        const arcColor = arc.color || 'black';

        const pathMarkup = `
    <path d="${pathData}" class="arc-hover ${dimClass}" ${
            pointerEvents} onmousedown="selectObject('${arc.uuid}'); event.stopPropagation();"/>
    <path d="${pathData}" class="arc ${isSelected ? 'selected' : ''} ${dimClass}" id="${
            arc.uuid}" style="stroke: ${arcColor};"/>
`;

        arcsGroup.insertAdjacentHTML('beforeend', pathMarkup);

        if (arc.weight > 1) {
            const tx = (midX + qx) / 2;
            const ty = (midY + qy) / 2 - 5;
            arcsGroup.insertAdjacentHTML(
                'beforeend',
                `<text x="${tx}" y="${ty}" class="arc-weight ${dimClass}">${arc.weight}</text>`);
        }
    });

    // 2. Рисуем ПОЗИЦИИ (Добавлена проверка arcSourceId)
    state.places.forEach(p => {
        const isSelected = selectedId === p.uuid;
        // Проверяем, является ли эта позиция началом строящейся дуги
        const isArcSource = arcSourceId === p.uuid;

        let tokensMarkup = '';
        if (p.tokens === 1) {
            tokensMarkup = `<circle cx="${p.x}" cy="${p.y}" r="5" class="token"/>`;
        } else if (p.tokens > 1) {
            tokensMarkup = `<text x="${p.x}" y="${p.y + 4}" class="token label">${p.tokens}</text>`;
        }

        // Добавляем класс 'source-selected', если объект выбран первым для дуги
        const dimClass = getColorDimClass(p.color);
        const pColor = p.color || 'black';

        const markup = `
    <g class="${dimClass}" onmousedown="onNodeMouseDown(event, '${p.uuid}')">
        <circle cx="${p.x}" cy="${p.y}" r="20" class="place ${isSelected ? 'selected' : ''} ${
            isArcSource ? 'source-selected' : ''}" style="stroke: ${pColor};"/>
        ${tokensMarkup}
        <text x="${p.x}" y="${p.y - 25}" class="label" style="fill: ${pColor};">${p.name}</text>
    </g>
`;

        nodesGroup.insertAdjacentHTML('beforeend', markup);
    });

    // 3. Рисуем ПЕРЕХОДЫ (Добавлена проверка arcSourceId)
    state.transitions.forEach(t => {
        const isSelected = selectedId === t.uuid;
        // Проверяем, является ли этот переход началом строящейся дуги
        const isArcSource = arcSourceId === t.uuid;
        const enabledClass =
            (currentMode === 'simulation' && isTransitionEnabled(t.uuid)) ? 'enabled' : '';

        // Добавляем класс 'source-selected', если объект выбран первым для дуги
        const dimClass = getColorDimClass(t.color);
        const tColor = t.color || 'black';

        const markup = `
    <g class="${dimClass}" onmousedown="onNodeMouseDown(event, '${t.uuid}')">
        <rect x="${t.x - 10}" y="${t.y - 25}" width="20" height="50" class="transition ${
            isSelected ?
                'selected' :
                ''} ${enabledClass} ${isArcSource ? 'source-selected' : ''}" style="stroke: ${
            tColor}; ${currentMode !== 'simulation' ? 'fill: white;' : ''}"/>
        <text x="${t.x}" y="${t.y - 32}" class="label" style="fill: ${tColor};">${t.name}</text>
    </g>
`;

        nodesGroup.insertAdjacentHTML('beforeend', markup);
    });

    // 4. Рисуем КОММЕНТАРИИ
    if (state.comments) {
        state.comments.forEach(c => {
            const isSelected = selectedId === c.uuid;
            // Комментарии используют общую систему onNodeMouseDown для перетаскивания и выделения
            const dimClass = getColorDimClass(c.color);
            const cColor = c.color || 'black';

            const markup = `
    <g class="comment-g ${isSelected ? 'selected' : ''} ${
                dimClass}" onmousedown="onNodeMouseDown(event, '${c.uuid}')">
        <rect x="${c.x - 75}" y="${c.y - 15}" width="150" height="30" class="comment-box"/>
        <text x="${c.x}" y="${c.y + 5}" class="comment-text" style="fill: ${cColor};">${
                c.text}</text>
    </g>
`;

            nodesGroup.insertAdjacentHTML('beforeend', markup);
        });
    }
}

// --- ПАНЕЛЬ СВОЙСТВ (СПРАВА) ---
function selectObject(id) {
    if (currentMode === 'simulation') return;
    selectedId = id;
    render();

    const panel = document.getElementById('properties-panel');
    if (!id) {
        panel.innerHTML = `<p style="color:#888;">Выберите объект для редактирования</p>`;
        return;
    }

    const place = state.places.find(p => p.uuid === id);
    const transition = state.transitions.find(t => t.uuid === id);
    const arc = state.arcs.find(a => a.uuid === id);
    const comment = state.comments.find(a => a.uuid === id);

    if (place) {
        panel.innerHTML = `
            <div class="property-group"><h3>Позиция</h3></div>
            <div class="property-group"><label>Имя:</label><input type="text" value="${
            place.name}" oninput="updateName('${id}', this.value)"></div>
            <div class="property-group"><label>Маркеры (фишки):</label><input type="number" min="0" value="${
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
            <div class="property-group"><label>Текст:</label><input type="text" value="${
            comment.text}" oninput="updateCommentText('${id}', this.value)"></div>
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

function updateName(id, newName) {
    const node = findNode(id);
    if (node) {
        node.name = newName;
        render();
    }
}

function updateTokens(id, value) {
    const place = state.places.find(p => p.uuid === id);
    if (place) {
        place.tokens = parseInt(value) || 0;
        place.initialTokens = place.tokens;
        render();
    }
}

function updateArcWeight(id, value) {
    const arc = state.arcs.find(a => a.uuid === id);
    if (arc) {
        arc.weight = parseInt(value) || 1;
        render();
    }
}

function updateCommentText(id, newText) {
    const comment = findComment(id);
    if (comment) {
        comment.text = newText;
        render();
    }
}


function deleteObject(id) {
    state.places = state.places.filter(p => p.uuid !== id);
    state.transitions = state.transitions.filter(t => t.uuid !== id);
    state.arcs = state.arcs.filter(a => a.uuid !== id && a.sourceId !== id && a.targetId !== id);
    state.comments = state.comments.filter(c => c.uuid !== id);
    selectObject(null);
    render();
}

// --- LOCAL STORAGE ---
function saveToLocalStorage() {
    resetSimulation();
    localStorage.setItem('petri_net_save', JSON.stringify(state));
    alert('Сеть успешно сохранена в браузере!');
}

function loadFromLocalStorage() {
    const data = localStorage.getItem('petri_net_save');
    if (data) {
        state = JSON.parse(data);
        selectObject(null);
        render();
    } else {
        alert('Сохранений в браузере не найдено.');
    }
}

// --- ЭКСПОРТ И ИМПОРТ ФАЙЛОВ ---
function exportToFile() {
    resetSimulation();
    const dataStr =
        'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `petri_net_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importFromFile(event) {
    const file = event.target.files;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedState = JSON.parse(e.target.result);
            if (importedState.places && importedState.transitions && importedState.arcs) {
                state = importedState;
                selectObject(null);
                render();
                alert('Сеть успешно импортирована из файла!');
            } else {
                alert('Неверный формат файла сети Петри.');
            }
        } catch (err) {
            alert('Ошибка при чтении JSON-файла.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// Инициализация холста
render();
