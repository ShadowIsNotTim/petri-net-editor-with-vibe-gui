import {selectObject} from '../editor.js';

import {render} from './render.js';
import {arcSourceId, currentMode, deleteObject, dragTarget, findComment, findNode, fireTransition, getState, selectedId, setArcSourceId, setDragTarget, setSelectedId} from './state.js';
import {importFromFile} from './storage.js';


const svg = document.getElementById('petri-svg');

let startX = 0, startY = 0;
let startLeft = 0, startTop = 0;
// --- ОБРАБОТКА КЛИКОВ НА ХОЛСТЕ ---
export function onCanvasMouseDown(e) {
    if (e.target !== svg) return;

    if (currentMode === 'select' || currentMode === 'simulation' ||
        (currentMode === 'arc' || currentMode == 'token')) {
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

// Буфер обмена для функций Ctrl+C / Ctrl+V
let clipboardData = null;
window.addEventListener('keydown', function(e) {
    // Если фокус находится в полях ввода, полностью отключаем глобальные горячие клавиши
    const targetTag = e.target.tagName.toUpperCase();
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }

    const isCtrl = e.ctrlKey || e.metaKey;  // Поддержка Win/Linux (Ctrl) и Mac (Cmd)
    const key = e.key.toLowerCase();
    if (isCtrl && (key === 'r' || key === 't' || key === 'w' || key === 'i' || key === 'p')) {
        return;  // Прерываем функцию и отдаем управление браузеру
    }

    // --- 1. ОПЕРАЦИИ СИМУЛЯЦИИ (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) ---
    if (currentMode === 'simulation' && isCtrl) {
        if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                window.redoTransition();  // Ctrl + Shift + Z
            } else {
                window.undoTransition();  // Ctrl + Z
            }
            return;
        }
        if (e.key.toLowerCase() === 'y') {
            e.preventDefault();
            window.redoTransition();  // Ctrl + Y (альтернатива)
            return;
        }
    }

    // --- 2. КОПИРОВАНИЕ И ВСТАВКА ---
    if (isCtrl && currentMode !== 'simulation') {
        // Ctrl+C операция
        if (e.key.toLowerCase() === 'c') {
            if (!selectedId) return;
            const node = findNode(selectedId) || findComment(selectedId);
            if (node) {
                e.preventDefault();
                const isPlace = getState().places.some(p => p.uuid === selectedId);
                const isTrans = getState().transitions.some(t => t.uuid === selectedId);
                const type = isPlace ? 'place' : (isTrans ? 'transition' : 'comment');

                // Находим все дуги, которые связаны с этим копируемым узлом
                const connectedArcs = getState().arcs.filter(
                    arc => arc.sourceId === selectedId || arc.targetId === selectedId);
                clipboardData = {
                    type: getState().places.some(p => p.uuid === selectedId)    ? 'place' :
                        getState().transitions.some(t => t.uuid === selectedId) ? 'transition' :
                                                                                  'comment',
                    sourceUuid: selectedId,
                    node: structuredClone(node),
                    arcs: structuredClone(connectedArcs)
                };
            }
            return;
        }

        // Ctrl+V операция
        if (e.key.toLowerCase() === 'v' && clipboardData) {
            const newX = clipboardData.node.x + 40;
            const newY = clipboardData.node.y + 40;
            clipboardData.node.x = newX;
            clipboardData.node.y = newY;
            let newUuid = '';

            if (clipboardData.type === 'place') {
                newUuid = `P${getState().counters.P++}`;
                const newPlace = {
                    ...structuredClone(clipboardData.node),
                    uuid: newUuid,
                    x: newX,
                    y: newY,
                    initialTokens: clipboardData.node.tokens
                };
                getState().places.push(newPlace);
                selectObject(newUuid);
            } else if (clipboardData.type === 'transition') {
                newUuid = `T${getState().counters.T++}`;
                const newTrans =
                    {...structuredClone(clipboardData.node), uuid: newUuid, x: newX, y: newY};
                getState().transitions.push(newTrans);
                selectObject(newUuid);
            } else if (clipboardData.type === 'comment') {
                newUuid = `C${getState().counters.C++}`;
                const newComment =
                    {...structuredClone(clipboardData.node), uuid: newUuid, x: newX, y: newY};
                if (!getState().comments) getState().comments = [];
                getState().comments.push(newComment);
                selectObject(newUuid);
            }

            // Проверяем дуги, которые мы скопировали вместе с узлом
            if (clipboardData.arcs && clipboardData.arcs.length > 0) {
                clipboardData.arcs.forEach(oldArc => {
                    let shouldCreateArc = false;
                    let finalSourceId = oldArc.sourceId;
                    let finalTargetId = oldArc.targetId;

                    // Если скопированная дуга шла ИЗ нашего старого узла
                    if (oldArc.sourceId === clipboardData.sourceUuid) {
                        finalSourceId = newUuid;
                        if (findNode(oldArc.targetId)) {
                            shouldCreateArc = true;
                        }
                    }

                    if (oldArc.targetId === clipboardData.sourceUuid) {
                        finalTargetId = newUuid;
                        if (findNode(oldArc.sourceId)) {
                            shouldCreateArc = true;
                        }
                    }

                    const arcExists = getState().arcs.some(
                        a => a.sourceId === finalSourceId && a.targetId === finalTargetId);

                    if (shouldCreateArc && !arcExists) {
                        const newArc = {
                            ...structuredClone(oldArc),
                            uuid: `${finalSourceId}-${finalTargetId}`,
                            sourceId: finalSourceId,
                            targetId: finalTargetId
                        };
                        getState().arcs.push(newArc);
                    }
                });
            }

            render();
            return;
        }
    }

    // --- 3. УДАЛЕНИЕ ЭЛЕМЕНТОВ (Backspace / Delete) ---
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
        e.preventDefault();
        deleteObject(selectedId);
        return;
    }

    // --- 4. ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ (Цифры 1 - 7 под кнопки меню) ---
    // Соответствует порядку: Select, Simulation, Place, Transition, Arc, Token, Comment
    const modesMapping = {
        'r': 'select',
        's': 'simulation',
        'p': 'place',
        't': 'transition',
        'a': 'arc',
        'o': 'token',
        'c': 'comment'
    };

    if (modesMapping[e.key]) {
        e.preventDefault();
        window.setMode(modesMapping[e.key]);
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
