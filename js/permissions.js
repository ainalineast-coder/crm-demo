/**
 * Роли доступа — как в EspoCRM.
 *
 * Для каждого раздела роль задаёт отдельно: можно ли создавать записи и чьи
 * записи сотрудник может смотреть, править и удалять — никакие, только свои,
 * своего города или всех городов. Править и удалять можно только то, что
 * видно. Кроме разделов роль задаёт доступ к полям (суммы, контакты клиентов),
 * выгрузку в CSV и кого можно назначать ответственным.
 */

// Охват по возрастанию: каждый следующий включает предыдущий.
// free — свои плюс свободные (без ответственного) записи своего города:
// менеджер видит новые заявки города, забирает их на себя и дальше видит только свои.
export const SCOPES = ['none', 'own', 'free', 'city', 'all'];
export const SCOPE_LABELS = {
  none: 'Нет', own: 'Только свои', free: 'Свои + свободные города', city: 'Свой город', all: 'Все города',
};
export const ACTIONS = ['read', 'edit', 'delete'];
export const ACTION_LABELS = { create: 'Создание', read: 'Просмотр', edit: 'Правка', delete: 'Удаление' };

/**
 * Разделы CRM. own — условие «запись моя» для охвата «Только свои»
 * (каждый «?» получает id сотрудника), free — «запись свободна» (без
 * ответственного), ownField — поле ответственного в готовой строке;
 * у товаров охвата нет — каталог общий; аналитика — только просмотр.
 */
const byField = (field) => ({
  ownField: field,
  own: (a) => `${a}.${field} = ?`,
  free: (a) => `${a}.${field} IS NULL`,
});

export const SECTIONS = {
  deals: { label: 'Сделки', table: 'deals', ...byField('owner_id') },
  contacts: { label: 'Контакты', table: 'contacts', ...byField('owner_id') },
  companies: { label: 'Компании', table: 'companies', ...byField('owner_id') },
  tasks: { label: 'Задачи', table: 'tasks', ...byField('assignee_id') },
  // Переписка «моя», если клиент или сделка закреплены за сотрудником,
  // и «свободна», если ни сделка, ни клиент ещё никому не отданы.
  chats: {
    label: 'imBox (WhatsApp)',
    table: 'chats',
    own: (a) => `(EXISTS (SELECT 1 FROM deals od WHERE od.id = ${a}.deal_id AND od.owner_id = ?)
                 OR EXISTS (SELECT 1 FROM contacts oc WHERE oc.id = ${a}.contact_id AND oc.owner_id = ?))`,
    free: (a) => `(NOT EXISTS (SELECT 1 FROM deals fd WHERE fd.id = ${a}.deal_id AND fd.owner_id IS NOT NULL)
                  AND NOT EXISTS (SELECT 1 FROM contacts fc WHERE fc.id = ${a}.contact_id AND fc.owner_id IS NOT NULL))`,
  },
  emails: { label: 'Почта', table: 'emails', ...byField('user_id') },
  calls: { label: 'Звонки', table: 'calls', ...byField('user_id') },
  products: { label: 'Товары', table: 'products', global: true },
  // Отчёты строятся по сделкам; «свои» — сделки сотрудника.
  analytics: { label: 'Аналитика и отчёты', table: 'deals', readOnly: true, ...byField('owner_id') },
};

/** Доступ к полям: суммы сделок и контакты клиентов можно скрыть или запретить менять. */
export const FIELD_GROUPS = {
  amounts: { label: 'Суммы: бюджеты сделок, итоги отчётов, планы' },
  contacts: { label: 'Телефоны и email клиентов' },
};
export const FIELD_LEVELS = ['hidden', 'read', 'edit'];
export const FIELD_LEVEL_LABELS = { hidden: 'Скрыты', read: 'Только видит', edit: 'Видит и меняет' };

// Кого можно назначить ответственным: только себя, коллег города, любого.
export const ASSIGN_SCOPES = ['own', 'city', 'all'];

const rank = (scope) => SCOPES.indexOf(scope);
const lowest = (a, b) => (rank(a) <= rank(b) ? a : b);

/** Права одного раздела одной строкой: { create, read, edit, delete } и для совместимости level/scope. */
function sectionAccess(section, { create, read, edit, del }) {
  const allowed = (value) => (section.global ? (value === 'none' ? 'none' : 'all') : value);
  const readScope = allowed(SCOPES.includes(read) ? read : 'none');
  // Править и удалять можно только то, что видно.
  const editScope = section.readOnly ? 'none' : lowest(allowed(SCOPES.includes(edit) ? edit : 'none'), readScope);
  const deleteScope = section.readOnly ? 'none' : lowest(allowed(SCOPES.includes(del) ? del : 'none'), readScope);
  const canCreate = !section.readOnly && readScope !== 'none' && Boolean(create);

  let level = 'none';
  if (deleteScope !== 'none') level = 'full';
  else if (editScope !== 'none' || canCreate) level = 'edit';
  else if (readScope !== 'none') level = 'read';
  return {
    create: canCreate, read: readScope, edit: editScope, delete: deleteScope,
    // Старое представление: уровень и охват просмотра.
    level, scope: readScope === 'none' ? 'own' : readScope,
  };
}

/** Прежний формат роли { level, scope } → новый по действиям. */
function fromLegacy({ level, scope }) {
  const target = ['own', 'city', 'all'].includes(scope) ? scope : 'city';
  return {
    create: level === 'edit' || level === 'full',
    read: level && level !== 'none' ? target : 'none',
    edit: level === 'edit' || level === 'full' ? target : 'none',
    del: level === 'full' ? target : 'none',
  };
}

export const DEFAULT_OPTIONS = { amounts: 'edit', contacts: 'edit', export: false, assign: 'city' };

/**
 * Приводит роль из базы или запроса к полному и допустимому виду:
 * { permissions: { раздел: {...} }, options: { amounts, contacts, export, assign } }.
 * Понимает и прежний формат с level/scope.
 */
export function normalizeRole(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const permissions = Object.fromEntries(Object.entries(SECTIONS).map(([key, section]) => {
    const entry = source[key] ?? {};
    const values = !('read' in entry) && 'level' in entry
      ? fromLegacy(entry)
      : { create: entry.create, read: entry.read, edit: entry.edit, del: entry.delete };
    return [key, sectionAccess(section, values)];
  }));

  const options = source.options ?? {};
  return {
    permissions,
    options: {
      amounts: FIELD_LEVELS.includes(options.amounts) ? options.amounts : DEFAULT_OPTIONS.amounts,
      contacts: FIELD_LEVELS.includes(options.contacts) ? options.contacts : DEFAULT_OPTIONS.contacts,
      export: Boolean(options.export),
      assign: ASSIGN_SCOPES.includes(options.assign) ? options.assign : DEFAULT_OPTIONS.assign,
    },
  };
}

export const normalizePermissions = (raw) => normalizeRole(raw).permissions;

export function parseRole(text) {
  try {
    return normalizeRole(JSON.parse(text ?? '{}'));
  } catch {
    return normalizeRole({});
  }
}

/** Права для хранения: разделы плюс options. */
export const serializeRole = ({ permissions, options }) => JSON.stringify({
  ...Object.fromEntries(Object.entries(permissions).map(([key, access]) => [key, {
    create: access.create, read: access.read, edit: access.edit, delete: access.delete,
  }])),
  options,
});

const every = (values) => Object.fromEntries(Object.keys(SECTIONS).map((key) => [key, values]));
const full = (scope) => ({ create: true, read: scope, edit: scope, delete: scope });

/** Администратор может всё во всех городах и видит все поля. */
export const ADMIN_ROLE = normalizeRole({
  ...every(full('all')),
  options: { amounts: 'edit', contacts: 'edit', export: true, assign: 'all' },
});

/** Роли, которые создаются в новой базе. Первая — роль менеджера по умолчанию. */
export const DEFAULT_ROLES = [
  {
    // Как в amoCRM: новые заявки города видят все менеджеры города, кто взял
    // заявку — тот её и ведёт, остальные её больше не видят.
    name: 'Менеджер — свои и свободные заявки',
    permissions: {
      ...every({ create: true, read: 'free', edit: 'own', delete: 'none' }),
      // Ответить в свободной переписке — значит взять заявку себе.
      chats: { create: true, read: 'free', edit: 'free', delete: 'none' },
      companies: { create: true, read: 'city', edit: 'own', delete: 'none' },
      products: { create: false, read: 'all', edit: 'none', delete: 'none' },
      analytics: { read: 'own' },
      options: { export: false, assign: 'own' },
    },
  },
  {
    name: 'Менеджер города — весь город',
    permissions: { ...every(full('city')), products: full('all'), options: { export: true, assign: 'city' } },
  },
  {
    // Классика EspoCRM: видит работу всего города, но правит только своё.
    name: 'Менеджер — видит город, правит свои',
    permissions: {
      ...every({ create: true, read: 'city', edit: 'own', delete: 'none' }),
      products: { create: false, read: 'all', edit: 'none', delete: 'none' },
      options: { export: false, assign: 'own' },
    },
  },
  {
    name: 'Стажёр',
    permissions: {
      ...every({ create: true, read: 'own', edit: 'own', delete: 'none' }),
      companies: { create: false, read: 'city', edit: 'none', delete: 'none' },
      emails: { read: 'none' },
      products: { read: 'all' },
      analytics: { read: 'none' },
      options: { amounts: 'read', export: false, assign: 'own' },
    },
  },
  {
    name: 'Руководитель — все города, только просмотр',
    permissions: {
      ...every({ create: false, read: 'all', edit: 'none', delete: 'none' }),
      options: { amounts: 'read', contacts: 'read', export: true, assign: 'own' },
    },
  },
];

/** Создаёт роли по умолчанию, если их ещё нет. */
export function createDefaultRoles(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM roles').get();
  if (count > 0) return false;
  const insert = db.prepare('INSERT INTO roles (name, permissions, position) VALUES (?, ?, ?)');
  DEFAULT_ROLES.forEach((role, index) => {
    insert.run(role.name, serializeRole(normalizeRole(role.permissions)), index);
  });
  return true;
}

/** Роль менеджера по умолчанию — первая по порядку. */
export const defaultRoleId = (db) =>
  db.prepare('SELECT id FROM roles ORDER BY position, id LIMIT 1').get()?.id ?? null;
