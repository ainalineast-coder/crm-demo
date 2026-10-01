import { api } from './api.js';
import { contactName } from './ui.js';

/** Справочники (пользователи, компании, контакты) для выпадающих списков. */
const cache = { users: null, companies: null, contacts: null, tags: null };

export const store = {
  user: null,

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
      users: empty.concat(users.map((user) => ({ value: user.id, label: user.name }))),
      companies: empty.concat(companies.map((company) => ({ value: company.id, label: company.name }))),
      contacts: empty.concat(contacts.map((contact) => ({ value: contact.id, label: contactName(contact) }))),
    };
  },
};
