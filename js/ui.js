/** Мини-хелперы для DOM, форматирования, модалок и уведомлений. */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  for (const child of [children].flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const clear = (node) => { node.replaceChildren(); return node; };

export const PRIORITY_LABELS = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };
export const ACTIVITY_LABELS = { note: 'Заметка', call: 'Звонок', meeting: 'Встреча', email: 'Письмо', system: 'Система' };

/** Суммы в тенге показываем символом ₸, как в amoCRM, а не кодом KZT. */
export const formatMoney = (amount, currency = 'KZT') =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(Number(amount ?? 0));

export const formatNumber = (value) => new Intl.NumberFormat('ru-RU').format(Number(value ?? 0));

/** Инициалы для кружка ответственного — как аватарки в amoCRM. */
export const initials = (name) => String(name ?? '?')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join('');

/**
 * Цвет рекламной кампании хранится у самого хэштега (светлый слот палитры),
 * поэтому при смене фильтров кампания не «перекрашивается».
 * Для тёмной темы берём пару того же оттенка.
 */
const SERIES_PAIRS = [
  ['#2a78d6', '#3987e5'], ['#eb6834', '#d95926'], ['#1baf7a', '#199e70'], ['#eda100', '#c98500'],
  ['#e87ba4', '#d55181'], ['#008300', '#008300'], ['#4a3aa7', '#9085e9'], ['#e34948', '#e66767'],
];
export const SERIES_LIGHT = SERIES_PAIRS.map(([light]) => light);

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function seriesColor(color, index = 0) {
  const pair = SERIES_PAIRS.find(([light, dark]) => light === color || dark === color)
    ?? SERIES_PAIRS[index % SERIES_PAIRS.length];
  return prefersDark() ? pair[1] : pair[0];
}

/** Чип хэштега кампании. */
export const tagChip = (tag, { onRemove } = {}) => el(
  'span',
  { class: `tag${onRemove ? ' removable' : ''}`, title: tag.title ?? '', onclick: onRemove },
  [
    el('span', { class: 'dot', style: `background:${seriesColor(tag.color)}` }),
    `#${tag.name}`,
    onRemove ? el('span', { class: 'muted', text: '✕' }) : null,
  ],
);

export const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
};

export const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value.replace(' ', 'T') + (value.endsWith('Z') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
};

export const isOverdue = (dueDate, done) =>
  !done && dueDate && dueDate < new Date().toISOString().slice(0, 10);

export const contactName = (contact) =>
  [contact.last_name, contact.first_name].filter(Boolean).join(' ') || contact.first_name;

export function toast(message, kind = 'info') {
  const node = el('div', { class: `toast ${kind}`, text: message });
  document.getElementById('toast-root').append(node);
  setTimeout(() => node.remove(), 3500);
}

/**
 * Универсальная модальная форма.
 * fields: [{ name, label, type, options, value, required, width }]
 * onSubmit(values) — может бросить ApiError с details для показа ошибок полей.
 */
/** Каждое окно рисуется в своём слое, поэтому окно поверх окна ничего не стирает. */
function openLayer() {
  const root = document.getElementById('modal-root');
  const layer = el('div');
  root.append(layer);
  return { layer, remove: () => layer.remove() };
}

export function openForm({ title, fields, submitLabel = 'Сохранить', onSubmit }) {
  const { layer, remove } = openLayer();
  const errorNodes = new Map();
  const inputs = new Map();

  const close = () => { remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const makeField = (field) => {
    // Поле со своим виджетом (например, выбор хэштегов кампаний):
    // { type: 'custom', node, read: () => value }
    if (field.type === 'custom') {
      const error = el('div', { class: 'error' });
      errorNodes.set(field.name, error);
      inputs.set(field.name, field);
      return el('div', { class: 'field', style: field.width === 'full' ? 'grid-column: 1 / -1' : '' }, [
        field.label ? el('label', { text: field.label }) : null,
        field.node,
        error,
      ]);
    }

    let input;
    if (field.type === 'select') {
      input = el('select', { name: field.name },
        (field.options ?? []).map((option) =>
          el('option', { value: option.value, selected: String(option.value) === String(field.value ?? '') }, option.label)));
    } else if (field.type === 'textarea') {
      input = el('textarea', { name: field.name, rows: field.rows ?? 3 }, field.value ?? '');
    } else if (field.type === 'checkbox') {
      input = el('input', { type: 'checkbox', name: field.name, style: 'width:auto', checked: !!field.value });
    } else {
      input = el('input', { type: field.type ?? 'text', name: field.name, value: field.value ?? '', step: field.step });
    }

    inputs.set(field.name, input);
    const error = el('div', { class: 'error' });
    errorNodes.set(field.name, error);

    return el('div', { class: 'field', style: field.width === 'full' ? 'grid-column: 1 / -1' : '' }, [
      el('label', { text: field.label + (field.required ? ' *' : '') }),
      input,
      error,
    ]);
  };

  const readValues = () => {
    const values = {};
    for (const field of fields) {
      const input = inputs.get(field.name);
      if (field.type === 'custom') values[field.name] = field.read();
      else if (field.type === 'checkbox') values[field.name] = input.checked;
      else values[field.name] = input.value.trim() === '' ? null : input.value.trim();
    }
    return values;
  };

  const submit = async (event) => {
    event.preventDefault();
    for (const node of errorNodes.values()) node.textContent = '';
    submitButton.disabled = true;
    try {
      await onSubmit(readValues());
      close();
    } catch (error) {
      if (error.details && typeof error.details === 'object') {
        for (const [field, message] of Object.entries(error.details)) {
          const node = errorNodes.get(field);
          if (node) node.textContent = message;
        }
        toast(error.message, 'error');
      } else {
        toast(error.message ?? 'Не удалось сохранить', 'error');
      }
    } finally {
      submitButton.disabled = false;
    }
  };

  const submitButton = el('button', { class: 'btn', type: 'submit' }, submitLabel);
  const form = el('form', { onsubmit: submit }, [
    el('div', { class: 'body' }, [el('div', { class: 'fields-row' }, fields.map(makeField))]),
    el('footer', {}, [
      el('button', { class: 'btn secondary', type: 'button', onclick: close }, 'Отмена'),
      submitButton,
    ]),
  ]);

  layer.append(el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target.classList.contains('modal-backdrop')) close(); } }, [
    el('div', { class: 'modal' }, [
      el('header', {}, [el('h2', { text: title }), el('button', { class: 'btn ghost', onclick: close }, '✕')]),
      form,
    ]),
  ]));

  form.querySelector('input, select, textarea')?.focus();
  return { close };
}

export function openPanel({ title, content, actions = [] }) {
  const { layer, remove } = openLayer();
  const close = () => remove();
  layer.append(el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target.classList.contains('modal-backdrop')) close(); } }, [
    el('div', { class: 'modal' }, [
      el('header', {}, [el('h2', { text: title }), el('button', { class: 'btn ghost', onclick: close }, '✕')]),
      el('div', { class: 'body' }, [content]),
      actions.length ? el('footer', {}, actions) : null,
    ]),
  ]));
  return { close };
}

/**
 * Подтверждение действия своим окном: window.confirm доступен не везде
 * (например, внутри встроенного просмотра страница его не показывает).
 */
/** Подтверждение живёт в своём слое, чтобы не закрывать окно, из которого вызвано. */
function dialogRoot() {
  let root = document.getElementById('dialog-root');
  if (!root) {
    root = el('div', { id: 'dialog-root' });
    document.body.append(root);
  }
  return root;
}

export function confirmDialog(message, { confirmLabel = 'Удалить', danger = true } = {}) {
  return new Promise((resolve) => {
    const root = dialogRoot();
    const layer = el('div');
    root.append(layer);

    const finish = (answer) => {
      layer.remove();
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') finish(false);
      if (event.key === 'Enter') finish(true);
    };
    document.addEventListener('keydown', onKey);

    const confirmButton = el('button', { class: `btn ${danger ? 'danger' : ''}`, onclick: () => finish(true) }, confirmLabel);

    layer.append(el('div', {
      class: 'modal-backdrop',
      style: 'z-index:60',
      onclick: (event) => { if (event.target.classList.contains('modal-backdrop')) finish(false); },
    }, [
      el('div', { class: 'modal', style: 'width:min(420px,100%)' }, [
        el('header', {}, [el('h2', { text: 'Подтвердите действие' })]),
        el('div', { class: 'body' }, [el('div', { text: message })]),
        el('footer', {}, [
          el('button', { class: 'btn secondary', onclick: () => finish(false) }, 'Отмена'),
          confirmButton,
        ]),
      ]),
    ]));

    confirmButton.focus();
  });
}
