import { api } from './api.js';
import { contactName, el } from './ui.js';

/** Справочники (пользователи, компании, контакты) для выпадающих списков. */
const cache = { users: null, companies: null, contacts: null, tags: null, cities: null };

const CITY_KEY = 'crm.cityId';
const LEVELS = ['none', 'read', 'edit', 'full'];
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
   * Права из роли доступа: can('deals', 'edit') — может ли править сделки.
   * Кнопки по ним прячутся, но решает всё равно сервер.
   */
  can(section, need = 'read') {
    if (this.isAdmin()) return true;
    const level = this.user?.permissions?.[section]?.level ?? 'none';
    return LEVELS.indexOf(level) >= LEVELS.indexOf(need);
  },

  /** Видны ли записи других городов — тогда нужен переключатель городов. */
  seesAllCities() {
    if (this.isAdmin()) return true;
    return Object.entries(this.user?.permissions ?? {})
      .some(([section, access]) => section !== 'products' && access.level !== 'none' && access.scope === 'all');
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

/** Подпись города у записи — нужна администратору, когда он смотрит все города сразу. */
export const cityTag = (row) => (store.seesAllCities() && !store.cityId && row?.city_name
  ? el('div', { class: 'city-tag', text: `📍 ${row.city_name}` })
  : null);
