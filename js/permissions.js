/**
 * Роли доступа — как в EspoCRM: администратор задаёт для каждого раздела,
 * что сотрудник может делать (уровень) и чьи записи ему видны (охват).
 */

// Уровни по возрастанию: каждый следующий включает предыдущий.
export const LEVELS = ['none', 'read', 'edit', 'full'];
export const LEVEL_LABELS = {
  none: 'Нет доступа',
  read: 'Только просмотр',
  edit: 'Просмотр и правка',
  full: 'Полный, с удалением',
};

export const SCOPES = ['own', 'city', 'all'];
export const SCOPE_LABELS = { own: 'Только свои', city: 'Свой город', all: 'Все города' };

/**
 * Разделы CRM. own — условие «запись моя» для охвата «Только свои»
 * (каждый «?» получает id сотрудника); у товаров охвата нет — каталог общий.
 */
export const SECTIONS = {
  deals: { label: 'Сделки', table: 'deals', own: (a) => `${a}.owner_id = ?` },
  contacts: { label: 'Контакты', table: 'contacts', own: (a) => `${a}.owner_id = ?` },
  companies: { label: 'Компании', table: 'companies', own: (a) => `${a}.owner_id = ?` },
  tasks: { label: 'Задачи', table: 'tasks', own: (a) => `${a}.assignee_id = ?` },
  // Переписка «моя», если клиент или сделка закреплены за сотрудником.
  chats: {
    label: 'imBox (WhatsApp)',
    table: 'chats',
    own: (a) => `(EXISTS (SELECT 1 FROM deals od WHERE od.id = ${a}.deal_id AND od.owner_id = ?)
                 OR EXISTS (SELECT 1 FROM contacts oc WHERE oc.id = ${a}.contact_id AND oc.owner_id = ?))`,
  },
  emails: { label: 'Почта', table: 'emails', own: (a) => `${a}.user_id = ?` },
  calls: { label: 'Звонки', table: 'calls', own: (a) => `${a}.user_id = ?` },
  products: { label: 'Товары', table: 'products', global: true },
  // Отчёты строятся по сделкам; «свои» — сделки сотрудника.
  analytics: { label: 'Аналитика и отчёты', table: 'deals', own: (a) => `${a}.owner_id = ?`, readOnly: true },
};

const all = (level, scope) => Object.fromEntries(Object.keys(SECTIONS).map((key) => [key, { level, scope }]));

/** Роли, которые создаются в новой базе. Первая — роль менеджера по умолчанию. */
export const DEFAULT_ROLES = [
  {
    name: 'Менеджер города',
    permissions: all('full', 'city'),
  },
  {
    name: 'Стажёр',
    permissions: {
      ...all('edit', 'own'),
      companies: { level: 'read', scope: 'city' },
      emails: { level: 'none', scope: 'own' },
      products: { level: 'read', scope: 'all' },
      analytics: { level: 'none', scope: 'own' },
    },
  },
  {
    name: 'Руководитель — все города, только просмотр',
    permissions: all('read', 'all'),
  },
];

/** Приводит права из базы или запроса к полному и допустимому виду. */
export function normalizePermissions(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(Object.entries(SECTIONS).map(([key, section]) => {
    const entry = source[key] ?? {};
    let level = LEVELS.includes(entry.level) ? entry.level : 'none';
    if (section.readOnly && level !== 'none') level = 'read';
    const scope = section.global ? 'all' : (SCOPES.includes(entry.scope) ? entry.scope : 'city');
    return [key, { level, scope }];
  }));
}

export const parsePermissions = (text) => {
  try {
    return normalizePermissions(JSON.parse(text ?? '{}'));
  } catch {
    return normalizePermissions({});
  }
};

/** Администратор может всё во всех городах. */
export const ADMIN_PERMISSIONS = normalizePermissions(all('full', 'all'));

/** Создаёт роли по умолчанию, если их ещё нет. */
export function createDefaultRoles(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM roles').get();
  if (count > 0) return false;
  const insert = db.prepare('INSERT INTO roles (name, permissions, position) VALUES (?, ?, ?)');
  DEFAULT_ROLES.forEach((role, index) => {
    insert.run(role.name, JSON.stringify(normalizePermissions(role.permissions)), index);
  });
  return true;
}

/** Роль менеджера по умолчанию — первая по порядку. */
export const defaultRoleId = (db) =>
  db.prepare('SELECT id FROM roles ORDER BY position, id LIMIT 1').get()?.id ?? null;
