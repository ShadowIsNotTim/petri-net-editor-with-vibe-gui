// --- КОРРЕКТНОЕ СОСТОЯНИЕ (STATE) ---
let state = {
    places: [],       // { uuid, name, x, y, tokens, initialTokens }
    transitions: [],  // { uuid, name, x, y }
    arcs: [],         // { uuid, sourceId, targetId, weight }
    comments: [],     // { uuid, text, x, y }
    counters: {P: 1, T: 1, C: 1},
    isSimMode: false,  // Запоминаем статус запущенной симуляции
    history: []        // История совершенных переходов в симуляции
};

export let currentMode = 'select';  // select, simulation, place, transition, arc, token, comment
export let selectedId = null;
export let dragTarget = null;
export let arcSourceId = null;

export let visibleColors = {
    black: true,
    red: true,
    blue: true,
    green: true
};

import {render} from './render.js';
import {selectObject} from '../editor.js';

export function setSelectedId(id) {
    selectedId = id;
}
export function setDragTarget(target) {
    dragTarget = target;
}
export function setArcSourceId(id) {
    arcSourceId = id;
}
export function setCurrentMode(mode) {
    currentMode = mode;
}

export function getState() {
    return state;
}
export function replaceState(newState) {
    state = newState;
}


// --- УПРАВЛЕНИЕ РЕЖИМАМИ ---
export function setMode(mode) {
    // Автоматический сброс к начальной разметке при выходе из симуляции
    if (currentMode === 'simulation' && mode !== 'simulation') {
        resetSimulation();
        state.isSimMode = false;
        selectObject(null);
    }

    // Вход в режим симуляции
    if (mode === 'simulation') {
        if (currentMode !== 'simulation') {
            state.places.forEach(p => p.initialTokens = p.tokens);
            state.isSimMode = true;
        }
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

function updatePropertyWhileSimulation() {
    if (selectedId) {  // Только для обновления количества фишек если выбрана позиция при симуляции
        const selectedPlace = state.places.find(p => p.uuid === selectedId);
        const tokensInput = document.getElementById('property-tokens-input');
        if (selectedPlace && tokensInput) {
            tokensInput.value = selectedPlace.tokens;
        }
    } else if (currentMode === 'simulation') { // Для обновления переходов при срабатывании в симуляции
        selectObject(null);
    }
}

export function resetSimulation() {
    state.places.forEach(p => {
        if (p.initialTokens !== undefined) p.tokens = p.initialTokens;
    });
    state.history = [];
    render();
    updatePropertyWhileSimulation();
}

export function generateUUID() {
    return 'uuid-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
}

export function findNode(id) {
    return state.places.find(p => p.uuid === id) || state.transitions.find(t => t.uuid === id);
}

export function findComment(id) {
    return state.comments.find(c => c.uuid === id);
}

// Проверка активности перехода
export function isTransitionEnabled(transId) {
    // Выбираем только те входящие дуги, у которых источник (позиция) является видимым
    const inArcs = state.arcs.filter(a => {
        if (a.targetId !== transId) return false;
        const srcPlace = state.places.find(p => p.uuid === a.sourceId);
        if (!srcPlace || getColorDimClass(srcPlace.color) === 'color-dimmed') return false;
        return true;
    });
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
export function fireTransition(transId) {
    if (!isTransitionEnabled(transId)) return;
    const transition = state.transitions.find(t => t.uuid === transId);

    const inArcs = state.arcs.filter(a => a.targetId === transId);
    const outArcs = state.arcs.filter(a => a.sourceId === transId);

    inArcs.forEach(arc => {
        const srcPlace = state.places.find(p => p.uuid === arc.sourceId);
        // Токены списываются, только если позиция существует и она видима
        if (srcPlace && getColorDimClass(srcPlace.color) !== 'color-dimmed') {
            srcPlace.tokens -= arc.weight;
        }
    });

    outArcs.forEach(arc => {
        const tgtPlace = state.places.find(p => p.uuid === arc.targetId);
        if (tgtPlace && getColorDimClass(tgtPlace.color) !== 'color-dimmed') {
            tgtPlace.tokens += arc.weight;
        }
    });

    if (transition) {
        state.history.push({
            name: transition.name,
            color: transition.color || 'black'
        });
    }

    render();
    updatePropertyWhileSimulation();
}


export function toggleFilterColor(color) {
    if (visibleColors[color] !== undefined) {
        visibleColors[color] = document.getElementById(`chk-filter-${color}`).checked;
        render();
        updatePropertyWhileSimulation();
    }
}

export function getColorDimClass(elementColor) {
    const itemColor = elementColor || 'black';  // Если цвет не задан, считаем черным
    if (!visibleColors[itemColor]) {
        return 'color-dimmed';
    }
    return '';
}

export function updateElementColor(id, newColor) {
    const obj = state.places.find(p => p.uuid === id) ||
        state.transitions.find(t => t.uuid === id) || state.arcs.find(a => a.uuid === id) ||
        state.comments.find(c => c.uuid === id);

    if (obj) {
        obj.color = newColor;
        render();
    }
}


export function updateName(id, newName) {
    const node = findNode(id);
    if (node) {
        node.name = newName;
        render();
    }
}

export function updateTokens(id, value) {
    const place = state.places.find(p => p.uuid === id);
    if (place) {
        place.tokens = Math.max(0, parseInt(value) || 0);
        if (!state.isSimMode) {
            place.initialTokens = place.tokens;
        }
        render();
    }
}

export function updateArcWeight(id, value) {
    const arc = state.arcs.find(a => a.uuid === id);
    if (arc) {
        arc.weight = Math.max(1, parseInt(value) || 1);
        render();
    }
}

export function updateCommentText(id, newText) {
    const comment = findComment(id);
    if (comment) {
        comment.text = newText;
        render();
    }
}


export function deleteObject(id) {
    state.places = state.places.filter(p => p.uuid !== id);
    state.transitions = state.transitions.filter(t => t.uuid !== id);
    state.arcs = state.arcs.filter(a => a.uuid !== id && a.sourceId !== id && a.targetId !== id);
    state.comments = state.comments.filter(c => c.uuid !== id);
    selectObject(null);
    render();
}


export function clearPetriNet() {
    const confirmed = confirm(
        'Вы уверены, что хотите полностью удалить текущую сеть Петри? Это действие нельзя отменить.');

    if (confirmed) {
        state = {
            places: [],
            transitions: [],
            arcs: [],
            comments: [],
            counters: {P: 1, T: 1, C: 1},
            isSimMode: false,
            history: []
        };

        selectObject(null);
        setMode('select');
        render();
    }
}

export function getCleanState() {
    const cleanState = structuredClone(getState());
    cleanState.places.forEach(p => {
        if (p.initialTokens !== undefined) {
            p.tokens = p.initialTokens;
        }
    });
    cleanState.history = [];
    cleanState.isSimMode = false;
    return cleanState;
}
