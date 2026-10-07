import { api } from '../api.js';
import { cityParam } from '../store.js';
import { ACTIVITY_LABELS, el, formatDate, formatDateTime, formatMoney, isOverdue } from '../ui.js';

const tile = (label, value, hint) =>
  el('div', { class: 'card stat' }, [el('div', { class: 'card-body' }, [
    el('div', { class: 'label', text: label }),
    el('div', { class: 'value', text: value }),
    hint ? el('div', { class: 'hint', text: hint }) : null,
  ])]);

/** Воронка продаж с цветами этапов — как полосы стадий в amoCRM. */
const funnel = (byStage) => {
  const max = Math.max(1, ...byStage.map((row) => row.count));
  return el('div', { class: 'card' }, [
    el('div', { class: 'card-head', text: 'Воронка продаж' }),
    el('div', { class: 'card-body', style: 'display:grid;gap:9px' }, byStage.map((row) =>
      el('div', {}, [
        el('div', { style: 'display:flex;justify-content:space-between;margin-bottom:3px' }, [
          el('span', { text: row.label }),
          el('span', { class: 'muted', text: `${row.count} · ${formatMoney(row.amount)}` }),
        ]),
        el('div', { style: 'height:8px;background:var(--surface-muted);border-radius:999px;overflow:hidden' }, [
          el('div', {
            style: `height:100%;width:${Math.round((row.count / max) * 100)}%;background:${row.color ?? 'var(--accent)'};border-radius:999px`,
          }),
        ]),
      ]))),
  ]);
};

export async function renderDashboard(root) {
  const data = await api.get('/api/dashboard', { cityId: cityParam() });
  const { totals } = data;

  root.append(
    el('div', { class: 'topbar' }, [el('h1', { text: 'Рабочий стол' })]),
    el('div', { class: 'content stack' }, [
      el('div', { class: 'grid cols-4' }, [
        tile('Сделки в работе', String(totals.open_deals), `на ${formatMoney(totals.open_amount)}`),
        tile('Успешно реализовано', formatMoney(totals.won_amount), `конверсия ${data.conversion}%`),
        tile('Контакты и компании', `${totals.contacts} / ${totals.companies}`),
        tile('Активные задачи', String(totals.open_tasks),
          totals.overdue_tasks ? `просрочено: ${totals.overdue_tasks}` : 'просроченных нет'),
      ]),
      el('div', { class: 'grid cols-2' }, [
        funnel(data.byStage),
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head', text: 'Крупнейшие сделки в работе' }),
          data.topDeals.length
            ? el('table', {}, [el('tbody', {}, data.topDeals.map((deal) =>
                el('tr', {}, [
                  el('td', {}, [
                    el('a', { href: `#/deals/${deal.id}`, text: deal.title }),
                    el('div', { class: 'muted', text: deal.contact_name || deal.company_name || '—' }),
                  ]),
                  el('td', { class: 'num', style: 'white-space:nowrap' }, formatMoney(deal.amount, deal.currency)),
                ])))])
            : el('div', { class: 'empty', text: 'Нет сделок в работе' }),
        ]),
      ]),
      el('div', { class: 'grid cols-2' }, [
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head', text: 'Ближайшие задачи' }),
          data.upcomingTasks.length
            ? el('table', {}, [el('tbody', {}, data.upcomingTasks.map((task) =>
                el('tr', {}, [
                  el('td', {}, [task.title, el('div', { class: 'muted', text: task.assignee_name ?? 'Без исполнителя' })]),
                  el('td', { class: isOverdue(task.due_date, false) ? 'overdue num' : 'muted num' },
                    formatDate(task.due_date)),
                ])))])
            : el('div', { class: 'empty', text: 'Задач нет' }),
        ]),
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head', text: 'Последняя активность' }),
          el('div', { class: 'card-body' }, [
            data.recentActivities.length
              ? el('div', { class: 'timeline' }, data.recentActivities.map((item) =>
                  el('div', { class: `item ${item.type}` }, [
                    el('div', { class: 'dot' }),
                    el('div', {}, [
                      el('div', { text: item.body }),
                      el('div', { class: 'meta', text: `${ACTIVITY_LABELS[item.type] ?? item.type} · ${item.user_name ?? 'система'} · ${formatDateTime(item.created_at)}${item.deal_title ? ` · ${item.deal_title}` : ''}` }),
                    ]),
                  ])))
              : el('div', { class: 'empty', text: 'Пока ничего не происходило' }),
          ]),
        ]),
      ]),
    ]),
  );
}
