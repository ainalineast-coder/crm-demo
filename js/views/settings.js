import { api } from '../api.js';
import { store } from '../store.js';
import { confirmDialog, el, openForm, toast } from '../ui.js';

/** Настройки (только администратор): города, сотрудники, номера WhatsApp, почта, AI. */
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
          el('thead', {}, [el('tr', {}, ['Город', 'Сотрудников', 'Сделок', 'Номеров WhatsApp', '']
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

  /** Роли доступа: по каждому разделу уровень и чьи записи видны — как в EspoCRM. */
  const roleEditor = (role, meta) => {
    const rows = meta.sections.map((section) => {
      const current = role?.permissions?.[section.key] ?? { level: 'none', scope: 'city' };
      const level = el('select', { 'aria-label': `${section.label}: доступ` },
        meta.levels
          .filter((item) => !section.readOnly || ['none', 'read'].includes(item.key))
          .map((item) => el('option', { value: item.key, selected: item.key === current.level }, item.label)));
      const scope = el('select', { 'aria-label': `${section.label}: чьи записи`, disabled: section.global },
        meta.scopes.map((item) => el('option', { value: item.key, selected: item.key === current.scope }, item.label)));
      // Без доступа охват не важен — делаем его неактивным, чтобы не путать.
      const sync = () => { scope.disabled = section.global || level.value === 'none'; };
      level.addEventListener('change', sync);
      sync();
      return { section, level, scope };
    });

    return {
      node: el('div', { class: 'table-wrap' }, el('table', { class: 'role-matrix' }, [
        el('thead', {}, [el('tr', {}, ['Раздел', 'Что можно делать', 'Чьи записи видны']
          .map((title) => el('th', { text: title })))]),
        el('tbody', {}, rows.map(({ section, level, scope }) => el('tr', {}, [
          el('td', {}, el('strong', { text: section.label })),
          el('td', {}, level),
          el('td', {}, section.global ? el('span', { class: 'muted', text: 'общий каталог' }) : scope),
        ]))),
      ])),
      read: () => Object.fromEntries(rows.map(({ section, level, scope }) => [
        section.key, { level: level.value, scope: scope.value },
      ])),
    };
  };

  const roleForm = (role, meta) => {
    const matrix = roleEditor(role, meta);
    openForm({
      title: role ? `Роль — ${role.name}` : 'Новая роль',
      fields: [
        { name: 'name', label: 'Название роли', required: true, value: role?.name, width: 'full' },
        { name: 'permissions', type: 'custom', width: 'full', node: matrix.node, read: matrix.read },
      ],
      onSubmit: async (values) => {
        if (role) await api.patch(`/api/roles/${role.id}`, values);
        else await api.post('/api/roles', values);
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
      el('div', { class: 'muted', text: 'Роль задаёт для каждого раздела, что сотрудник может делать (нет доступа, только просмотр, просмотр и правка или полный — с удалением) и чьи записи ему видны (только свои, своего города или всех городов). Роль назначается сотруднику ниже.' }),
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Роль', 'Кратко', 'Сотрудников', '']
          .map((title, index) => el('th', { class: index === 2 ? 'num' : '', text: title })))]),
        el('tbody', {}, roles.items.map((role) => el('tr', {}, [
          el('td', {}, el('strong', { text: role.name })),
          el('td', { class: 'muted', text: roleSummary(role, roles) }),
          el('td', { class: 'num', text: String(role.users_count) }),
          el('td', { class: 'actions' }, [
            el('button', { class: 'btn ghost', title: 'Настроить права', onclick: () => roleForm(role, roles) }, '✎'),
            el('button', { class: 'btn ghost', title: 'Удалить роль', onclick: async () => {
              if (!await confirmDialog(`Удалить роль «${role.name}»?`)) return;
              run(() => api.delete(`/api/roles/${role.id}`), 'Роль удалена');
            } }, '🗑'),
          ]),
        ]))),
      ])),
    ]),
  ]);

  /** «Сделки: редактирование, свой город · Почта: нет доступа…» — коротко по разделам. */
  const roleSummary = (role, meta) => {
    const short = { none: 'нет', read: 'просмотр', edit: 'правка', full: 'полный' };
    const scopes = { own: 'свои', city: 'город', all: 'все города' };
    return meta.sections.map((section) => {
      const access = role.permissions[section.key];
      const scope = access.level === 'none' || section.global ? '' : `, ${scopes[access.scope]}`;
      return `${section.label}: ${short[access.level]}${scope}`;
    }).join(' · ');
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
        el('td', { class: 'actions' }, el('button', { class: 'btn ghost', onclick: () => userForm(user, cities, roles) }, '✎')),
      ]))),
    ])),
  ]);

  /** Номера WhatsApp: у каждого города свой номер и свой шлюз. */
  const channelForm = (channel, cities) => openForm({
    title: channel ? `Номер — ${channel.name}` : 'Новый номер WhatsApp',
    fields: [
      { name: 'name', label: 'Название', required: true, value: channel?.name ?? '', width: 'full' },
      { name: 'phone', label: 'Номер телефона', value: channel?.phone },
      { name: 'city_id', label: 'Город', type: 'select', value: channel?.city_id ?? '',
        options: cityOptions(cities, '— общий, только администратору —') },
      { name: 'provider', label: 'Шлюз', type: 'select', value: channel?.provider ?? 'none', options: PROVIDERS },
      { name: 'phone_id', label: 'Идентификатор номера (phone_number_id)', value: channel?.phone_id },
      { name: 'token', label: channel?.has_token ? 'Токен доступа (сохранён — введите новый, чтобы заменить)' : 'Токен доступа',
        type: 'password' },
      { name: 'api_url', label: 'Адрес API', value: channel?.api_url, width: 'full' },
      channel ? { name: 'active', label: 'Номер включён', type: 'checkbox', value: Boolean(channel.active) } : null,
    ].filter(Boolean),
    onSubmit: async (values) => {
      const payload = { ...values };
      if (!payload.token) delete payload.token;
      if (channel) await api.patch(`/api/channels/${channel.id}`, payload);
      else await api.post('/api/channels', payload);
      toast(channel ? 'Номер сохранён' : 'Номер добавлен');
      store.invalidate('cities');
      await reload();
    },
  });

  const channelsCard = (channels, cities) => el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      'Номера WhatsApp',
      el('button', { class: 'btn', onclick: () => channelForm(null, cities) }, '+ Номер'),
    ]),
    el('div', { class: 'card-body', style: 'display:grid;gap:14px' }, [
      el('div', { class: 'muted', text: 'Сообщения, пришедшие на номер, попадают в imBox его города. Ответ клиенту уходит с того же номера. Для каждого номера укажите у провайдера свой адрес вебхука.' }),
      ...(channels.length ? channels.map((channel) => el('div', { class: 'channel-row' }, [
        el('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center' }, [
          el('div', {}, [
            el('strong', { text: channel.name }),
            el('span', { class: 'muted', text: ` · ${channel.phone ?? 'номер не указан'} · ${channel.city_name ?? 'общий номер'}` }),
          ]),
          el('div', { style: 'display:flex;gap:6px;align-items:center' }, [
            statusBadge(channel.status),
            el('button', { class: 'btn ghost', title: 'Изменить', onclick: () => channelForm(channel, cities) }, '✎'),
            el('button', { class: 'btn ghost', title: 'Удалить номер', onclick: async () => {
              if (!await confirmDialog(`Удалить номер «${channel.name}»? Переписки останутся.`)) return;
              run(() => api.delete(`/api/channels/${channel.id}`), 'Номер удалён');
            } }, '🗑'),
          ]),
        ]),
        copyRow('Вебхук этого номера', channel.webhook_url),
      ])) : [el('div', { class: 'empty', text: 'Номера не добавлены' })]),
    ]),
  ]);

  async function reload() {
    const [data, users, cities, channels, roles] = await Promise.all([
      api.get('/api/settings'), store.users(), store.cities(true), api.get('/api/channels'), api.get('/api/roles'),
    ]);
    const { settings, channels: status, webhooks } = data;

    content.replaceChildren(
      citiesCard(cities),
      rolesCard(roles),
      usersCard(users, cities, roles),
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
            'Адрес вебхука почты укажите в почтовом сервисе. Адреса WhatsApp — у каждого номера в разделе «Номера WhatsApp».'),
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
