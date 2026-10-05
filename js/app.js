// MyJob : suivi des candidatures, CV et lettres de motivation.
// Les données sont stockées dans le navigateur (localStorage) et peuvent être
// exportées / importées en JSON pour la sauvegarde.

const STORAGE_KEY = 'myjob.v1';

const STATUTS = [
  { id: 'a_postuler', label: 'À postuler' },
  { id: 'postule', label: 'Postulé' },
  { id: 'relance', label: 'Relancé' },
  { id: 'entretien', label: 'Entretien' },
  { id: 'offre', label: 'Offre reçue' },
  { id: 'refus', label: 'Refusé' },
  { id: 'abandon', label: 'Abandonné' },
];
const statutLabel = (id) => STATUTS.find((s) => s.id === id)?.label ?? id;

// ---------- Données ----------

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.offres) && Array.isArray(data.documents)) return data;
  } catch { /* données absentes ou invalides */ }
  return { offres: [], documents: [] };
}

let state = load();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);

// ---------- Utilitaires d'affichage ----------

const $ = (sel) => document.querySelector(sel);

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function safeUrl(url) {
  return /^https?:\/\//i.test(url || '') ? url : '';
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function docLink(id) {
  const doc = state.documents.find((d) => d.id === id);
  if (!doc) return '';
  const url = safeUrl(doc.lien);
  return url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(doc.nom)}</a>`
    : esc(doc.nom);
}

// ---------- Vue candidatures ----------

let activeStatut = '';

function renderStats() {
  const counts = Object.fromEntries(STATUTS.map((s) => [s.id, 0]));
  state.offres.forEach((o) => { counts[o.statut] = (counts[o.statut] || 0) + 1; });
  const items = [{ id: '', label: 'Total', n: state.offres.length }]
    .concat(STATUTS.map((s) => ({ ...s, n: counts[s.id] })));
  $('#stats').innerHTML = items.map((s) => `
    <div class="stat ${activeStatut === s.id ? 'selected' : ''}" data-statut="${s.id}">
      <div class="n">${s.n}</div><div class="l">${esc(s.label)}</div>
    </div>`).join('');
}

function filteredOffres() {
  const q = $('#search').value.trim().toLowerCase();
  const [field, dir] = $('#sort').value.split('-');
  return state.offres
    .filter((o) => !activeStatut || o.statut === activeStatut)
    .filter((o) => !q || [o.entreprise, o.poste, o.lieu, o.source, o.contact, o.notes]
      .some((v) => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => {
      const va = (a[field] || '').toLowerCase();
      const vb = (b[field] || '').toLowerCase();
      // Les valeurs vides vont toujours en fin de liste.
      if (!va && vb) return 1;
      if (va && !vb) return -1;
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
}

function renderOffres() {
  renderStats();
  const rows = filteredOffres();
  const now = today();
  $('#offres-body').innerHTML = rows.map((o) => {
    const url = safeUrl(o.lien);
    const titre = url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(o.poste)}</a>`
      : esc(o.poste);
    const enAttente = ['postule', 'relance'].includes(o.statut);
    const overdue = o.dateRelance && o.dateRelance <= now && enAttente;
    const docs = [docLink(o.cvId), docLink(o.lettreId)].filter(Boolean).join('<br>');
    return `<tr>
      <td><strong>${esc(o.entreprise)}</strong><br>${titre}
        ${o.lieu ? `<div class="sub">${esc(o.lieu)}</div>` : ''}</td>
      <td><span class="badge s-${esc(o.statut)}">${esc(statutLabel(o.statut))}</span></td>
      <td>${fmtDate(o.dateCandidature)}</td>
      <td class="${overdue ? 'overdue' : ''}" title="${overdue ? 'Relance à faire' : ''}">${fmtDate(o.dateRelance)}</td>
      <td class="sub">${docs || '—'}</td>
      <td class="actions">
        <button class="btn small" data-edit-offre="${o.id}">Modifier</button>
        <button class="btn small danger" data-del-offre="${o.id}">Supprimer</button>
      </td>
    </tr>`;
  }).join('');
  $('#offres-empty').hidden = rows.length > 0;
  $('#offres-empty').textContent = state.offres.length
    ? 'Aucune candidature ne correspond aux filtres.'
    : 'Aucune candidature pour le moment. Cliquez sur « Nouvelle offre » pour commencer.';
}

function fillDocSelect(select, type, selected) {
  const docs = state.documents.filter((d) => d.type === type);
  select.innerHTML = '<option value="">—</option>' + docs
    .map((d) => `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${esc(d.nom)}</option>`)
    .join('');
}

function openOffre(id) {
  const form = $('#form-offre');
  const o = state.offres.find((x) => x.id === id)
    || { statut: 'postule', dateCandidature: today() };
  form.reset();
  $('#dlg-offre-title').textContent = id ? 'Modifier la candidature' : 'Nouvelle offre';
  form.statut.innerHTML = STATUTS.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  fillDocSelect(form.cvId, 'cv', o.cvId);
  fillDocSelect(form.lettreId, 'lettre', o.lettreId);
  ['id', 'entreprise', 'poste', 'lieu', 'lien', 'source', 'contact', 'statut',
    'dateCandidature', 'dateRelance', 'salaire', 'cvId', 'lettreId', 'notes']
    .forEach((k) => { form[k].value = o[k] ?? ''; });
  $('#dlg-offre').showModal();
}

$('#form-offre').addEventListener('submit', (e) => {
  const data = Object.fromEntries(new FormData(e.target));
  if (data.id) {
    const i = state.offres.findIndex((o) => o.id === data.id);
    state.offres[i] = { ...state.offres[i], ...data, majLe: today() };
  } else {
    state.offres.push({ ...data, id: uid(), creeLe: today() });
  }
  save();
  renderAll();
});

// ---------- Vue documents ----------

function renderDocs() {
  $('#docs-body').innerHTML = state.documents.map((d) => {
    const usages = state.offres.filter((o) => o.cvId === d.id || o.lettreId === d.id);
    const url = safeUrl(d.lien);
    return `<tr>
      <td>${d.type === 'cv' ? 'CV' : 'Lettre'}</td>
      <td><strong>${esc(d.nom)}</strong>${d.notes ? `<div class="sub">${esc(d.notes)}</div>` : ''}</td>
      <td>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Ouvrir</a>` : '—'}</td>
      <td class="sub">${usages.length
        ? usages.map((o) => esc(o.entreprise)).join(', ')
        : 'Aucune candidature'}</td>
      <td class="actions">
        <button class="btn small" data-edit-doc="${d.id}">Modifier</button>
        <button class="btn small danger" data-del-doc="${d.id}">Supprimer</button>
      </td>
    </tr>`;
  }).join('');
  $('#docs-empty').hidden = state.documents.length > 0;
}

function openDoc(id) {
  const form = $('#form-doc');
  const d = state.documents.find((x) => x.id === id) || { type: 'cv' };
  form.reset();
  $('#dlg-doc-title').textContent = id ? 'Modifier le document' : 'Nouveau document';
  ['id', 'type', 'nom', 'lien', 'notes'].forEach((k) => { form[k].value = d[k] ?? ''; });
  $('#dlg-doc').showModal();
}

$('#form-doc').addEventListener('submit', (e) => {
  const data = Object.fromEntries(new FormData(e.target));
  if (data.id) {
    const i = state.documents.findIndex((d) => d.id === data.id);
    state.documents[i] = { ...state.documents[i], ...data };
  } else {
    state.documents.push({ ...data, id: uid() });
  }
  save();
  renderAll();
});

// ---------- Événements ----------

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, .stat');
  if (!t) return;

  if (t.matches('[data-close]')) t.closest('dialog').close();
  if (t.id === 'btn-add-offre') openOffre();
  if (t.id === 'btn-add-doc') openDoc();
  if (t.dataset.editOffre) openOffre(t.dataset.editOffre);
  if (t.dataset.editDoc) openDoc(t.dataset.editDoc);

  if (t.dataset.delOffre) {
    const o = state.offres.find((x) => x.id === t.dataset.delOffre);
    if (confirm(`Supprimer la candidature « ${o.poste} » chez ${o.entreprise} ?`)) {
      state.offres = state.offres.filter((x) => x.id !== o.id);
      save(); renderAll();
    }
  }
  if (t.dataset.delDoc) {
    const d = state.documents.find((x) => x.id === t.dataset.delDoc);
    if (confirm(`Supprimer le document « ${d.nom} » ? Il sera retiré des candidatures associées.`)) {
      state.documents = state.documents.filter((x) => x.id !== d.id);
      state.offres.forEach((o) => {
        if (o.cvId === d.id) o.cvId = '';
        if (o.lettreId === d.id) o.lettreId = '';
      });
      save(); renderAll();
    }
  }

  if (t.classList.contains('stat')) {
    activeStatut = t.dataset.statut;
    $('#filter-statut').value = activeStatut;
    renderOffres();
  }

  if (t.classList.contains('tab')) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === t));
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${t.dataset.view}`; });
  }
});

$('#search').addEventListener('input', renderOffres);
$('#sort').addEventListener('change', renderOffres);
$('#filter-statut').addEventListener('change', (e) => {
  activeStatut = e.target.value;
  renderOffres();
});

$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `myjob-sauvegarde-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#input-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.offres) || !Array.isArray(data.documents)) throw new Error('format');
    if (confirm(`Remplacer les données actuelles par ${data.offres.length} candidature(s) et ${data.documents.length} document(s) ?`)) {
      state = data;
      save();
      renderAll();
    }
  } catch {
    alert('Fichier invalide : ce n\'est pas une sauvegarde MyJob.');
  }
});

// ---------- Démarrage ----------

function renderAll() {
  renderOffres();
  renderDocs();
}

$('#filter-statut').innerHTML += STATUTS
  .map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
renderAll();
