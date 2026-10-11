import { api } from './api.js';
import { contactName, el } from './ui.js';

/** Справочники (пользователи, компании, контакты) для выпадающих списков. */
const cache = { users: null, companies: null, contacts: null, tags: null, cities: null };

const CITY_KEY = 'crm.cityId';
// Поле ответственного у записей раздела — для охвата «только свои».
const OWN_FIELDS = {
  deals: 'owner_id', contacts: 'owner_id', companies: 'owner_id', tasks: 'assignee_id',
  emails: 'user_id', calls: 'user_id',
};
const readCity = () => {
  try { return localStorage.getItem(CITY_KEY) ?? ''; } catch { return ''; }
};

export const store = {
  user: null,
  // Город, выбранный администратором в переключателе ('' — все города).
  cityId: readCity(),

  isAdmin() {
    return this.user?.role === 'admin';
  },

  /**
   * Права из роли доступа: can('deals', 'create') — может ли заводить сделки;
   * edit — создавать или править хоть что-то, delete — удалять хоть что-то.
   * Кнопки по ним прячутся, но решает всё равно сервер.
   */
  can(section, need = 'read') {
    if (this.isAdmin()) return true;
    const access = this.user?.permissions?.[section];
    if (!access) return false;
    if (need === 'create') return access.create;
    if (need === 'edit') return access.create || access.edit !== 'none';
    if (need === 'delete' || need === 'full') return access.delete !== 'none';
    return access.read !== 'none';
  },

  /** Можно ли править (edit) или удалять (delete) именно эту запись. */
  canRow(section, action, row) {
    if (this.isAdmin()) return true;
    const scope = this.user?.permissions?.[section]?.[action] ?? 'none';
    if (scope === 'none' || !row) return false;
    if (scope === 'all') return true;
    const sameCity = (row.city_id ?? null) === (this.user.city_id ?? null);
    if (scope === 'city') return sameCity;
    const field = OWN_FIELDS[section];
    if (!field) return true; // переписку проверит сервер
    const own = row[field] === this.user.id;
    return scope === 'own' ? own : own || (sameCity && row[field] == null);
  },

  /** Настройка роли: суммы, контакты клиентов, выгрузка. Администратору можно всё. */
  option(name) {
    if (this.isAdmin()) return { amounts: 'edit', contacts: 'edit', export: true, assign: 'all' }[name];
    return this.user?.options?.[name];
  },

  /** Видны ли записи других городов — тогда нужен переключатель городов. */
  seesAllCities() {
    if (this.isAdmin()) return true;
    return Object.entries(this.user?.permissions ?? {})
      .some(([section, access]) => section !== 'products' && access.read === 'all');
  },

  setCity(cityId) {
    this.cityId = cityId ? String(cityId) : '';
    try { localStorage.setItem(CITY_KEY, this.cityId); } catch { /* хранилище недоступно — выбор живёт до перезагрузки */ }
  },

  /** Города, доступные пользователю: все — администратору, свой — менеджеру. */
  async cities(force = false) {
    if (force) cache.cities = null;
    cache.cities ??= (await api.get('/api/cities')).items;
    return cache.cities;
  },

  invalidate(...keys) {
    for (const key of keys.length ? keys : Object.keys(cache)) cache[key] = null;
  },

  async users() {
    cache.users ??= (await api.get('/api/users')).items;
    return cache.users;
  },

  async companies() {
    cache.companies ??= (await api.get('/api/companies', { limit: 200 })).items;
    return cache.companies;
  },

  async contacts() {
    cache.contacts ??= (await api.get('/api/contacts', { limit: 200 })).items;
    return cache.contacts;
  },

  /** Рекламные кампании (хэштеги). force — перечитать после изменений. */
  async tags(force = false) {
    if (force) cache.tags = null;
    cache.tags ??= (await api.get('/api/tags')).items;
    return cache.tags;
  },

  async options() {
    const [users, companies, contacts] = await Promise.all([this.users(), this.companies(), this.contacts()]);
    const empty = [{ value: '', label: '— не выбрано —' }];
    return {
      users: empty.concat(users.map((user) => ({
        value: user.id,
        label: this.isAdmin() && user.city_name ? `${user.name} · ${user.city_name}` : user.name,
      }))),
      companies: empty.concat(companies.map((company) => ({ value: company.id, label: company.name }))),
      contacts: empty.concat(contacts.map((contact) => ({ value: contact.id, label: contactName(contact) }))),
    };
  },
};

/** cityId для запросов: только у того, кому видны все города, и только если город выбран. */
export const cityParam = () => (store.seesAllCities() && store.cityId ? store.cityId : undefined);

/** Кнопка или поле — только если хватает прав, иначе ничего. */
export const allow = (section, need, node) => (store.can(section, need) ? node : null);

/** То же для конкретной записи: allowRow('deals', 'delete', deal, кнопка). */
export const allowRow = (section, action, row, node) => (store.canRow(section, action, row) ? node : null);

/** Подпись города у записи — нужна администратору, когда он смотрит все города сразу. */
export const cityTag = (row) => (store.seesAllCities() && !store.cityId && row?.city_name
  ? el('div', { class: 'city-tag', text: `📍 ${row.city_name}` })
  : null);
