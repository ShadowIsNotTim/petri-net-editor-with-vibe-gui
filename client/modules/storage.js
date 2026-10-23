import {selectObject} from '../editor.js';

import {render} from './render.js';
import {getCleanState, replaceState, resetSimulation} from './state.js';


// --- LOCAL STORAGE ---
let lastSaveTime = 0;
let saveTimeout = null;
export function saveToLocalStorage() {
    const now = Date.now();
    const remaining = 660 - (now - lastSaveTime);
    clearTimeout(saveTimeout);

    const doSave = () => {
        lastSaveTime = Date.now();
        localStorage.setItem('petri_net_save', JSON.stringify(getCleanState()));
    };

    if (remaining <= 0) {
        doSave();
    } else {
        saveTimeout = setTimeout(doSave, remaining);
    }
}

export function loadFromLocalStorage() {
    const data = localStorage.getItem('petri_net_save');
    if (data) {
        replaceState(JSON.parse(data));
        selectObject(null);
        render();
    }
}

// --- ЭКСПОРТ И ИМПОРТ ФАЙЛОВ ---
export async function exportToFile() {
    resetSimulation();

    const formattedDate =
        new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
    const defaultFileName = `petri_net_${formattedDate}.json`;

    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: defaultFileName,
                types: [{description: 'JSON Files', accept: {'application/json': ['.json']}}]
            });

            const stateData = JSON.stringify(getCleanState(), null, 2);
            const writable = await handle.createWritable();
            await writable.write(stateData);
            await writable.close();
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('Ошибка File System Access API, переключаемся на fallback:', err);
        }
    }

    // (Если API недоступно или упало)
    const stateDataFallback = JSON.stringify(getCleanState(), null, 2);
    const blob = new Blob([stateDataFallback], {type: 'application/json;charset=utf-8'});
    const dataUrl = URL.createObjectURL(blob);

    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataUrl);
    downloadAnchor.setAttribute('download', defaultFileName);

    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    URL.revokeObjectURL(dataUrl);
}


export function importFromFile(event) {
    if (event) {
        event.preventDefault();
    }
    const files = event.dataTransfer ? event.dataTransfer.files : event.target.files;
    const file = files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedState = JSON.parse(e.target.result);
            if (importedState.places && importedState.transitions && importedState.arcs) {
                replaceState(importedState);
                selectObject(null);
                render();
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


export function exportToSVG() {
    const svgElement = document.getElementById('petri-svg');
    if (!svgElement) return;

    // 1. Получаем точные границы всего нарисованного контента (сетей Петри)
    // Метод игнорирует пустое пространство вокруг графа
    const bbox = svgElement.getBBox();

    const svgClone = svgElement.cloneNode(true);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // 2. Добавляем небольшой отступ (padding) вокруг сети, чтобы элементы у краев не обрезались
    const padding = 20;
    const minX = bbox.x - padding;
    const minY = bbox.y - padding;
    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;

    // 3. Задаем viewBox. Именно он заставляет SVG растягиваться и сжиматься
    svgClone.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);

    // Задаем физические размеры для корректного отображения в базовых просмотрщиках
    svgClone.setAttribute('width', width);
    svgClone.setAttribute('height', height);

    // Сразу вычищаем пустые комментарии (из прошлого шага), чтобы они не влияли на viewBox
    const emptyComments = svgClone.querySelectorAll('.is-empty');
    emptyComments.forEach(comment => comment.remove());

    let styles = '';
    for (const stylesheet of document.styleSheets) {
        try {
            for (const rule of stylesheet.cssRules) {
                styles += rule.cssText + '\n';
            }
        } catch (e) {
            // Игнорируем внешние стили
        }
    }

    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    let defs = svgClone.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svgClone.insertBefore(defs, svgClone.firstChild);
    }
    defs.appendChild(styleElement);

    const svgString = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
    const svgUrl = URL.createObjectURL(svgBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = 'petri-net.svg';
    const formattedDate =
        new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
    downloadLink.download = `petri_net_${formattedDate}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
}
