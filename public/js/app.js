// MyJob : suivi des candidatures, CV et lettres de motivation.
// Les données sont sur le serveur (API /api, voir server/modules) ; l'état
// complet du compte est chargé au démarrage puis tenu à jour à chaque action.

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
const TYPES_REPONSE = { entretien: 'Proposition d\'entretien', refus: 'Refus', offre: 'Offre d\'embauche', autre: 'Autre' };

let state = { offres: [], documents: [], reglages: {}, utilisateur: {} };

// Annonce envoyée par le favori « Envoyer à MyJob » (dans l'adresse, après #annonce=).
// Gardée dans l'onglet le temps d'une éventuelle connexion, puis retirée de l'adresse.
let annonceRecue = null;
if (location.hash.startsWith('#annonce=')) {
  annonceRecue = location.hash.slice('#annonce='.length);
  try { sessionStorage.setItem('myjob-annonce', annonceRecue); } catch { /* navigation privée */ }
  history.replaceState(null, '', location.pathname + location.search);
}

// ---------- Accès au serveur ----------

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`api/${url}`, opts);
  if (res.status === 401 && url !== 'compte/mot-de-passe') {
    location.href = 'login.html';
    throw new Error('Session expirée');
  }
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).error || `Erreur ${res.status}`;
    throw new Error(msg);
  }
  const type = res.headers.get('content-type') || '';
  return type.includes('application/json') ? res.json() : res.blob();
}

function toast(message, isError = false) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = `toast${isError ? ' err' : ''}`;
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), isError ? 5000 : 2500);
}

// Exécute une action et affiche l'erreur éventuelle plutôt que de l'ignorer.
async function run(fn) {
  try { return await fn(); } catch (err) { toast(err.message, true); return undefined; }
}

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function normaliser(o) {
  o.type ??= 'offre';
  o.historique ??= [];
  o.motsCles ??= [];
  o.reponses ??= [];
  o.entretiens ??= [];
  return o;
}

async function chargerEtat() {
  state = await api('GET', 'etat');
  state.offres.forEach(normaliser);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const today = () => new Date().toLocaleDateString('sv-SE');

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
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

function fileUrl(doc) {
  return doc?.fichier ? `api/documents/${doc.id}/fichier` : safeUrl(doc?.lien);
}

function docLink(id) {
  const doc = state.documents.find((d) => d.id === id);
  if (!doc) return '';
  const url = fileUrl(doc);
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(doc.nom)}</a>` : esc(doc.nom);
}

function applyTheme() {
  const t = state.reglages.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('myjob.theme', t); } catch { /* indisponible */ }
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
  // Délai moyen entre la candidature et la première réponse.
  const delais = state.offres
    .filter((o) => o.dateCandidature && o.reponses.length)
    .map((o) => (new Date(o.reponses.map((r) => r.date).sort()[0]) - new Date(o.dateCandidature)) / 86400000)
    .filter((d) => d >= 0);
  const delaiMoyen = delais.length ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null;

  $('#stats').innerHTML = items.map((s) => `
    <div class="stat ${activeStatut === s.id ? 'selected' : ''}" data-statut="${s.id}">
      <div class="n">${s.n}</div><div class="l">${esc(s.label)}</div>
    </div>`).join('') + `
    <div class="stat info" title="Entretiens, offres et refus, rapportés aux candidatures envoyées">
      <div class="n">${taux} %</div><div class="l">Taux de réponse</div>
    </div>
    <div class="stat info"><div class="n">${semaine}</div><div class="l">Ces 7 derniers jours</div></div>
    ${delaiMoyen === null ? '' : `<div class="stat info" title="Entre la candidature et la première réponse">
      <div class="n">${delaiMoyen} j</div><div class="l">Délai de réponse</div></div>`}`;
}

const fmtHeure = (h) => (h ? h.replace(':', 'h') : '');

function entretiensAVenir() {
  return state.offres.flatMap((o) => o.entretiens.filter((e) => e.date >= today()).map((e) => ({ ...e, offre: o })))
    .sort((a, b) => `${a.date}${a.heure}`.localeCompare(`${b.date}${b.heure}`));
}

function renderEntretiensAVenir() {
  const list = entretiensAVenir();
  const el = $('#entretiens-a-venir');
  el.hidden = list.length === 0;
  el.innerHTML = list.length
    ? `<strong>${list.length > 1 ? 'Prochains entretiens' : 'Prochain entretien'} :</strong> `
      + list.map((e) => `<a href="#" data-edit-offre="${e.offre.id}">${esc(e.offre.entreprise)}</a>
        le ${e.date === today() ? '<strong>aujourd\'hui</strong>' : fmtDate(e.date)}${e.heure ? ` à ${fmtHeure(e.heure)}` : ''} (${esc(e.format)})`).join(' · ')
    : '';
}

function renderRelances() {
  const dues = state.offres.filter(relanceDue);
  const el = $('#relances');
  el.hidden = !state.reglages.alerteRelances || dues.length === 0;
  el.innerHTML = dues.length
    ? `<strong>${dues.length} relance${dues.length > 1 ? 's' : ''} à faire :</strong> `
      + dues.map((o) => `<a href="#" data-edit-offre="${o.id}">${esc(o.entreprise)}</a>`).join(', ')
    : '';
}

function searchText(o) {
  const histo = o.historique.map((h) => h.texte).concat(o.reponses.map((r) => r.message))
    .concat(o.entretiens.flatMap((e) => [e.interlocuteurs, e.preparation, e.compteRendu])).join(' ');
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
  renderEntretiensAVenir();
  renderRelances();
  const rows = filteredOffres();
  $('#offres-body').innerHTML = rows.map((o) => {
    const url = safeUrl(o.lien);
    const posteTxt = o.poste || (o.type === 'spontanee' ? 'Candidature spontanée' : '');
    const titre = url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(posteTxt)}</a>`
      : esc(posteTxt);
    const tag = (o.type === 'spontanee' ? '<span class="tag">spontanée</span>' : '')
      + (o.reponses.length ? `<span class="tag" title="Réponse reçue">✉ ${o.reponses.length}</span>` : '');
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
  const delai = state.reglages.delaiRelance;
  editing = existing
    ? structuredClone(existing)
    : {
      type: 'offre', statut: 'postule', dateCandidature: d, historique: [], motsCles: [], reponses: [], entretiens: [],
      dateRelance: delai > 0 ? addDays(d, delai) : '',
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
  $('#section-entretiens').open = editing.entretiens.length > 0;
  resetEntretienForm();
  renderEntretiens();
  $('#section-reponses').open = editing.reponses.length > 0;
  $('#rep-date').value = d;
  $('#rep-message').value = '';
  renderReponses();
  $('#histo-date').value = d;
  $('#histo-texte').value = '';
  renderAnalyse(editing.texteOffre ? analyseOffre(editing.texteOffre) : null);
  renderAnalyseIA(editing.analyseIA);
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

// ---------- Entretiens ----------

const ENT_CHAMPS = { date: 'ent-date', heure: 'ent-heure', format: 'ent-format', etape: 'ent-etape', lieu: 'ent-lieu',
  interlocuteurs: 'ent-interlocuteurs', preparation: 'ent-preparation', compteRendu: 'ent-compte-rendu', ressenti: 'ent-ressenti' };
const RESSENTI = { 1: '😟 Mauvais', 2: '😐 Moyen', 3: '🙂 Bon', 4: '😀 Très bon' };

function resetEntretienForm() {
  Object.values(ENT_CHAMPS).forEach((id) => { $(`#${id}`).value = ''; });
  $('#ent-format').value = 'sur place';
  $('#ent-etape').selectedIndex = 0;
  $('#ent-id').value = '';
  $('#entretien-titre').textContent = 'Nouvel entretien';
  $('#btn-ent-save').textContent = 'Ajouter l\'entretien';
  $('#btn-ent-cancel').hidden = true;
}

function renderEntretiens() {
  const items = [...editing.entretiens].sort((a, b) => `${b.date}${b.heure}`.localeCompare(`${a.date}${a.heure}`));
  $('#entretiens').innerHTML = items.map((e) => {
    const avenir = e.date >= today();
    const lieu = safeUrl(e.lieu) ? `<a href="${esc(e.lieu)}" target="_blank" rel="noopener">${esc(e.lieu)}</a>` : esc(e.lieu);
    return `<li><div class="entete"><span class="badge ${avenir ? 'r-avenir' : 'r-passe'}">${avenir ? 'À venir' : 'Passé'}</span>
      <strong>${esc(e.etape)}</strong><time>${fmtDate(e.date)}${e.heure ? ` à ${fmtHeure(e.heure)}` : ''} · ${esc(e.format)}</time></div>
      <div class="details">${[lieu, esc(e.interlocuteurs), RESSENTI[e.ressenti] ? `Ressenti : ${RESSENTI[e.ressenti]}` : ''].filter(Boolean).join(' · ')}</div>
      ${e.preparation ? `<p class="message"><strong>Préparation</strong>\n${esc(e.preparation)}</p>` : ''}
      ${e.compteRendu ? `<p class="message"><strong>Compte rendu</strong>\n${esc(e.compteRendu)}</p>` : ''}
      <div class="actions-ent">
        <button type="button" class="btn small" data-edit-ent="${e.id}">Modifier</button>
        <button type="button" class="btn small" data-ics-ent="${e.id}" title="Fichier à ouvrir avec Google Agenda, Outlook ou le téléphone">Ajouter à l'agenda</button>
        <button type="button" class="btn small danger" data-del-ent="${e.id}">Supprimer</button>
      </div></li>`;
  }).join('');
  $('#nb-entretiens').hidden = !editing.entretiens.length;
  $('#nb-entretiens').textContent = editing.entretiens.length;
}

$('#btn-ent-save').addEventListener('click', () => {
  const e = Object.fromEntries(Object.entries(ENT_CHAMPS).map(([k, id]) => [k, $(`#${id}`).value.trim()]));
  if (!e.date) { toast('Indiquez la date de l\'entretien.', true); return; }
  const id = $('#ent-id').value;
  if (id) {
    Object.assign(editing.entretiens.find((x) => x.id === id), e);
  } else {
    editing.entretiens.push({ id: uid(), ...e });
    editing.historique.push({ id: uid(), date: today(), texte: `${e.etape} prévu le ${fmtDate(e.date)}${e.heure ? ` à ${fmtHeure(e.heure)}` : ''}` });
    const form = $('#form-offre');
    if (['a_postuler', 'postule', 'relance'].includes(form.statut.value)) form.statut.value = 'entretien';
    renderHistorique();
  }
  resetEntretienForm();
  renderEntretiens();
  toast('Entretien enregistré dans la fiche : pensez à enregistrer la candidature.');
});

$('#btn-ent-cancel').addEventListener('click', resetEntretienForm);

function editEntretien(id) {
  const e = editing.entretiens.find((x) => x.id === id);
  Object.entries(ENT_CHAMPS).forEach(([k, fid]) => { $(`#${fid}`).value = e[k] ?? ''; });
  $('#ent-id').value = id;
  $('#entretien-titre').textContent = 'Modifier l\'entretien';
  $('#btn-ent-save').textContent = 'Mettre à jour l\'entretien';
  $('#btn-ent-cancel').hidden = false;
  $('#form-entretien').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Fichier agenda (.ics) : heure locale, durée d'une heure.
function icsEntretien(e, o) {
  const echap = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
  const debut = `${e.date.replaceAll('-', '')}T${(e.heure || '09:00').replace(':', '')}00`;
  const d = new Date(`${e.date}T${e.heure || '09:00'}:00`);
  d.setHours(d.getHours() + 1);
  const p2 = (n) => String(n).padStart(2, '0');
  const fin = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyJob//FR', 'BEGIN:VEVENT',
    `UID:${e.id}@myjob`, `DTSTAMP:${stamp}`, `DTSTART:${debut}`, `DTEND:${fin}`,
    `SUMMARY:${echap(`${e.etape} - ${o.entreprise}${o.poste ? ` (${o.poste})` : ''}`)}`,
    `LOCATION:${echap(e.lieu)}`,
    `DESCRIPTION:${echap([`Format : ${e.format}`, e.interlocuteurs && `Interlocuteurs : ${e.interlocuteurs}`, e.preparation && `\n${e.preparation}`].filter(Boolean).join('\n'))}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Entretien dans 2 heures', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

function promptEntretien(form) {
  const etape = $('#ent-etape').value;
  return [
    `Je prépare un ${etape.toLowerCase()} (${$('#ent-format').value}) pour le poste de « ${form.poste.value || 'non précisé'} » chez ${form.entreprise.value}.`,
    $('#ent-interlocuteurs').value ? `Interlocuteurs : ${$('#ent-interlocuteurs').value}.` : '',
    '',
    'Mon profil : technicien de maintenance informatique, compétences polyvalentes.',
    state.reglages.profil ? `Mes compétences : ${state.reglages.profil.replace(/\s*\n\s*/g, ', ')}` : '',
    '',
    'Peux-tu :',
    '1. lister les 10 questions les plus probables (techniques et comportementales) avec, pour chacune, une piste de réponse adaptée à mon profil ;',
    '2. me donner 3 exemples concrets à préparer selon la méthode STAR ;',
    '3. proposer 5 questions pertinentes à poser au recruteur ;',
    '4. signaler les points de l\'annonce où mon profil est moins fort et comment en parler.',
    '',
    'Voici l\'annonce :',
    '"""',
    form.texteOffre.value.trim() || '(candidature spontanée, pas d\'annonce)',
    '"""',
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
}

$('#btn-ent-claude').addEventListener('click', async () => {
  await copier(promptEntretien($('#form-offre')));
  toast('Demande copiée : collez-la dans Claude (claude.ai).');
});

function renderReponses() {
  const items = [...editing.reponses].reverse().sort((a, b) => b.date.localeCompare(a.date));
  $('#reponses').innerHTML = items.map((r) => `
    <li><div class="entete"><span class="badge r-${esc(r.type)}">${esc(TYPES_REPONSE[r.type] || r.type)}</span>
      <time>${fmtDate(r.date)}</time>
      <button type="button" data-del-rep="${r.id}" title="Supprimer">✕</button></div>
      ${r.message ? `<p class="message">${esc(r.message)}</p>` : ''}</li>`).join('');
  $('#nb-reponses').hidden = !editing.reponses.length;
  $('#nb-reponses').textContent = editing.reponses.length;
}

// Statut proposé selon la réponse, tant que la candidature est en attente.
const STATUT_REPONSE = { entretien: 'entretien', refus: 'refus', offre: 'offre' };

$('#btn-rep-add').addEventListener('click', () => {
  const type = $('#rep-type').value;
  const message = $('#rep-message').value.trim();
  const date = $('#rep-date').value || today();
  editing.reponses.push({ id: uid(), date, type, message });
  editing.historique.push({ id: uid(), date, texte: `Réponse reçue : ${TYPES_REPONSE[type]}` });
  const form = $('#form-offre');
  if (STATUT_REPONSE[type] && ['a_postuler', 'postule', 'relance', 'entretien'].includes(form.statut.value)) {
    form.statut.value = STATUT_REPONSE[type];
  }
  $('#rep-message').value = '';
  renderReponses();
  renderHistorique();
  toast('Réponse ajoutée : pensez à enregistrer la candidature.');
});

function renderAnalyse(res) {
  const el = $('#analyse');
  if (!res) { el.innerHTML = ''; return; }
  const profil = state.reglages.profil || '';
  const chips = (list, cls) => list.map((k) => {
    const have = cls !== 'freq' && profil && profilContient(profil, k);
    return `<span class="chip ${cls}${have ? ' have' : ''}">${esc(k.label)}${k.n > 1 ? ` <small>×${k.n}</small>` : ''}</span>`;
  }).join('');
  const group = (title, list, cls) => (list.length ? `<div class="kw-group"><h4>${title}</h4>${chips(list, cls)}</div>` : '');

  let match = '';
  if (profil && res.tech.length) {
    const n = res.tech.filter((k) => profilContient(profil, k)).length;
    match = `<p class="match">Vous avez <strong>${n} des ${res.tech.length}</strong> compétences techniques repérées (✓). Mettez-les en avant dans la lettre.</p>`;
  } else if (res.tech.length) {
    match = '<p class="hint">Renseignez vos compétences dans Paramètres pour voir celles que vous avez déjà.</p>';
  }
  el.innerHTML = (match + group('Compétences techniques', res.tech, 'tech')
    + group('Qualités attendues', res.soft, 'soft')
    + group('Mots les plus répétés', res.frequents, 'freq'))
    || '<p class="hint">Aucun mot-clé repéré. Collez le texte complet de l\'annonce.</p>';
}

function promptClaude(form) {
  const res = analyseOffre(form.texteOffre.value);
  const motsCles = [...res.tech, ...res.soft].map((k) => k.label).join(', ');
  return [
    `Je postule au poste de « ${form.poste.value || 'non précisé'} » chez ${form.entreprise.value || 'une entreprise'}${form.lieu.value ? ` (${form.lieu.value})` : ''}.`,
    '',
    'Mon profil : technicien de maintenance informatique, compétences polyvalentes.',
    state.reglages.profil ? `Mes compétences : ${state.reglages.profil.replace(/\s*\n\s*/g, ', ')}` : '',
    '',
    motsCles ? `Mots-clés repérés dans l'annonce : ${motsCles}` : '',
    '',
    'Peux-tu :',
    '1. lister les 5 attentes principales du recruteur et ce qu\'il faut mettre en avant ;',
    '2. indiquer les points de mon profil qui correspondent et ceux à compenser ;',
    '3. rédiger une lettre de motivation sobre (moins d\'une page), en français, qui reprend ces mots-clés sans en abuser.',
    '',
    'Voici l\'annonce :',
    '"""',
    form.texteOffre.value.trim() || '(candidature spontanée, pas d\'annonce)',
    '"""',
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
}

async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
  } catch {
    const t = document.createElement('textarea');
    t.value = texte;
    document.body.append(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
}

$('#form-offre').addEventListener('change', (e) => {
  if (e.target.name === 'type') setOffreType(e.target.value);
  const delai = state.reglages.delaiRelance;
  if (e.target.name === 'dateCandidature' && e.target.value && !e.target.form.dateRelance.value && delai > 0) {
    e.target.form.dateRelance.value = addDays(e.target.value, delai);
  }
});

// Remplit les champs encore vides du formulaire avec les informations de l'annonce.
function remplirDepuisAnnonce(form, a) {
  const remplis = [];
  ['entreprise', 'poste', 'lieu', 'reference', 'source', 'contact', 'contrat', 'teletravail', 'salaire', 'texteOffre'].forEach((k) => {
    if (a[k] && !form[k].value.trim()) {
      if (form[k].tagName === 'SELECT' && ![...form[k].options].some((o) => o.value === a[k])) return;
      form[k].value = a[k];
      remplis.push(k);
    }
  });
  if (a.lien) form.lien.value = a.lien;
  if (a.dateLimite) form.notes.value = [form.notes.value, `Date limite de candidature : ${fmtDate(a.dateLimite)}`].filter(Boolean).join('\n');
  if (form.texteOffre.value) {
    $('#section-texte').open = true;
    renderAnalyse(analyseOffre(form.texteOffre.value));
  }
  toast(remplis.length
    ? `${remplis.length} champ${remplis.length > 1 ? 's' : ''} rempli${remplis.length > 1 ? 's' : ''}${a.entreprise ? '' : ' (entreprise non trouvée, à compléter)'}`
    : 'Les champs étaient déjà remplis.');
}

$('#btn-lire-annonce').addEventListener('click', (e) => run(async () => {
  const form = $('#form-offre');
  const url = form.lien.value.trim();
  if (!url) throw new Error('Collez d\'abord le lien de l\'annonce.');
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Lecture…';
  try {
    remplirDepuisAnnonce(form, await api('POST', 'annonces/lire', { url }));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Remplir depuis le lien';
  }
}));

// ---------- Analyse par Claude ----------

function renderAnalyseIA(a) {
  const el = $('#analyse-ia');
  $('#btn-analyse-ia').hidden = !state.analyseDisponible;
  if (!a) { el.innerHTML = ''; return; }
  const puces = (titre, items) => (items?.length
    ? `<h4>${titre}</h4><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '');
  const competences = (a.competences || []).map((c) => `<span class="chip${c.importance === 'indispensable' ? ' tech' : ''}${c.dansLeProfil ? ' have' : ''}"
    title="${esc(c.importance)}">${esc(c.intitule)}</span>`).join('');
  const note = Math.min(5, Math.max(0, Math.round(Number(a.adequation?.note) || 0)));
  el.innerHTML = `
    <h4>Analyse de Claude${a.date ? ` du ${fmtDate(a.date)}` : ''}</h4>
    <p>${esc(a.resume)}</p>
    <p class="note-ia">Adéquation avec votre profil : ${'★'.repeat(note)}${'☆'.repeat(5 - note)}</p>
    <p>${esc(a.adequation?.explication)}</p>
    ${puces('Missions principales', a.missions)}
    ${competences ? `<h4>Compétences demandées (en couleur : indispensables, ✓ : dans votre profil)</h4><div>${competences}</div>` : ''}
    ${puces('Vos atouts', a.atouts)}
    ${puces('Ce qui manque, et comment le compenser', a.manques)}
    ${puces('À mettre en avant', a.aMettreEnAvant)}
    ${puces('Points de vigilance', a.vigilance)}`;
}

$('#btn-analyse-ia').addEventListener('click', (e) => run(async () => {
  const form = $('#form-offre');
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Claude lit l\'annonce… (1 à 2 min)';
  try {
    const champs = Object.fromEntries(['poste', 'entreprise', 'lieu', 'contrat', 'salaire', 'texteOffre']
      .map((k) => [k, form[k].value]));
    editing.analyseIA = await api('POST', 'analyse', champs);
    renderAnalyseIA(editing.analyseIA);
    toast('Analyse terminée : pensez à enregistrer la candidature.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyser avec Claude';
  }
}));

$('#btn-analyse').addEventListener('click', () => {
  renderAnalyse(analyseOffre($('#form-offre').texteOffre.value));
});

$('#btn-prompt').addEventListener('click', async () => {
  await copier(promptClaude($('#form-offre')));
  toast('Demande copiée : collez-la dans Claude (claude.ai).');
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

$('#form-offre').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const prev = state.offres.find((o) => o.id === data.id);
  const offre = { ...editing, ...data };
  const res = analyseOffre(offre.texteOffre);
  // Les compétences que l'on possède passent en premier : ce sont elles que la lettre reprend.
  const profil = state.reglages.profil || '';
  const tech = [...res.tech].sort((a, b) => Number(Boolean(profil) && profilContient(profil, b)) - Number(Boolean(profil) && profilContient(profil, a)));
  offre.motsCles = offre.texteOffre ? [...tech, ...res.soft].map((k) => k.label) : [];

  if (prev && prev.statut !== offre.statut) {
    offre.historique.push({ id: uid(), date: today(), texte: `Statut : ${statutLabel(offre.statut)}` });
  }
  if (prev) {
    offre.majLe = today();
  } else {
    offre.id = uid();
    offre.creeLe = today();
    offre.historique.push({ id: uid(), date: offre.dateCandidature || today(),
      texte: offre.statut === 'a_postuler' ? 'Ajoutée à la liste' : 'Candidature envoyée' });
  }
  const saved = await run(() => api('PUT', `offres/${offre.id}`, offre));
  if (!saved) return;
  if (prev) Object.assign(prev, normaliser(saved));
  else state.offres.push(normaliser(saved));
  editing = null;
  $('#dlg-offre').close();
  renderAll();
});

// ---------- Lettre depuis un modèle ----------

let lettreOffre = null;

async function fillLettre() {
  const modeleId = $('#lettre-modele').value;
  const r = await run(() => api('POST', `offres/${lettreOffre.id}/lettre/apercu`, { modeleId }));
  if (!r) return;
  $('#lettre-word').hidden = !r.modeleWord;
  $('#lettre-texte').hidden = r.modeleWord;
  $('#btn-copy-lettre').hidden = r.modeleWord;
  $('#lettre-texte').value = r.texte;
}

function openLettre(id) {
  lettreOffre = state.offres.find((o) => o.id === id);
  const modeles = state.documents.filter((d) => d.type === 'modele');
  if (!modeles.length) {
    toast('Créez d\'abord un modèle de lettre dans l\'onglet « CV & lettres ».', true);
    return;
  }
  $('#lettre-modele').innerHTML = modeles.map((m) => `<option value="${m.id}">${esc(m.nom)}</option>`).join('');
  fillLettre();
  $('#dlg-lettre').showModal();
}

$('#lettre-modele').addEventListener('change', fillLettre);
$('#btn-copy-lettre').addEventListener('click', async (e) => {
  await copier($('#lettre-texte').value);
  e.target.textContent = 'Copié ✓';
  setTimeout(() => { e.target.textContent = 'Copier le texte'; }, 1500);
});
$('#btn-docx-lettre').addEventListener('click', () => run(async () => {
  const body = { modeleId: $('#lettre-modele').value };
  if (!$('#lettre-texte').hidden) body.texte = $('#lettre-texte').value; // texte retouché
  const blob = await api('POST', `offres/${lettreOffre.id}/lettre.docx`, body);
  const nom = `Lettre_${lettreOffre.entreprise}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_');
  download(blob, `${nom}.docx`);
}));

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
    const url = fileUrl(d);
    const label = d.fichier ? d.fichier.nom : 'Lien';
    return `<tr>
      <td>${DOC_TYPES[d.type] || esc(d.type)}</td>
      <td><strong>${esc(d.nom)}</strong>${d.notes ? `<div class="sub">${esc(d.notes)}</div>` : ''}</td>
      <td data-label="Fichier">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : ''}</td>
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
  $('#fichier-actuel').hidden = !d.fichier;
  $('#fichier-actuel').textContent = d.fichier ? `Fichier actuel : ${d.fichier.nom} (choisissez-en un autre pour le remplacer)` : '';
  $('#dlg-doc').showModal();
}

$('#form-doc').addEventListener('change', (e) => {
  if (e.target.name === 'type') e.target.form.dataset.doctype = e.target.value;
  // Propose le nom du fichier comme nom du document.
  if (e.target.name === 'fichier' && e.target.files[0] && !e.target.form.nom.value) {
    e.target.form.nom.value = e.target.files[0].name.replace(/\.[^.]+$/, '');
  }
});

$('#form-doc').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const file = form.fichier.files[0];
  delete data.fichier;
  const prev = state.documents.find((d) => d.id === data.id);
  const doc = { ...prev, ...data, id: data.id || uid() };
  delete doc.fichier;

  let saved = await run(() => api('PUT', `documents/${doc.id}`, doc));
  if (!saved) return;
  if (file) {
    const fd = new FormData();
    fd.append('fichier', file);
    saved = (await run(() => api('POST', `documents/${doc.id}/fichier`, fd))) || saved;
  }
  if (prev) Object.assign(prev, saved);
  else state.documents.push(saved);
  $('#dlg-doc').close();
  renderAll();
});

// ---------- Paramètres ----------

function renderSettings() {
  const form = $('#form-settings');
  const r = state.reglages;
  ['theme', 'delaiRelance', 'nomComplet', 'ville', 'profil', 'emailDestinataire', 'smtpUser', 'smtpHost', 'smtpPort', 'ftClientId']
    .forEach((k) => { if (document.activeElement !== form[k]) form[k].value = r[k] ?? ''; });
  form.alerteRelances.checked = r.alerteRelances;
  form.emailRelances.checked = r.emailRelances;
  const garde = '•••••••• (enregistré, laisser vide pour garder)';
  form.smtpPass.placeholder = r.smtpPassDefini ? garde : '16 caractères, fourni par Google';
  form.claudeToken.placeholder = r.claudeTokenDefini ? garde
    : state.analyseDisponible ? 'configuré sur le serveur' : 'sk-ant-…';
  form.ftClientId.placeholder = !r.ftClientId && state.franceTravailConfigure ? 'configuré sur le serveur' : '';
  form.ftClientSecret.placeholder = r.ftClientSecretDefini ? garde : '';
  $('#user-name').textContent = state.utilisateur.username || '';
  $('#card-users').hidden = !state.utilisateur.isAdmin;
  renderChoixProfil();
}

// Liste à cocher des compétences du dictionnaire (keywords.js), par thème.
const THEMES_PROFIL = [
  ['Systèmes et postes de travail', ['Windows', 'Windows Server', 'Linux', 'macOS', 'Active Directory', 'GPO', 'Microsoft 365',
    'Exchange', 'Entra ID / Azure AD', 'Intune', 'SCCM / MECM', 'WSUS', 'Déploiement de postes', 'Sécurité des postes']],
  ['Réseau et sécurité', ['Réseau', 'TCP/IP', 'DNS / DHCP', 'VLAN', 'Wi-Fi', 'Cisco', 'HP / Aruba', 'Fortinet', 'Stormshield',
    'Pare-feu', 'VPN', 'Sécurité', 'Câblage / brassage', 'Téléphonie / ToIP']],
  ['Virtualisation, cloud et sauvegarde', ['Virtualisation', 'VMware', 'Hyper-V', 'Proxmox', 'Docker', 'Kubernetes', 'Cloud',
    'Azure', 'AWS', 'Stockage / NAS', 'Sauvegarde']],
  ['Support et outils', ['Helpdesk', 'Support N1', 'Support N2', 'Support N3', 'Ticketing', 'GLPI', 'ServiceNow', 'ITIL',
    'Supervision', 'Inventaire', 'Matériel', 'Maintenance', 'Dépannage', 'RGPD']],
  ['Scripts et bases de données', ['PowerShell', 'Bash / Shell', 'Python', 'Scripting', 'SQL']],
  ['Conditions', ['Anglais', 'Permis B', 'Déplacements', 'Astreintes']],
];

// Morceaux du profil : une compétence par ligne ou séparées par des virgules.
const morceauxProfil = (profil) => profil.split('\n').map((l) => l.split(',').map((m) => m.trim()));

function renderChoixProfil() {
  const profil = $('#form-settings').profil.value;
  // Nombre d'annonces enregistrées qui demandent chaque compétence.
  const demandes = {};
  state.offres.forEach((o) => {
    if (!o.texteOffre) return;
    const res = analyseOffre(o.texteOffre);
    [...res.tech, ...res.soft].forEach((k) => { demandes[k.label] = (demandes[k.label] || 0) + 1; });
  });
  const classes = new Set(THEMES_PROFIL.flatMap(([, labels]) => labels));
  const themes = [...THEMES_PROFIL,
    ['Autres compétences', Object.keys(KW_TECH).filter((l) => !classes.has(l))],
    ['Qualités', Object.keys(KW_SOFT)]];
  const groupes = (liste) => liste.filter(([, labels]) => labels.length).map(([titre, labels]) => `
    <div class="kw-group"><h4>${esc(titre)}</h4>${labels.map((l) => `<button type="button" data-competence="${esc(l)}"
      class="chip${profil && profilContient(profil, { label: l }) ? ' have' : ''}">${esc(l)}${demandes[l] ? ` <small>${demandes[l]}</small>` : ''}</button>`).join('')}</div>`).join('');
  // Le bloc officiel reste ouvert d'un affichage à l'autre.
  const romeOuvert = $('#profil-choix details')?.open ?? false;
  $('#profil-choix').innerHTML = groupes(themes) + `
    <details${romeOuvert ? ' open' : ''}><summary>Compétences officielles France Travail (référentiel ROME)</summary>
      <p class="hint">Savoir-faire et connaissances des fiches métiers du support, de la maintenance et de l'administration
        systèmes, réseaux et sécurité.</p>
      ${groupes(Object.entries(ROME_COMPETENCES))}
    </details>`;
}

$('#profil-choix').addEventListener('click', (e) => {
  const label = e.target.closest('[data-competence]')?.dataset.competence;
  if (!label) return;
  const champ = $('#form-settings').profil;
  const egal = (m) => m.trim().toLowerCase() === label.toLowerCase();
  const morceaux = morceauxProfil(champ.value);
  // Un intitulé officiel peut contenir des virgules : il occupe alors une ligne entière.
  if (champ.value.split('\n').some(egal)) {
    champ.value = champ.value.split('\n').filter((l) => !egal(l)).join('\n');
  } else if (morceaux.some((l) => l.some(egal))) {
    champ.value = morceaux.map((l) => l.filter((m) => !egal(m)).join(', '))
      .filter(Boolean).join('\n');
  } else if (champ.value && profilContient(champ.value, { label })) {
    toast('Déjà dans votre profil sous un autre nom : modifiez le texte pour la retirer.');
    return;
  } else {
    champ.value = [champ.value.trim(), label].filter(Boolean).join('\n');
  }
  renderChoixProfil();
  champ.dispatchEvent(new Event('change', { bubbles: true }));
});

let saveQueue = Promise.resolve();

$('#form-settings').addEventListener('change', (e) => {
  if (!e.target.name) return; // champs hors réglages (mot de passe, comptes, import)
  const form = e.currentTarget;
  const values = {
    theme: form.theme.value,
    delaiRelance: Math.max(0, parseInt(form.delaiRelance.value, 10) || 0),
    alerteRelances: form.alerteRelances.checked,
    nomComplet: form.nomComplet.value,
    ville: form.ville.value,
    profil: form.profil.value,
    emailRelances: form.emailRelances.checked,
    emailDestinataire: form.emailDestinataire.value,
    smtpUser: form.smtpUser.value.trim(),
    smtpPass: form.smtpPass.value.replace(/\s+/g, ''),
    smtpHost: form.smtpHost.value.trim(),
    smtpPort: parseInt(form.smtpPort.value, 10) || 465,
    claudeToken: form.claudeToken.value.replace(/\s+/g, ''),
    ftClientId: form.ftClientId.value.trim(),
    ftClientSecret: form.ftClientSecret.value.replace(/\s+/g, ''),
  };
  // Les enregistrements sont faits l'un après l'autre, dans l'ordre des modifications.
  saveQueue = saveQueue.then(() => run(async () => {
    state.reglages = await api('PUT', 'reglages', values);
    ['smtpPass', 'claudeToken', 'ftClientSecret'].forEach((k) => { if (values[k]) form[k].value = ''; });
    state.analyseDisponible ||= state.reglages.claudeTokenDefini;
    state.franceTravailConfigure ||= Boolean(state.reglages.ftClientId && state.reglages.ftClientSecretDefini);
    applyTheme();
    renderSettings();
    renderOffres();
    toast('Réglages enregistrés');
  }));
});

$('#btn-test-email').addEventListener('click', () => run(async () => {
  const r = await api('POST', 'rappels/test');
  toast(`E-mail de test envoyé à ${r.destinataire}`);
}));

// Les vérifications attendent la fin d'un éventuel enregistrement en cours.
$('#btn-test-claude').addEventListener('click', () => run(async () => {
  await saveQueue;
  await api('POST', 'analyse/test');
  toast('Claude : jeton reconnu.');
}));

$('#btn-test-ft').addEventListener('click', () => run(async () => {
  await saveQueue;
  await api('POST', 'francetravail/test');
  toast('France Travail : identifiants acceptés.');
}));

$('#btn-mdp').addEventListener('click', () => run(async () => {
  await api('POST', 'compte/mot-de-passe', { actuel: $('#mdp-actuel').value, nouveau: $('#mdp-nouveau').value });
  $('#mdp-actuel').value = '';
  $('#mdp-nouveau').value = '';
  toast('Mot de passe modifié');
}));

function renderUsers(users) {
  $('#users').innerHTML = users.map((u) => `
    <li><span>${esc(u.username)}${u.isAdmin ? ' <span class="tag">admin</span>' : ''}</span>
      ${u.username === state.utilisateur.username ? '' : `<button type="button" class="btn small danger" data-del-user="${u.id}" data-username="${esc(u.username)}">Supprimer</button>`}</li>`).join('');
}

async function loadUsers() {
  if (state.utilisateur.isAdmin) renderUsers(await api('GET', 'utilisateurs'));
}

$('#btn-add-user').addEventListener('click', () => run(async () => {
  renderUsers(await api('POST', 'utilisateurs', {
    username: $('#new-user').value, password: $('#new-user-pass').value, isAdmin: $('#new-user-admin').checked,
  }));
  $('#new-user').value = '';
  $('#new-user-pass').value = '';
  $('#new-user-admin').checked = false;
  toast('Compte créé');
}));

$('#input-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  run(async () => {
    let data;
    try { data = JSON.parse(await file.text()); } catch { throw new Error('Fichier invalide : ce n\'est pas une sauvegarde MyJob.'); }
    if (!Array.isArray(data.offres) || !Array.isArray(data.documents)) throw new Error('Fichier invalide : ce n\'est pas une sauvegarde MyJob.');
    if (!confirm(`Remplacer les données actuelles par ${data.offres.length} candidature(s) et ${data.documents.length} document(s) ?`)) return;
    // Les sauvegardes de la première version utilisaient « settings ».
    await api('POST', 'import', data);
    await chargerEtat();
    applyTheme();
    renderAll();
    toast('Import terminé');
  });
});

$('#btn-logout').addEventListener('click', async () => {
  await fetch('api/deconnexion', { method: 'POST' });
  location.href = 'login.html';
});

// ---------- Navigation et événements ----------

function showView(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  if (name === 'parametres') run(loadUsers);
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

  if (ds.editEnt) editEntretien(ds.editEnt);
  if (ds.delEnt && confirm('Supprimer cet entretien ?')) {
    editing.entretiens = editing.entretiens.filter((x) => x.id !== ds.delEnt);
    resetEntretienForm();
    renderEntretiens();
  }
  if (ds.icsEnt) {
    const ent = editing.entretiens.find((x) => x.id === ds.icsEnt);
    const form = $('#form-offre');
    const ics = icsEntretien(ent, { entreprise: form.entreprise.value, poste: form.poste.value });
    download(new Blob([ics], { type: 'text/calendar' }), `entretien-${form.entreprise.value.replace(/[^\w-]+/g, '_')}-${ent.date}.ics`);
  }
  if (ds.delRep) {
    editing.reponses = editing.reponses.filter((r) => r.id !== ds.delRep);
    renderReponses();
  }
  if (ds.delHisto) {
    editing.historique = editing.historique.filter((h) => h.id !== ds.delHisto);
    renderHistorique();
  }

  if (ds.delOffre) {
    const o = state.offres.find((x) => x.id === ds.delOffre);
    if (confirm(`Supprimer la candidature chez ${o.entreprise} ?`)) {
      run(async () => {
        await api('DELETE', `offres/${o.id}`);
        state.offres = state.offres.filter((x) => x.id !== o.id);
        renderAll();
      });
    }
  }
  if (ds.delDoc) {
    const d = state.documents.find((x) => x.id === ds.delDoc);
    if (confirm(`Supprimer le document « ${d.nom} » et son fichier ? Il sera retiré des candidatures associées.`)) {
      run(async () => {
        await api('DELETE', `documents/${d.id}`);
        state.documents = state.documents.filter((x) => x.id !== d.id);
        const liees = state.offres.filter((o) => o.cvId === d.id || o.lettreId === d.id);
        for (const o of liees) {
          if (o.cvId === d.id) o.cvId = '';
          if (o.lettreId === d.id) o.lettreId = '';
          await api('PUT', `offres/${o.id}`, o);
        }
        renderAll();
      });
    }
  }
  if (ds.delUser && confirm(`Supprimer le compte « ${ds.username} » et toutes ses données ?`)) {
    run(async () => renderUsers(await api('DELETE', `utilisateurs/${ds.delUser}`)));
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

// ---------- Favori « Envoyer à MyJob » ----------

// À augmenter à chaque modification de envoyerAMyJob() : MyJob signale alors
// qu'un favori plus ancien doit être refait.
const FAVORI_VERSION = 2;

// Ce code s'exécute sur la page de l'annonce (Indeed, LinkedIn…) quand on
// clique sur le favori : il lit ce que le navigateur affiche et l'ouvre dans
// MyJob. Il doit rester autonome (aucune fonction de ce fichier n'y est connue).
function envoyerAMyJob() {
  const ORIGINE = '__ORIGINE__';
  const lire = (sels) => {
    for (const s of sels) {
      const t = document.querySelector(s)?.innerText?.trim();
      if (t) return t;
    }
    return '';
  };
  const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const meta = (n) => document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.content || '';
  const jsonld = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => s.textContent).filter((t) => t.includes('JobPosting'));

  // Indeed : l'annonce ouverte est repérée par sa clé (?vjk= ou ?jk=) dans
  // les données de la liste de résultats que la page garde en mémoire.
  const indeed = /(^|\.)indeed\./.test(location.hostname);
  let carte = null;
  if (indeed) {
    const p = new URLSearchParams(location.search);
    const cle = p.get('vjk') || p.get('jk');
    try {
      carte = window.mosaic.providerData['mosaic-provider-jobcards'].metaData
        .mosaicProviderJobCardsModel.results.find((r) => r.jobkey === cle) || null;
    } catch { /* autre page Indeed */ }
  }

  // Repères relevés sur la vraie page de résultats Indeed (octobre 2026) ;
  // #jobDescriptionText est celui de l'ancienne mise en page. Sur Indeed, on
  // ne prend jamais toute la page (elle contient la liste des autres offres).
  const texte = lire(['.react-native-html-content', '#jobDescriptionText', '.jobs-description__content', '#job-details',
    ...(indeed ? [] : ['main', 'article', 'body'])]);
  const html = `<title>${echapper(document.title)}</title>`
    + ['og:title', 'og:description', 'og:site_name', 'description']
      .map((n) => `<meta property="${n}" content="${echapper(meta(n))}">`).join('')
    + jsonld.map((j) => `<script type="application/ld+json">${j.replace(/<\//g, '<\\/')}</script>`).join('')
    + `<main>${echapper(texte.slice(0, 30000)).replace(/\n/g, '<br>')}</main>`;
  const donnees = {
    version: '__VERSION__',
    url: location.href,
    html: html.slice(0, 300000),
    selection: String(getSelection() || '').trim().slice(0, 30000),
    champs: {
      poste: carte?.displayTitle || carte?.title || lire(['[data-testid="vj-job-title"]',
        '.job-details-jobs-unified-top-card__job-title', '.top-card-layout__title']),
      entreprise: carte?.company || lire(['[data-testid="company-info-metadata"] > div > :first-child',
        '.job-details-jobs-unified-top-card__company-name', '.topcard__org-name-link']),
      lieu: carte?.formattedLocation || lire(['[data-testid="company-info-metadata"] > div > :nth-child(2)']),
      contrat: (carte?.jobTypes || []).join(' '),
      salaire: carte?.salarySnippet?.text || '',
      teletravail: carte?.remoteWorkModel?.text || '',
    },
  };
  const adresse = `${ORIGINE}/#annonce=${encodeURIComponent(JSON.stringify(donnees))}`;
  if (!window.open(adresse, '_blank')) location.href = adresse;
}

function renderFavori() {
  const code = `(${envoyerAMyJob.toString().replace('__ORIGINE__', location.origin).replace('__VERSION__', FAVORI_VERSION)})()`;
  $('#favori-myjob').href = `javascript:${encodeURIComponent(code)}`;
}

$('#favori-myjob').addEventListener('click', (e) => {
  e.preventDefault();
  toast('Faites glisser ce bouton dans la barre de favoris.');
});

// Ouvre une nouvelle candidature remplie avec l'annonce reçue du favori.
async function recevoirAnnonce() {
  let brut = annonceRecue;
  try {
    brut ??= sessionStorage.getItem('myjob-annonce');
    sessionStorage.removeItem('myjob-annonce');
  } catch { /* navigation privée */ }
  if (!brut) return;
  let donnees;
  try { donnees = JSON.parse(decodeURIComponent(brut)); } catch { throw new Error('Annonce reçue illisible.'); }
  const a = await api('POST', 'annonces/page', donnees);
  openOffre();
  if (Number(donnees.version || 1) < FAVORI_VERSION) {
    setTimeout(() => toast('Votre favori « Envoyer à MyJob » n\'est plus à jour : supprimez-le et refaites-le glisser depuis Paramètres.', true), 2600);
  }
  const form = $('#form-offre');
  // On garde l'annonce de côté : la candidature n'est pas encore envoyée.
  form.statut.value = 'a_postuler';
  form.dateCandidature.value = '';
  form.dateRelance.value = '';
  remplirDepuisAnnonce(form, { lien: donnees.url, ...a });
}

run(async () => {
  await chargerEtat();
  applyTheme();
  renderAll();
  renderFavori();
  await recevoirAnnonce();
});
