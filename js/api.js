/**
 * Мок серверного API для демо-версии: те же адреса и формат ответов,
 * что и у настоящего бэкенда, но всё считается в браузере.
 * Экраны приложения используют этот модуль вместо public/js/api.js.
 */
import { USERS, buildDataset } from './demo-data.js';
// Права и подписи — из того же файла, что и на сервере (src/lib/permissions.js).
import {
  ADMIN_PERMISSIONS, LEVELS, LEVEL_LABELS, SCOPES, SCOPE_LABELS, SECTIONS, normalizePermissions,
} from './permissions.js';
// Константы берём из того же файла, что и сервер (src/lib/pipelines.js).
import { CURRENCIES, LEAD_TYPES, STAGE_COLORS, buildStages, normalizeTag } from './stage-constants.js';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details ?? null;
  }
}

export const setUnauthorizedHandler = () => {};

// При переключении «Смотреть как» данные демо переносятся через перезагрузку,
// чтобы можно было поменять права роли и сразу увидеть CRM глазами сотрудника.
// Обычное обновление страницы возвращает исходные демо-данные.
const DEMO_DB_KEY = 'crm.demoDb';
const restoreDb = () => {
  try {
    const saved = sessionStorage.getItem(DEMO_DB_KEY);
    sessionStorage.removeItem(DEMO_DB_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};
const db = restoreDb() ?? buildDataset();
const DEMO_USER = db.users[0];

// Демо открывается уже авторизованным. Переключатель «Смотреть как» на странице
// запоминает выбранного сотрудника, чтобы показать CRM глазами менеджера города.
const DEMO_USER_KEY = 'crm.demoUser';
const savedUser = () => {
  try {
    const email = sessionStorage.getItem(DEMO_USER_KEY);
    return db.users.find((user) => user.email === email) ?? null;
  } catch {
    return null;
  }
};
let session = savedUser() ?? DEMO_USER;

/** Сотрудники для переключателя «Смотреть как» на демо-странице. */
export const demoAccounts = () => USERS.map((user) => ({
  email: user.email,
  current: user.email === session?.email,
  label: `${user.name.split(' ')[0]} — ${user.demoLabel}`,
}));

/** Перезагружает демо от имени другого сотрудника (данные демо при этом сбрасываются). */
export function viewAs(email) {
  try {
    sessionStorage.setItem(DEMO_USER_KEY, email);
    sessionStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
  } catch {
    // Без хранилища выбор не переживёт перезагрузку — входим вручную.
    session = db.users.find((user) => user.email === email) ?? session;
  }
  location.reload();
}

const TAG_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

const stageById = (id) => byId(db.stages, id);
const stagesOfPipeline = (pipelineId) => db.stages
  .filter((stage) => stage.pipeline_id === Number(pipelineId))
  .sort((a, b) => a.position - b.position || a.id - b.id);
const isOpen = (deal) => stageById(deal.stage_id)?.type === 'open';
const stageType = (deal) => stageById(deal.stage_id)?.type ?? 'open';
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const byId = (list, id) => list.find((item) => item.id === Number(id));
const like = (value, query) => String(value ?? '').toLowerCase().includes(query.toLowerCase());
const percent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

const userName = (id) => byId(db.users, id)?.name ?? null;
const cityName = (id) => byId(db.cities, id)?.name ?? null;

// --- Права доступа: те же правила, что на сервере (src/lib/scope.js) ---
const isAdmin = () => session?.role === 'admin';
const roleOf = (user) => (user?.role === 'admin' ? null : byId(db.roles, user?.role_id));
const permissionsOf = (user) => (user?.role === 'admin'
  ? ADMIN_PERMISSIONS
  : normalizePermissions(roleOf(user)?.permissions));
const access = (section) => permissionsOf(session)[section] ?? { level: 'none', scope: 'own' };
const can = (section, need = 'read') => LEVELS.indexOf(access(section).level) >= LEVELS.indexOf(need);
const assertAccess = (section, need = 'read') => {
  if (can(section, need)) return;
  const what = need === 'read' ? 'нет доступа' : `нужен уровень «${LEVEL_LABELS[need]}»`;
  throw new ApiError(403, `Раздел «${SECTIONS[section].label}»: ${what}`);
};

// «Моя запись» для охвата «Только свои».
const OWN = {
  deals: (row) => row.owner_id === session?.id,
  contacts: (row) => row.owner_id === session?.id,
  companies: (row) => row.owner_id === session?.id,
  tasks: (row) => row.assignee_id === session?.id,
  chats: (row) => byId(db.deals, row.deal_id)?.owner_id === session?.id
    || byId(db.contacts, row.contact_id)?.owner_id === session?.id,
  emails: (row) => row.user_id === session?.id,
  calls: (row) => row.user_id === session?.id,
  analytics: (row) => row.owner_id === session?.id,
};
const requestedCity = (params = {}) => (row) => {
  if (params.cityId === 'none') return (row.city_id ?? null) === null;
  if (Number(params.cityId) > 0) return row.city_id === Number(params.cityId);
  return true;
};
/** Фильтр записей раздела по уровню и охвату роли (и выбранному городу). */
const inScope = (section, params = {}) => (row) => {
  if (!row) return false;
  const { level, scope } = access(section);
  if (level === 'none') return false;
  if (scope === 'all' || SECTIONS[section].global) return requestedCity(params)(row);
  if (scope === 'city') return (row.city_id ?? null) === (session?.city_id ?? null);
  return OWN[section](row);
};
const seesAllCities = () => isAdmin() || Object.entries(permissionsOf(session))
  .some(([key, item]) => !SECTIONS[key]?.global && item.level !== 'none' && item.scope === 'all');
/** Сотрудники в списках и отчётах раздела: свои / коллеги города / все. */
const peopleIn = (section, params = {}) => (user) => {
  const { level, scope } = access(section);
  if (level === 'none') return false;
  if (isAdmin() || scope === 'all') return requestedCity(params)(user);
  if (scope === 'city') return (user.city_id ?? null) === (session?.city_id ?? null);
  return user.id === session?.id;
};
const usersIn = (params = {}) => (user) => (seesAllCities()
  ? requestedCity(params)(user)
  : (user.city_id ?? null) === (session?.city_id ?? null));
const channelsIn = (params = {}) => (channel) => (isAdmin() || access('chats').scope === 'all'
  ? requestedCity(params)(channel)
  : (channel.city_id ?? null) === (session?.city_id ?? null));
const visible = (section, id, message = 'Не найдено') => {
  const row = byId(db[section], id);
  if (!inScope(section)(row)) throw new ApiError(404, message);
  return row;
};
const requireAdmin = () => {
  if (!isAdmin()) throw new ApiError(403, 'Недостаточно прав');
};
/** Ответственный: «все города» — любой, «свой город» — коллега, «только свои» — только сам. */
const assignable = (section, userId, field = 'owner_id') => {
  const user = byId(db.users, userId);
  const { scope } = access(section);
  const allowed = user && (isAdmin() || scope === 'all' || user.id === session?.id
    || (scope === 'city' && (user.city_id ?? null) === (session?.city_id ?? null)));
  if (!allowed) {
    throw new ApiError(400, 'Ошибка валидации', {
      [field]: scope === 'own' ? 'Можно назначить только себя' : 'Сотрудник не найден в вашем городе',
    });
  }
  return user;
};
/** Ссылки на сделку, контакт, компанию: город первой найденной записи. */
const linkedCity = (body) => {
  let city;
  for (const [field, section, message] of [['deal_id', 'deals', 'Сделка не найдена'],
    ['contact_id', 'contacts', 'Контакт не найден'], ['company_id', 'companies', 'Компания не найдена']]) {
    if (!body?.[field]) continue;
    const row = visible(section, body[field], message);
    if (city === undefined) city = row.city_id ?? null;
  }
  return city;
};
const parentSection = (row) => (row.deal_id ? 'deals' : row.contact_id ? 'contacts' : row.company_id ? 'companies' : 'deals');
const checkCity = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (!byId(db.cities, value)) throw new ApiError(400, 'Ошибка валидации', { city_id: 'Город не найден' });
  return Number(value);
};
const canMoveCity = (section) => isAdmin() || access(section).scope === 'all';
/** Город новой записи: при охвате «все города» — указанный, связанной записи или ответственного. */
const cityForNew = (section, { requested, linked, owner } = {}) => {
  if (!canMoveCity(section)) return session?.city_id ?? null;
  if (requested !== undefined) return checkCity(requested);
  if (linked !== undefined) return linked;
  if (owner?.city_id) return owner.city_id;
  return isAdmin() ? null : (session?.city_id ?? null);
};

/** Уровень доступа по адресу и методу — проверяется до обработчика, как middleware на сервере. */
const NEED_BY_METHOD = { GET: 'read', POST: 'edit', PUT: 'edit', PATCH: 'edit', DELETE: 'full' };
const GUARDS = [
  [/^\/api\/deals\/\d+\/items/, 'deals', (method) => (method === 'GET' ? 'read' : 'edit')],
  [/^\/api\/deals/, 'deals'],
  [/^\/api\/contacts/, 'contacts'],
  [/^\/api\/companies/, 'companies'],
  [/^\/api\/tasks/, 'tasks'],
  [/^\/api\/chats/, 'chats'],
  [/^\/api\/emails/, 'emails'],
  [/^\/api\/calls/, 'calls'],
  [/^\/api\/products/, 'products'],
  [/^\/api\/(reports|events|goals)/, 'analytics', () => 'read'],
  [/^\/api\/tags/, 'deals', (method) => (method === 'GET' ? null : NEED_BY_METHOD[method])],
  [/^\/api\/ai\/deals/, 'deals', () => 'edit'],
  [/^\/api\/ai\/chats/, 'chats', () => 'read'],
];
function guard(method, path) {
  const rule = GUARDS.find(([pattern]) => pattern.test(path));
  if (!rule || !session) return;
  const need = rule[2] ? rule[2](method) : NEED_BY_METHOD[method];
  if (need) assertAccess(rule[1], need);
}
const roleView = (role) => ({
  ...role,
  permissions: normalizePermissions(role.permissions),
  users_count: db.users.filter((user) => user.role === 'manager' && user.role_id === role.id).length,
});
const userView = (user) => ({
  ...user,
  city_name: cityName(user.city_id),
  role_id: user.role === 'admin' ? null : (user.role_id ?? null),
  role_name: user.role === 'admin' ? 'Администратор' : (roleOf(user)?.name ?? 'Роль не назначена'),
  permissions: permissionsOf(user),
});
const channelStatus = (channel) => (channel.active
  ? { provider: 'demo', ready: false, missing: ['демо-режим: сообщения не уходят наружу'] }
  : { provider: channel.provider, ready: false, missing: ['номер отключён'] });
const channelView = (channel) => ({
  ...channel,
  city_name: cityName(channel.city_id),
  status: channelStatus(channel),
  ...(isAdmin() ? { webhook_url: `https://ваш-адрес/api/webhooks/whatsapp?channel=${channel.id}` } : {}),
});
const companyName = (id) => byId(db.companies, id)?.name ?? null;

const contactOf = (id) => byId(db.contacts, id);
const contactFullName = (contact) =>
  (contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : null);

const tagsOfDeal = (dealId) => db.dealTags
  .filter((link) => link.deal_id === dealId)
  .map((link) => byId(db.tags, link.tag_id))
  .filter(Boolean)
  .map((tag) => ({ id: tag.id, name: tag.name, title: tag.title, color: tag.color }))
  .sort((a, b) => a.name.localeCompare(b.name));

const dealView = (deal) => {
  const contact = contactOf(deal.contact_id);
  const stage = stageById(deal.stage_id);
  return {
    ...deal,
    stage_name: stage?.name ?? null,
    stage_type: stage?.type ?? null,
    stage_color: stage?.color ?? null,
    pipeline_name: byId(db.pipelines, deal.pipeline_id)?.name ?? null,
    city_name: cityName(deal.city_id),
    company_name: companyName(deal.company_id),
    owner_name: userName(deal.owner_id),
    contact_name: contactFullName(contact),
    contact_phone: contact?.phone ?? null,
    contact_email: contact?.email ?? null,
    tags: tagsOfDeal(deal.id),
  };
};

const contactView = (contact) => ({
  ...contact,
  company_name: companyName(contact.company_id),
  owner_name: userName(contact.owner_id),
  city_name: cityName(contact.city_id),
});

const companyView = (company) => ({
  ...company,
  owner_name: userName(company.owner_id),
  city_name: cityName(company.city_id),
  contacts_count: db.contacts.filter((contact) => contact.company_id === company.id).length,
  deals_count: db.deals.filter((deal) => deal.company_id === company.id).length,
});

const taskView = (task) => ({
  ...task,
  assignee_name: userName(task.assignee_id),
  city_name: cityName(task.city_id),
  deal_title: byId(db.deals, task.deal_id)?.title ?? null,
  company_name: companyName(task.company_id),
});

const activityView = (activity) => ({
  ...activity,
  user_name: userName(activity.user_id),
  deal_title: byId(db.deals, activity.deal_id)?.title ?? null,
  company_name: companyName(activity.company_id),
});

const required = (body, field, message = 'Обязательное поле') => {
  const value = body?.[field];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new ApiError(400, 'Ошибка валидации', { [field]: message });
  }
  return String(value).trim();
};

const toNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
};

/** Ставит сделке набор хэштегов: принимает и идентификаторы, и имена. */
function setDealTags(dealId, tags) {
  db.dealTags = db.dealTags.filter((link) => link.deal_id !== dealId);
  for (const item of tags ?? []) {
    if (item === null || item === undefined || item === '') continue;
    const tag = /^\d+$/.test(String(item)) ? byId(db.tags, item) : ensureTag(item);
    if (tag && !db.dealTags.some((link) => link.deal_id === dealId && link.tag_id === tag.id)) {
      db.dealTags.push({ deal_id: dealId, tag_id: tag.id });
    }
  }
}

function ensureTag(rawName) {
  const name = normalizeTag(rawName);
  if (!name) throw new ApiError(400, 'Пустой хэштег');
  if (!/^[a-zа-яё0-9_-]+$/i.test(name)) {
    throw new ApiError(400, 'Ошибка валидации', { name: 'Только буквы, цифры, дефис и подчёркивание' });
  }
  const existing = db.tags.find((tag) => tag.name === name);
  if (existing) return existing;

  const tag = {
    id: db.nextId.tag++, name, title: null,
    color: TAG_COLORS[db.tags.length % TAG_COLORS.length], active: 1, created_at: now(),
  };
  db.tags.push(tag);
  return tag;
}

const itemsOf = (dealId) => db.dealItems
  .filter((item) => item.deal_id === dealId)
  .map((item) => ({ ...item, amount: item.price * item.quantity, sku: byId(db.products, item.product_id)?.sku ?? null }));

/** Бюджет сделки — сумма её позиций. */
function syncDealAmount(dealId) {
  const total = itemsOf(dealId).reduce((sum, item) => sum + item.amount, 0);
  const deal = byId(db.deals, dealId);
  if (deal) deal.amount = total;
  return total;
}

const callView = (call) => ({
  ...call,
  user_name: userName(call.user_id),
  deal_title: byId(db.deals, call.deal_id)?.title ?? null,
  contact_name: contactFullName(contactOf(call.contact_id)),
});

const chatView = (chat) => ({
  ...chat,
  contact_name: contactFullName(contactOf(chat.contact_id)),
  deal_title: byId(db.deals, chat.deal_id)?.title ?? null,
  channel_name: byId(db.channels, chat.channel_id)?.name ?? null,
  channel_phone: byId(db.channels, chat.channel_id)?.phone ?? null,
  city_name: cityName(chat.city_id),
  last_message: db.chatMessages.filter((message) => message.chat_id === chat.id).at(-1)?.body ?? null,
  messages_count: db.chatMessages.filter((message) => message.chat_id === chat.id).length,
});

/** Журнал событий демо пополняется теми же действиями, что и в рабочей CRM. */
function logEvent(event) {
  db.events.push({
    id: db.nextId.event++,
    entity_type: event.entity_type, entity_id: event.entity_id ?? null,
    entity_name: event.entity_name ?? null, action: event.action,
    field: event.field ?? null, old_value: event.old_value ?? null, new_value: event.new_value ?? null,
    user_id: session?.id ?? DEMO_USER.id, city_id: event.city_id ?? null, created_at: now(),
  });
}

const tagView = (tag) => ({
  ...tag,
  leads_count: db.dealTags.filter((link) => link.tag_id === tag.id && inScope('deals')(byId(db.deals, link.deal_id))).length,
});

const parseTagIds = (params) => String(params.tagIds ?? '')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

function filterDeals(params, section = 'deals') {
  const tagIds = parseTagIds(params);
  const city = inScope(section, params);
  return db.deals.filter((deal) => {
    if (!city(deal)) return false;
    if (params.pipelineId && deal.pipeline_id !== Number(params.pipelineId)) return false;
    if (params.stageId && deal.stage_id !== Number(params.stageId)) return false;
    if (params.leadType && deal.lead_type !== params.leadType) return false;
    if (params.ownerId && deal.owner_id !== Number(params.ownerId)) return false;
    if (params.companyId && deal.company_id !== Number(params.companyId)) return false;
    if (params.open === 'true' && !isOpen(deal)) return false;
    if (params.from && deal.created_at.slice(0, 10) < params.from) return false;
    if (params.to && deal.created_at.slice(0, 10) > params.to) return false;
    if (tagIds.length && !db.dealTags.some((link) => link.deal_id === deal.id && tagIds.includes(link.tag_id))) {
      return false;
    }
    if (params.q) {
      const contact = contactOf(deal.contact_id);
      const haystack = [deal.title, companyName(deal.company_id), contactFullName(contact), contact?.phone];
      if (!haystack.some((value) => like(value, params.q))) return false;
    }
    return true;
  });
}

/** Отчёт по рекламным кампаниям — та же логика, что и на сервере. */
function campaignsReport(params) {
  const DAY = 86_400_000;
  const toISO = (date) => date.toISOString().slice(0, 10);
  const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''));

  let to = isDate(params.to) ? params.to : toISO(new Date());
  let from = isDate(params.from) ? params.from : toISO(new Date(Date.now() - 29 * DAY));
  if (from > to) [from, to] = [to, from];

  // Отчёты считаются в охвате раздела «Аналитика».
  const deals = filterDeals({ ...params, from, to }, 'analytics');
  const measure = (list) => ({
    leads: list.length,
    won: list.filter((deal) => stageType(deal) === 'won').length,
    lost: list.filter((deal) => stageType(deal) === 'lost').length,
    inProgress: list.filter((deal) => stageType(deal) === 'open').length,
    amount: list.reduce((sum, deal) => sum + deal.amount, 0),
    wonAmount: list.filter((deal) => stageType(deal) === 'won').reduce((sum, deal) => sum + deal.amount, 0),
  });

  const totals = measure(deals);
  totals.conversion = percent(totals.won, totals.won + totals.lost);

  const groups = new Map();
  for (const deal of deals) {
    const tags = tagsOfDeal(deal.id);
    const keys = tags.length ? tags.map((tag) => tag.id) : [0];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(deal);
    }
  }

  const campaigns = [...groups.entries()].map(([tagId, list]) => {
    const tag = tagId ? byId(db.tags, tagId) : null;
    return {
      tagId: tag?.id ?? null,
      name: tag?.name ?? null,
      title: tag?.title ?? null,
      color: tag?.color ?? null,
      label: tag ? `#${tag.name}` : 'Без кампании',
      ...measure(list),
      conversion: percent(measure(list).won, measure(list).won + measure(list).lost),
    };
  }).sort((a, b) => b.leads - a.leads || String(a.name).localeCompare(String(b.name)));

  const byDay = [];
  for (let time = Date.parse(from); time <= Date.parse(to); time += DAY) {
    const date = toISO(new Date(time));
    const ofDay = deals.filter((deal) => deal.created_at.slice(0, 10) === date);
    const byTag = {};
    for (const deal of ofDay) {
      const tags = tagsOfDeal(deal.id);
      const keys = tags.length ? tags.map((tag) => tag.id) : [0];
      for (const key of keys) byTag[key] = (byTag[key] ?? 0) + 1;
    }
    byDay.push({
      date,
      leads: ofDay.length,
      won: ofDay.filter((deal) => stageType(deal) === 'won').length,
      lost: ofDay.filter((deal) => stageType(deal) === 'lost').length,
      amount: ofDay.reduce((sum, deal) => sum + deal.amount, 0),
      byTag,
    });
  }

  const pipelineId = params.pipelineId ?? db.pipelines[0].id;
  const byStage = stagesOfPipeline(pipelineId).map((stage) => {
    const list = deals.filter((deal) => deal.stage_id === stage.id);
    return {
      id: stage.id, name: stage.name, color: stage.color, type: stage.type,
      count: list.length, amount: list.reduce((sum, deal) => sum + deal.amount, 0),
    };
  });

  const cityGroups = new Map();
  for (const deal of deals) {
    if (!cityGroups.has(deal.city_id ?? null)) cityGroups.set(deal.city_id ?? null, []);
    cityGroups.get(deal.city_id ?? null).push(deal);
  }
  const byCity = [...cityGroups.entries()].map(([cityId, list]) => {
    const measured = measure(list);
    return {
      cityId, name: cityName(cityId) ?? 'Без города', ...measured,
      conversion: percent(measured.won, measured.won + measured.lost),
    };
  }).sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));

  return { from, to, tagIds: parseTagIds(params), totals, campaigns, byDay, byStage, byCity };
}

const ROUTES = [
  ['GET', /^\/api\/auth\/me$/, () => {
    if (!session) throw new ApiError(401, 'Требуется авторизация');
    return { user: userView(session) };
  }],
  ['POST', /^\/api\/auth\/login$/, (_m, body) => {
    const user = db.users.find((item) => item.email === String(body.email ?? '').toLowerCase());
    if (!user) throw new ApiError(401, 'Неверный email или пароль');
    session = user;
    return { user: userView(user), token: 'demo' };
  }],
  ['POST', /^\/api\/auth\/logout$/, () => { session = null; return null; }],

  ['GET', /^\/api\/users$/, (_m, _b, params) => ({
    items: db.users.filter(usersIn(params)).map(userView).sort((a, b) => a.name.localeCompare(b.name)),
  })],

  ['POST', /^\/api\/users$/, (_m, body) => {
    requireAdmin();
    const email = required(body, 'email').toLowerCase();
    if (db.users.some((user) => user.email === email)) throw new ApiError(409, 'Такой email уже есть');
    const role = body.role === 'admin' ? 'admin' : 'manager';
    const user = {
      id: db.nextId.user++, name: required(body, 'name'), email, role, city_id: checkCity(body.city_id),
      // Менеджер без явной роли получает роль по умолчанию — «Менеджер города».
      role_id: role === 'admin' ? null : (byId(db.roles, body.role_id)?.id ?? db.roles[0]?.id ?? null),
      active: 1, created_at: now(),
    };
    required(body, 'password');
    db.users.push(user);
    return userView(user);
  }],

  ['PATCH', /^\/api\/users\/(\d+)$/, (match, body) => {
    requireAdmin();
    const user = byId(db.users, match[1]);
    if (!user) throw new ApiError(404, 'Пользователь не найден');
    if (user.id === session.id && (body.role === 'manager' || body.active === false)) {
      throw new ApiError(400, 'Нельзя снять права администратора или отключить самого себя');
    }
    for (const field of ['name', 'email', 'role']) if (body[field]) user[field] = body[field];
    if (Object.hasOwn(body, 'city_id')) user.city_id = checkCity(body.city_id);
    if (Object.hasOwn(body, 'role_id')) {
      if (body.role_id && !byId(db.roles, body.role_id)) throw new ApiError(400, 'Ошибка валидации', { role_id: 'Роль не найдена' });
      user.role_id = body.role_id ? Number(body.role_id) : null;
    }
    if (user.role === 'manager' && !user.role_id) user.role_id = db.roles[0]?.id ?? null;
    if (Object.hasOwn(body, 'active')) user.active = body.active ? 1 : 0;
    return userView(user);
  }],

  // --- Роли доступа (только администратор) ---
  ['GET', /^\/api\/roles$/, () => {
    requireAdmin();
    return {
      items: db.roles.map(roleView),
      sections: Object.entries(SECTIONS).map(([key, section]) => ({
        key, label: section.label, global: Boolean(section.global), readOnly: Boolean(section.readOnly),
      })),
      levels: LEVELS.map((key) => ({ key, label: LEVEL_LABELS[key] })),
      scopes: SCOPES.map((key) => ({ key, label: SCOPE_LABELS[key] })),
    };
  }],

  ['POST', /^\/api\/roles$/, (_m, body) => {
    requireAdmin();
    const name = required(body, 'name');
    if (db.roles.some((role) => role.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, `Роль «${name}» уже есть`);
    const role = { id: db.nextId.role++, name, permissions: normalizePermissions(body.permissions), created_at: now() };
    db.roles.push(role);
    return roleView(role);
  }],

  ['PATCH', /^\/api\/roles\/(\d+)$/, (match, body) => {
    requireAdmin();
    const role = byId(db.roles, match[1]);
    if (!role) throw new ApiError(404, 'Роль не найдена');
    if (body.name) role.name = String(body.name).trim();
    if (body.permissions) role.permissions = normalizePermissions(body.permissions);
    return roleView(role);
  }],

  ['DELETE', /^\/api\/roles\/(\d+)$/, (match) => {
    requireAdmin();
    const role = byId(db.roles, match[1]);
    if (!role) throw new ApiError(404, 'Роль не найдена');
    const count = db.users.filter((user) => user.role === 'manager' && user.role_id === role.id).length;
    if (count) throw new ApiError(409, `Роль назначена сотрудникам: ${count} — сначала смените им роль`);
    db.roles = db.roles.filter((item) => item.id !== role.id);
    return null;
  }],

  ['GET', /^\/api\/cities$/, () => ({
    items: db.cities.filter((city) => seesAllCities() || city.id === session?.city_id).map((city) => ({
      ...city,
      users_count: db.users.filter((user) => user.city_id === city.id && user.active).length,
      deals_count: db.deals.filter((deal) => deal.city_id === city.id).length,
      channels_count: db.channels.filter((channel) => channel.city_id === city.id).length,
    })),
  })],

  ['POST', /^\/api\/cities$/, (_m, body) => {
    requireAdmin();
    const name = required(body, 'name');
    if (db.cities.some((city) => city.name.toLowerCase() === name.toLowerCase())) {
      throw new ApiError(409, `Город «${name}» уже есть`);
    }
    const city = { id: db.nextId.city++, name, position: db.cities.length, created_at: now() };
    db.cities.push(city);
    logEvent({ entity_type: 'city', entity_id: city.id, entity_name: name, action: 'create', field: 'Город добавлен' });
    return city;
  }],

  ['PATCH', /^\/api\/cities\/(\d+)$/, (match, body) => {
    requireAdmin();
    const city = byId(db.cities, match[1]);
    if (!city) throw new ApiError(404, 'Город не найден');
    city.name = required(body, 'name');
    return city;
  }],

  ['DELETE', /^\/api\/cities\/(\d+)$/, (match) => {
    requireAdmin();
    const id = Number(match[1]);
    const deals = db.deals.filter((deal) => deal.city_id === id).length;
    if (deals) throw new ApiError(409, `В городе ${deals} сделок — сначала перенесите их в другой город`);
    const users = db.users.filter((user) => user.city_id === id && user.active).length;
    if (users) throw new ApiError(409, `К городу привязано сотрудников: ${users} — сначала переведите их`);
    db.cities = db.cities.filter((city) => city.id !== id);
    return null;
  }],

  ['GET', /^\/api\/channels$/, (_m, _b, params) => ({
    items: db.channels.filter(channelsIn(params)).map(channelView),
  })],

  ['POST', /^\/api\/channels$/, (_m, body) => {
    requireAdmin();
    const channel = {
      id: db.nextId.channel++, name: required(body, 'name'), phone: body.phone ?? null,
      city_id: checkCity(body.city_id), provider: body.provider ?? 'none', phone_id: body.phone_id ?? null,
      api_url: body.api_url ?? null, has_token: Boolean(body.token), active: 1, created_at: now(),
    };
    db.channels.push(channel);
    return channelView(channel);
  }],

  ['PATCH', /^\/api\/channels\/(\d+)$/, (match, body) => {
    requireAdmin();
    const channel = byId(db.channels, match[1]);
    if (!channel) throw new ApiError(404, 'Номер не найден');
    for (const field of ['name', 'phone', 'provider', 'phone_id', 'api_url']) {
      if (Object.hasOwn(body, field)) channel[field] = body[field];
    }
    if (body.token) channel.has_token = true;
    if (Object.hasOwn(body, 'active')) channel.active = body.active ? 1 : 0;
    if (Object.hasOwn(body, 'city_id')) {
      channel.city_id = checkCity(body.city_id);
      // Переписки номера переезжают вместе с ним.
      for (const chat of db.chats) if (chat.channel_id === channel.id) chat.city_id = channel.city_id;
    }
    return channelView(channel);
  }],

  ['DELETE', /^\/api\/channels\/(\d+)$/, (match) => {
    requireAdmin();
    const id = Number(match[1]);
    db.channels = db.channels.filter((channel) => channel.id !== id);
    for (const chat of db.chats) if (chat.channel_id === id) chat.channel_id = null;
    return null;
  }],
  ['GET', /^\/api\/pipelines$/, () => ({
    items: db.pipelines.map((pipeline) => ({
      ...pipeline,
      stages: stagesOfPipeline(pipeline.id).map((stage) => ({
        ...stage,
        deals_count: db.deals.filter((deal) => deal.stage_id === stage.id && inScope('deals')(deal)).length,
      })),
    })),
  })],

  ['GET', /^\/api\/pipelines\/(\d+)$/, (match) => {
    const pipeline = byId(db.pipelines, match[1]);
    if (!pipeline) throw new ApiError(404, 'Воронка не найдена');
    return { ...pipeline, stages: stagesOfPipeline(pipeline.id) };
  }],

  ['POST', /^\/api\/pipelines$/, (_m, body) => {
    requireAdmin();
    const name = required(body, 'name');
    const names = Array.isArray(body.stages) && body.stages.length
      ? body.stages.map((item) => String(item).trim()).filter(Boolean)
      : ['Новая заявка', 'Принято в работу'];

    const pipeline = {
      id: db.nextId.pipeline++, name, position: db.pipelines.length, created_at: now(),
    };
    db.pipelines.push(pipeline);
    for (const stage of buildStages(names)) {
      db.stages.push({
        id: db.nextId.stage++, pipeline_id: pipeline.id, name: stage.name,
        color: stage.color, position: stage.position, type: stage.type, created_at: now(),
      });
    }
    return { ...pipeline, stages: stagesOfPipeline(pipeline.id) };
  }],

  ['DELETE', /^\/api\/pipelines\/(\d+)$/, (match) => {
    requireAdmin();
    const id = Number(match[1]);
    if (db.pipelines.length <= 1) throw new ApiError(409, 'Нельзя удалить единственную воронку');
    if (db.deals.some((deal) => deal.pipeline_id === id)) {
      throw new ApiError(409, 'В воронке есть сделки — сначала перенесите их');
    }
    db.pipelines = db.pipelines.filter((pipeline) => pipeline.id !== id);
    db.stages = db.stages.filter((stage) => stage.pipeline_id !== id);
    return null;
  }],

  ['POST', /^\/api\/pipelines\/(\d+)\/stages$/, (match, body) => {
    requireAdmin();
    const pipelineId = Number(match[1]);
    if (!byId(db.pipelines, pipelineId)) throw new ApiError(404, 'Воронка не найдена');
    const name = required(body, 'name');

    const open = stagesOfPipeline(pipelineId).filter((stage) => stage.type === 'open');
    const position = open.length ? open.at(-1).position + 1 : 0;
    for (const stage of db.stages) {
      if (stage.pipeline_id === pipelineId && stage.type !== 'open') stage.position += 1;
    }

    const stage = {
      id: db.nextId.stage++, pipeline_id: pipelineId, name,
      color: body.color ?? STAGE_COLORS[open.length % STAGE_COLORS.length],
      position, type: 'open', created_at: now(),
    };
    db.stages.push(stage);
    return stage;
  }],

  ['PATCH', /^\/api\/stages\/(\d+)$/, (match, body) => {
    requireAdmin();
    const stage = stageById(Number(match[1]));
    if (!stage) throw new ApiError(404, 'Этап не найден');
    if (Object.hasOwn(body, 'name')) stage.name = required(body, 'name');
    if (Object.hasOwn(body, 'color')) stage.color = body.color;
    return stage;
  }],

  ['DELETE', /^\/api\/stages\/(\d+)$/, (match) => {
    requireAdmin();
    const stage = stageById(Number(match[1]));
    if (!stage) throw new ApiError(404, 'Этап не найден');
    if (stage.type !== 'open') throw new ApiError(409, 'Закрывающие этапы удалить нельзя');
    if (db.deals.some((deal) => deal.stage_id === stage.id)) {
      throw new ApiError(409, 'На этапе есть сделки — сначала перенесите их');
    }
    const open = stagesOfPipeline(stage.pipeline_id).filter((item) => item.type === 'open');
    if (open.length <= 1) throw new ApiError(409, 'В воронке должен остаться хотя бы один рабочий этап');
    db.stages = db.stages.filter((item) => item.id !== stage.id);
    return null;
  }],

  ['GET', /^\/api\/deals\/pipeline$/, (_m, _b, params) => {
    const pipeline = params.pipelineId ? byId(db.pipelines, params.pipelineId) : db.pipelines[0];
    if (!pipeline) throw new ApiError(404, 'Воронка не найдена');

    const deals = filterDeals({ ...params, pipelineId: pipeline.id }).map(dealView);
    return {
      pipeline: { id: pipeline.id, name: pipeline.name },
      stages: stagesOfPipeline(pipeline.id).map((stage) => {
        const items = deals.filter((deal) => deal.stage_id === stage.id)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        return {
          id: stage.id, name: stage.name, type: stage.type, color: stage.color,
          count: items.length,
          amount: items.reduce((sum, deal) => sum + deal.amount, 0),
          items,
        };
      }),
    };
  }],

  ['GET', /^\/api\/deals$/, (_m, _b, params) => {
    const items = filterDeals(params)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(dealView);
    return { items, total: items.length, page: 1, limit: items.length };
  }],

  ['GET', /^\/api\/deals\/(\d+)$/, (match) => {
    const deal = visible('deals', match[1], 'Сделка не найдена');
    return {
      ...dealView(deal),
      tasks: db.tasks.filter((task) => task.deal_id === deal.id).map(taskView),
      activities: db.activities.filter((item) => item.deal_id === deal.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .map(activityView),
    };
  }],

  ['POST', /^\/api\/deals$/, (_m, body) => {
    const title = required(body, 'title');
    if (title.length < 2) throw new ApiError(400, 'Ошибка валидации', { title: 'Минимум 2 символов' });
    const owner = assignable('deals', body.owner_id ? Number(body.owner_id) : session.id);
    const cityId = cityForNew('deals', {
      requested: Object.hasOwn(body, 'city_id') ? body.city_id : undefined,
      linked: linkedCity(body),
      owner,
    });

    let contactId = body.contact_id ? Number(body.contact_id) : null;
    if (!contactId && body.contact && (body.contact.first_name || body.contact.last_name || body.contact.phone)) {
      const contact = {
        id: db.nextId.contact++,
        first_name: body.contact.first_name ?? 'Клиент',
        last_name: body.contact.last_name ?? null,
        phone: body.contact.phone ?? null,
        email: body.contact.email ?? null,
        position: null, company_id: null, owner_id: owner.id, city_id: cityId, notes: null,
        created_at: now(), updated_at: now(),
      };
      db.contacts.push(contact);
      contactId = contact.id;
    }

    const pipeline = body.pipeline_id ? byId(db.pipelines, body.pipeline_id) : db.pipelines[0];
    const stage = body.stage_id
      ? stageById(body.stage_id)
      : stagesOfPipeline(pipeline.id).find((item) => item.type === 'open');
    if (!stage) throw new ApiError(400, 'Ошибка валидации', { stage_id: 'Этап не найден' });

    const deal = {
      id: db.nextId.deal++,
      title,
      amount: toNumber(body.amount),
      currency: CURRENCIES.includes(body.currency) ? body.currency : 'KZT',
      pipeline_id: stage.pipeline_id,
      stage_id: stage.id,
      lead_type: LEAD_TYPES.includes(body.lead_type) ? body.lead_type : 'individual',
      company_id: body.company_id ? Number(body.company_id) : null,
      contact_id: contactId,
      owner_id: owner.id,
      city_id: cityId,
      expected_close_date: body.expected_close_date ?? null,
      closed_at: stage.type === 'open' ? null : now(),
      notes: body.notes ?? null,
      created_at: now(),
      updated_at: now(),
    };
    db.deals.push(deal);
    setDealTags(deal.id, body.tags);
    db.activities.push({
      id: db.nextId.activity++, type: 'system',
      body: `Сделка создана на этапе «${stage.name}»`,
      user_id: session?.id ?? DEMO_USER.id, deal_id: deal.id, company_id: null, contact_id: null,
      created_at: now(),
    });
    return dealView(deal);
  }],

  ['PATCH', /^\/api\/deals\/(\d+)$/, (match, body) => {
    const deal = visible('deals', match[1], 'Сделка не найдена');
    linkedCity(body);
    const owner = body.owner_id ? assignable('deals', body.owner_id) : null;
    // Город меняет администратор; смена ответственного переносит сделку в его город.
    if (canMoveCity('deals') && Object.hasOwn(body, 'city_id')) deal.city_id = checkCity(body.city_id);
    else if (canMoveCity('deals') && owner?.city_id) deal.city_id = owner.city_id;

    if (Object.hasOwn(body, 'title')) {
      const title = required(body, 'title');
      if (title.length < 2) throw new ApiError(400, 'Ошибка валидации', { title: 'Минимум 2 символов' });
      deal.title = title;
    }
    if (Object.hasOwn(body, 'stage_id') && Number(body.stage_id) !== deal.stage_id) {
      const next = stageById(body.stage_id);
      if (!next) throw new ApiError(400, 'Ошибка валидации', { stage_id: 'Этап не найден' });
      db.activities.push({
        id: db.nextId.activity++, type: 'system',
        body: `Этап изменён: «${stageById(deal.stage_id)?.name}» → «${next.name}»`,
        user_id: session?.id ?? DEMO_USER.id, deal_id: deal.id, company_id: null, contact_id: null,
        created_at: now(),
      });
      logEvent({
        entity_type: 'deal', entity_id: deal.id, entity_name: deal.title, action: 'update',
        field: 'Этап', old_value: stageById(deal.stage_id)?.name, new_value: next.name, city_id: deal.city_id,
      });
      deal.stage_id = next.id;
      deal.pipeline_id = next.pipeline_id;
      deal.closed_at = next.type === 'open' ? null : now();
    }
    for (const field of ['currency', 'lead_type', 'expected_close_date', 'notes']) {
      if (Object.hasOwn(body, field)) deal[field] = body[field] ?? (field === 'currency' ? 'KZT' : null);
    }
    if (Object.hasOwn(body, 'amount')) deal.amount = toNumber(body.amount);
    for (const field of ['company_id', 'contact_id', 'owner_id']) {
      if (Object.hasOwn(body, field)) deal[field] = body[field] ? Number(body[field]) : null;
    }
    if (Array.isArray(body.tags)) setDealTags(deal.id, body.tags);

    deal.updated_at = now();
    return dealView(deal);
  }],

  ['DELETE', /^\/api\/deals\/(\d+)$/, (match) => {
    const id = visible('deals', match[1], 'Сделка не найдена').id;
    db.deals = db.deals.filter((deal) => deal.id !== id);
    db.dealTags = db.dealTags.filter((link) => link.deal_id !== id);
    db.tasks = db.tasks.filter((task) => task.deal_id !== id);
    db.activities = db.activities.filter((item) => item.deal_id !== id);
    return null;
  }],

  ['GET', /^\/api\/tags$/, () => ({ items: db.tags.map(tagView).sort((a, b) => a.name.localeCompare(b.name)) })],

  ['POST', /^\/api\/tags$/, (_m, body) => {
    const name = normalizeTag(required(body, 'name'));
    if (db.tags.some((tag) => tag.name === name)) throw new ApiError(409, `Хэштег #${name} уже существует`);
    const tag = ensureTag(name);
    if (body.title) tag.title = body.title;
    return tagView(tag);
  }],

  ['PATCH', /^\/api\/tags\/(\d+)$/, (match, body) => {
    const tag = byId(db.tags, match[1]);
    if (!tag) throw new ApiError(404, 'Хэштег не найден');
    if (Object.hasOwn(body, 'name')) {
      const name = normalizeTag(required(body, 'name'));
      if (db.tags.some((item) => item.name === name && item.id !== tag.id)) {
        throw new ApiError(409, `Хэштег #${name} уже существует`);
      }
      tag.name = name;
    }
    if (Object.hasOwn(body, 'title')) tag.title = body.title ?? null;
    return tagView(tag);
  }],

  ['DELETE', /^\/api\/tags\/(\d+)$/, (match) => {
    const id = Number(match[1]);
    if (!byId(db.tags, id)) throw new ApiError(404, 'Хэштег не найден');
    db.tags = db.tags.filter((tag) => tag.id !== id);
    db.dealTags = db.dealTags.filter((link) => link.tag_id !== id);
    return null;
  }],

  ['GET', /^\/api\/contacts$/, (_m, _b, params) => {
    let items = db.contacts.filter(inScope('contacts', params));
    if (params.companyId) items = items.filter((contact) => contact.company_id === Number(params.companyId));
    if (params.ownerId) items = items.filter((contact) => contact.owner_id === Number(params.ownerId));
    if (params.q) {
      items = items.filter((contact) => [contact.first_name, contact.last_name, contact.email, contact.phone]
        .some((value) => like(value, params.q)));
    }
    items = [...items].sort((a, b) => String(a.last_name).localeCompare(String(b.last_name)));
    return { items: items.map(contactView), total: items.length, page: 1, limit: items.length };
  }],

  ['POST', /^\/api\/contacts$/, (_m, body) => {
    const contact = {
      id: db.nextId.contact++,
      first_name: required(body, 'first_name'),
      last_name: body.last_name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      position: body.position ?? null,
      company_id: body.company_id ? Number(body.company_id) : null,
      owner_id: assignable('contacts', body.owner_id ? Number(body.owner_id) : session.id).id,
      notes: body.notes ?? null,
      created_at: now(), updated_at: now(),
    };
    contact.city_id = cityForNew('contacts', {
      requested: Object.hasOwn(body, 'city_id') ? body.city_id : undefined,
      linked: linkedCity(body),
      owner: byId(db.users, contact.owner_id),
    });
    db.contacts.push(contact);
    return contactView(contact);
  }],

  ['PATCH', /^\/api\/contacts\/(\d+)$/, (match, body) => {
    const contact = visible('contacts', match[1], 'Контакт не найден');
    for (const field of ['first_name', 'last_name', 'email', 'phone', 'position', 'notes']) {
      if (Object.hasOwn(body, field)) contact[field] = body[field];
    }
    for (const field of ['company_id', 'owner_id']) {
      if (Object.hasOwn(body, field)) contact[field] = body[field] ? Number(body[field]) : null;
    }
    contact.updated_at = now();
    return contactView(contact);
  }],

  ['DELETE', /^\/api\/contacts\/(\d+)$/, (match) => {
    visible('contacts', match[1], 'Контакт не найден');
    db.contacts = db.contacts.filter((contact) => contact.id !== Number(match[1]));
    return null;
  }],

  ['GET', /^\/api\/companies$/, (_m, _b, params) => {
    let items = db.companies.filter(inScope('companies', params));
    if (params.q) items = items.filter((company) => [company.name, company.industry, company.phone]
      .some((value) => like(value, params.q)));
    if (params.ownerId) items = items.filter((company) => company.owner_id === Number(params.ownerId));
    items = [...items].sort((a, b) => a.name.localeCompare(b.name));
    return { items: items.map(companyView), total: items.length, page: 1, limit: items.length };
  }],

  ['GET', /^\/api\/companies\/(\d+)$/, (match) => {
    const company = visible('companies', match[1], 'Компания не найдена');
    return {
      ...companyView(company),
      contacts: db.contacts.filter((contact) => contact.company_id === company.id && inScope('contacts')(contact)),
      deals: db.deals.filter((deal) => deal.company_id === company.id && inScope('deals')(deal)),
    };
  }],

  ['POST', /^\/api\/companies$/, (_m, body) => {
    const company = {
      id: db.nextId.company++,
      name: required(body, 'name'),
      industry: body.industry ?? null, website: body.website ?? null, phone: body.phone ?? null,
      address: body.address ?? null, notes: body.notes ?? null,
      owner_id: assignable('companies', body.owner_id ? Number(body.owner_id) : session.id).id,
      created_at: now(), updated_at: now(),
    };
    company.city_id = cityForNew('companies', {
      requested: Object.hasOwn(body, 'city_id') ? body.city_id : undefined,
      owner: byId(db.users, company.owner_id),
    });
    db.companies.push(company);
    return companyView(company);
  }],

  ['PATCH', /^\/api\/companies\/(\d+)$/, (match, body) => {
    const company = visible('companies', match[1], 'Компания не найдена');
    for (const field of ['name', 'industry', 'website', 'phone', 'address', 'notes']) {
      if (Object.hasOwn(body, field)) company[field] = body[field];
    }
    if (Object.hasOwn(body, 'owner_id')) company.owner_id = body.owner_id ? Number(body.owner_id) : null;
    company.updated_at = now();
    return companyView(company);
  }],

  ['DELETE', /^\/api\/companies\/(\d+)$/, (match) => {
    visible('companies', match[1], 'Компания не найдена');
    db.companies = db.companies.filter((company) => company.id !== Number(match[1]));
    return null;
  }],

  ['GET', /^\/api\/tasks$/, (_m, _b, params) => {
    let items = db.tasks.filter(inScope('tasks', params));
    if (params.done === 'true') items = items.filter((task) => task.done);
    if (params.done === 'false') items = items.filter((task) => !task.done);
    if (params.overdue === 'true') {
      const today = new Date().toISOString().slice(0, 10);
      items = items.filter((task) => !task.done && task.due_date && task.due_date < today);
    }
    if (params.assigneeId) items = items.filter((task) => task.assignee_id === Number(params.assigneeId));
    if (params.dealId) items = items.filter((task) => task.deal_id === Number(params.dealId));
    if (params.q) items = items.filter((task) => [task.title, task.description].some((value) => like(value, params.q)));
    items = [...items].sort((a, b) => a.done - b.done || String(a.due_date).localeCompare(String(b.due_date)));
    return { items: items.map(taskView), total: items.length, page: 1, limit: items.length };
  }],

  ['POST', /^\/api\/tasks$/, (_m, body) => {
    const task = {
      id: db.nextId.task++,
      title: required(body, 'title'),
      description: body.description ?? null,
      due_date: body.due_date ?? null,
      done: body.done ? 1 : 0,
      priority: body.priority ?? 'normal',
      assignee_id: body.assignee_id ? Number(body.assignee_id) : (session?.id ?? DEMO_USER.id),
      company_id: body.company_id ? Number(body.company_id) : null,
      contact_id: body.contact_id ? Number(body.contact_id) : null,
      deal_id: body.deal_id ? Number(body.deal_id) : null,
      created_at: now(), updated_at: now(),
    };
    task.city_id = cityForNew('tasks', {
      requested: Object.hasOwn(body, 'city_id') ? body.city_id : undefined,
      linked: linkedCity(body),
      owner: assignable('tasks', task.assignee_id, 'assignee_id'),
    });
    db.tasks.push(task);
    return taskView(task);
  }],

  ['PATCH', /^\/api\/tasks\/(\d+)$/, (match, body) => {
    const task = visible('tasks', match[1], 'Задача не найдена');
    linkedCity(body);
    for (const field of ['title', 'description', 'due_date', 'priority']) {
      if (Object.hasOwn(body, field)) task[field] = body[field];
    }
    if (Object.hasOwn(body, 'done')) task.done = body.done ? 1 : 0;
    for (const field of ['assignee_id', 'company_id', 'contact_id', 'deal_id']) {
      if (Object.hasOwn(body, field)) task[field] = body[field] ? Number(body[field]) : null;
    }
    task.updated_at = now();
    return taskView(task);
  }],

  ['DELETE', /^\/api\/tasks\/(\d+)$/, (match) => {
    visible('tasks', match[1], 'Задача не найдена');
    db.tasks = db.tasks.filter((task) => task.id !== Number(match[1]));
    return null;
  }],

  ['GET', /^\/api\/activities$/, (_m, _b, params) => {
    let items = db.activities;
    if (params.dealId) items = items.filter((item) => item.deal_id === Number(params.dealId));
    if (params.contactId) items = items.filter((item) => item.contact_id === Number(params.contactId));
    if (params.companyId) items = items.filter((item) => item.company_id === Number(params.companyId));
    items = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    return { items: items.map(activityView), total: items.length, page: 1, limit: items.length };
  }],

  ['POST', /^\/api\/activities$/, (_m, body) => {
    const activity = {
      id: db.nextId.activity++,
      type: body.type ?? 'note',
      body: required(body, 'body'),
      user_id: session?.id ?? DEMO_USER.id,
      company_id: body.company_id ? Number(body.company_id) : null,
      contact_id: body.contact_id ? Number(body.contact_id) : null,
      deal_id: body.deal_id ? Number(body.deal_id) : null,
      created_at: now(),
    };
    if (!activity.company_id && !activity.contact_id && !activity.deal_id) {
      throw new ApiError(400, 'Укажите, к чему относится запись: компания, контакт или сделка');
    }
    linkedCity(activity);
    assertAccess(parentSection(activity), 'edit');
    db.activities.push(activity);
    return activityView(activity);
  }],

  ['GET', /^\/api\/dashboard$/, (_m, _b, params) => {
    const deals = db.deals.filter(inScope('deals', params));
    const open = deals.filter((deal) => stageType(deal) === 'open');
    const won = deals.filter((deal) => stageType(deal) === 'won');
    const lost = deals.filter((deal) => stageType(deal) === 'lost');
    const today = new Date().toISOString().slice(0, 10);
    const tasks = db.tasks.filter(inScope('tasks', params));
    const openTasks = tasks.filter((task) => !task.done);
    const dealIds = new Set(deals.map((deal) => deal.id));

    return {
      totals: {
        companies: db.companies.filter(inScope('companies', params)).length,
        contacts: db.contacts.filter(inScope('contacts', params)).length,
        open_deals: open.length,
        open_amount: open.reduce((sum, deal) => sum + deal.amount, 0),
        won_amount: won.reduce((sum, deal) => sum + deal.amount, 0),
        open_tasks: openTasks.length,
        overdue_tasks: openTasks.filter((task) => task.due_date && task.due_date < today).length,
      },
      pipeline: { id: db.pipelines[0].id, name: db.pipelines[0].name },
      byStage: stagesOfPipeline(db.pipelines[0].id).map((stage) => {
        const list = deals.filter((deal) => deal.stage_id === stage.id);
        return {
          id: stage.id, label: stage.name, color: stage.color, type: stage.type,
          count: list.length, amount: list.reduce((sum, deal) => sum + deal.amount, 0),
        };
      }),
      conversion: percent(won.length, won.length + lost.length),
      topDeals: [...open].sort((a, b) => b.amount - a.amount).slice(0, 5).map(dealView),
      upcomingTasks: tasks.filter((task) => !task.done && task.due_date)
        .sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5).map(taskView),
      recentActivities: db.activities.filter((item) => dealIds.has(item.deal_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .slice(0, 8).map(activityView),
    };
  }],


  // --- Товары и позиции сделки ---
  ['GET', /^\/api\/products$/, (_m, _b, params) => {
    let items = db.products;
    if (params.q) items = items.filter((product) => [product.name, product.sku, product.group_name]
      .some((value) => like(value, params.q)));
    if (params.group) items = items.filter((product) => product.group_name === params.group);
    return {
      items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
      total: items.length,
      groups: [...new Set(db.products.map((product) => product.group_name).filter(Boolean))].sort(),
      page: 1, limit: items.length,
    };
  }],

  ['POST', /^\/api\/products$/, (_m, body) => {
    const product = {
      id: db.nextId.product++,
      sku: body.sku ?? null,
      name: required(body, 'name'),
      description: body.description ?? null,
      price: toNumber(body.price),
      currency: 'KZT',
      unit: body.unit ?? 'шт',
      stock: toNumber(body.stock),
      group_name: body.group_name ?? null,
      active: 1, created_at: now(), updated_at: now(),
    };
    db.products.push(product);
    logEvent({ entity_type: 'product', entity_id: product.id, entity_name: product.name, action: 'create', field: 'Товар добавлен' });
    return product;
  }],

  ['PATCH', /^\/api\/products\/(\d+)$/, (match, body) => {
    const product = byId(db.products, match[1]);
    if (!product) throw new ApiError(404, 'Товар не найден');
    for (const field of ['sku', 'name', 'description', 'unit', 'group_name']) {
      if (Object.hasOwn(body, field)) product[field] = body[field];
    }
    for (const field of ['price', 'stock']) {
      if (Object.hasOwn(body, field)) product[field] = toNumber(body[field]);
    }
    product.updated_at = now();
    return product;
  }],

  ['DELETE', /^\/api\/products\/(\d+)$/, (match) => {
    db.products = db.products.filter((product) => product.id !== Number(match[1]));
    return null;
  }],

  ['GET', /^\/api\/deals\/(\d+)\/items$/, (match) => ({
    items: itemsOf(visible('deals', match[1], 'Сделка не найдена').id),
  })],

  ['POST', /^\/api\/deals\/(\d+)\/items$/, (match, body) => {
    const dealId = visible('deals', match[1], 'Сделка не найдена').id;
    const product = body.product_id ? byId(db.products, body.product_id) : null;
    const name = body.name ?? product?.name;
    if (!name) throw new ApiError(400, 'Ошибка валидации', { name: 'Укажите товар' });

    db.dealItems.push({
      id: db.nextId.item++, deal_id: dealId, product_id: product?.id ?? null, name,
      price: toNumber(body.price) || product?.price || 0,
      quantity: toNumber(body.quantity, 1), created_at: now(),
    });
    return { items: itemsOf(dealId), amount: syncDealAmount(dealId) };
  }],

  ['DELETE', /^\/api\/deals\/(\d+)\/items\/(\d+)$/, (match) => {
    const dealId = visible('deals', match[1], 'Сделка не найдена').id;
    db.dealItems = db.dealItems.filter((item) => item.id !== Number(match[2]));
    return { items: itemsOf(dealId), amount: syncDealAmount(dealId) };
  }],

  // --- Файлы (в демо хранится только карточка файла) ---
  ['GET', /^\/api\/files$/, (_m, _b, params) => {
    let items = db.files;
    if (params.dealId) items = items.filter((file) => file.deal_id === Number(params.dealId));
    return { items, total: items.length, page: 1, limit: items.length };
  }],

  // --- Звонки ---
  ['GET', /^\/api\/calls$/, (_m, _b, params) => {
    let items = db.calls.filter(inScope('calls', params));
    if (params.direction) items = items.filter((call) => call.direction === params.direction);
    if (params.dealId) items = items.filter((call) => call.deal_id === Number(params.dealId));
    if (params.from) items = items.filter((call) => call.created_at.slice(0, 10) >= params.from);
    if (params.to) items = items.filter((call) => call.created_at.slice(0, 10) <= params.to);
    const sorted = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { items: sorted.map(callView), total: sorted.length, page: 1, limit: sorted.length };
  }],

  ['GET', /^\/api\/calls\/report$/, (_m, _b, params) => {
    const to = params.to ?? new Date().toISOString().slice(0, 10);
    const from = params.from ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const inRange = db.calls.filter(inScope('calls', params))
      .filter((call) => call.created_at.slice(0, 10) >= from && call.created_at.slice(0, 10) <= to);
    const measure = (list) => ({
      total: list.length,
      incoming: list.filter((call) => call.direction === 'in').length,
      outgoing: list.filter((call) => call.direction === 'out').length,
      missed: list.filter((call) => call.result === 'missed').length,
      duration: list.reduce((sum, call) => sum + call.duration, 0),
    });

    return {
      from, to,
      totals: measure(inRange),
      byUser: db.users.filter(peopleIn('calls', params)).map((user) => ({
        id: user.id, name: user.name,
        ...measure(inRange.filter((call) => call.user_id === user.id)),
      })).sort((a, b) => b.total - a.total),
    };
  }],

  ['POST', /^\/api\/calls$/, (_m, body) => {
    const call = {
      id: db.nextId.call++,
      direction: body.direction ?? 'out',
      phone: body.phone ?? null,
      duration: toNumber(body.duration),
      result: body.result ?? 'answered',
      recording_url: null,
      note: body.note ?? null,
      user_id: session?.id ?? DEMO_USER.id,
      deal_id: body.deal_id ? Number(body.deal_id) : null,
      contact_id: body.contact_id ? Number(body.contact_id) : null,
      created_at: now(),
    };
    call.city_id = cityForNew('calls', { linked: linkedCity(call), owner: session });
    db.calls.push(call);

    if (call.deal_id) {
      db.activities.push({
        id: db.nextId.activity++, type: 'call',
        body: `${call.direction === 'in' ? 'Входящий' : 'Исходящий'} звонок · ${call.duration} сек.${call.note ? ` · ${call.note}` : ''}`,
        user_id: call.user_id, deal_id: call.deal_id, company_id: null, contact_id: null, created_at: now(),
      });
    }
    logEvent({
      entity_type: 'call', entity_id: call.id, entity_name: call.phone, action: 'create',
      field: call.direction === 'in' ? 'Входящий звонок' : 'Исходящий звонок', new_value: `${call.duration} сек.`,
      city_id: call.city_id,
    });
    return callView(call);
  }],

  // --- Цели ---
  ['GET', /^\/api\/goals$/, (_m, _b, params) => {
    const period = /^\d{4}-\d{2}$/.test(String(params.period ?? '')) ? params.period : new Date().toISOString().slice(0, 7);
    const items = db.users.filter(peopleIn('analytics', params)).map((user) => {
      const goal = db.goals.find((item) => item.user_id === user.id && item.period === period);
      const won = db.deals.filter((deal) => deal.owner_id === user.id && stageType(deal) === 'won'
        && (deal.closed_at ?? deal.updated_at).slice(0, 7) === period);
      const wonAmount = won.reduce((sum, deal) => sum + deal.amount, 0);
      return {
        user_id: user.id, name: user.name, city_name: cityName(user.city_id), goal_id: goal?.id ?? 0,
        target_amount: goal?.target_amount ?? 0, target_count: goal?.target_count ?? 0,
        won_count: won.length, won_amount: wonAmount,
        progress_amount: goal?.target_amount ? Math.round((wonAmount / goal.target_amount) * 100) : null,
        progress_count: goal?.target_count ? Math.round((won.length / goal.target_count) * 100) : null,
      };
    });

    const totals = items.reduce((sum, row) => ({
      target_amount: sum.target_amount + row.target_amount,
      target_count: sum.target_count + row.target_count,
      won_amount: sum.won_amount + row.won_amount,
      won_count: sum.won_count + row.won_count,
    }), { target_amount: 0, target_count: 0, won_amount: 0, won_count: 0 });

    return {
      period, items,
      totals: { ...totals, progress_amount: totals.target_amount ? Math.round((totals.won_amount / totals.target_amount) * 100) : null },
    };
  }],

  ['PUT', /^\/api\/goals$/, (_m, body) => {
    requireAdmin();
    const period = body.period ?? new Date().toISOString().slice(0, 7);
    const existing = db.goals.find((goal) => goal.user_id === Number(body.user_id) && goal.period === period);
    if (existing) {
      existing.target_amount = toNumber(body.target_amount);
      existing.target_count = toNumber(body.target_count);
      return existing;
    }
    const goal = {
      id: db.nextId.goal++, user_id: Number(body.user_id), period,
      target_amount: toNumber(body.target_amount), target_count: toNumber(body.target_count), created_at: now(),
    };
    db.goals.push(goal);
    return goal;
  }],

  // --- Чаты imBox ---
  ['GET', /^\/api\/chats$/, (_m, _b, params) => {
    let items = db.chats.filter(inScope('chats', params));
    if (params.q) items = items.filter((chat) => [chat.title, chat.phone].some((value) => like(value, params.q)));
    return {
      items: [...items]
        .sort((a, b) => String(b.last_message_at ?? b.created_at).localeCompare(String(a.last_message_at ?? a.created_at)))
        .map(chatView),
      channels: db.channels.filter(channelsIn()).map(channelView),
    };
  }],

  ['GET', /^\/api\/chats\/(\d+)$/, (match) => {
    const chat = visible('chats', match[1], 'Переписка не найдена');
    chat.unread = 0;
    return {
      ...chatView(chat),
      messages: db.chatMessages.filter((message) => message.chat_id === chat.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
        .map((message) => ({ ...message, user_name: byId(db.users, message.user_id)?.name ?? null })),
    };
  }],

  ['POST', /^\/api\/chats$/, (_m, body) => {
    // Писать можно только с номеров своего города (администратор — с любого).
    const available = db.channels.filter(channelsIn());
    const channel = body.channel_id ? available.find((item) => item.id === Number(body.channel_id)) : available[0];
    if (body.channel_id && !channel) throw new ApiError(400, 'Ошибка валидации', { channel_id: 'Номер не найден' });
    const chat = {
      id: db.nextId.chat++, channel: 'whatsapp', external_id: null,
      channel_id: channel?.id ?? null,
      city_id: canMoveCity('chats') ? (channel?.city_id ?? null) : (session?.city_id ?? null),
      title: body.title ?? body.phone, phone: required(body, 'phone'),
      contact_id: null, deal_id: null, unread: 0,
      last_message_at: null, created_at: now(),
    };
    db.chats.push(chat);
    return chatView(chat);
  }],

  ['POST', /^\/api\/chats\/(\d+)\/messages$/, (match, body) => {
    const chat = visible('chats', match[1], 'Переписка не найдена');

    const message = {
      id: db.nextId.message++, chat_id: chat.id, direction: 'out',
      body: required(body, 'body'), author_name: session?.name ?? DEMO_USER.name,
      user_id: session?.id ?? DEMO_USER.id, external_id: null, status: 'sent', created_at: now(),
    };
    db.chatMessages.push(message);
    chat.last_message_at = message.created_at;

    return {
      message,
      delivery: { status: 'sent', demo: true },
    };
  }],

  // --- Почта ---
  ['GET', /^\/api\/emails$/, (_m, _b, params) => {
    let items = db.emails.filter(inScope('emails', params));
    if (params.direction) items = items.filter((email) => email.direction === params.direction);
    if (params.q) items = items.filter((email) => [email.subject, email.body, email.from_addr, email.to_addr]
      .some((value) => like(value, params.q)));
    const sorted = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      items: sorted.map((email) => ({
        ...email,
        deal_title: byId(db.deals, email.deal_id)?.title ?? null,
        contact_name: contactFullName(contactOf(email.contact_id)),
      })),
      total: sorted.length,
      mailbox: { ready: false, missing: ['демо-режим: письма не уходят наружу'], from: 'demo@crm.local', host: null },
      page: 1, limit: sorted.length,
    };
  }],

  ['POST', /^\/api\/emails$/, (_m, body) => {
    const email = {
      id: db.nextId.email++, direction: 'out',
      subject: required(body, 'subject'), body: required(body, 'body'),
      from_addr: 'demo@crm.local', to_addr: required(body, 'to_addr'),
      status: 'pending', error: 'Демо-версия: письмо сохранено, но наружу не уходит',
      user_id: session?.id ?? DEMO_USER.id,
      contact_id: body.contact_id ? Number(body.contact_id) : null,
      deal_id: body.deal_id ? Number(body.deal_id) : null,
      created_at: now(),
    };
    email.city_id = cityForNew('emails', { linked: linkedCity(email), owner: session });
    db.emails.push(email);
    return { email, delivery: { status: 'pending', error: email.error } };
  }],

  ['DELETE', /^\/api\/emails\/(\d+)$/, (match) => {
    visible('emails', match[1], 'Письмо не найдено');
    db.emails = db.emails.filter((email) => email.id !== Number(match[1]));
    return null;
  }],

  // --- Настройки, события, AI ---
  ['GET', /^\/api\/settings$/, () => (requireAdmin(), {
    settings: {
      smtp_host: db.settings.smtp_host ?? '', smtp_port: db.settings.smtp_port ?? '',
      smtp_secure: db.settings.smtp_secure ?? '', smtp_user: db.settings.smtp_user ?? '',
      smtp_password: Boolean(db.settings.smtp_password), smtp_from: db.settings.smtp_from ?? '',
      ai_provider: db.settings.ai_provider ?? '', ai_api_key: Boolean(db.settings.ai_api_key),
      ai_model: db.settings.ai_model ?? '', webhook_secret: Boolean(db.settings.webhook_secret),
    },
    channels: {
      whatsapp: { count: db.channels.length, ready: false, connected: 0, missing: ['демо-режим'] },
      email: { ready: false, missing: ['демо-режим'], from: 'demo@crm.local', host: null },
    },
    webhooks: {
      whatsapp: 'https://ваш-адрес/api/webhooks/whatsapp',
      email: 'https://ваш-адрес/api/webhooks/email',
    },
  })],

  ['PATCH', /^\/api\/settings$/, (_m, body) => {
    requireAdmin();
    Object.assign(db.settings, body);
    return handle('GET', '/api/settings', null, {});
  }],

  ['GET', /^\/api\/events$/, (_m, _b, params) => {
    // «Только свои» в журнале — события самого сотрудника.
    let items = !isAdmin() && access('analytics').scope === 'own'
      ? db.events.filter((event) => can('analytics') && event.user_id === session?.id)
      : db.events.filter(inScope('analytics', params));
    if (params.entityType) items = items.filter((event) => event.entity_type === params.entityType);
    if (params.from) items = items.filter((event) => event.created_at.slice(0, 10) >= params.from);
    if (params.to) items = items.filter((event) => event.created_at.slice(0, 10) <= params.to);
    const sorted = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    return {
      items: sorted.map((event) => ({ ...event, user_name: byId(db.users, event.user_id)?.name ?? null })),
      total: sorted.length, page: 1, limit: sorted.length,
    };
  }],

  ['GET', /^\/api\/ai\/status$/, () => ({
    ready: false, provider: 'demo', model: 'claude-opus-5-5', missing: ['демо-режим'],
  })],

  ['POST', /^\/api\/ai\/deals\/(\d+)\/summary$/, () => {
    throw new ApiError(400, 'В демо AI-помощник отключён. В рабочей CRM он делает сводку по сделке и предлагает следующий шаг.');
  }],

  ['POST', /^\/api\/ai\/chats\/(\d+)\/reply$/, () => {
    throw new ApiError(400, 'В демо AI-помощник отключён. В рабочей CRM он готовит черновик ответа клиенту.');
  }],

  ['GET', /^\/api\/reports\/campaigns$/, (_m, _b, params) => campaignsReport(params)],

  ['GET', /^\/api\/reports\/funnel$/, (_m, _b, params) => {
    const pipeline = params.pipelineId ? byId(db.pipelines, params.pipelineId) : db.pipelines[0];
    const report = campaignsReport({ ...params, pipelineId: pipeline.id });
    return {
      from: report.from,
      to: report.to,
      pipeline: { id: pipeline.id, name: pipeline.name },
      stages: report.byStage,
      totals: report.totals,
    };
  }],

  ['GET', /^\/api\/reports\/managers$/, (_m, _b, params) => {
    const report = campaignsReport(params);
    const inRange = (date) => date.slice(0, 10) >= report.from && date.slice(0, 10) <= report.to;

    return {
      from: report.from,
      to: report.to,
      items: db.users.filter(peopleIn('analytics', params)).map((user) => {
        const own = db.deals.filter((deal) => deal.owner_id === user.id);
        const open = own.filter((deal) => stageType(deal) === 'open');
        const won = own.filter((deal) => stageType(deal) === 'won' && inRange(deal.created_at));
        return {
          id: user.id,
          name: user.name,
          city_name: cityName(user.city_id),
          open_deals: open.length,
          open_amount: open.reduce((sum, deal) => sum + deal.amount, 0),
          new_deals: own.filter((deal) => inRange(deal.created_at)).length,
          won_deals: won.length,
          won_amount: won.reduce((sum, deal) => sum + deal.amount, 0),
          notes: db.activities.filter((item) => item.user_id === user.id && item.type !== 'system'
            && inRange(item.created_at)).length,
          open_tasks: db.tasks.filter((task) => task.assignee_id === user.id && !task.done).length,
        };
      }),
    };
  }],
];

function handle(method, path, body, params) {
  guard(method, path);
  for (const [routeMethod, pattern, handler] of ROUTES) {
    if (routeMethod !== method) continue;
    const match = pattern.exec(path);
    if (match) return handler(match, body ?? {}, params ?? {});
  }
  throw new ApiError(404, `Эндпоинт не найден: ${method} ${path}`);
}

// Небольшая задержка — чтобы демо вело себя как приложение с сервером.
const respond = (method, path, body, params) => new Promise((resolve, reject) => {
  setTimeout(() => {
    try {
      resolve(structuredClone(handle(method, path, body, params)));
    } catch (error) {
      reject(error);
    }
  }, 60);
});

export const api = {
  get: (path, params) => respond('GET', path, null, params),
  post: (path, body) => respond('POST', path, body),
  patch: (path, body) => respond('PATCH', path, body),
  put: (path, body) => respond('PUT', path, body),
  delete: (path) => respond('DELETE', path),
  upload: async () => {
    throw new ApiError(400, 'В демо файлы не загружаются — в рабочей CRM они хранятся вместе со сделкой');
  },
  download: async () => {
    throw new ApiError(400, 'В демо-версии выгрузка файла недоступна — в рабочей CRM отчёт скачивается в CSV');
  },
};
