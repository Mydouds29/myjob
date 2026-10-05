// Page de connexion.
const form = document.querySelector('#form-login');
const erreur = document.querySelector('#login-erreur');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  erreur.hidden = true;
  const res = await fetch('api/connexion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(new FormData(form))),
  });
  if (res.ok) {
    location.href = './';
  } else {
    erreur.textContent = (await res.json().catch(() => ({}))).error || 'Connexion impossible.';
    erreur.hidden = false;
  }
});
