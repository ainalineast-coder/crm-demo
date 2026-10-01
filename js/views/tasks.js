import { api } from '../api.js';
import { store } from '../store.js';
import { PRIORITY_LABELS, confirmDialog, el, formatDate, initials, isOverdue, openForm, toast } from '../ui.js';

const DAY = 86_400_000;
const toISO = (date) => date.toISOString().slice(0, 10);
const today = () => toISO(new Date());
const shift = (days) => toISO(new Date(Date.now() + days * DAY));

const PERIODS = [
  { key: 'day', label: 'ДЕНЬ', title: 'Задачи на завтра', days: 1 },
  { key: 'week', label: 'НЕДЕЛЯ', title: 'Задачи на неделю', days: 7 },
  { key: 'month', label: 'МЕСЯЦ', title: 'Задачи на месяц', days: 30 },
];

const fields = async (task = {}) => {
  const options = await store.options();
  const deals = (await api.get('/api/deals', { limit: 200 })).items;
  return [
    { name: 'title', label: 'Название', required: true, value: task.title, width: 'full' },
    { name: 'due_date', label: 'Срок', type: 'date', value: task.due_date ?? today() },
    { name: 'priority', label: 'Приоритет', type: 'select', value: task.priority ?? 'normal',
      options: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })) },
    { name: 'assignee_id', label: 'Исполнитель', type: 'select', value: task.assignee_id, options: options.users },
    { name: 'deal_id', label: 'Сделка', type: 'select', value: task.deal_id,
      options: [{ value: '', label: '— не выбрано —' }, ...deals.map((deal) => ({ value: deal.id, label: deal.title }))] },
    { name: 'description', label: 'Описание', type: 'textarea', value: task.description, width: 'full' },
  ];
};

async function openTaskForm(task, onDone) {
  openForm({
    title: task ? 'Редактирование задачи' : 'Новая задача',
    fields: await fields(task ?? {}),
    onSubmit: async (values) => {
      if (task) await api.patch(`/api/tasks/${task.id}`, values);
      else await api.post('/api/tasks', values);
      toast(task ? 'Задача обновлена' : 'Задача создана');
      await onDone?.();
    },
  });
}

export async function renderTasks(root) {
  const state = { period: 'day', view: 'board' };

  const board = el('div', { class: 'board' });
  const listWrap = el('div', { class: 'card', hidden: true });
  const assigneeSelect = el('select', { style: 'width:190px' });
  const search = el('input', { class: 'search', placeholder: 'Фильтр по задачам' });
  const counter = el('span', { class: 'muted' });
  const periodBox = el('div', { class: 'presets' });

  const users = await store.users();
  assigneeSelect.append(el('option', { value: '' }, 'Все исполнители'),
    ...users.map((user) => el('option', { value: user.id }, user.name)));

  const toggleTask = async (task) => {
    try {
      await api.patch(`/api/tasks/${task.id}`, { done: !task.done });
      await reload();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const removeTask = async (task) => {
    if (!await confirmDialog(`Удалить задачу «${task.title}»?`)) return;
    await api.delete(`/api/tasks/${task.id}`);
    toast('Задача удалена');
    await reload();
  };

  const taskCard = (task) => {
    const checkbox = el('input', { type: 'checkbox', style: 'width:auto', checked: !!task.done });
    checkbox.addEventListener('change', () => toggleTask(task));

    return el('div', { class: 'task-card' }, [
      el('div', { style: 'display:flex;gap:8px;align-items:flex-start' }, [
        checkbox,
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { class: 'title', onclick: () => openTaskForm(task, reload), text: task.title }),
          task.deal_title ? el('div', { class: 'who', text: task.deal_title }) : null,
        ]),
      ]),
      el('div', { class: 'row' }, [
        el('span', {
          class: isOverdue(task.due_date, task.done) ? 'overdue' : 'muted',
          style: 'font-size:11px',
          text: formatDate(task.due_date),
        }),
        el('span', { style: 'display:flex;gap:6px;align-items:center' }, [
          task.priority === 'high' ? el('span', { class: 'badge prio-high', text: 'Важно' }) : null,
          el('span', { class: 'owner', title: task.assignee_name ?? '', text: initials(task.assignee_name) }),
        ]),
      ]),
    ]);
  };

  const column = (title, color, tasks) => el('div', {
    class: 'column',
    style: `--stage-color:${color}`,
  }, [
    el('header', {}, [
      el('div', { class: 'title' }, [
        el('span', { text: title }),
        el('span', { class: 'muted', text: String(tasks.length) }),
      ]),
    ]),
    el('div', { class: 'items' }, tasks.length
      ? tasks.map(taskCard)
      : [el('div', { class: 'muted', style: 'padding:6px', text: 'Задач нет' })]),
  ]);

  const renderList = (tasks) => {
    listWrap.replaceChildren(el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, [el('tr', {}, ['', 'Задача', 'Срок', 'Приоритет', 'Исполнитель', ''].map((title) => el('th', { text: title })))]),
      el('tbody', {}, tasks.length ? tasks.map((task) => {
        const checkbox = el('input', { type: 'checkbox', style: 'width:auto', checked: !!task.done });
        checkbox.addEventListener('change', () => toggleTask(task));
        return el('tr', { class: task.done ? 'muted' : '' }, [
          el('td', { style: 'width:36px' }, checkbox),
          el('td', {}, [
            el('span', { style: task.done ? 'text-decoration:line-through' : '', text: task.title }),
            task.deal_title ? el('div', { class: 'muted', text: task.deal_title }) : null,
          ]),
          el('td', { class: isOverdue(task.due_date, task.done) ? 'overdue' : '' }, formatDate(task.due_date)),
          el('td', {}, el('span', { class: `badge prio-${task.priority}` }, PRIORITY_LABELS[task.priority])),
          el('td', { text: task.assignee_name ?? '—' }),
          el('td', { class: 'actions' }, [
            el('button', { class: 'btn ghost', onclick: () => openTaskForm(task, reload) }, '✎'),
            el('button', { class: 'btn ghost', onclick: () => removeTask(task) }, '🗑'),
          ]),
        ]);
      }) : [el('tr', {}, [el('td', { colspan: '6' }, el('div', { class: 'empty', text: 'Задач нет' }))])]),
    ])));
  };

  const reload = async () => {
    const { items, total } = await api.get('/api/tasks', {
      q: search.value.trim() || undefined,
      assigneeId: assigneeSelect.value || undefined,
      limit: 200,
    });
    counter.textContent = `${total} задач`;

    const period = PERIODS.find((item) => item.key === state.period);
    const now = today();
    const horizon = shift(period.days);

    const overdue = items.filter((task) => !task.done && task.due_date && task.due_date < now);
    const todayTasks = items.filter((task) => !task.done && task.due_date === now);
    const upcoming = items.filter((task) => !task.done && task.due_date > now && task.due_date <= horizon);

    board.replaceChildren(
      column('ПРОСРОЧЕННЫЕ ЗАДАЧИ', 'var(--red)', overdue),
      column('ЗАДАЧИ НА СЕГОДНЯ', 'var(--green)', todayTasks),
      column(period.title.toUpperCase(), 'var(--axis)', upcoming),
    );
    renderList(items);

    board.hidden = state.view !== 'board';
    listWrap.hidden = state.view !== 'list';
  };

  periodBox.append(...PERIODS.map((period) => {
    const button = el('button', {
      class: `btn chip${state.period === period.key ? ' on' : ''}`,
      onclick: () => {
        state.period = period.key;
        for (const chip of periodBox.children) chip.classList.remove('on');
        button.classList.add('on');
        reload();
      },
    }, period.label);
    return button;
  }));

  const viewToggle = el('div', { class: 'presets' }, [
    el('button', { class: 'btn chip on', onclick: (event) => setView('board', event.target) }, 'Канбан'),
    el('button', { class: 'btn chip', onclick: (event) => setView('list', event.target) }, 'Список'),
  ]);
  const setView = (view, button) => {
    state.view = view;
    for (const chip of viewToggle.children) chip.classList.remove('on');
    button.classList.add('on');
    board.hidden = view !== 'board';
    listWrap.hidden = view !== 'list';
  };

  assigneeSelect.addEventListener('change', reload);
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 250); });

  root.append(
    el('div', { class: 'topbar' }, [
      el('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' }, [
        el('h1', { text: 'Задачи' }), periodBox, counter,
      ]),
      el('div', { class: 'toolbar' }, [
        viewToggle, search, assigneeSelect,
        el('button', { class: 'btn', onclick: () => openTaskForm(null, reload) }, '+ ДОБАВИТЬ ЗАДАЧУ'),
      ]),
    ]),
    el('div', { class: 'content' }, [board, listWrap]),
  );

  await reload();
}
