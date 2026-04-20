import { el, clear } from '../ui.js';
import { api, setSession } from '../api.js';

export function renderSignup({ view, navigate, toast }) {
  clear(view);

  const username = el('input', { class: 'input', type: 'text', placeholder: 'yourname', autocomplete: 'username' });
  const email    = el('input', { class: 'input', type: 'email', placeholder: 'you@example.com', autocomplete: 'email' });
  const password = el('input', { class: 'input', type: 'password', placeholder: '8+ characters', autocomplete: 'new-password' });
  const submit   = el('button', { class: 'btn btn-primary', type: 'submit' }, 'Create account');

  const form = el('form', {
    class: 'form',
    onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        const res = await api.signup({
          username: username.value.trim(),
          email: email.value.trim(),
          password: password.value,
        });
        setSession(res.token, res.user);
        toast(`Welcome, ${res.user.username}.`, 'ok');
        navigate('#/decks');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        submit.disabled = false;
      }
    },
  }, [
    el('h1', {}, 'Sign up'),
    el('div', { class: 'field' }, [el('label', {}, 'Username'), username]),
    el('div', { class: 'field' }, [el('label', {}, 'Email'),    email]),
    el('div', { class: 'field' }, [el('label', {}, 'Password'), password]),
    el('div', { class: 'row mt-2' }, [
      submit,
      el('a', { href: '#/login', class: 'btn btn-ghost btn-sm' }, 'Already have an account?'),
    ]),
  ]);

  view.appendChild(form);
  username.focus();
}
