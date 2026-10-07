import { api } from '../api.js';
import {
  LEAD_TYPE_LABELS, currentPipeline, findStage, loadPipelines, pipelineList,
  setCurrentPipeline, stageOptions, stagesOf,
} from '../pipelines.js';
import { cityParam, cityTag, store } from '../store.js';
import {
  ACTIVITY_LABELS, confirmDialog, el, formatDate, formatDateTime, formatMoney,
  initials, openForm, openPanel, seriesColor, tagChip, toast,
} from '../ui.js';

const CURRENCIES = ['KZT', 'RUB', 'USD', 'EUR'];

/** Виджет выбора рекламных кампаний: отмечаем хэштеги и можем завести новый. */
function tagPicker(tags, selectedIds) {
  const selected = new Set(selectedIds);
  const chips = el('div', { class: 'tag-list' });
  const list = [...tags];

  const draw = () => chips.replaceChildren(...list.map((tag) => el('button', {
    type: 'button',
    class: `btn chip${selected.has(tag.id) ? ' on' : ''}`,
    onclick: () => {
      if (selected.has(tag.id)) selected.delete(tag.id);
      else selected.add(tag.id);
      draw();
    },
  }, [
    el('span', {
      style: `display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${seriesColor(tag.color)}`,
    }),
    `#${tag.name}`,
  ])));
  draw();

  const newTag = el('input', { placeholder: 'новый хэштег', style: 'width:150px' });
  const addNew = async () => {
    const name = newTag.value.trim();
    if (!name) return;
    try {
      const created = await api.post('/api/tags', { name });
      list.push(created);
      selected.add(created.id);
      newTag.value = '';
      store.invalidate('tags');
      draw();
    } catch (error) {
      toast(error.message, 'error');
    }
  };
  newTag.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addNew();
    }
  });

  return {
    node: el('div', { style: 'display:grid;gap:8px' }, [
      chips,
      el('div', { style: 'display:flex;gap:6px' }, [
        newTag,
        el('button', { type: 'button', class: 'btn secondary', onclick: addNew }, '+ кампания'),
      ]),
    ]),
    read: () => [...selected],
  };
}

export async function openDealForm(deal, onDone, pipelineId) {
  const [options, tags, cities] = await Promise.all([store.options(), store.tags(), store.cities()]);
  const picker = tagPicker(tags, (deal?.tags ?? []).map((tag) => tag.id));
  const isEdit = Boolean(deal);
  const pipeline = deal?.pipeline_id ?? pipelineId ?? currentPipeline()?.id;

  const fields = [
    { name: 'title', label: 'Название сделки', required: true, value: deal?.title, width: 'full' },
    { name: 'stage_id', label: 'Этап', type: 'select', value: deal?.stage_id, options: stageOptions(pipeline) },
    { name: 'lead_type', label: 'Тип клиента', type: 'select', value: deal?.lead_type ?? 'individual',
      options: Object.entries(LEAD_TYPE_LABELS).map(([value, label]) => ({ value, label })) },
    { name: 'amount', label: 'Бюджет', type: 'number', step: '0.01', value: deal?.amount ?? 0 },
    { name: 'currency', label: 'Валюта', type: 'select', value: deal?.currency ?? 'KZT',
      options: CURRENCIES.map((code) => ({ value: code, label: code })) },
    { name: 'owner_id', label: 'Ответственный', type: 'select', value: deal?.owner_id, options: options.users },
    // Город выбирает администратор; не указан — сделка уходит в город ответственного.
    // Менеджер всегда работает в своём городе, поле ему не нужно.
    store.isAdmin()
      ? { name: 'city_id', label: 'Город', type: 'select', value: deal ? deal.city_id : store.cityId,
          options: [{ value: '', label: isEdit ? '— без города —' : '— как у ответственного —' }]
            .concat(cities.map((city) => ({ value: city.id, label: city.name }))) }
      : null,
    { name: 'expected_close_date', label: 'Ожидаемое закрытие', type: 'date', value: deal?.expected_close_date },
  ];

  if (isEdit) {
    fields.push(
      { name: 'contact_id', label: 'Контакт', type: 'select', value: deal.contact_id, options: options.contacts },
      { name: 'company_id', label: 'Компания', type: 'select', value: deal.company_id, options: options.companies },
    );
  } else {
    // Новый лид чаще всего от физлица: ФИО и телефон создают контакт сразу.
    fields.push(
      { name: 'contact_last_name', label: 'Фамилия клиента' },
      { name: 'contact_first_name', label: 'Имя клиента' },
      { name: 'contact_phone', label: 'Телефон' },
      { name: 'company_id', label: 'Компания (для юрлица)', type: 'select', options: options.companies },
    );
  }

  fields.push(
    { name: 'tags', label: 'Рекламные кампании (хэштеги)', type: 'custom', width: 'full', node: picker.node, read: picker.read },
    { name: 'notes', label: 'Примечание', type: 'textarea', value: deal?.notes, width: 'full' },
  );

  openForm({
    title: isEdit ? 'Редактирование сделки' : 'Новая сделка',
    fields: fields.filter(Boolean),
    onSubmit: async (values) => {
      const payload = { ...values, pipeline_id: pipeline };
      // Город отправляем, только если его действительно выбрали или поменяли:
      // иначе смена ответственного сама переносит сделку в его город.
      const cityChanged = isEdit
        ? String(payload.city_id ?? '') !== String(deal.city_id ?? '')
        : payload.city_id !== null && payload.city_id !== undefined;
      if (!cityChanged) delete payload.city_id;
      const first = payload.contact_first_name;
      const last = payload.contact_last_name;
      const phone = payload.contact_phone;
      delete payload.contact_first_name;
      delete payload.contact_last_name;
      delete payload.contact_phone;

      if (!isEdit && (first || last || phone)) {
        payload.contact = { first_name: first ?? last ?? 'Клиент', last_name: first ? last : null, phone };
      }

      if (isEdit) await api.patch(`/api/deals/${deal.id}`, payload);
      else await api.post('/api/deals', payload);

      store.invalidate('contacts');
      toast(isEdit ? 'Сделка обновлена' : 'Сделка создана');
      await onDone?.();
    },
  });
}

/** Позиции сделки: товары, количество и сумма. */
function itemsBlock(dealId, onChange) {
  const box = el('div', { style: 'display:grid;gap:6px' });

  const draw = (items) => {
    box.replaceChildren(
      ...(items.length
        ? items.map((item) => el('div', { style: 'display:flex;gap:8px;align-items:center' }, [
            el('span', { style: 'flex:1', text: `${item.name} × ${item.quantity}` }),
            el('span', { class: 'muted', text: formatMoney(item.amount) }),
            el('button', { class: 'btn ghost', title: 'Убрать', onclick: async () => {
              const result = await api.delete(`/api/deals/${dealId}/items/${item.id}`);
              draw(result.items);
              await onChange?.();
            } }, '✕'),
          ]))
        : [el('div', { class: 'muted', text: 'Товары не добавлены' })]),
    );
  };

  const add = async () => {
    const products = (await api.get('/api/products', { active: 'true', limit: 200 })).items;
    if (!products.length) return toast('Сначала заведите товары в разделе «Товары»', 'error');

    openForm({
      title: 'Добавить товар в сделку',
      fields: [
        { name: 'product_id', label: 'Товар', type: 'select', width: 'full',
          options: products.map((product) => ({
            value: product.id, label: `${product.name} — ${formatMoney(product.price, product.currency)}`,
          })) },
        { name: 'quantity', label: 'Количество', type: 'number', value: 1 },
        { name: 'price', label: 'Цена (если отличается)', type: 'number' },
      ],
      submitLabel: 'Добавить',
      onSubmit: async (values) => {
        const result = await api.post(`/api/deals/${dealId}/items`, values);
        draw(result.items);
        toast('Товар добавлен');
        await onChange?.();
      },
    });
  };

  api.get(`/api/deals/${dealId}/items`).then((result) => draw(result.items));

  return {
    node: box,
    addButton: el('button', { class: 'btn secondary', onclick: add }, '+ Товар'),
  };
}

/** Файлы сделки: загрузка и скачивание. */
function filesBlock(dealId) {
  const box = el('div', { style: 'display:grid;gap:6px' });
  const input = el('input', { type: 'file', multiple: 'multiple', style: 'display:none' });

  const draw = (items) => {
    box.replaceChildren(
      ...(items.length
        ? items.map((file) => el('div', { style: 'display:flex;gap:8px;align-items:center' }, [
            el('a', {
              href: `/api/files/${file.id}/download`,
              style: 'flex:1',
              onclick: async (event) => {
                event.preventDefault();
                try {
                  await api.download(`/api/files/${file.id}/download`, {}, file.name);
                } catch (error) {
                  toast(error.message, 'error');
                }
              },
              text: file.name,
            }),
            el('span', { class: 'muted', text: `${Math.max(1, Math.round(file.size / 1024))} КБ` }),
            el('button', { class: 'btn ghost', onclick: async () => {
              if (!await confirmDialog(`Удалить файл «${file.name}»?`)) return;
              await api.delete(`/api/files/${file.id}`);
              draw((await api.get('/api/files', { dealId })).items);
            } }, '✕'),
          ]))
        : [el('div', { class: 'muted', text: 'Файлов нет' })]),
      input,
    );
  };

  input.addEventListener('change', async () => {
    if (!input.files?.length) return;
    const form = new FormData();
    for (const file of input.files) form.append('files', file);
    form.append('deal_id', String(dealId));

    try {
      await api.upload('/api/files', form);
      toast('Файл загружен');
      draw((await api.get('/api/files', { dealId })).items);
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  api.get('/api/files', { dealId }).then((result) => draw(result.items));

  return {
    node: box,
    addButton: el('button', { class: 'btn secondary', onclick: () => input.click() }, '+ Файл'),
  };
}

/** Карточка сделки: данные, товары, файлы, задачи, примечания и история. */
export async function openDealDetails(id, onDone) {
  const deal = await api.get(`/api/deals/${id}`);
  const items = itemsBlock(id, onDone);
  const files = filesBlock(id);

  const timeline = el('div', { class: 'timeline' });
  const renderTimeline = (items) => {
    timeline.replaceChildren(...(items.length
      ? items.map((item) => el('div', { class: `item ${item.type}` }, [
          el('div', { class: 'dot' }),
          el('div', {}, [
            el('div', { text: item.body }),
            el('div', { class: 'meta', text: `${ACTIVITY_LABELS[item.type] ?? item.type} · ${item.user_name ?? 'система'} · ${formatDateTime(item.created_at)}` }),
          ]),
        ]))
      : [el('div', { class: 'muted', text: 'Записей пока нет' })]));
  };
  renderTimeline(deal.activities);

  const noteInput = el('input', { placeholder: 'Добавить примечание и нажать Enter…' });
  const typeSelect = el('select', { style: 'width:130px' },
    ['note', 'call', 'meeting', 'email'].map((type) => el('option', { value: type }, ACTIVITY_LABELS[type])));

  const addNote = async () => {
    const body = noteInput.value.trim();
    if (!body) return;
    try {
      await api.post('/api/activities', { type: typeSelect.value, body, deal_id: deal.id });
      noteInput.value = '';
      renderTimeline((await api.get(`/api/deals/${deal.id}`)).activities);
      await onDone?.();
    } catch (error) {
      toast(error.message, 'error');
    }
  };
  noteInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') addNote(); });

  const info = (label, value) => el('div', {}, [
    el('div', { class: 'muted', style: 'font-size:11px', text: label }),
    el('div', {}, value ?? '—'),
  ]);

  const stageSelect = el('select', {}, stagesOf(deal.pipeline_id).map((stage) =>
    el('option', { value: stage.id, selected: stage.id === deal.stage_id }, stage.name)));
  stageSelect.addEventListener('change', async () => {
    try {
      await api.patch(`/api/deals/${deal.id}`, { stage_id: Number(stageSelect.value) });
      renderTimeline((await api.get(`/api/deals/${deal.id}`)).activities);
      toast(`Этап: ${findStage(stageSelect.value)?.name ?? ''}`);
      await onDone?.();
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  const panel = openPanel({
    title: deal.title,
    content: el('div', { style: 'display:grid;gap:14px' }, [
      el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px' }, [
        info('Бюджет', formatMoney(deal.amount, deal.currency)),
        info('Этап', stageSelect),
        info('Воронка', deal.pipeline_name),
        info('Тип клиента', LEAD_TYPE_LABELS[deal.lead_type]),
        info('Клиент', deal.contact_name || deal.company_name),
        info('Телефон', deal.contact_phone),
        info('Ответственный', deal.owner_name),
        info('Город', deal.city_name),
        info('Ожидаемое закрытие', formatDate(deal.expected_close_date)),
        info('Создана', formatDateTime(deal.created_at)),
      ]),
      el('div', {}, [
        el('div', { class: 'muted', style: 'font-size:11px', text: 'Рекламные кампании' }),
        deal.tags.length
          ? el('div', { class: 'tag-list', style: 'margin-top:4px' }, deal.tags.map((tag) => tagChip(tag)))
          : el('div', { class: 'muted', text: 'без кампании' }),
      ]),
      deal.notes ? info('Примечание', deal.notes) : null,
      el('div', {}, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' }, [
          el('div', { class: 'section-title', style: 'margin:0', text: 'Товары' }),
          items.addButton,
        ]),
        items.node,
      ]),
      el('div', {}, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' }, [
          el('div', { class: 'section-title', style: 'margin:0', text: 'Файлы' }),
          files.addButton,
        ]),
        files.node,
      ]),
      el('div', {}, [
        el('div', { class: 'section-title', text: `Задачи (${deal.tasks.length})` }),
        deal.tasks.length
          ? el('div', { style: 'display:grid;gap:5px' }, deal.tasks.map((task) =>
              el('div', { class: task.done ? 'muted' : '' }, `${task.done ? '✓' : '○'} ${task.title} · ${formatDate(task.due_date)}`)))
          : el('div', { class: 'muted', text: 'Задач нет' }),
      ]),
      el('div', {}, [
        el('div', { class: 'section-title', text: 'История' }),
        el('div', { style: 'display:flex;gap:8px;margin-bottom:12px' }, [typeSelect, noteInput,
          el('button', { class: 'btn', onclick: addNote }, 'Добавить')]),
        timeline,
      ]),
    ]),
    actions: [
      el('button', { class: 'btn secondary', title: 'Записать звонок по сделке', onclick: () => openForm({
        title: 'Записать звонок',
        fields: [
          { name: 'direction', label: 'Направление', type: 'select', value: 'out',
            options: [{ value: 'out', label: 'Исходящий' }, { value: 'in', label: 'Входящий' }] },
          { name: 'result', label: 'Результат', type: 'select', value: 'answered',
            options: [
              { value: 'answered', label: 'Разговор' }, { value: 'missed', label: 'Пропущенный' },
              { value: 'busy', label: 'Занято' }, { value: 'failed', label: 'Не дозвонились' },
            ] },
          { name: 'duration', label: 'Длительность, сек.', type: 'number', value: 60 },
          { name: 'phone', label: 'Номер', value: deal.contact_phone },
          { name: 'note', label: 'Заметка', type: 'textarea', width: 'full' },
        ],
        submitLabel: 'Записать',
        onSubmit: async (values) => {
          await api.post('/api/calls', { ...values, deal_id: deal.id, contact_id: deal.contact_id });
          toast('Звонок записан');
          renderTimeline((await api.get(`/api/deals/${deal.id}`)).activities);
          await onDone?.();
        },
      }) }, '☎ Звонок'),
      el('button', { class: 'btn secondary', title: 'Сводка и следующий шаг от AI-помощника', onclick: async (event) => {
        const button = event.target;
        button.disabled = true;
        try {
          const { text } = await api.post(`/api/ai/deals/${deal.id}/summary`, {});
          renderTimeline((await api.get(`/api/deals/${deal.id}`)).activities);
          openPanel({
            title: 'Сводка по сделке',
            content: el('div', { style: 'white-space:pre-wrap;line-height:1.5' }, text),
          });
          await onDone?.();
        } catch (error) {
          toast(error.message, 'error');
        } finally {
          button.disabled = false;
        }
      } }, '✨ Сводка AI'),
      el('button', { class: 'btn danger', onclick: async () => {
        if (!await confirmDialog('Удалить сделку вместе с её задачами и историей?')) return;
        await api.delete(`/api/deals/${deal.id}`);
        toast('Сделка удалена');
        panel.close();
        await onDone?.();
      } }, 'Удалить'),
      el('button', { class: 'btn secondary', onclick: () => { panel.close(); openDealForm(deal, onDone); } }, 'Редактировать'),
    ],
  });
}

/** Настройка воронки: этапы можно переименовать, добавить и удалить. */
function openPipelineSettings(pipeline, onDone) {
  const body = el('div', { style: 'display:grid;gap:10px' });

  const draw = () => {
    const rows = stagesOf(pipeline.id).map((stage) => {
      const input = el('input', { value: stage.name, style: 'flex:1' });
      const save = async () => {
        if (input.value.trim() === stage.name) return;
        try {
          await api.patch(`/api/stages/${stage.id}`, { name: input.value.trim() });
          await loadPipelines();
          toast('Этап переименован');
          await onDone?.();
        } catch (error) {
          toast(error.message, 'error');
          input.value = stage.name;
        }
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur(); });

      return el('div', { style: 'display:flex;gap:8px;align-items:center' }, [
        el('span', { style: `width:10px;height:26px;border-radius:3px;background:${stage.color ?? 'var(--accent)'}` }),
        input,
        el('span', { class: 'muted', style: 'width:70px;text-align:right', text: `${stage.deals_count} сдел.` }),
        stage.type === 'open'
          ? el('button', { class: 'btn ghost', title: 'Удалить этап', onclick: async () => {
              if (!await confirmDialog(`Удалить этап «${stage.name}»?`)) return;
              try {
                await api.delete(`/api/stages/${stage.id}`);
                await loadPipelines();
                draw();
                await onDone?.();
              } catch (error) {
                toast(error.message, 'error');
              }
            } }, '🗑')
          : el('span', { class: 'muted', style: 'width:28px;text-align:center', title: 'Системный этап', text: '🔒' }),
      ]);
    });

    const newStage = el('input', { placeholder: 'Название нового этапа', style: 'flex:1' });
    const addStage = async () => {
      const name = newStage.value.trim();
      if (!name) return;
      try {
        await api.post(`/api/pipelines/${pipeline.id}/stages`, { name });
        newStage.value = '';
        await loadPipelines();
        draw();
        toast('Этап добавлен');
        await onDone?.();
      } catch (error) {
        toast(error.message, 'error');
      }
    };
    newStage.addEventListener('keydown', (event) => { if (event.key === 'Enter') addStage(); });

    body.replaceChildren(
      el('div', { class: 'muted', text: 'Названия этапов меняются прямо в списке. Закрывающие этапы удалить нельзя.' }),
      ...rows,
      el('div', { style: 'display:flex;gap:8px;margin-top:6px' }, [
        newStage,
        el('button', { class: 'btn', onclick: addStage }, '+ Этап'),
      ]),
    );
  };
  draw();

  openPanel({ title: `Настройка воронки «${pipeline.name}»`, content: body });
}

function openPipelineForm(onDone) {
  openForm({
    title: 'Новая воронка',
    fields: [
      { name: 'name', label: 'Название воронки', required: true, width: 'full' },
      { name: 'stages', label: 'Этапы через запятую', width: 'full',
        value: 'Новая заявка, Принято в работу, Заказ оформлен' },
    ],
    onSubmit: async (values) => {
      const stages = String(values.stages ?? '').split(',').map((name) => name.trim()).filter(Boolean);
      const created = await api.post('/api/pipelines', { name: values.name, stages });
      await loadPipelines();
      setCurrentPipeline(created.id);
      toast('Воронка создана');
      await onDone?.();
    },
  });
}

export async function renderDeals(root, params = {}) {
  const board = el('div', { class: 'board' });
  const pipelineSelect = el('select', { class: 'pipeline-select' });
  const ownerSelect = el('select', { style: 'width:170px' });
  const typeSelect = el('select', { style: 'width:150px' }, [
    el('option', { value: '' }, 'Все клиенты'),
    el('option', { value: 'individual' }, 'Физические лица'),
    el('option', { value: 'company' }, 'Компании'),
  ]);
  const tagSelect = el('select', { style: 'width:170px' });
  const search = el('input', { class: 'search', placeholder: 'Поиск и фильтр' });
  const summary = el('span', { class: 'muted' });

  const drawPipelines = () => {
    pipelineSelect.replaceChildren(
      ...pipelineList().map((pipeline) => el('option', {
        value: pipeline.id,
        selected: pipeline.id === currentPipeline()?.id,
      }, pipeline.name)),
    );
  };

  const reload = async () => {
    const pipeline = currentPipeline();
    if (!pipeline) return;

    const data = await api.get('/api/deals/pipeline', {
      pipelineId: pipeline.id,
      ownerId: ownerSelect.value || undefined,
      leadType: typeSelect.value || undefined,
      tagIds: tagSelect.value || undefined,
      cityId: cityParam(),
      q: search.value.trim() || undefined,
    });
    board.replaceChildren(...data.stages.map((stage) => renderColumn(stage, reload)));

    const total = data.stages.reduce((sum, stage) => sum + stage.count, 0);
    const amount = data.stages.reduce((sum, stage) => sum + stage.amount, 0);
    summary.textContent = `${total} сделок: ${formatMoney(amount)}`;
  };

  const [users, tags] = await Promise.all([store.users(), store.tags()]);
  ownerSelect.append(el('option', { value: '' }, 'Все ответственные'),
    ...users.map((user) => el('option', { value: user.id }, user.name)));
  tagSelect.append(el('option', { value: '' }, 'Все кампании'),
    ...tags.map((tag) => el('option', { value: tag.id }, `#${tag.name}`)));
  drawPipelines();

  pipelineSelect.addEventListener('change', () => {
    setCurrentPipeline(pipelineSelect.value);
    reload();
  });
  for (const control of [ownerSelect, typeSelect, tagSelect]) control.addEventListener('change', reload);
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 250); });

  const refresh = async () => {
    await loadPipelines();
    drawPipelines();
    await reload();
  };

  root.append(
    el('div', { class: 'topbar' }, [
      el('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' }, [
        pipelineSelect,
        summary,
      ]),
      el('div', { class: 'toolbar' }, [
        search, typeSelect, tagSelect, ownerSelect,
        // Воронки общие для всех городов — перестраивает их администратор.
        store.isAdmin()
          ? el('button', { class: 'btn secondary', onclick: () => openPipelineSettings(currentPipeline(), refresh) }, 'НАСТРОИТЬ')
          : null,
        store.isAdmin()
          ? el('button', { class: 'btn secondary', title: 'Добавить воронку', onclick: () => openPipelineForm(refresh) }, '+ ВОРОНКА')
          : null,
        el('button', { class: 'btn', onclick: () => openDealForm(null, reload, currentPipeline()?.id) }, '+ НОВАЯ СДЕЛКА'),
      ]),
    ]),
    el('div', { class: 'content' }, [board]),
  );

  await reload();
  if (params.id) await openDealDetails(params.id, reload);
}

function renderColumn(stage, reload) {
  const items = el('div', { class: 'items' }, stage.items.map((deal) => renderCard(deal, reload)));

  const node = el('div', {
    class: 'column',
    dataset: { stage: String(stage.id), stageType: stage.type },
    style: `--stage-color:${stage.color ?? 'var(--accent)'}`,
  }, [
    el('header', {}, [
      el('div', { class: 'title' }, [el('span', { text: stage.name }), el('span', { class: 'muted', text: String(stage.count) })]),
      el('div', { class: 'sum', text: formatMoney(stage.amount) }),
    ]),
    items,
  ]);

  node.addEventListener('dragover', (event) => { event.preventDefault(); node.classList.add('drop-target'); });
  node.addEventListener('dragleave', () => node.classList.remove('drop-target'));
  node.addEventListener('drop', async (event) => {
    event.preventDefault();
    node.classList.remove('drop-target');
    const dealId = event.dataTransfer.getData('text/deal-id');
    const fromStage = event.dataTransfer.getData('text/deal-stage');
    if (!dealId || Number(fromStage) === stage.id) return;
    try {
      await api.patch(`/api/deals/${dealId}`, { stage_id: stage.id });
      toast(`Сделка перенесена: ${stage.name}`);
      await reload();
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  return node;
}

function renderCard(deal, reload) {
  const client = deal.contact_name || deal.company_name || 'Клиент не указан';

  const card = el('div', {
    class: 'deal-card',
    draggable: 'true',
    onclick: () => openDealDetails(deal.id, reload),
  }, [
    el('div', { class: 'title', text: deal.title }),
    el('div', { class: 'who', text: client + (deal.contact_phone ? ` · ${deal.contact_phone}` : '') }),
    el('div', { class: 'amount', text: formatMoney(deal.amount, deal.currency) }),
    deal.tags.length ? el('div', { class: 'tag-list', style: 'margin-top:6px' }, deal.tags.map((tag) => tagChip(tag))) : null,
    cityTag(deal),
    el('div', { class: 'row' }, [
      el('span', { class: 'muted', style: 'font-size:11px', text: formatDate(deal.expected_close_date) }),
      el('span', { class: 'owner', title: deal.owner_name ?? '', text: initials(deal.owner_name) }),
    ]),
  ]);

  card.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/deal-id', String(deal.id));
    event.dataTransfer.setData('text/deal-stage', String(deal.stage_id));
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  return card;
}
