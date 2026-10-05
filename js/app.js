// MyJob : suivi des candidatures, CV et lettres de motivation.
// Pour l'instant les données sont stockées dans le navigateur (localStorage)
// et peuvent être exportées / importées en JSON. load() et save() sont les
// seuls points d'accès au stockage, pour pouvoir brancher un serveur ensuite.

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
const EN_ATTENTE = ['postule', 'relance'];
const AVEC_REPONSE = ['entretien', 'offre', 'refus'];

const DEFAULT_SETTINGS = { theme: 'auto', delaiRelance: 10, alerteRelances: true };

// ---------- Données ----------

function load() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* invalide */ }
  if (!data || !Array.isArray(data.offres) || !Array.isArray(data.documents)) {
    data = { offres: [], documents: [] };
  }
  data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  data.offres.forEach((o) => {
    o.type ??= 'offre';
    o.historique ??= [];
    o.motsCles ??= [];
  });
  return data;
}

let state = load();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

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

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

const relanceDue = (o) => o.dateRelance && o.dateRelance <= today() && EN_ATTENTE.includes(o.statut);

// ---------- Vue candidatures ----------

let activeStatut = '';

function renderStats() {
  const counts = Object.fromEntries(STATUTS.map((s) => [s.id, 0]));
  state.offres.forEach((o) => { counts[o.statut] = (counts[o.statut] || 0) + 1; });
  const items = [{ id: '', label: 'Total', n: state.offres.length }]
    .concat(STATUTS.map((s) => ({ ...s, n: counts[s.id] })));

  const envoyees = state.offres.filter((o) => o.statut !== 'a_postuler').length;
  const reponses = state.offres.filter((o) => AVEC_REPONSE.includes(o.statut)).length;
  const taux = envoyees ? Math.round((reponses / envoyees) * 100) : 0;
  const semaine = state.offres.filter((o) => o.dateCandidature && o.dateCandidature > addDays(today(), -7)).length;

  $('#stats').innerHTML = items.map((s) => `
    <div class="stat ${activeStatut === s.id ? 'selected' : ''}" data-statut="${s.id}">
      <div class="n">${s.n}</div><div class="l">${esc(s.label)}</div>
    </div>`).join('') + `
    <div class="stat info" title="Entretiens, offres et refus, rapportés aux candidatures envoyées">
      <div class="n">${taux} %</div><div class="l">Taux de réponse</div>
    </div>
    <div class="stat info"><div class="n">${semaine}</div><div class="l">Ces 7 derniers jours</div></div>`;
}

function renderRelances() {
  const dues = state.offres.filter(relanceDue);
  const el = $('#relances');
  el.hidden = !state.settings.alerteRelances || dues.length === 0;
  el.innerHTML = dues.length
    ? `<strong>${dues.length} relance${dues.length > 1 ? 's' : ''} à faire :</strong> `
      + dues.map((o) => `<a href="#" data-edit-offre="${o.id}">${esc(o.entreprise)}</a>`).join(', ')
    : '';
}

function searchText(o) {
  const histo = o.historique.map((h) => h.texte).join(' ');
  return [o.entreprise, o.poste, o.lieu, o.source, o.contact, o.reference, o.contrat,
    o.notes, o.texteOffre, histo, o.motsCles.join(' ')].join(' ').toLowerCase();
}

function filteredOffres() {
  const q = $('#search').value.trim().toLowerCase();
  const [field, dir] = $('#sort').value.split('-');
  return state.offres
    .filter((o) => !activeStatut || o.statut === activeStatut)
    .filter((o) => !q || q.split(/\s+/).every((w) => searchText(o).includes(w)))
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
  renderRelances();
  const rows = filteredOffres();
  $('#offres-body').innerHTML = rows.map((o) => {
    const url = safeUrl(o.lien);
    const posteTxt = o.poste || (o.type === 'spontanee' ? 'Candidature spontanée' : '');
    const titre = url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(posteTxt)}</a>`
      : esc(posteTxt);
    const tag = o.type === 'spontanee' ? '<span class="tag">spontanée</span>' : '';
    const details = [o.lieu, o.contrat].filter(Boolean).map(esc).join(' · ');
    const docs = [docLink(o.cvId), docLink(o.lettreId)].filter(Boolean).join('<br>');
    const overdue = relanceDue(o);
    return `<tr>
      <td class="clickable" data-edit-offre="${o.id}"><strong>${esc(o.entreprise)}</strong>${tag}<br>${titre}
        ${details ? `<div class="sub">${details}</div>` : ''}</td>
      <td><span class="badge s-${esc(o.statut)}">${esc(statutLabel(o.statut))}</span></td>
      <td data-label="Candidature">${fmtDate(o.dateCandidature)}</td>
      <td data-label="Relance" class="${overdue ? 'overdue' : ''}" title="${overdue ? 'Relance à faire' : ''}">${fmtDate(o.dateRelance)}</td>
      <td class="sub">${docs}</td>
      <td class="actions">
        <button class="btn small" data-edit-offre="${o.id}">Ouvrir</button>
        <button class="btn small" data-lettre="${o.id}" title="Générer une lettre depuis un modèle">Lettre</button>
        <button class="btn small danger" data-del-offre="${o.id}">Supprimer</button>
      </td>
    </tr>`;
  }).join('');
  $('#offres-empty').hidden = rows.length > 0;
  $('#offres-empty').textContent = state.offres.length
    ? 'Aucune candidature ne correspond aux filtres.'
    : 'Aucune candidature pour le moment. Cliquez sur « Nouvelle candidature » pour commencer.';
}

// ---------- Formulaire candidature ----------

const OFFRE_FIELDS = ['id', 'entreprise', 'poste', 'lieu', 'lien', 'reference', 'source', 'contact',
  'contrat', 'teletravail', 'salaire', 'statut', 'dateCandidature', 'dateRelance', 'cvId',
  'lettreId', 'texteOffre', 'notes'];

let editing = null; // copie de travail de la candidature ouverte

function fillDocSelect(select, type, selected) {
  const docs = state.documents.filter((d) => d.type === type);
  select.innerHTML = '<option value="">—</option>' + docs
    .map((d) => `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${esc(d.nom)}</option>`)
    .join('');
}

function setOffreType(type) {
  const form = $('#form-offre');
  form.dataset.type = type;
  form.querySelector(`[name=type][value=${type}]`).checked = true;
}

function openOffre(id) {
  const form = $('#form-offre');
  const existing = state.offres.find((x) => x.id === id);
  const d = today();
  editing = existing
    ? structuredClone(existing)
    : {
      type: 'offre', statut: 'postule', dateCandidature: d, historique: [], motsCles: [],
      dateRelance: state.settings.delaiRelance > 0 ? addDays(d, state.settings.delaiRelance) : '',
    };
  form.reset();
  $('#dlg-offre-title').textContent = existing ? 'Candidature' : 'Nouvelle candidature';
  form.statut.innerHTML = STATUTS.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  fillDocSelect(form.cvId, 'cv', editing.cvId);
  fillDocSelect(form.lettreId, 'lettre', editing.lettreId);
  OFFRE_FIELDS.forEach((k) => { form[k].value = editing[k] ?? ''; });
  setOffreType(editing.type);
  $('#section-texte').open = !existing || Boolean(editing.texteOffre);
  $('#section-historique').open = editing.historique.length > 0;
  $('#histo-date').value = d;
  $('#histo-texte').value = '';
  renderAnalyse(editing.texteOffre ? analyseOffre(editing.texteOffre) : null);
  renderHistorique();
  $('#dlg-offre').showModal();
}

function renderHistorique() {
  // Plus récent en premier ; à date égale, le dernier ajouté en premier.
  const items = [...editing.historique].reverse().sort((a, b) => b.date.localeCompare(a.date));
  $('#historique').innerHTML = items.map((h) => `
    <li><time>${fmtDate(h.date)}</time><span>${esc(h.texte)}</span>
      <button type="button" data-del-histo="${h.id}" title="Supprimer">✕</button></li>`).join('');
}

function renderAnalyse(res) {
  const el = $('#analyse');
  if (!res) { el.innerHTML = ''; return; }
  const group = (title, list, cls) => (list.length ? `
    <div class="kw-group"><h4>${title}</h4>${list.map((k) =>
      `<span class="chip ${cls}">${esc(k.label)}${k.n > 1 ? ` <small>×${k.n}</small>` : ''}</span>`).join('')}</div>` : '');
  el.innerHTML = (group('Compétences techniques', res.tech, 'tech')
    + group('Qualités attendues', res.soft, '')
    + group('Mots les plus répétés', res.frequents, ''))
    || '<p class="hint">Aucun mot-clé repéré. Collez le texte complet de l\'annonce.</p>';
}

$('#form-offre').addEventListener('change', (e) => {
  if (e.target.name === 'type') setOffreType(e.target.value);
  if (e.target.name === 'dateCandidature' && e.target.value && !e.target.form.dateRelance.value
      && state.settings.delaiRelance > 0) {
    e.target.form.dateRelance.value = addDays(e.target.value, state.settings.delaiRelance);
  }
});

$('#btn-analyse').addEventListener('click', () => {
  renderAnalyse(analyseOffre($('#form-offre').texteOffre.value));
});

$('#btn-histo-add').addEventListener('click', () => {
  const texte = $('#histo-texte').value.trim();
  if (!texte) return;
  editing.historique.push({ id: uid(), date: $('#histo-date').value || today(), texte });
  $('#histo-texte').value = '';
  renderHistorique();
});
$('#histo-texte').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('#btn-histo-add').click(); }
});

$('#form-offre').addEventListener('submit', (e) => {
  const data = Object.fromEntries(new FormData(e.target));
  const prev = state.offres.find((o) => o.id === data.id);
  const offre = { ...editing, ...data };
  const res = analyseOffre(offre.texteOffre);
  offre.motsCles = offre.texteOffre ? [...res.tech, ...res.soft].map((k) => k.label) : [];

  if (prev && prev.statut !== offre.statut) {
    offre.historique.push({ id: uid(), date: today(), texte: `Statut : ${statutLabel(offre.statut)}` });
  }
  if (prev) {
    Object.assign(prev, offre, { majLe: today() });
  } else {
    offre.historique.push({ id: uid(), date: offre.dateCandidature || today(),
      texte: offre.statut === 'a_postuler' ? 'Ajoutée à la liste' : 'Candidature envoyée' });
    state.offres.push({ ...offre, id: uid(), creeLe: today() });
  }
  editing = null;
  save();
  renderAll();
});

// ---------- Lettre depuis un modèle ----------

let lettreOffre = null;

function fillLettre() {
  const modele = state.documents.find((d) => d.id === $('#lettre-modele').value);
  const o = lettreOffre;
  const competences = o.motsCles.slice(0, 6).join(', ');
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#lettre-texte').value = (modele?.contenu || '')
    .replaceAll('{entreprise}', o.entreprise || '')
    .replaceAll('{poste}', o.poste || '')
    .replaceAll('{competences}', competences)
    .replaceAll('{date}', date);
}

function openLettre(id) {
  lettreOffre = state.offres.find((o) => o.id === id);
  const modeles = state.documents.filter((d) => d.type === 'modele');
  if (!modeles.length) {
    alert('Créez d\'abord un modèle de lettre dans l\'onglet « CV & lettres ».');
    return;
  }
  $('#lettre-modele').innerHTML = modeles.map((m) => `<option value="${m.id}">${esc(m.nom)}</option>`).join('');
  fillLettre();
  $('#dlg-lettre').showModal();
}

$('#lettre-modele').addEventListener('change', fillLettre);
$('#btn-copy-lettre').addEventListener('click', async (e) => {
  const txt = $('#lettre-texte');
  try { await navigator.clipboard.writeText(txt.value); } catch { txt.select(); document.execCommand('copy'); }
  e.target.textContent = 'Copiée ✓';
  setTimeout(() => { e.target.textContent = 'Copier'; }, 1500);
});

// ---------- Vue entreprises ----------

function renderEntreprises() {
  const byName = {};
  state.offres.forEach((o) => {
    const key = (o.entreprise || '').trim().toLowerCase();
    if (!key) return;
    (byName[key] ||= { nom: o.entreprise.trim(), offres: [] }).offres.push(o);
  });
  const rows = Object.values(byName).map((e) => {
    const dates = e.offres.flatMap((o) => [o.dateCandidature, ...o.historique.map((h) => h.date)]).filter(Boolean);
    const dernier = dates.sort().at(-1) || '';
    const recente = [...e.offres].sort((a, b) => (b.dateCandidature || '').localeCompare(a.dateCandidature || ''))[0];
    return { ...e, dernier, statut: recente.statut };
  }).sort((a, b) => b.dernier.localeCompare(a.dernier));

  $('#entreprises-body').innerHTML = rows.map((e) => `
    <tr class="clickable" data-entreprise="${esc(e.nom)}">
      <td><strong>${esc(e.nom)}</strong></td>
      <td data-label="Candidatures">${e.offres.length}</td>
      <td><span class="badge s-${esc(e.statut)}">${esc(statutLabel(e.statut))}</span></td>
      <td data-label="Dernier échange">${fmtDate(e.dernier)}</td>
    </tr>`).join('');
  $('#entreprises-empty').hidden = rows.length > 0;
}

// ---------- Vue documents ----------

const DOC_TYPES = { cv: 'CV', lettre: 'Lettre', modele: 'Modèle' };

function renderDocs() {
  $('#docs-body').innerHTML = state.documents.map((d) => {
    const usages = state.offres.filter((o) => o.cvId === d.id || o.lettreId === d.id);
    const url = safeUrl(d.lien);
    return `<tr>
      <td>${DOC_TYPES[d.type] || d.type}</td>
      <td><strong>${esc(d.nom)}</strong>${d.notes ? `<div class="sub">${esc(d.notes)}</div>` : ''}</td>
      <td>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Ouvrir</a>` : ''}</td>
      <td class="sub">${d.type === 'modele' ? '' : usages.length
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
  ['id', 'type', 'nom', 'lien', 'contenu', 'notes'].forEach((k) => { form[k].value = d[k] ?? ''; });
  form.dataset.doctype = d.type;
  $('#dlg-doc').showModal();
}

$('#form-doc').addEventListener('change', (e) => {
  if (e.target.name === 'type') e.target.form.dataset.doctype = e.target.value;
});

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

// ---------- Paramètres ----------

function renderSettings() {
  const form = $('#form-settings');
  form.theme.value = state.settings.theme;
  form.delaiRelance.value = state.settings.delaiRelance;
  form.alerteRelances.checked = state.settings.alerteRelances;
}

$('#form-settings').addEventListener('change', (e) => {
  const form = e.currentTarget;
  state.settings = {
    ...state.settings,
    theme: form.theme.value,
    delaiRelance: Math.max(0, parseInt(form.delaiRelance.value, 10) || 0),
    alerteRelances: form.alerteRelances.checked,
  };
  save();
  applyTheme();
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      state = load();
      save();
      applyTheme();
      renderAll();
    }
  } catch {
    alert('Fichier invalide : ce n\'est pas une sauvegarde MyJob.');
  }
});

// ---------- Navigation et événements ----------

function showView(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a, .stat, [data-edit-offre], [data-entreprise]');
  if (!t) return;
  const ds = t.dataset;

  if (t.matches('[data-close]')) t.closest('dialog').close();
  if (t.id === 'btn-add-offre') openOffre();
  if (t.id === 'btn-add-doc') openDoc();
  if (ds.editOffre) { e.preventDefault(); openOffre(ds.editOffre); }
  if (ds.editDoc) openDoc(ds.editDoc);
  if (ds.lettre) openLettre(ds.lettre);

  if (ds.delHisto) {
    editing.historique = editing.historique.filter((h) => h.id !== ds.delHisto);
    renderHistorique();
  }

  if (ds.delOffre) {
    const o = state.offres.find((x) => x.id === ds.delOffre);
    if (confirm(`Supprimer la candidature chez ${o.entreprise} ?`)) {
      state.offres = state.offres.filter((x) => x.id !== o.id);
      save(); renderAll();
    }
  }
  if (ds.delDoc) {
    const d = state.documents.find((x) => x.id === ds.delDoc);
    if (confirm(`Supprimer le document « ${d.nom} » ? Il sera retiré des candidatures associées.`)) {
      state.documents = state.documents.filter((x) => x.id !== d.id);
      state.offres.forEach((o) => {
        if (o.cvId === d.id) o.cvId = '';
        if (o.lettreId === d.id) o.lettreId = '';
      });
      save(); renderAll();
    }
  }

  if (t.classList.contains('stat') && !t.classList.contains('info')) {
    activeStatut = ds.statut;
    $('#filter-statut').value = activeStatut;
    renderOffres();
  }

  if (ds.entreprise) {
    activeStatut = '';
    $('#filter-statut').value = '';
    $('#search').value = ds.entreprise;
    showView('offres');
    renderOffres();
  }

  if (t.classList.contains('tab')) showView(ds.view);
});

$('#search').addEventListener('input', renderOffres);
$('#sort').addEventListener('change', renderOffres);
$('#filter-statut').addEventListener('change', (e) => {
  activeStatut = e.target.value;
  renderOffres();
});

// Raccourci : « / » place le curseur dans la recherche.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.closest('input, textarea, select') && !document.querySelector('dialog[open]')) {
    e.preventDefault();
    showView('offres');
    $('#search').focus();
  }
});

// ---------- Démarrage ----------

function renderAll() {
  renderOffres();
  renderEntreprises();
  renderDocs();
  renderSettings();
}

$('#filter-statut').innerHTML += STATUTS
  .map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
applyTheme();
renderAll();
