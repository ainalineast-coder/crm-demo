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
// Путь без ведущего «/»: так логотип находится и в CRM, и в демо-витрине на GitHub Pages.
const LOGO = 'img/beyosa-logo.png';

// Разделы — как в левом меню amoCRM.
// byCity — раздел показывает данные по городам (кому видны все города, есть переключатель);
// section — раздел роли доступа: без доступа пункт меню скрыт; adminOnly — только администратор.
const NAV = [
  { path: '#/dashboard', icon: '🏠', label: 'Рабочий стол', render: renderDashboard, byCity: true },
  { path: '#/deals', icon: '🗂', label: 'Сделки', render: renderDeals, byCity: true, section: 'deals' },
  { path: '#/chats', icon: '💬', label: 'imBox', render: renderChats, byCity: true, section: 'chats' },
  { path: '#/tasks', icon: '✔️', label: 'Задачи', render: renderTasks, byCity: true, section: 'tasks' },
  { path: '#/contacts', icon: '👤', label: 'Контакты', render: renderContacts, byCity: true, section: 'contacts' },
  { path: '#/companies', icon: '🏢', label: 'Компании', render: renderCompanies, byCity: true, section: 'companies' },
  { path: '#/products', icon: '📦', label: 'Товары', render: renderProducts, section: 'products' },
  { path: '#/emails', icon: '✉️', label: 'Почта', render: renderEmails, byCity: true, section: 'emails' },
  { path: '#/analytics', icon: '📈', label: 'Аналитика', render: renderAnalytics, byCity: true, section: 'analytics' },
  { path: '#/settings', icon: '⚙️', label: 'Настройки', render: renderSettings, adminOnly: true },
];

const navItems = () => NAV.filter((item) =>
  (!item.adminOnly || store.isAdmin()) && (!item.section || store.can(item.section)));

function parseHash() {
  const [section = 'dashboard', id] = location.hash.replace(/^#\/?/, '').split('/');
  return { section: section || 'dashboard', id };
}

function renderShell() {
  const nav = el('nav', {}, navItems().map((item) =>
    el('a', { href: item.path, dataset: { path: item.path }, title: item.label }, [
      el('span', { class: 'ico', text: item.icon }),
      item.label,
    ])));

  const cityBar = el('div', { class: 'city-bar', hidden: true });
  const view = el('div', { style: 'display:contents' });
  const workspace = el('div', { class: 'workspace' }, [cityBar, view]);

  const logout = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* сессия уже недействительна */ }
    store.user = null;
    store.invalidate();
    renderLogin();
  };

  const layout = el('div', { class: 'layout' }, [
    el('aside', { class: 'rail' }, [
      el('a', { class: 'logo', href: '#/dashboard', title: 'Beyosa CRM' }, el('img', { src: LOGO, alt: 'Beyosa' })),
      nav,
      el('div', { class: 'spacer' }),
      el('div', { class: 'me', title: store.user.role_name ?? '' }, [
        el('div', { class: 'avatar', text: initials(store.user.name) }),
        el('div', {}, [
          store.user.name.split(' ')[0],
          el('div', { class: 'me-city', text: store.isAdmin() ? 'все города' : (store.user.city_name ?? 'без города') }),
        ]),
        el('button', { onclick: logout }, 'Выйти'),
      ]),
    ]),
    workspace,
  ]);

  appRoot.className = '';
  clear(appRoot).append(layout);
  return { workspace, view, cityBar, nav };
}

/** Переключатель городов: администратор смотрит все города вместе или один. */
async function drawCityBar(bar, visible) {
  bar.hidden = !visible;
  if (!visible) return;

  const cities = await store.cities();
  const chip = (id, label) => el('button', {
    class: `btn chip${String(store.cityId) === String(id) ? ' on' : ''}`,
    onclick: () => {
      store.setCity(id);
      route();
    },
  }, label);

  bar.replaceChildren(
    el('span', { class: 'muted', text: 'Город:' }),
    chip('', 'Все города'),
    ...cities.map((city) => chip(city.id, city.name)),
  );
}

/** Выбранный раньше город мог быть удалён — тогда показываем все. */
async function loadCities() {
  const cities = await store.cities(true);
  if (store.cityId && !cities.some((city) => String(city.id) === store.cityId)) store.setCity('');
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
  const item = navItems().find((entry) => entry.path === `#/${section}`) ?? NAV[0];
  await drawCityBar(shell.cityBar, store.seesAllCities() && item.byCity);

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

  if (current === navigationId && store.user) shell.view.replaceChildren(view);
}

/** Вход выполнен: загружаем справочники и открываем CRM. */
async function enter(user) {
  store.user = user;
  store.invalidate();
  await Promise.all([loadPipelines(), loadCities()]);
  if (!location.hash) location.hash = '#/dashboard';
  await route();
  toast(`Добро пожаловать, ${user.name}`);
}

/** Карточка экрана входа с логотипом. */
function loginCard(title, hint, form) {
  clear(appRoot).append(el('div', { class: 'login-wrap' }, [
    el('div', { class: 'card login' }, [
      el('div', { class: 'card-body' }, [
        el('img', { class: 'login-logo', src: LOGO, alt: 'Beyosa' }),
        el('h1', { text: title }),
        el('div', { class: 'hint', text: hint }),
        form,
      ]),
    ]),
  ]));
}

/** Форма с полями и одной кнопкой: ошибки показываются под полями. */
function authForm(fields, submitLabel, onSubmit) {
  const error = el('div', { style: 'color:var(--red);font-size:12px' });
  const submit = el('button', { class: 'btn', type: 'submit' }, submitLabel);
  const inputs = fields.map((field) => ({
    ...field,
    input: el('input', { type: field.type ?? 'text', name: field.name, required: 'required', autocomplete: field.autocomplete }),
  }));

  const form = el('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      try {
        await onSubmit(Object.fromEntries(inputs.map(({ name, input }) => [name, input.value])));
      } catch (err) {
        error.textContent = err.details ? Object.values(err.details).join('. ') : err.message;
      } finally {
        submit.disabled = false;
      }
    },
  }, [
    ...inputs.map(({ label, input }) => el('div', { class: 'field' }, [el('label', { text: label }), input])),
    error,
    submit,
  ]);
  return { form, focus: () => inputs[0].input.focus() };
}

/** Первый запуск рабочей CRM: пользователей ещё нет — создаём владельца. */
function renderSetup() {
  const { form, focus } = authForm([
    { name: 'name', label: 'Ваше имя', autocomplete: 'name' },
    { name: 'email', label: 'Email для входа', type: 'email', autocomplete: 'username' },
    { name: 'password', label: 'Пароль (не короче 8 символов)', type: 'password', autocomplete: 'new-password' },
    { name: 'repeat', label: 'Пароль ещё раз', type: 'password', autocomplete: 'new-password' },
  ], 'Создать и войти', async (values) => {
    if (values.password !== values.repeat) throw new Error('Пароли не совпадают');
    const { user } = await api.post('/api/auth/register', {
      name: values.name, email: values.email, password: values.password,
    });
    await enter(user);
  });

  loginCard('Первый запуск Beyosa CRM',
    'Создайте учётную запись владельца — администратора со всеми правами. Сотрудников добавите потом в «Настройках».',
    form);
  focus();
}

async function renderLogin(message) {
  shell = null;
  appRoot.className = '';

  let status = { needsSetup: false, demo: false };
  try {
    status = await api.get('/api/auth/status');
  } catch { /* сервер недоступен — покажем обычный вход */ }
  if (status.needsSetup) return renderSetup();

  const { form, focus } = authForm([
    { name: 'email', label: 'Email', type: 'email', autocomplete: 'username' },
    { name: 'password', label: 'Пароль', type: 'password', autocomplete: 'current-password' },
  ], 'Войти', async (values) => {
    const { user } = await api.post('/api/auth/login', values);
    await enter(user);
  });

  const hint = message
    ?? (status.demo ? 'Демо-доступ: admin@crm.local / admin12345' : 'Войдите под своим email и паролем');
  loginCard('Вход в Beyosa CRM', hint, form);
  focus();
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
    await Promise.all([loadPipelines(), loadCities()]);
    if (!location.hash) location.hash = '#/dashboard';
    await route();
  } catch {
    renderLogin();
  }
}

start();
