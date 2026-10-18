// Функция переключения темы (вызывается по клику на кнопку)
export function toggleTheme() {
    const body = document.body;
    const btn = document.getElementById('theme-btn');
    body.classList.toggle('dark-theme');

    const isDark = body.classList.contains('dark-theme');
    if (isDark) {
        btn.innerHTML = '☀️ Светлая тема';
    } else {
        btn.innerHTML = '🌙 Тёмная тема';
    }

    localStorage.setItem('inverted', isDark);
}

function applyDarkTheme() {
    document.body.classList.add('dark-theme');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.innerHTML = '☀️ Светлая тема';
}

export function loadToggleTheme() {
    if (localStorage.getItem('inverted') === 'true') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', applyDarkTheme);
        } else {
            applyDarkTheme();
        }
    }
}
