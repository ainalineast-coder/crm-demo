import { api } from '../api.js';
import { chartLegend, stackedColumns } from '../chart.js';
import { currentPipeline, pipelineList } from '../pipelines.js';
import { store } from '../store.js';
import {
  confirmDialog, el, formatDateTime, formatMoney, formatNumber, openForm, seriesColor, toast,
} from '../ui.js';

const DAY = 86_400_000;
const toISO = (date) => date.toISOString().slice(0, 10);
const shiftDays = (days) => toISO(new Date(Date.now() + days * DAY));

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const dayLabel = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const dayFullLabel = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

const NO_CAMPAIGN_COLOR = '#98a4b5';

const monthStart = (offset = 0) => {
  const now = new Date();
  return toISO(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)));
};
const monthEnd = (offset = 0) => {
  const now = new Date();
  return toISO(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0)));
};

const PRESETS = [
  { label: '7 дней', from: () => shiftDays(-6), to: () => shiftDays(0) },
  { label: '30 дней', from: () => shiftDays(-29), to: () => shiftDays(0) },
  { label: 'Этот месяц', from: () => monthStart(0), to: () => shiftDays(0) },
  { label: 'Прошлый месяц', from: () => monthStart(-1), to: () => monthEnd(-1) },
];

const tile = (label, value, hint, kind = '') =>
  el('div', { class: `card stat ${kind}` }, [el('div', { class: 'card-body' }, [
    el('div', { class: 'label', text: label }),
    el('div', { class: 'value', text: value }),
    hint ? el('div', { class: 'hint', text: hint }) : null,
  ])]);

export async function renderAnalytics(root) {
  const state = {
    from: shiftDays(-29),
    to: shiftDays(0),
    tagIds: new Set(),
    ownerId: '',
    pipelineId: currentPipeline()?.id ?? '',
    view: 'chart',
    tab: 'campaigns',
  };

  // Разделы аналитики — как в amoCRM: анализ продаж, отчёт по кампаниям, по сотрудникам.
  const TABS = [
    { key: 'funnel', label: 'Анализ продаж' },
    { key: 'campaigns', label: 'Отчёт по кампаниям' },
    { key: 'managers', label: 'Отчёт по сотрудникам' },
    { key: 'calls', label: 'Звонки' },
    { key: 'goals', label: 'Цели' },
    { key: 'events', label: 'Список событий' },
  ];

  const fromInput = el('input', { type: 'date', value: state.from });
  const toInput = el('input', { type: 'date', value: state.to });
  const ownerSelect = el('select', { style: 'width:180px' });
  const presetsBox = el('div', { class: 'presets' });
  const campaignFilter = el('div', { class: 'tag-list' });
  const tilesBox = el('div', { class: 'grid cols-6' });
  const chartCard = el('div', { class: 'card' });
  const campaignsCard = el('div', { class: 'card' });
  const manageCard = el('div', { class: 'card' });
  const funnelCard = el('div', { class: 'card' });
  const managersCard = el('div', { class: 'card' });
  const callsCard = el('div', { class: 'card' });
  const goalsCard = el('div', { class: 'card' });
  const eventsCard = el('div', { class: 'card' });
  const tabsBox = el('div', { class: 'presets' });
  const pipelineSelect = el('select', { style: 'width:190px' });

  const users = await store.users();
  ownerSelect.append(el('option', { value: '' }, 'Все ответственные'),
    ...users.map((user) => el('option', { value: user.id }, user.name)));

  presetsBox.append(...PRESETS.map((preset) =>
    el('button', { class: 'btn chip', onclick: () => {
      state.from = preset.from();
      state.to = preset.to();
      fromInput.value = state.from;
      toInput.value = state.to;
      reload();
    } }, preset.label)));

  const reportParams = () => ({
    from: state.from,
    to: state.to,
    ownerId: state.ownerId || undefined,
    tagIds: state.tagIds.size ? [...state.tagIds].join(',') : undefined,
  });

  const exportCsv = async () => {
    try {
      await api.download('/api/reports/campaigns.csv', reportParams(), `кампании-${state.from}_${state.to}.csv`);
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  for (const [input, field] of [[fromInput, 'from'], [toInput, 'to']]) {
    input.addEventListener('change', () => {
      state[field] = input.value;
      reload();
    });
  }
  ownerSelect.addEventListener('change', () => {
    state.ownerId = ownerSelect.value;
    reload();
  });

  // --- Справочник рекламных кампаний: добавление и удаление хэштегов ---
  const renderTagManager = (tags) => {
    const nameInput = el('input', { placeholder: 'например, маркетинг', style: 'width:200px' });
    const titleInput = el('input', { placeholder: 'описание (необязательно)', style: 'width:230px' });

    const addTag = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      try {
        await api.post('/api/tags', { name, title: titleInput.value.trim() || null });
        nameInput.value = '';
        titleInput.value = '';
        store.invalidate('tags');
        toast(`Кампания #${name.replace(/^#/, '')} добавлена`);
        await reload();
      } catch (error) {
        toast(error.message, 'error');
      }
    };
    nameInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') addTag(); });

    const removeTag = async (tag) => {
      const warning = tag.leads_count
        ? `Хэштег #${tag.name} стоит у ${tag.leads_count} заявок. Удалить его? Заявки останутся, метка снимется.`
        : `Удалить хэштег #${tag.name}?`;
      if (!await confirmDialog(warning)) return;
      await api.delete(`/api/tags/${tag.id}`);
      state.tagIds.delete(tag.id);
      store.invalidate('tags');
      toast('Хэштег удалён');
      await reload();
    };

    const editTag = (tag) => openForm({
      title: `Кампания #${tag.name}`,
      fields: [
        { name: 'name', label: 'Хэштег', value: tag.name, required: true },
        { name: 'title', label: 'Описание', value: tag.title },
      ],
      onSubmit: async (values) => {
        await api.patch(`/api/tags/${tag.id}`, values);
        store.invalidate('tags');
        toast('Кампания обновлена');
        await reload();
      },
    });

    manageCard.replaceChildren(
      el('div', { class: 'card-head' }, [
        'Рекламные кампании',
        el('span', { class: 'muted', style: 'font-weight:400', text: 'хэштеги можно добавлять и удалять' }),
      ]),
      el('div', { class: 'card-body', style: 'display:grid;gap:12px' }, [
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' }, [
          el('span', { class: 'muted', text: '#' }), nameInput, titleInput,
          el('button', { class: 'btn', onclick: addTag }, 'Добавить'),
        ]),
        tags.length
          ? el('div', { class: 'table-wrap' }, el('table', {}, [
              el('thead', {}, [el('tr', {}, ['Хэштег', 'Описание', 'Заявок', ''].map((title, index) =>
                el('th', { class: index === 2 ? 'num' : '', text: title })))]),
              el('tbody', {}, tags.map((tag) => el('tr', {}, [
                el('td', {}, el('span', { class: 'tag' }, [
                  el('span', { class: 'dot', style: `background:${seriesColor(tag.color)}` }),
                  `#${tag.name}`,
                ])),
                el('td', { class: 'muted', text: tag.title ?? '—' }),
                el('td', { class: 'num', text: formatNumber(tag.leads_count) }),
                el('td', { class: 'actions' }, [
                  el('button', { class: 'btn ghost', title: 'Изменить', onclick: () => editTag(tag) }, '✎'),
                  el('button', { class: 'btn ghost', title: 'Удалить', onclick: () => removeTag(tag) }, '🗑'),
                ]),
              ]))),
            ]))
          : el('div', { class: 'empty', text: 'Кампаний пока нет — добавьте первый хэштег' }),
      ]),
    );
  };

  const renderCampaignFilter = (tags) => {
    campaignFilter.replaceChildren(
      el('button', {
        class: `btn chip${state.tagIds.size === 0 ? ' on' : ''}`,
        onclick: () => { state.tagIds.clear(); reload(); },
      }, 'Все кампании'),
      ...tags.map((tag) => el('button', {
        class: `btn chip${state.tagIds.has(tag.id) ? ' on' : ''}`,
        onclick: () => {
          if (state.tagIds.has(tag.id)) state.tagIds.delete(tag.id);
          else state.tagIds.add(tag.id);
          reload();
        },
      }, [
        el('span', { class: 'dot', style: `display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${seriesColor(tag.color)}` }),
        `#${tag.name}`,
      ])),
    );
  };

  const renderReport = (report) => {
    const { totals } = report;
    tilesBox.replaceChildren(
      tile('Заявок', formatNumber(totals.leads), `${report.from} — ${report.to}`),
      tile('Успешно реализовано', formatNumber(totals.won), 'закрытые сделки', 'good'),
      tile('Закрыто и не реализовано', formatNumber(totals.lost), 'отказы', 'bad'),
      tile('В работе', formatNumber(totals.inProgress), 'открытые заявки'),
      tile('Конверсия', `${totals.conversion}%`, 'успешные из закрытых'),
      tile('Бюджет успешных', formatMoney(totals.wonAmount), `всего заявок на ${formatMoney(totals.amount)}`),
    );

    // Серии графика: цвет закреплён за кампанией, а не за её местом в списке.
    const series = report.campaigns.map((campaign) => ({
      key: String(campaign.tagId ?? 0),
      label: campaign.label,
      color: campaign.tagId ? seriesColor(campaign.color) : NO_CAMPAIGN_COLOR,
    }));

    const days = report.byDay.map((day) => ({
      date: day.date,
      label: dayLabel(day.date),
      fullLabel: dayFullLabel(day.date),
      values: day.byTag,
      total: day.leads,
      won: day.won,
      lost: day.lost,
    }));

    const toggle = (view, label) => el('button', {
      class: `btn chip${state.view === view ? ' on' : ''}`,
      onclick: () => { state.view = view; renderReport(report); },
    }, label);

    const dayTable = () => el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Дата' }),
        ...series.map((item) => el('th', { class: 'num', text: item.label })),
        el('th', { class: 'num', text: 'Всего' }),
        el('th', { class: 'num', text: 'Успешно' }),
        el('th', { class: 'num', text: 'Не реализовано' }),
      ])]),
      el('tbody', {}, days.filter((day) => day.total > 0).map((day) => el('tr', {}, [
        el('td', { text: dayFullLabel(day.date) }),
        ...series.map((item) => el('td', { class: 'num', text: formatNumber(day.values[item.key] ?? 0) })),
        el('td', { class: 'num' }, el('strong', { text: formatNumber(day.total) })),
        el('td', { class: 'num', text: formatNumber(day.won) }),
        el('td', { class: 'num', text: formatNumber(day.lost) }),
      ]))),
    ]));

    chartCard.replaceChildren(
      el('div', { class: 'card-head' }, [
        'Заявки по дням',
        el('div', { class: 'presets' }, [toggle('chart', 'График'), toggle('table', 'Таблица')]),
      ]),
      el('div', { class: 'card-body' }, [
        state.view === 'chart'
          ? el('div', {}, [
              stackedColumns({ days, series }),
              series.length > 1 ? chartLegend(series) : null,
            ])
          : dayTable(),
        el('div', { class: 'muted', style: 'margin-top:10px;font-size:11px' },
          'Заявка учитывается по дате поступления. Если у заявки несколько хэштегов, она попадает в каждую кампанию.'),
      ]),
    );

    campaignsCard.replaceChildren(
      el('div', { class: 'card-head' }, ['Отчёт по рекламным кампаниям']),
      report.campaigns.length
        ? el('div', { class: 'table-wrap' }, el('table', {}, [
            el('thead', {}, [el('tr', {}, [
              el('th', { text: 'Кампания' }),
              ...['Заявок', 'Успешно реализовано', 'Закрыто и не реализовано', 'В работе', 'Конверсия', 'Бюджет успешных']
                .map((title) => el('th', { class: 'num', text: title })),
            ])]),
            el('tbody', {}, report.campaigns.map((campaign) => el('tr', {}, [
              el('td', {}, el('span', { class: 'tag' }, [
                el('span', {
                  class: 'dot',
                  style: `background:${campaign.tagId ? seriesColor(campaign.color) : NO_CAMPAIGN_COLOR}`,
                }),
                campaign.label,
              ])),
              el('td', { class: 'num' }, el('strong', { text: formatNumber(campaign.leads) })),
              el('td', { class: 'num', text: formatNumber(campaign.won) }),
              el('td', { class: 'num', text: formatNumber(campaign.lost) }),
              el('td', { class: 'num', text: formatNumber(campaign.inProgress) }),
              el('td', { class: 'num', text: `${campaign.conversion}%` }),
              el('td', { class: 'num', text: formatMoney(campaign.wonAmount) }),
            ]))),
            el('tfoot', {}, [el('tr', {}, [
              el('td', { text: 'Итого' }),
              el('td', { class: 'num', text: formatNumber(totals.leads) }),
              el('td', { class: 'num', text: formatNumber(totals.won) }),
              el('td', { class: 'num', text: formatNumber(totals.lost) }),
              el('td', { class: 'num', text: formatNumber(totals.inProgress) }),
              el('td', { class: 'num', text: `${totals.conversion}%` }),
              el('td', { class: 'num', text: formatMoney(totals.wonAmount) }),
            ])]),
          ]))
        : el('div', { class: 'empty', text: 'За выбранный период заявок нет' }),
    );
  };

  /** Анализ продаж: сколько сделок и денег стоит на каждом этапе воронки. */
  const renderFunnel = (report) => {
    const max = Math.max(1, ...report.stages.map((stage) => stage.count));
    funnelCard.replaceChildren(
      el('div', { class: 'card-head' }, [
        `Анализ продаж — ${report.pipeline?.name ?? 'воронка не выбрана'}`,
        el('span', { class: 'muted', style: 'font-weight:400', text: `${report.from} — ${report.to}` }),
      ]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'funnel' }, report.stages.map((stage) => el('div', {
          class: 'funnel-stage',
          style: `--stage-color:${stage.color ?? 'var(--accent)'}`,
        }, [
          el('div', { class: 'name', text: stage.name }),
          el('div', { class: 'count', text: `${formatNumber(stage.count)} сдел.` }),
          el('div', { class: 'sum muted', text: formatMoney(stage.amount) }),
          el('div', { class: 'bar' }, el('div', {
            class: 'fill',
            style: `width:${Math.round((stage.count / max) * 100)}%`,
          })),
        ]))),
      ]),
    );
  };

  /** Отчёт по сотрудникам: сделки, заявки, примечания и задачи каждого менеджера. */
  const renderManagers = (report) => {
    const columns = ['Сотрудник', 'Сделок в работе', 'Сумма в работе', 'Новых заявок',
      'Успешных', 'Сумма успешных', 'Примечаний', 'Задач в работе'];

    managersCard.replaceChildren(
      el('div', { class: 'card-head' }, [
        'Отчёт по сотрудникам',
        el('span', { class: 'muted', style: 'font-weight:400', text: `${report.from} — ${report.to}` }),
      ]),
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, [el('tr', {}, columns.map((title, index) =>
          el('th', { class: index === 0 ? '' : 'num', text: title })))]),
        el('tbody', {}, report.items.map((row) => el('tr', {}, [
          el('td', {}, el('strong', { text: row.name })),
          el('td', { class: 'num', text: formatNumber(row.open_deals) }),
          el('td', { class: 'num', text: formatMoney(row.open_amount) }),
          el('td', { class: 'num', text: formatNumber(row.new_deals) }),
          el('td', { class: 'num', text: formatNumber(row.won_deals) }),
          el('td', { class: 'num', text: formatMoney(row.won_amount) }),
          el('td', { class: 'num', text: formatNumber(row.notes) }),
          el('td', { class: 'num', text: formatNumber(row.open_tasks) }),
        ]))),
      ])),
    );
  };

  /** Звонки: сводка и последние вызовы — как отчёт «Звонки» в amoCRM. */
  const renderCalls = (report, recent) => {
    const minutes = (seconds) => `${Math.floor(seconds / 60)} мин ${seconds % 60} сек`;
    const RESULTS = { answered: 'Разговор', missed: 'Пропущенный', busy: 'Занято', failed: 'Не дозвонились' };

    callsCard.replaceChildren(
      el('div', { class: 'card-head' }, [
        'Звонки', el('span', { class: 'muted', style: 'font-weight:400', text: `${report.from} — ${report.to}` }),
      ]),
      el('div', { class: 'card-body', style: 'display:grid;gap:14px' }, [
        el('div', { class: 'grid cols-4' }, [
          tile('Всего звонков', formatNumber(report.totals.total ?? 0)),
          tile('Входящие', formatNumber(report.totals.incoming ?? 0)),
          tile('Исходящие', formatNumber(report.totals.outgoing ?? 0)),
          tile('Пропущенные', formatNumber(report.totals.missed ?? 0), minutes(report.totals.duration ?? 0), 'bad'),
        ]),
        el('div', { class: 'table-wrap' }, el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Сотрудник', 'Входящие', 'Исходящие', 'Пропущенные', 'Всего', 'Длительность']
            .map((title, index) => el('th', { class: index ? 'num' : '', text: title })))]),
          el('tbody', {}, report.byUser.map((row) => el('tr', {}, [
            el('td', {}, el('strong', { text: row.name })),
            el('td', { class: 'num', text: formatNumber(row.incoming) }),
            el('td', { class: 'num', text: formatNumber(row.outgoing) }),
            el('td', { class: 'num', text: formatNumber(row.missed) }),
            el('td', { class: 'num', text: formatNumber(row.total) }),
            el('td', { class: 'num', text: minutes(row.duration) }),
          ]))),
        ])),
        el('div', { class: 'section-title', text: 'Недавние звонки' }),
        el('div', { class: 'table-wrap' }, el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Дата', 'Направление', 'Номер', 'Клиент', 'Сделка', 'Результат', 'Длительность']
            .map((title) => el('th', { text: title })))]),
          el('tbody', {}, recent.length ? recent.slice(0, 15).map((call) => el('tr', {}, [
            el('td', { class: 'muted', text: formatDateTime(call.created_at) }),
            el('td', { text: call.direction === 'in' ? 'Входящий' : 'Исходящий' }),
            el('td', { text: call.phone ?? '—' }),
            el('td', { text: call.contact_name || '—' }),
            el('td', { class: 'muted', text: call.deal_title ?? '—' }),
            el('td', {}, el('span', {
              class: call.result === 'missed' ? 'badge prio-high' : 'badge',
              text: RESULTS[call.result] ?? call.result,
            })),
            el('td', { class: 'num', text: minutes(call.duration) }),
          ])) : [el('tr', {}, [el('td', { colspan: '7' }, el('div', { class: 'empty', text: 'Звонков нет' }))])]),
        ])),
      ]),
    );
  };

  /** Цели на месяц и их выполнение. */
  const renderGoals = (report) => {
    const bar = (percent, good) => el('div', {
      style: 'height:8px;background:var(--surface-muted);border-radius:999px;overflow:hidden;min-width:120px',
    }, el('div', {
      style: `height:100%;width:${Math.min(100, percent ?? 0)}%;background:${good ? 'var(--green)' : 'var(--accent)'};border-radius:999px`,
    }));

    const editGoal = (row) => openForm({
      title: `Цель на ${report.period} — ${row.name}`,
      fields: [
        { name: 'target_amount', label: 'План по сумме', type: 'number', value: row.target_amount },
        { name: 'target_count', label: 'План по числу сделок', type: 'number', value: row.target_count },
      ],
      submitLabel: 'Сохранить',
      onSubmit: async (values) => {
        await api.put('/api/goals', {
          user_id: row.user_id, period: report.period,
          target_amount: values.target_amount ?? 0, target_count: values.target_count ?? 0,
        });
        toast('Цель сохранена');
        await reload();
      },
    });

    goalsCard.replaceChildren(
      el('div', { class: 'card-head' }, [
        `Цели по сделкам — ${report.period}`,
        el('span', { class: 'muted', style: 'font-weight:400',
          text: `выполнено ${formatMoney(report.totals.won_amount)} из ${formatMoney(report.totals.target_amount)}` }),
      ]),
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Сотрудник', 'План, сумма', 'Факт, сумма', 'Выполнение', 'План, сделок', 'Факт, сделок', '']
          .map((title, index) => el('th', { class: index && index < 6 ? 'num' : '', text: title })))]),
        el('tbody', {}, report.items.map((row) => el('tr', {}, [
          el('td', {}, el('strong', { text: row.name })),
          el('td', { class: 'num', text: row.target_amount ? formatMoney(row.target_amount) : '—' }),
          el('td', { class: 'num', text: formatMoney(row.won_amount) }),
          el('td', {}, el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
            bar(row.progress_amount, (row.progress_amount ?? 0) >= 100),
            el('span', { class: 'muted', text: row.progress_amount === null ? 'план не задан' : `${row.progress_amount}%` }),
          ])),
          el('td', { class: 'num', text: row.target_count || '—' }),
          el('td', { class: 'num', text: formatNumber(row.won_count) }),
          el('td', { class: 'actions' }, el('button', { class: 'btn ghost', onclick: () => editGoal(row) }, '✎')),
        ]))),
      ])),
    );
  };

  /** Список событий: кто что менял. */
  const renderEvents = (report) => {
    const ENTITIES = {
      deal: 'Сделка', contact: 'Контакт', company: 'Компания', product: 'Товар',
      file: 'Файл', call: 'Звонок', chat: 'Переписка', email: 'Письмо', settings: 'Настройки',
    };

    eventsCard.replaceChildren(
      el('div', { class: 'card-head' }, [
        'Список событий', el('span', { class: 'muted', style: 'font-weight:400', text: `${report.total} событий` }),
      ]),
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Дата', 'Автор', 'Объект', 'Название', 'Событие', 'Было', 'Стало']
          .map((title) => el('th', { text: title })))]),
        el('tbody', {}, report.items.length ? report.items.map((event) => el('tr', {}, [
          el('td', { class: 'muted', text: formatDateTime(event.created_at) }),
          el('td', { text: event.user_name ?? 'система' }),
          el('td', { text: ENTITIES[event.entity_type] ?? event.entity_type }),
          el('td', {}, event.entity_type === 'deal' && event.entity_id
            ? el('a', { href: `#/deals/${event.entity_id}`, text: event.entity_name ?? '—' })
            : (event.entity_name ?? '—')),
          el('td', { text: event.field ?? event.action }),
          el('td', { class: 'muted', text: event.old_value ?? '—' }),
          el('td', { text: event.new_value ?? '—' }),
        ])) : [el('tr', {}, [el('td', { colspan: '7' }, el('div', { class: 'empty', text: 'Событий нет' }))])]),
      ])),
    );
  };

  const applyTab = () => {
    for (const chip of tabsBox.children) {
      chip.classList.toggle('on', chip.dataset.tab === state.tab);
    }
    campaignFilter.hidden = state.tab !== 'campaigns';
    pipelineSelect.hidden = state.tab !== 'funnel';
    for (const [node, tab] of [[chartCard, 'campaigns'], [campaignsCard, 'campaigns'], [manageCard, 'campaigns'],
      [funnelCard, 'funnel'], [managersCard, 'managers'], [callsCard, 'calls'], [goalsCard, 'goals'],
      [eventsCard, 'events']]) {
      node.hidden = state.tab !== tab;
    }
    tilesBox.hidden = state.tab !== 'campaigns' && state.tab !== 'funnel';
  };

  async function reload() {
    applyTab();

    if (state.tab === 'managers') {
      renderManagers(await api.get('/api/reports/managers', { from: state.from, to: state.to }));
      return;
    }

    if (state.tab === 'calls') {
      const [report, recent] = await Promise.all([
        api.get('/api/calls/report', { from: state.from, to: state.to }),
        api.get('/api/calls', { from: state.from, to: state.to, limit: 20 }),
      ]);
      renderCalls(report, recent.items);
      return;
    }

    if (state.tab === 'goals') {
      renderGoals(await api.get('/api/goals', { period: state.from.slice(0, 7) }));
      return;
    }

    if (state.tab === 'events') {
      renderEvents(await api.get('/api/events', { from: state.from, to: state.to, limit: 100 }));
      return;
    }

    if (state.tab === 'funnel') {
      const report = await api.get('/api/reports/funnel', {
        from: state.from, to: state.to,
        ownerId: state.ownerId || undefined,
        pipelineId: state.pipelineId || undefined,
      });
      renderFunnel(report);
      const { totals } = report;
      tilesBox.replaceChildren(
        tile('Заявок', formatNumber(totals.leads), `${report.from} — ${report.to}`),
        tile('Успешно реализовано', formatNumber(totals.won), 'закрытые сделки', 'good'),
        tile('Закрыто и не реализовано', formatNumber(totals.lost), 'отказы', 'bad'),
        tile('В работе', formatNumber(totals.inProgress), 'открытые заявки'),
        tile('Конверсия', `${totals.conversion}%`, 'успешные из закрытых'),
        tile('Бюджет успешных', formatMoney(totals.wonAmount), `всего заявок на ${formatMoney(totals.amount)}`),
      );
      return;
    }

    const [report, tags] = await Promise.all([
      api.get('/api/reports/campaigns', reportParams()),
      store.tags(true),
    ]);
    renderCampaignFilter(tags);
    renderTagManager(tags);
    renderReport(report);
  }

  tabsBox.append(...TABS.map((tab) => el('button', {
    class: `btn chip${state.tab === tab.key ? ' on' : ''}`,
    dataset: { tab: tab.key },
    onclick: () => {
      state.tab = tab.key;
      reload();
    },
  }, tab.label)));

  pipelineSelect.append(...pipelineList().map((pipeline) => el('option', {
    value: pipeline.id, selected: pipeline.id === state.pipelineId,
  }, pipeline.name)));
  pipelineSelect.addEventListener('change', () => {
    state.pipelineId = pipelineSelect.value;
    reload();
  });

  root.append(
    el('div', { class: 'topbar' }, [
      el('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' }, [
        el('h1', { text: 'Аналитика' }),
        tabsBox,
      ]),
      el('div', { class: 'toolbar' }, [
        el('button', { class: 'btn secondary', onclick: exportCsv }, '↓ Выгрузить CSV'),
      ]),
    ]),
    el('div', { class: 'content stack' }, [
      el('div', { class: 'card' }, [el('div', { class: 'card-body', style: 'display:grid;gap:10px' }, [
        el('div', { class: 'filters' }, [
          el('div', { class: 'field' }, [el('label', { text: 'Период с' }), fromInput]),
          el('div', { class: 'field' }, [el('label', { text: 'по' }), toInput]),
          el('div', { class: 'field' }, [el('label', { text: 'Ответственный' }), ownerSelect]),
          el('div', { class: 'field' }, [el('label', { text: 'Воронка' }), pipelineSelect]),
          el('div', { class: 'field', style: 'flex:1' }, [el('label', { text: 'Быстрый период' }), presetsBox]),
        ]),
        campaignFilter,
      ])]),
      tilesBox,
      funnelCard,
      managersCard,
      callsCard,
      goalsCard,
      eventsCard,
      chartCard,
      campaignsCard,
      manageCard,
    ]),
  );

  await reload();
}
