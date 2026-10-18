import {selectObject} from '../editor.js';

import {render} from './render.js';
import {arcSourceId, currentMode, deleteObject, dragTarget, findComment, findNode, fireTransition, generateUUID, selectedId, setArcSourceId, setDragTarget, setSelectedId, getState} from './state.js';
import {importFromFile} from './storage.js';


const svg = document.getElementById('petri-svg');

let startX = 0, startY = 0;
let startLeft = 0, startTop = 0;
// --- ОБРАБОТКА КЛИКОВ НА ХОЛСТЕ ---
export function onCanvasMouseDown(e) {
    if (e.target !== svg) return;

    if (currentMode === 'select' || currentMode === 'simulation') {
        startX = e.clientX;
        startY = e.clientY;
        const container = document.getElementById('canvas-container');
        startLeft = container.scrollLeft;
        startTop = container.scrollTop;

        window.addEventListener('pointermove', onCanvasMouseMove);
        window.addEventListener('pointerup', () => {
            window.removeEventListener('pointermove', onCanvasMouseMove);
        });
        return;
    }

    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentMode === 'place') {
        const name = `P${getState().counters.P++}`;
        const newPlace = {uuid: generateUUID(), name, x, y, tokens: 0, initialTokens: 0};
        getState().places.push(newPlace);
        selectObject(newPlace.uuid);
    } else if (currentMode === 'transition') {
        const name = `T${getState().counters.T++}`;
        const newTrans = {uuid: generateUUID(), name, x, y};
        getState().transitions.push(newTrans);
        selectObject(newTrans.uuid);
    } else if (currentMode === 'comment') {
        const text = `Комментарий ${getState().counters.C++}`;
        const newComment = {uuid: generateUUID(), text, x, y};
        if (!getState().comments) getState().comments = [];
        getState().comments.push(newComment);
        selectObject(newComment.uuid);
    } else {
        selectObject(null);
    }
    render();
}

export function onCanvasMouseMove(e) {
    if (e.cancelable) e.preventDefault();
    const container = document.getElementById('canvas-container');

    container.scrollLeft = startLeft - (e.clientX - startX);
    container.scrollTop = startTop - (e.clientY - startY);
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
                const existingArc =
                    getState().arcs.find(arc => arc.sourceId === arcSourceId && arc.targetId === id);

                if (existingArc) {
                    existingArc.weight = (existingArc.weight || 1) + 1;
                    selectObject(existingArc.uuid);
                } else {
                    const transitionId = srcIsPlace ? id : arcSourceId;
                    const transition = getState().transitions?.find(t => t.uuid === transitionId);
                    const transitionColor = transition?.color
                    const newArc = {
                        uuid: generateUUID(),
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
    dragTarget.node.x = e.clientX - rect.left;
    dragTarget.node.y = e.clientY - rect.top;
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

window.addEventListener('keydown', function(e) {
    if (!selectedId) return;

    // Если фокус сейчас находится в текстовом инпуте или поле ввода — не удаляем объект
    const targetTag = e.target.tagName.toUpperCase();
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteObject(selectedId);
    }
})


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
