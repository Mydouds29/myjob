// Extraction des informations d'une annonce à partir du HTML de sa page.
// 1. Données structurées schema.org « JobPosting » (JSON-LD), publiées par la
//    plupart des sites d'emploi pour Google (France Travail, HelloWork,
//    Welcome to the Jungle, Meteojob, LinkedIn…).
// 2. À défaut, balises Open Graph et texte principal de la page.

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è',
  ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î',
  iuml: 'ï', euml: 'ë', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', hellip: '…', ndash: '–',
  mdash: '—', euro: '€', bull: '•', middot: '·', oelig: 'œ', Eacute: 'É' };

export function decoderEntites(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITES[e] ?? m;
  });
}

// HTML → texte lisible, en gardant les paragraphes et les listes.
export function htmlEnTexte(html) {
  let s = String(html || '');
  // Certaines annonces sont encodées deux fois (&lt;p&gt;).
  if (!/<[a-z]/i.test(s) && /&lt;[a-z]/i.test(s)) s = decoderEntites(s);
  s = s
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|section|article|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decoderEntites(s)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+- /g, '\n- ')
    .trim();
}

function texte(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(texte).filter(Boolean).join(', ');
  if (typeof v === 'object') return texte(v.name ?? v['@value'] ?? '');
  return decoderEntites(String(v)).trim();
}

// ---------- JSON-LD ----------

function* parcourir(node) {
  if (Array.isArray(node)) { for (const n of node) yield* parcourir(n); return; }
  if (!node || typeof node !== 'object') return;
  yield node;
  if (node['@graph']) yield* parcourir(node['@graph']);
  if (node.mainEntity) yield* parcourir(node.mainEntity);
}

function estJobPosting(n) {
  const t = n['@type'];
  return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
}

export function trouverJobPosting(html) {
  const re = /<script[^>]+type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    let data;
    try {
      data = JSON.parse(m[1].trim().replace(/^<!--|-->$/g, ''));
    } catch {
      // JSON parfois invalide à cause de retours à la ligne non échappés.
      try { data = JSON.parse(m[1].replace(/[\r\n\t]+/g, ' ')); } catch { continue; }
    }
    for (const n of parcourir(data)) if (estJobPosting(n)) return n;
  }
  return null;
}

function lieu(jobLocation) {
  const locs = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
  return locs.map((l) => {
    const a = l?.address || l;
    if (!a || typeof a !== 'object') return texte(a);
    const ville = texte(a.addressLocality);
    const cp = texte(a.postalCode);
    return [ville, cp && !ville.includes(cp) ? `(${cp})` : ''].filter(Boolean).join(' ') || texte(a.addressRegion);
  }).filter(Boolean).join(', ');
}

function salaire(base) {
  if (!base) return '';
  if (typeof base !== 'object') return texte(base);
  const v = base.value ?? {};
  const unite = { YEAR: '/an', MONTH: '/mois', HOUR: '/h', DAY: '/jour', WEEK: '/sem.' }[v.unitText || base.unitText] || '';
  const fmt = (n) => Number(n).toLocaleString('fr-FR');
  const devise = base.currency === 'EUR' || !base.currency ? '€' : base.currency;
  if (typeof v !== 'object') return `${fmt(v)} ${devise}${unite}`;
  if (v.minValue && v.maxValue) return `${fmt(v.minValue)} - ${fmt(v.maxValue)} ${devise}${unite}`;
  const n = v.value ?? v.minValue ?? v.maxValue;
  return n ? `${fmt(n)} ${devise}${unite}` : '';
}

const CONTRATS_SCHEMA = { CONTRACTOR: 'Freelance', TEMPORARY: 'Intérim', INTERN: 'Alternance' };

// ---------- Détection dans le texte ----------

export function contratDepuisTexte(t) {
  const s = ` ${t} `;
  if (/\bCDI\b|contrat (à|a) dur(é|e)e ind(é|e)termin(é|e)e/i.test(s)) return 'CDI';
  if (/\bCDD\b|contrat (à|a) dur(é|e)e d(é|e)termin(é|e)e/i.test(s)) return 'CDD';
  if (/\bint(é|e)rim\b|mission d'int(é|e)rim|travail temporaire/i.test(s)) return 'Intérim';
  if (/\balternance\b|apprentissage|contrat de professionnalisation/i.test(s)) return 'Alternance';
  if (/\bfreelance\b|ind(é|e)pendant|portage salarial/i.test(s)) return 'Freelance';
  return '';
}

export function teletravailDepuisTexte(t) {
  if (/t(é|e)l(é|e)travail (complet|total|100 ?%)|full remote|100 ?% (à|a) distance/i.test(t)) return 'Complet';
  if (/t(é|e)l(é|e)travail (partiel|possible|occasionnel|autoris(é|e)|\d)|\d ?jours? de t(é|e)l(é|e)travail|hybride|remote partiel/i.test(t)) return 'Partiel';
  if (/pas de t(é|e)l(é|e)travail|t(é|e)l(é|e)travail non (possible|autoris(é|e))/i.test(t)) return 'Aucun';
  return '';
}

// ---------- Repli : Open Graph et texte de la page ----------

function meta(html, nom) {
  const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${nom}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decoderEntites(tag.match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i)?.slice(1).find(Boolean) || '').trim() : '';
}

function textePrincipal(html) {
  const zone = html.match(/<main[\s\S]*?<\/main>/i)?.[0]
    || html.match(/<article[\s\S]*?<\/article>/i)?.[0]
    || html.match(/<body[\s\S]*<\/body>/i)?.[0] || html;
  const sansNav = zone.replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  return htmlEnTexte(sansNav).slice(0, 15000);
}

// ---------- Point d'entrée ----------

export function extraireAnnonce(html, url) {
  const jp = trouverJobPosting(html);
  const r = { methode: jp ? 'jsonld' : 'page' };

  if (jp) {
    r.poste = texte(jp.title);
    r.entreprise = texte(jp.hiringOrganization);
    r.lieu = lieu(jp.jobLocation);
    if (!r.lieu && /TELECOMMUTE/i.test(texte(jp.jobLocationType))) r.lieu = 'Télétravail';
    r.texteOffre = htmlEnTexte(jp.description);
    r.salaire = salaire(jp.baseSalary);
    r.reference = texte(jp.identifier?.value ?? (typeof jp.identifier === 'string' ? jp.identifier : ''));
    r.datePublication = texte(jp.datePosted).slice(0, 10);
    r.dateLimite = texte(jp.validThrough).slice(0, 10);
    const types = [].concat(jp.employmentType || []).map(String);
    r.contrat = types.map((t) => CONTRATS_SCHEMA[t.toUpperCase()]).find(Boolean) || '';
    if (/TELECOMMUTE/i.test(texte(jp.jobLocationType))) r.teletravail = 'Complet';
  } else {
    r.poste = meta(html, 'og:title') || decoderEntites(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
    r.entreprise = '';
    r.texteOffre = textePrincipal(html);
    const desc = meta(html, 'og:description') || meta(html, 'description');
    if (desc && r.texteOffre.length < desc.length) r.texteOffre = desc;
  }

  const tout = `${r.poste} ${r.texteOffre}`;
  r.contrat ||= contratDepuisTexte(tout);
  r.teletravail ||= teletravailDepuisTexte(tout);
  r.source = sourceDepuisUrl(url) || meta(html, 'og:site_name');
  r.lien = url;
  Object.keys(r).forEach((k) => { if (r[k] === '') delete r[k]; });
  return r;
}

const SOURCES = [
  [/francetravail\.fr|pole-emploi\.fr/, 'France Travail'],
  [/indeed\./, 'Indeed'],
  [/linkedin\./, 'LinkedIn'],
  [/hellowork\.|regionsjob\./, 'HelloWork'],
  [/welcometothejungle\./, 'Welcome to the Jungle'],
  [/apec\.fr/, 'Apec'],
  [/meteojob\./, 'Meteojob'],
  [/monster\./, 'Monster'],
  [/cadremploi\./, 'Cadremploi'],
  [/jobteaser\./, 'JobTeaser'],
  [/glassdoor\./, 'Glassdoor'],
  [/ouestjob\.|ouest-france/, 'Ouest-France Emploi'],
  [/choisirleservicepublic\.gouv\.fr|place-emploi-public/, 'Emploi public'],
];

export function sourceDepuisUrl(url) {
  try {
    const host = new URL(url).hostname;
    return SOURCES.find(([re]) => re.test(host))?.[1] || host.replace(/^www\./, '');
  } catch { return ''; }
}
