// Téléchargement d'une page d'annonce, avec garde-fous : le serveur étant
// sur votre réseau local, il refuse les adresses internes (box, Proxmox,
// NAS…) pour qu'un lien ne puisse pas servir à les interroger.

import dns from 'node:dns/promises';
import net from 'node:net';

const TAILLE_MAX = 3 * 1024 * 1024;
const DELAI_MS = 15000;
const REDIRECTIONS_MAX = 5;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function ipPrivee(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith('::ffff:')) return ipPrivee(x.slice(7));
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80');
}

async function verifierUrl(url, autoriserLocal) {
  let u;
  try { u = new URL(url); } catch { throw Object.assign(new Error('Lien invalide.'), { status: 400 }); }
  if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('Seuls les liens http et https sont acceptés.'), { status: 400 });
  if (autoriserLocal) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const adresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!adresses.length) throw Object.assign(new Error('Site introuvable (nom de domaine inconnu).'), { status: 400 });
  if (adresses.some((a) => ipPrivee(a.address))) throw Object.assign(new Error('Adresse locale refusée.'), { status: 400 });
  return u;
}

export async function telechargerPage(url, { autoriserLocal = false } = {}) {
  let courant = url;
  for (let i = 0; i <= REDIRECTIONS_MAX; i++) {
    const u = await verifierUrl(courant, autoriserLocal);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DELAI_MS);
    let res;
    try {
      res = await fetch(u, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-FR,fr;q=0.9' },
      });
    } catch (err) {
      clearTimeout(timer);
      throw Object.assign(new Error(err.name === 'AbortError' ? 'Le site met trop de temps à répondre.' : 'Impossible de joindre le site.'), { status: 502 });
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      courant = new URL(res.headers.get('location'), u).href;
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      const bloque = [401, 403, 429, 999].includes(res.status);
      throw Object.assign(new Error(bloque
        ? `Le site refuse la lecture automatique (code ${res.status}). Copiez-collez le texte de l'annonce.`
        : `Le site a répondu avec une erreur (code ${res.status}).`), { status: 502 });
    }

    // Lecture limitée en taille.
    const reader = res.body.getReader();
    const morceaux = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > TAILLE_MAX) { ctrl.abort(); break; }
        morceaux.push(value);
      }
    } finally {
      clearTimeout(timer);
    }
    const buf = Buffer.concat(morceaux);
    const charset = (res.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1]
      || buf.subarray(0, 2048).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
    let html;
    try { html = new TextDecoder(charset.toLowerCase()).decode(buf); } catch { html = buf.toString('utf8'); }
    return { html, url: courant };
  }
  throw Object.assign(new Error('Trop de redirections.'), { status: 502 });
}
