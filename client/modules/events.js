import {selectObject} from '../editor.js';

import {render} from './render.js';
import {arcSourceId, currentMode, deleteObject, dragTarget, findComment, findNode, fireTransition, getState, selectedId, setArcSourceId, setDragTarget, setSelectedId} from './state.js';
import {importFromFile} from './storage.js';


const svg = document.getElementById('petri-svg');

// --- ПЕРЕМЕННЫЕ ДЛЯ ПЕРЕМЕЩЕНИЯ ---
let startX = 0, startY = 0;
let isPanning = false;

// --- ПЕРЕМЕННЫЕ ДЛЯ МАСШТАБИРОВАНИЯ ---
let scale = 1;
let translateX = 0;
let translateY = 0;
let initialPinchDistance = 0; // Mobile pinch-to-Zoom
let initialScale = 1;
let isPinching = false;

// --- ОБРАБОТКА КЛИКОВ НА ХОЛСТЕ ---
export function onCanvasMouseDown(e) {
    if (e.target !== svg) return;

    if (currentMode === 'select' || currentMode === 'simulation' ||
        (currentMode === 'arc' || currentMode == 'token')) {
        isPanning = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;

        window.addEventListener('pointermove', onCanvasMouseMove);
        window.addEventListener('pointerup', () => {
            isPanning = false;
            window.removeEventListener('pointermove', onCanvasMouseMove);
        });
        return;
    }

    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left - translateX) / scale;
    const y = (e.clientY - rect.top - translateY) / scale;

    if (currentMode === 'place') {
        const name = `P${getState().counters.P++}`;
        const newPlace = {uuid: name, name, x, y, tokens: 0, initialTokens: 0};
        getState().places.push(newPlace);
        selectObject(newPlace.uuid);
    } else if (currentMode === 'transition') {
        const name = `T${getState().counters.T++}`;
        const newTrans = {uuid: name, name, x, y};
        getState().transitions.push(newTrans);
        selectObject(newTrans.uuid);
    } else if (currentMode === 'comment') {
        const id = `C${getState().counters.C++}`;
        const newComment = {uuid: id, text: '', x, y};
        if (!getState().comments) getState().comments = [];
        getState().comments.push(newComment);
        selectObject(newComment.uuid);
    } else {
        selectObject(null);
    }
    render();
}

export function onCanvasMouseMove(e) {
    if (!isPanning) return;
    if (e.cancelable) e.preventDefault();
    const container = document.getElementById('canvas-container');

    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    applyTransform();
}

export function onNodeMouseDown(e, id) {
    e.stopPropagation();

    if (currentMode === 'simulation') {
        const isTrans = getState().transitions.some(t => t.uuid === id);
        const isPlace = getState().places.some(t => t.uuid === id);
        if (isTrans)
            fireTransition(id);
        else if (isPlace)
            selectObject(id);  // Для работы с ресурсами и разметками во время симуляции
        return;
    }

    if (currentMode === 'select' ||
        (currentMode === 'place' || currentMode === 'transition' ||
         currentMode === 'comment')) {  // Для перетаскивания при создании элементов
        const node = findNode(id) || findComment(id);
        setDragTarget({id: id, node: node})
        selectObject(id);

        window.addEventListener('pointermove', onNodeMouseMove);
        window.addEventListener('pointerup', onNodeMouseUp);

    } else if (currentMode === 'arc') {
        if (findComment(id)) return;
        if (!arcSourceId) {
            setArcSourceId(id);
            window.addEventListener('pointerup', onNodeMouseUp);
        } else {
            const srcIsPlace = getState().places.some(p => p.uuid === arcSourceId);
            const tgtIsPlace = getState().places.some(p => p.uuid === id);

            if (srcIsPlace !== tgtIsPlace) {
                const existingArc = getState().arcs.find(
                    arc => arc.sourceId === arcSourceId && arc.targetId === id);

                if (existingArc) {
                    existingArc.weight = (existingArc.weight || 1) + 1;
                    selectObject(existingArc.uuid);
                } else {
                    const transitionId = srcIsPlace ? id : arcSourceId;
                    const transition = getState().transitions?.find(t => t.uuid === transitionId);
                    const transitionColor = transition?.color
                    const newArc = {
                        uuid: `${arcSourceId}-${id}`,
                        sourceId: arcSourceId,
                        targetId: id,
                        weight: 1,
                        ...(transitionColor && {color: transitionColor})
                    };
                    getState().arcs.push(newArc);
                    selectObject(newArc.uuid);
                }

                setArcSourceId(null);
            } else {
                alert('Дуга должна соединять Позицию и Переход (или наоборот)!');
                setArcSourceId(null);
            }
        }
    } else if (currentMode === 'token') {
        const place = getState().places.find(p => p.uuid === id);
        if (place) {
            place.tokens++;
            place.initialTokens = place.tokens;
        }
    }
    render();
}

export function onNodeMouseMove(e) {
    if (!dragTarget || !dragTarget.node) return;
    const rect = svg.getBoundingClientRect();
    dragTarget.node.x = (e.clientX - rect.left - translateX) / scale;
    dragTarget.node.y = (e.clientY - rect.top - translateY) / scale;
    render();
}

export function onNodeMouseUp(e) {
    if (currentMode === 'arc' && arcSourceId) {  // Размещение дуги "натягиванием"
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const targetElement = el?.closest('[onpointerdown]');
        const pointerDownAttr = targetElement?.getAttribute('onpointerdown');

        const match = pointerDownAttr?.match(/onNodeMouseDown\(event,\s*'([^']+)'\)/);
        const targetId = match ? match[1] : null;

        if (targetId && targetId !== arcSourceId) {
            onNodeMouseDown(e, targetId);
        }
        // Ничего не делаем, если отпустили в пустоту
    }

    setDragTarget(null);
    window.removeEventListener('pointermove', onNodeMouseMove);
    window.removeEventListener('pointerup', onNodeMouseUp);
}



// Масштабирование холста
function applyTransform() {
    const viewport = document.getElementById('viewport') || svg.firstElementChild;
    if (viewport) {
        viewport.setAttribute('transform', `translate(${translateX}, ${translateY}) scale(${scale})`);
    }
}

svg.addEventListener('wheel', function(e) {
    // Проверяем, зажат ли Ctrl (или Cmd на Mac). 
    // На тачпадах ноутбуков жест "щипок" тоже генерирует событие wheel с зажатым ctrlKey!
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        const zoomFactor = 1.1;
        const oldScale = scale;

        if (e.deltaY < 0) {
            scale = Math.min(5, scale * zoomFactor); // Макс зум x5
        } else {
            scale = Math.max(0.2, scale / zoomFactor); // Мин зум x0.2
        }

        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        translateX = mouseX - (mouseX - translateX) * (scale / oldScale);
        translateY = mouseY - (mouseY - translateY) * (scale / oldScale);

        applyTransform();
    }
}, { passive: false });

let touchStartPoints = [];
svg.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
        isPinching = true;
        e.preventDefault(); 

        initialPinchDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        initialScale = scale;
    }
}, { passive: false });

svg.addEventListener('touchmove', function(e) {
    if (isPinching && e.touches.length === 2) {
        e.preventDefault();

        const currentDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );

        if (initialPinchDistance > 0) {
            const oldScale = scale;
            const pinchFactor = currentDistance / initialPinchDistance;
            scale = Math.max(0.2, Math.min(5, initialScale * pinchFactor));

            const rect = svg.getBoundingClientRect();
            const touchCenterX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
            const touchCenterY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;

            translateX = touchCenterX - (touchCenterX - translateX) * (scale / oldScale);
            translateY = touchCenterY - (touchCenterY - translateY) * (scale / oldScale);

            applyTransform();
        }
    }
}, { passive: false });

svg.addEventListener('touchend', function(e) {
    if (e.touches.length < 2) {
        isPinching = false;
        initialPinchDistance = 0;
    }
});



// --- ИМПОРТ DRAG-and-DROP ---
let dragCounter = 0;
document.body.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
        document.body.classList.add('drag-active');
    }
});

document.body.addEventListener('dragover', (event) => {
    event.preventDefault();
});

document.body.addEventListener('dragleave', (event) => {
    event.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
        document.body.classList.remove('drag-active');
    }
});

document.body.addEventListener('drop', (event) => {
    dragCounter = 0;
    document.body.classList.remove('drag-active');
    importFromFile(event);
});
