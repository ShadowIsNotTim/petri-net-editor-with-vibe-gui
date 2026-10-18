import {selectObject} from '../editor.js';

import {render} from './render.js';
import {getState, replaceState, resetSimulation} from './state.js';


// --- LOCAL STORAGE ---
let lastSaveTime = 0;
let saveTimeout = null;
export function saveToLocalStorage() {
    const now = Date.now();
    const remaining = 660 - (now - lastSaveTime);
    clearTimeout(saveTimeout);

    const doSave = () => {
        lastSaveTime = Date.now();

        const cleanState = structuredClone(getState());
        cleanState.places.forEach(p => {
            if (p.initialTokens !== undefined) {
                p.tokens = p.initialTokens;
            }
        });

        cleanState.isSimMode = false;
        localStorage.setItem('petri_net_save', JSON.stringify(cleanState));
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
export function exportToFile() {
    resetSimulation();
    const dataStr =
        'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(getState(), null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `petri_net_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
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

    const svgClone = svgElement.cloneNode(true);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    if (!svgClone.getAttribute('width')) {
        svgClone.setAttribute('width', svgElement.clientWidth || 800);
    }
    if (!svgClone.getAttribute('height')) {
        svgClone.setAttribute('height', svgElement.clientHeight || 600);
    }

    let styles = '';
    for (const stylesheet of document.styleSheets) {
        try {
            for (const rule of stylesheet.cssRules) {
                styles += rule.cssText + '\n';
            }
        } catch (e) {
            // Игнорируем внешние стили (например, со сторонних CDN)
        }
    }

    // Внедряем стили внутрь тега <defs> клонированного SVG
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    let defs = svgClone.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svgClone.insertBefore(defs, svgClone.firstChild);
    }
    defs.appendChild(styleElement);

    // Сериализуем DOM SVG в строку и создаем файл для скачивания
    const svgString = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
    const svgUrl = URL.createObjectURL(svgBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = 'petri-net.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
}
