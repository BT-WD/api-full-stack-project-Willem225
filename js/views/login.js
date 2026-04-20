import { el, clear } from '../ui.js';
import { api, setSession } from '../api.js';

export function renderLogin({ view, navigate, toast }) {
  clear(view);

  const identifier = el('input', { class: 'input', type: 'text', placeholder: 'Username or email', autocomplete: 'username' });
  const password   = el('input', { class: 'input', type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
  const submit     = el('button', { class: 'btn btn-primary', type: 'submit' }, 'Log in');

  const form = el('form', {
    class: 'form',
    onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        const res = await api.login({ identifier: identifier.value.trim(), password: password.value });
        setSession(res.token, res.user);
        toast(`Welcome back, ${res.user.username}.`, 'ok');
        navigate('#/decks');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        submit.disabled = false;
      }
    },
  }, [
    el('h1', {}, 'Log in'),
    el('div', { class: 'field' }, [
      el('label', { for: 'identifier' }, 'Username or email'),
      identifier,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'password' }, 'Password'),
      password,
    ]),
    el('div', { class: 'row mt-2' }, [
      submit,
      el('a', { href: '#/signup', class: 'btn btn-ghost btn-sm' }, 'Need an account?'),
    ]),
  ]);

  view.appendChild(form);
  identifier.focus();
}
