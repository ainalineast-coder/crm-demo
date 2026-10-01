import { api, setUnauthorizedHandler } from './api.js';
import { loadPipelines } from './pipelines.js';
import { store } from './store.js';
import { clear, el, initials, toast } from './ui.js';
import { renderAnalytics } from './views/analytics.js';
import { renderChats } from './views/chats.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDeals } from './views/deals.js';
import { renderCompanies } from './views/companies.js';
import { renderContacts } from './views/contacts.js';
import { renderEmails } from './views/emails.js';
import { renderProducts } from './views/products.js';
import { renderSettings } from './views/settings.js';
import { renderTasks } from './views/tasks.js';

const appRoot = document.getElementById('app');

// Разделы — как в левом меню amoCRM.
const NAV = [
  { path: '#/dashboard', icon: '🏠', label: 'Рабочий стол', render: renderDashboard },
  { path: '#/deals', icon: '🗂', label: 'Сделки', render: renderDeals },
  { path: '#/chats', icon: '💬', label: 'imBox', render: renderChats },
  { path: '#/tasks', icon: '✔️', label: 'Задачи', render: renderTasks },
  { path: '#/contacts', icon: '👤', label: 'Контакты', render: renderContacts },
  { path: '#/companies', icon: '🏢', label: 'Компании', render: renderCompanies },
  { path: '#/products', icon: '📦', label: 'Товары', render: renderProducts },
  { path: '#/emails', icon: '✉️', label: 'Почта', render: renderEmails },
  { path: '#/analytics', icon: '📈', label: 'Аналитика', render: renderAnalytics },
  { path: '#/settings', icon: '⚙️', label: 'Настройки', render: renderSettings },
];

function parseHash() {
  const [section = 'dashboard', id] = location.hash.replace(/^#\/?/, '').split('/');
  return { section: section || 'dashboard', id };
}

function renderShell() {
  const nav = el('nav', {}, NAV.map((item) =>
    el('a', { href: item.path, dataset: { path: item.path }, title: item.label }, [
      el('span', { class: 'ico', text: item.icon }),
      item.label,
    ])));

  const workspace = el('div', { class: 'workspace' });

  const logout = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* сессия уже недействительна */ }
    store.user = null;
    store.invalidate();
    renderLogin();
  };

  const layout = el('div', { class: 'layout' }, [
    el('aside', { class: 'rail' }, [
      el('div', { class: 'logo', text: 'CRM' }),
      nav,
      el('div', { class: 'spacer' }),
      el('div', { class: 'me' }, [
        el('div', { class: 'avatar', text: initials(store.user.name) }),
        store.user.name.split(' ')[0],
        el('button', { onclick: logout }, 'Выйти'),
      ]),
    ]),
    workspace,
  ]);

  appRoot.className = '';
  clear(appRoot).append(layout);
  return { workspace, nav };
}

let shell = null;
// Номер последнего запрошенного перехода: экран, который успел устареть
// (быстрые клики по меню, вход одновременно с hashchange), на страницу не попадает.
let navigationId = 0;

async function route() {
  if (!store.user) return;
  if (!shell) shell = renderShell();

  const current = ++navigationId;
  const { section, id } = parseHash();
  const item = NAV.find((entry) => entry.path === `#/${section}`) ?? NAV[0];

  for (const link of shell.nav.querySelectorAll('a')) {
    link.classList.toggle('active', link.dataset.path === item.path);
  }

  // Экран собирается в отсоединённом узле и подставляется целиком,
  // поэтому незавершённый рендер не смешивается с новым.
  const view = el('div', { style: 'display:contents' });
  try {
    await item.render(view, { id });
  } catch (error) {
    if (error.status === 401) return;
    clear(view).append(
      el('div', { class: 'topbar' }, [el('h1', { text: item.label })]),
      el('div', { class: 'content' }, [el('div', { class: 'card' }, [
        el('div', { class: 'empty', text: `Не удалось загрузить данные: ${error.message}` }),
      ])]),
    );
  }

  if (current === navigationId && store.user) shell.workspace.replaceChildren(view);
}

function renderLogin(message) {
  shell = null;
  appRoot.className = '';

  const email = el('input', { type: 'email', name: 'email', required: 'required', autocomplete: 'username' });
  const password = el('input', { type: 'password', name: 'password', required: 'required', autocomplete: 'current-password' });
  const error = el('div', { style: 'color:var(--red);font-size:12px' });
  const submit = el('button', { class: 'btn', type: 'submit' }, 'Войти');

  const form = el('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      try {
        const { user } = await api.post('/api/auth/login', { email: email.value, password: password.value });
        store.user = user;
        store.invalidate();
        await loadPipelines();
        if (!location.hash) location.hash = '#/dashboard';
        await route();
        toast(`Добро пожаловать, ${user.name}`);
      } catch (err) {
        error.textContent = err.message;
      } finally {
        submit.disabled = false;
      }
    },
  }, [
    el('div', { class: 'field' }, [el('label', { text: 'Email' }), email]),
    el('div', { class: 'field' }, [el('label', { text: 'Пароль' }), password]),
    error,
    submit,
  ]);

  clear(appRoot).append(el('div', { class: 'login-wrap' }, [
    el('div', { class: 'card login' }, [
      el('div', { class: 'card-body' }, [
        el('h1', { text: 'Вход в CRM' }),
        el('div', { class: 'hint', text: message ?? 'Демо-доступ: admin@crm.local / admin12345' }),
        form,
      ]),
    ]),
  ]));

  email.focus();
}

setUnauthorizedHandler(() => {
  if (store.user) {
    store.user = null;
    store.invalidate();
    renderLogin('Сессия истекла, войдите заново');
  }
});

window.addEventListener('hashchange', route);

async function start() {
  try {
    const { user } = await api.get('/api/auth/me');
    store.user = user;
    await loadPipelines();
    if (!location.hash) location.hash = '#/dashboard';
    await route();
  } catch {
    renderLogin();
  }
}

start();
