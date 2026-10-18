import {arcSourceId, currentMode, findNode, getColorDimClass, isTransitionEnabled, selectedId, getState} from './state.js';
import {saveToLocalStorage} from './storage.js';

const svg = document.getElementById('petri-svg');
const nodesGroup = document.getElementById('nodes-group');
const arcsGroup = document.getElementById('arcs-group');


// --- ОТРИСОВКА В SVG ---
export function render() {
    nodesGroup.innerHTML = '';
    arcsGroup.innerHTML = '';

    saveToLocalStorage();

    // 1. Рисуем ДУГИ
    getState().arcs.forEach(arc => {
        const src = findNode(arc.sourceId);
        const tgt = findNode(arc.targetId);
        if (!src || !tgt) return;

        const hasReturn =
            getState().arcs.some(a => a.sourceId === arc.targetId && a.targetId === arc.sourceId);
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
            pointerEvents} onpointerdown="selectObject('${arc.uuid}'); event.stopPropagation();"/>
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
    getState().places.forEach(p => {
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
    <g class="${dimClass}" onpointerdown="onNodeMouseDown(event, '${p.uuid}')">
        <circle cx="${p.x}" cy="${p.y}" r="20" class="place ${isSelected ? 'selected' : ''} ${
            isArcSource ? 'source-selected' : ''}" style="stroke: ${pColor};"/>
        ${tokensMarkup}
        <text x="${p.x}" y="${p.y - 25}" class="label" style="fill: ${pColor};">${p.name}</text>
    </g>
`;

        nodesGroup.insertAdjacentHTML('beforeend', markup);
    });

    // 3. Рисуем ПЕРЕХОДЫ (Добавлена проверка arcSourceId)
    getState().transitions.forEach(t => {
        const isSelected = selectedId === t.uuid;
        // Проверяем, является ли этот переход началом строящейся дуги
        const isArcSource = arcSourceId === t.uuid;
        const enabledClass =
            (currentMode === 'simulation' && isTransitionEnabled(t.uuid)) ? 'enabled' : '';

        // Добавляем класс 'source-selected', если объект выбран первым для дуги
        const dimClass = getColorDimClass(t.color);
        const tColor = t.color || 'black';

        const markup = `
    <g class="${dimClass}" onpointerdown="onNodeMouseDown(event, '${t.uuid}')">
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
    if (getState().comments) {
        getState().comments.forEach(c => {
            const isSelected = selectedId === c.uuid;
            // Комментарии используют общую систему onNodeMouseDown для перетаскивания и выделения
            const dimClass = getColorDimClass(c.color);
            const cColor = c.color || 'black';

            const markup = `
    <g class="comment-g ${isSelected ? 'selected' : ''} ${
                dimClass}" onpointerdown="onNodeMouseDown(event, '${c.uuid}')">
        <rect x="${c.x - 75}" y="${c.y - 15}" width="150" height="30" class="comment-box"/>
        <text x="${c.x}" y="${c.y + 5}" class="comment-text" style="fill: ${cColor};">${
                c.text}</text>
    </g>
`;

            nodesGroup.insertAdjacentHTML('beforeend', markup);
        });
    }
}