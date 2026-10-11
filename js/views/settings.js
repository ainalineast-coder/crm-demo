import { api } from '../api.js';
import { store } from '../store.js';
import { confirmDialog, el, formatDateTime, openForm, toast } from '../ui.js';

/** Настройки (только администратор): города, сотрудники, каналы (WhatsApp, Instagram, Telegram), почта, AI. */
export async function renderSettings(root) {
  const content = el('div', { class: 'content stack' });

  const field = (name, label, value, { type = 'text', hint = '', options = null, secret = false } = {}) => {
    const input = options
      ? el('select', { name }, options.map((option) => el('option', {
          value: option.value, selected: String(option.value) === String(value ?? ''),
        }, option.label)))
      : el('input', {
          name, type,
          value: secret ? '' : (value ?? ''),
          placeholder: secret && value ? '•••••••• (сохранён)' : '',
        });

    return el('div', { class: 'field' }, [
      el('label', { text: label }),
      input,
      hint ? el('div', { class: 'muted', style: 'font-size:11px;margin-top:3px', text: hint }) : null,
    ]);
  };

  const section = (title, subtitle, status, fields, onSave) => {
    const form = el('div', { class: 'fields-row' }, fields);
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        title,
        status
          ? el('span', {
              class: status.ready ? 'badge' : 'badge prio-high',
              style: 'font-weight:400',
              text: status.ready ? 'подключено' : `не настроено: ${status.missing.join(', ')}`,
            })
          : null,
      ]),
      el('div', { class: 'card-body', style: 'display:grid;gap:12px' }, [
        subtitle ? el('div', { class: 'muted', text: subtitle }) : null,
        form,
        el('div', {}, el('button', {
          class: 'btn',
          onclick: async () => {
            const values = {};
            for (const input of form.querySelectorAll('input, select')) {
              if (input.type === 'password' && input.value === '') continue;
              values[input.name] = input.value;
            }
            try {
              await onSave(values);
              toast('Настройки сохранены');
              await reload();
            } catch (error) {
              toast(error.message, 'error');
            }
          },
        }, 'Сохранить')),
      ]),
    ]);
  };

  const copyRow = (label, value) => {
    const input = el('input', { value, readonly: 'readonly' });
    return el('div', { class: 'field' }, [
      el('label', { text: label }),
      el('div', { style: 'display:flex;gap:6px' }, [
        input,
        el('button', {
          class: 'btn secondary',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast('Адрес скопирован');
            } catch {
              input.select();
              toast('Скопируйте адрес вручную');
            }
          },
        }, 'Копировать'),
      ]),
    ]);
  };

  const save = (values) => api.patch('/api/settings', values);

  const ADMIN_LABEL = 'Администратор — всё, все города';
  const PROVIDERS = [
    { value: 'none', label: 'Не подключён' },
    { value: 'wazzup', label: 'Wazzup' },
    { value: 'meta', label: 'WhatsApp Cloud API (Meta)' },
    { value: 'custom', label: 'Другой шлюз (HTTP)' },
  ];

  const statusBadge = (status) => el('span', {
    class: status.ready ? 'badge' : 'badge prio-high',
    text: status.ready ? 'подключено' : `не настроено: ${status.missing.join(', ')}`,
  });

  const cityOptions = (cities, emptyLabel) => [{ value: '', label: emptyLabel }]
    .concat(cities.map((city) => ({ value: city.id, label: city.name })));

  const run = async (action, message) => {
    try {
      await action();
      if (message) toast(message);
      store.invalidate('users', 'cities');
      await reload();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  /** Города: менеджер города видит только его заявки и переписку. */
  const citiesCard = (cities) => {
    const newCity = el('input', { placeholder: 'Название города', style: 'max-width:240px' });
    const add = () => {
      const name = newCity.value.trim();
      if (name) run(() => api.post('/api/cities', { name }), `Город «${name}» добавлен`);
    };
    newCity.addEventListener('keydown', (event) => { if (event.key === 'Enter') add(); });

    return el('div', { class: 'card' }, [
      el('div', { class: 'card-head', text: 'Города' }),
      el('div', { class: 'card-body', style: 'display:grid;gap:12px' }, [
        el('div', { class: 'muted', text: 'Город сотрудника определяет «свои города» в его роли. Администратор видит все города.' }),
        el('div', { class: 'table-wrap' }, el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Город', 'Сотрудников', 'Сделок', 'Каналов', '']
            .map((title, index) => el('th', { class: index && index < 4 ? 'num' : '', text: title })))]),
          el('tbody', {}, cities.length ? cities.map((city) => {
            const input = el('input', { value: city.name, style: 'max-width:220px' });
            input.addEventListener('change', () => run(
              () => api.patch(`/api/cities/${city.id}`, { name: input.value.trim() }), 'Город переименован',
            ));
            return el('tr', {}, [
              el('td', {}, input),
              el('td', { class: 'num', text: String(city.users_count) }),
              el('td', { class: 'num', text: String(city.deals_count) }),
              el('td', { class: 'num', text: String(city.channels_count) }),
              el('td', { class: 'actions' }, el('button', {
                class: 'btn ghost', title: 'Удалить город',
                onclick: async () => {
                  if (!await confirmDialog(`Удалить город «${city.name}»?`)) return;
                  run(() => api.delete(`/api/cities/${city.id}`), 'Город удалён');
                },
              }, '🗑')),
            ]);
          }) : [el('tr', {}, [el('td', { colspan: '5' }, el('div', { class: 'empty', text: 'Городов пока нет' }))])]),
        ])),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
          newCity,
          el('button', { class: 'btn', onclick: add }, '+ Город'),
        ]),
      ]),
    ]);
  };

  /**
   * Роли доступа — как в EspoCRM: по каждому разделу можно ли создавать
   * и чьи записи смотреть, править и удалять; плюс доступ к полям и выгрузке.
   */
  const SCOPE_RANK = ['none', 'own', 'free', 'city', 'all'];
  const narrower = (a, b) => (SCOPE_RANK.indexOf(a) <= SCOPE_RANK.indexOf(b) ? a : b);

  // Шаблоны в один клик: дальше любую клетку можно поменять вручную.
  const PRESETS = [
    { label: 'Только просмотр своего города', make: () => ({ create: false, read: 'city', edit: 'none', delete: 'none' }) },
    { label: 'Свои и свободные заявки', make: () => ({ create: true, read: 'free', edit: 'own', delete: 'none' }) },
    { label: 'Весь свой город', make: () => ({ create: true, read: 'city', edit: 'city', delete: 'city' }) },
    { label: 'Всё во всех городах', make: () => ({ create: true, read: 'all', edit: 'all', delete: 'all' }) },
  ];

  const roleEditor = (role, meta) => {
    const scopeOptions = (section, value, allowNone = true) => {
      const options = section.global
        ? [{ key: 'none', label: 'Нет' }, { key: 'all', label: 'Да' }]
        : meta.scopes.filter((item) => allowNone || item.key !== 'none');
      return options.map((item) => el('option', { value: item.key, selected: item.key === value }, item.label));
    };

    const rows = meta.sections.map((section) => {
      const current = role?.permissions?.[section.key] ?? { create: false, read: 'none', edit: 'none', delete: 'none' };
      const create = el('input', { type: 'checkbox', style: 'width:auto', checked: current.create,
        'aria-label': `${section.label}: создание` });
      const make = (action) => el('select', { 'aria-label': `${section.label}: ${action}` },
        scopeOptions(section, current[action]));
      const read = make('read');
      const edit = make('edit');
      const remove = make('delete');

      // Править и удалять — не шире, чем видно; без просмотра и создавать нечего.
      const sync = () => {
        edit.value = narrower(edit.value, read.value);
        remove.value = narrower(remove.value, read.value);
        create.disabled = read.value === 'none';
        if (create.disabled) create.checked = false;
      };
      for (const control of [read, edit, remove]) control.addEventListener('change', sync);
      sync();

      const set = (values) => {
        read.value = section.global && values.read !== 'none' ? 'all' : values.read;
        edit.value = section.global && values.edit !== 'none' ? 'all' : values.edit;
        remove.value = section.global && values.delete !== 'none' ? 'all' : values.delete;
        create.checked = values.create;
        sync();
      };
      return { section, create, read, edit, remove, set };
    });

    const options = role?.options ?? { amounts: 'edit', contacts: 'edit', export: false, assign: 'own' };
    const pick = (list, value, label) => el('select', { 'aria-label': label },
      list.map((item) => el('option', { value: item.key, selected: item.key === value }, item.label)));
    const amounts = pick(meta.fieldLevels, options.amounts, 'Суммы');
    const contacts = pick(meta.fieldLevels, options.contacts, 'Контакты клиентов');
    const assign = pick(meta.assignScopes, options.assign, 'Кого назначать ответственным');
    const exportAllowed = el('input', { type: 'checkbox', style: 'width:auto', checked: options.export });

    const cell = (row, control) => (row.section.readOnly && control !== row.read ? el('span', { class: 'muted', text: '—' }) : control);

    return {
      node: el('div', { style: 'display:grid;gap:14px' }, [
        el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center' }, [
          el('span', { class: 'muted', text: 'Шаблон для всех разделов:' }),
          ...PRESETS.map((preset) => el('button', {
            type: 'button', class: 'btn chip',
            onclick: () => rows.forEach((row) => row.set(row.section.readOnly
              ? { ...preset.make(), create: false, edit: 'none', delete: 'none' }
              : preset.make())),
          }, preset.label)),
        ]),
        el('div', { class: 'table-wrap' }, el('table', { class: 'role-matrix' }, [
          el('thead', {}, [el('tr', {}, ['Раздел', 'Создание', 'Просмотр', 'Правка', 'Удаление']
            .map((title) => el('th', { text: title })))]),
          el('tbody', {}, rows.map((row) => el('tr', {}, [
            el('td', {}, el('strong', { text: row.section.label })),
            el('td', {}, cell(row, row.create)),
            el('td', {}, row.read),
            el('td', {}, cell(row, row.edit)),
            el('td', {}, cell(row, row.remove)),
          ]))),
        ])),
        el('div', { class: 'muted', style: 'font-size:12px' },
          '«Свои + свободные города» — свои записи и новые заявки города без ответственного: их видят все такие менеджеры, кто взял — тот и ведёт.'),
        el('div', { class: 'fields-row' }, [
          el('div', { class: 'field' }, [el('label', { text: meta.fieldGroups[0].label }), amounts]),
          el('div', { class: 'field' }, [el('label', { text: meta.fieldGroups[1].label }), contacts]),
          el('div', { class: 'field' }, [el('label', { text: 'Кого можно назначать ответственным' }), assign]),
          el('label', { class: 'field', style: 'display:flex;gap:8px;align-items:center;margin-top:18px' },
            [exportAllowed, 'Может выгружать отчёты в CSV']),
        ]),
      ]),
      read: () => ({
        permissions: Object.fromEntries(rows.map((row) => [row.section.key, {
          create: row.create.checked, read: row.read.value, edit: row.edit.value, delete: row.remove.value,
        }])),
        options: {
          amounts: amounts.value, contacts: contacts.value, assign: assign.value, export: exportAllowed.checked,
        },
      }),
    };
  };

  const roleForm = (role, meta) => {
    const matrix = roleEditor(role, meta);
    openForm({
      title: role ? `Роль — ${role.name}` : 'Новая роль',
      fields: [
        { name: 'name', label: 'Название роли', required: true, value: role?.name, width: 'full' },
        { name: 'access', type: 'custom', width: 'full', node: matrix.node, read: matrix.read },
      ],
      onSubmit: async ({ name, access }) => {
        const payload = { name, ...access };
        if (role) await api.patch(`/api/roles/${role.id}`, payload);
        else await api.post('/api/roles', payload);
        toast(role ? 'Права роли сохранены — действуют сразу' : 'Роль создана');
        await reload();
      },
    });
  };

  const rolesCard = (roles) => el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      'Роли и доступ',
      el('button', { class: 'btn', onclick: () => roleForm(null, roles) }, '+ Роль'),
    ]),
    el('div', { class: 'card-body', style: 'display:grid;gap:12px' }, [
      el('div', { class: 'muted', text: 'Роль задаёт по каждому разделу, можно ли создавать записи и чьи записи сотрудник может смотреть, править и удалять: свои, свои и свободные заявки города, весь город или все города. Ещё — можно ли видеть суммы и контакты клиентов и выгружать отчёты. Роль назначается сотруднику ниже; для одного сотрудника можно настроить личный доступ.' }),
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Роль', 'Кратко', 'Сотрудников', '']
          .map((title, index) => el('th', { class: index === 2 ? 'num' : '', text: title })))]),
        el('tbody', {}, roles.items.map((role) => el('tr', {}, [
          el('td', {}, el('strong', { text: role.name })),
          el('td', { class: 'muted', text: roleSummary(role, roles) }),
          el('td', { class: 'num', text: String(role.users_count) }),
          el('td', { class: 'actions' }, [
            el('button', { class: 'btn ghost', title: 'Настроить права', onclick: () => roleForm(role, roles) }, '✎'),
            el('button', { class: 'btn ghost', title: 'Сделать копию', onclick: async () => {
              try {
                const copy = await api.post(`/api/roles/${role.id}/copy`, {});
                toast(`Создана «${copy.name}»`);
                await reload();
                roleForm(copy, roles);
              } catch (error) {
                toast(error.message, 'error');
              }
            } }, '⧉'),
            el('button', { class: 'btn ghost', title: 'Удалить роль', onclick: async () => {
              if (!await confirmDialog(`Удалить роль «${role.name}»?`)) return;
              run(() => api.delete(`/api/roles/${role.id}`), 'Роль удалена');
            } }, '🗑'),
          ]),
        ]))),
      ])),
    ]),
  ]);

  /** Коротко: что со сделками, что закрыто, что со скрытыми полями и выгрузкой. */
  const roleSummary = (role, meta) => {
    const scopes = { none: 'нет', own: 'свои', free: 'свои и свободные', city: 'весь город', all: 'все города' };
    const deals = role.permissions.deals;
    const parts = [
      `Сделки: видит ${scopes[deals.read]}, правит ${scopes[deals.edit]}${deals.delete !== 'none' ? `, удаляет ${scopes[deals.delete]}` : ''}`,
    ];
    const closed = meta.sections.filter((section) => role.permissions[section.key].read === 'none').map((section) => section.label);
    if (closed.length) parts.push(`нет доступа: ${closed.join(', ')}`);
    if (role.options.amounts === 'hidden') parts.push('суммы скрыты');
    if (role.options.contacts === 'hidden') parts.push('контакты клиентов скрыты');
    parts.push(role.options.export ? 'выгрузка разрешена' : 'без выгрузки');
    return parts.join(' · ');
  };

  /** Сотрудники: роль доступа и город определяют, что человек видит. */
  const accessOptions = (roles) => [{ value: 'admin', label: ADMIN_LABEL }]
    .concat(roles.items.map((role) => ({ value: `role:${role.id}`, label: role.name })));

  const userForm = (user, cities, roles) => openForm({
    title: user ? `Сотрудник — ${user.name}` : 'Новый сотрудник',
    fields: [
      { name: 'name', label: 'Имя', required: true, value: user?.name },
      { name: 'email', label: 'Email для входа', required: true, value: user?.email },
      { name: 'access', label: 'Роль доступа', type: 'select',
        value: user?.role === 'admin' ? 'admin' : `role:${user?.role_id ?? roles.items[0]?.id ?? ''}`,
        options: accessOptions(roles) },
      { name: 'city_id', label: 'Город', type: 'select', value: user?.city_id ?? '',
        options: cityOptions(cities, '— не выбран —') },
      { name: 'password', label: user ? 'Новый пароль (если меняете)' : 'Пароль', type: 'password', required: !user },
      user ? { name: 'active', label: 'Доступ открыт', type: 'checkbox', value: Boolean(user.active) } : null,
    ].filter(Boolean),
    onSubmit: async (values) => {
      const { access, ...payload } = values;
      payload.role = access === 'admin' ? 'admin' : 'manager';
      payload.role_id = access === 'admin' ? null : Number(String(access).replace('role:', ''));
      if (payload.role === 'manager' && !payload.city_id) {
        const error = new Error('Укажите город: от него зависят заявки «своего города»');
        error.details = { city_id: 'Выберите город' };
        throw error;
      }
      if (!payload.password) delete payload.password;
      if (user) await api.patch(`/api/users/${user.id}`, payload);
      else await api.post('/api/users', payload);
      toast(user ? 'Сотрудник сохранён' : 'Сотрудник добавлен');
      store.invalidate('users', 'cities');
      await reload();
    },
  });

  /** Личный доступ: копия роли сотрудника под его именем — настраивается, не задевая коллег. */
  const personalAccess = async (user, roles) => {
    try {
      const role = await api.post('/api/roles/personal', { user_id: user.id });
      await reload();
      roleForm(role, roles);
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  /** Войти как сотрудник — проверить, что он видит. Вернуться — кнопкой в шапке. */
  const loginAs = async (user) => {
    if (!await confirmDialog(`Открыть CRM глазами сотрудника «${user.name}»? Вернуться к себе можно кнопкой вверху страницы.`,
      { confirmLabel: 'Войти как сотрудник', danger: false })) return;
    try {
      await api.post(`/api/users/${user.id}/login-as`, {});
      location.hash = '#/deals';
      location.reload();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const usersCard = (users, cities, roles) => el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      'Сотрудники',
      el('button', { class: 'btn', onclick: () => userForm(null, cities, roles) }, '+ Сотрудник'),
    ]),
    el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Имя', 'Email', 'Роль', 'Город', 'Статус', '']
        .map((title) => el('th', { text: title })))]),
      el('tbody', {}, users.map((user) => el('tr', {}, [
        el('td', {}, el('strong', { text: user.name })),
        el('td', { class: 'muted', text: user.email }),
        el('td', { text: user.role === 'admin' ? ADMIN_LABEL : (user.role_name ?? 'роль не назначена — нет доступа') }),
        el('td', { text: user.role === 'admin' ? 'все города' : (user.city_name ?? '— не выбран —') }),
        el('td', { text: user.active ? 'активен' : 'отключён' }),
        el('td', { class: 'actions' }, [
          el('button', { class: 'btn ghost', title: 'Изменить', onclick: () => userForm(user, cities, roles) }, '✎'),
          user.role !== 'admin'
            ? el('button', { class: 'btn ghost', title: 'Личный доступ — настроить права только этому сотруднику',
                onclick: () => personalAccess(user, roles) }, '🔑')
            : null,
          user.role !== 'admin' && user.active
            ? el('button', { class: 'btn ghost', title: 'Войти как сотрудник — посмотреть его глазами',
                onclick: () => loginAs(user) }, '👁')
            : null,
        ]),
      ]))),
    ])),
  ]);

  /** Журнал входов: кто, когда и откуда входил, неудачные попытки. */
  const authLogCard = (log) => el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, ['Журнал входов', el('span', { class: 'muted', style: 'font-weight:400', text: 'последние 200' })]),
    el('div', { class: 'table-wrap', style: 'max-height:340px;overflow:auto' }, el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Когда', 'Сотрудник', 'Результат', 'IP'].map((title) => el('th', { text: title })))]),
      el('tbody', {}, log.items.length ? log.items.map((entry) => el('tr', {}, [
        el('td', { class: 'muted', text: formatDateTime(entry.created_at) }),
        el('td', { text: entry.user_name ?? entry.email ?? '—' }),
        el('td', {}, el('span', {
          class: entry.success ? 'badge' : 'badge prio-high',
          text: entry.success ? (entry.reason ?? 'вход') : `не вошёл: ${entry.reason ?? 'ошибка'}`,
        })),
        el('td', { class: 'muted', text: entry.ip ?? '—' }),
      ])) : [el('tr', {}, [el('td', { colspan: '4' }, el('div', { class: 'empty', text: 'Входов пока не было' }))])]),
    ])),
  ]);

  /** Каналы: номера WhatsApp, Instagram и Telegram. У каждого города может быть свой. */
  const KINDS = [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'telegram', label: 'Telegram' },
  ];
  const KIND_ICONS = { whatsapp: '🟢', instagram: '📸', telegram: '✈️' };
  const accountOf = (item) => {
    if (!item.phone) return item.channelId;
    if (item.kind === 'whatsapp') return `+${item.phone}`;
    return item.kind === 'instagram' ? `@${item.phone}` : item.phone;
  };

  /** Поиск каналов в аккаунте Wazzup: выбор канала заполняет его ID и мессенджер. */
  const wazzupPicker = (channel) => {
    const list = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' });
    const find = async (event) => {
      const form = event.target.closest('form');
      const token = form.querySelector('input[name=token]').value.trim();
      event.target.disabled = true;
      try {
        const { items } = await api.post('/api/channels/wazzup/channels', token ? { token } : { channel_id: channel?.id });
        list.replaceChildren(...(items.length ? items.map((item) => el('button', {
          type: 'button', class: 'btn chip',
          onclick: (choice) => {
            form.querySelector('input[name=phone_id]').value = item.channelId;
            form.querySelector('select[name=kind]').value = item.kind ?? 'whatsapp';
            const phone = form.querySelector('input[name=phone]');
            if (!phone.value && item.phone) phone.value = accountOf(item);
            for (const chip of list.children) chip.classList.toggle('on', chip === choice.currentTarget);
          },
        }, `${KIND_ICONS[item.kind] ?? ''} ${accountOf(item)}${item.state && item.state !== 'active' ? ` (${item.state})` : ''}`))
          : [el('span', { class: 'muted', text: 'В аккаунте Wazzup нет каналов WhatsApp, Instagram или Telegram' })]));
      } catch (error) {
        const message = error.details ? Object.values(error.details).join('. ') : error.message;
        list.replaceChildren(el('span', { style: 'color:var(--red)', text: message }));
      } finally {
        event.target.disabled = false;
      }
    };
    return {
      node: el('div', { style: 'display:grid;gap:6px' }, [
        el('div', {}, el('button', { type: 'button', class: 'btn secondary', onclick: find }, 'Найти каналы в аккаунте Wazzup')),
        list,
      ]),
      read: () => undefined,
    };
  };

  const channelForm = (channel, cities) => {
    const picker = wazzupPicker(channel);
    return openForm({
    title: channel ? `Канал — ${channel.name}` : 'Новый канал',
    fields: [
      { name: 'name', label: 'Название', required: true, value: channel?.name ?? '' },
      { name: 'kind', label: 'Мессенджер', type: 'select', value: channel?.kind ?? 'whatsapp', options: KINDS },
      { name: 'phone', label: 'Номер телефона или @аккаунт', value: channel?.phone },
      { name: 'city_id', label: 'Город', type: 'select', value: channel?.city_id ?? '',
        options: cityOptions(cities, '— общий, заявки у владельца —') },
      { name: 'provider', label: 'Шлюз', type: 'select', value: channel?.provider ?? 'none', options: PROVIDERS },
      { name: 'token', label: channel?.has_token
        ? 'Ключ API Wazzup или токен Meta (сохранён — введите новый, чтобы заменить)'
        : 'Ключ API Wazzup или токен Meta', type: 'password' },
      { name: 'phone_id', label: 'ID канала Wazzup или phone_number_id Meta', value: channel?.phone_id },
      { name: 'wazzup', label: 'Для Wazzup: введите ключ и выберите канал', type: 'custom', width: 'full',
        node: picker.node, read: picker.read },
      { name: 'api_url', label: 'Адрес API (только для своего шлюза)', value: channel?.api_url, width: 'full' },
      channel ? { name: 'active', label: 'Канал включён', type: 'checkbox', value: Boolean(channel.active) } : null,
    ].filter(Boolean),
    onSubmit: async (values) => {
      const { wazzup, ...payload } = values;
      if (!payload.token) delete payload.token;
      if (channel) await api.patch(`/api/channels/${channel.id}`, payload);
      else await api.post('/api/channels', payload);
      toast(channel ? 'Канал сохранён' : 'Канал добавлен');
      store.invalidate('cities');
      await reload();
    },
    });
  };

  /** Wazzup сам не знает адрес CRM — сообщаем его одной кнопкой. */
  const connectWazzup = async (channel, button) => {
    button.disabled = true;
    try {
      await api.post(`/api/channels/${channel.id}/wazzup/webhook`, {});
      toast('Приём сообщений из Wazzup подключён');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };

  const channelsCard = (channels, cities) => el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      'Каналы: WhatsApp, Instagram, Telegram',
      el('button', { class: 'btn', onclick: () => channelForm(null, cities) }, '+ Канал'),
    ]),
    el('div', { class: 'card-body', style: 'display:grid;gap:14px' }, [
      el('div', { class: 'muted', text: 'Сообщения, пришедшие в канал, попадают в imBox его города, ответ клиенту уходит из того же канала. Канал без города (например, один Instagram на все города) — заявки видит владелец и передаёт городу, указав город в сделке. Wazzup: в карточке канала (✎) выберите шлюз Wazzup, введите ключ API, найдите и выберите канал, сохраните и нажмите «Подключить приём сообщений». Instagram и Telegram подключаются только через Wazzup.' }),
      ...(channels.length ? channels.map((channel) => el('div', { class: 'channel-row' }, [
        el('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center' }, [
          el('div', {}, [
            el('strong', { text: `${KIND_ICONS[channel.kind] ?? ''} ${channel.name}` }),
            el('span', { class: 'muted', text: ` · ${channel.phone ?? 'не указан'} · ${channel.city_name ?? 'общий, у владельца'}` }),
          ]),
          el('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, [
            statusBadge(channel.status),
            channel.provider === 'wazzup' && channel.has_token
              ? el('button', { class: 'btn secondary', title: 'Wazzup будет присылать входящие сообщения в CRM',
                  onclick: (event) => connectWazzup(channel, event.currentTarget) }, 'Подключить приём сообщений')
              : null,
            el('button', { class: 'btn ghost', title: 'Изменить', onclick: () => channelForm(channel, cities) }, '✎'),
            el('button', { class: 'btn ghost', title: 'Удалить канал', onclick: async () => {
              if (!await confirmDialog(`Удалить канал «${channel.name}»? Переписки останутся.`)) return;
              run(() => api.delete(`/api/channels/${channel.id}`), 'Канал удалён');
            } }, '🗑'),
          ]),
        ]),
        copyRow('Вебхук этого канала', channel.webhook_url),
      ])) : [el('div', { class: 'empty', text: 'Каналы не добавлены' })]),
    ]),
  ]);

  async function reload() {
    const [data, users, cities, channels, roles, log] = await Promise.all([
      api.get('/api/settings'), store.users(), store.cities(true), api.get('/api/channels'), api.get('/api/roles'),
      api.get('/api/users/auth-log'),
    ]);
    const { settings, channels: status, webhooks } = data;

    content.replaceChildren(
      citiesCard(cities),
      rolesCard(roles),
      usersCard(users, cities, roles),
      authLogCard(log),
      channelsCard(channels.items, cities),

      section('Почта (SMTP)', 'Исходящие письма уходят с этого ящика; входящие принимает вебхук почтового сервиса.',
        status.email, [
          field('smtp_host', 'Сервер', settings.smtp_host, { hint: 'например, smtp.yandex.ru' }),
          field('smtp_port', 'Порт', settings.smtp_port, { hint: '587 — обычный, 465 — SSL' }),
          field('smtp_secure', 'Шифрование SSL', settings.smtp_secure, {
            options: [{ value: 'false', label: 'STARTTLS (587)' }, { value: 'true', label: 'SSL (465)' }],
          }),
          field('smtp_user', 'Логин', settings.smtp_user),
          field('smtp_password', 'Пароль', settings.smtp_password, { type: 'password', secret: true }),
          field('smtp_from', 'Отправитель', settings.smtp_from, { hint: 'Адрес в поле «От кого»' }),
        ], save),

      section('AI-помощник', 'Готовит сводку по сделке и черновик ответа клиенту. Нужен ключ API — он хранится только в вашей базе.',
        { ready: settings.ai_api_key, missing: ['ключ API'] }, [
          field('ai_api_key', 'Ключ API', settings.ai_api_key, { type: 'password', secret: true }),
          field('ai_model', 'Модель', settings.ai_model, { hint: 'по умолчанию claude-opus-5-5' }),
        ], save),

      el('div', { class: 'card' }, [
        el('div', { class: 'card-head', text: 'Адреса для интеграций' }),
        el('div', { class: 'card-body', style: 'display:grid;gap:12px' }, [
          el('div', { class: 'muted' },
            'Адрес вебхука почты укажите в почтовом сервисе. Адреса WhatsApp, Instagram и Telegram — у каждого канала в разделе «Каналы».'),
          copyRow('Вебхук почты', webhooks.email),
          el('div', { class: 'fields-row' }, [
            field('webhook_secret', 'Секрет вебхука', settings.webhook_secret, {
              type: 'password', secret: true,
              hint: 'Передаётся в заголовке X-Webhook-Secret; для Meta — это verify token',
            }),
          ]),
          el('div', {}, el('button', {
            class: 'btn',
            onclick: async (event) => {
              const input = event.target.closest('.card-body').querySelector('input[name=webhook_secret]');
              if (!input.value) return toast('Введите секрет', 'error');
              await save({ webhook_secret: input.value });
              toast('Секрет сохранён');
              await reload();
            },
          }, 'Сохранить секрет')),
        ]),
      ]),
    );
  }

  root.append(
    el('div', { class: 'topbar' }, [el('h1', { text: 'Настройки' })]),
    content,
  );

  await reload();
}
