// Envoi des rappels de relance par e-mail : une fois par jour, à l'heure réglée
// (MYJOB_RAPPEL_HEURE), chaque compte qui l'a activé reçoit la liste des
// candidatures à relancer, via son propre compte d'envoi (Gmail).

import nodemailer from 'nodemailer';
import { getSettings, allUserIds, getInternal, setInternal } from '../../core/db.js';
import { config } from '../../core/config.js';
import { today } from '../../core/http.js';
import { offres } from '../candidatures/index.js';

const EN_ATTENTE = ['postule', 'relance'];

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function relancesDues(uid) {
  const now = today();
  return offres.all(uid)
    .filter((o) => o.dateRelance && o.dateRelance <= now && EN_ATTENTE.includes(o.statut))
    .sort((a, b) => a.dateRelance.localeCompare(b.dateRelance));
}

export async function envoyerEmail(uid, sujet, texte) {
  const s = getSettings(uid, { withSecrets: true });
  if (!s.smtpUser || !s.smtpPass) throw Object.assign(new Error('Compte d\'envoi non configuré (adresse Gmail et mot de passe d\'application).'), { status: 400 });
  const to = s.emailDestinataire || s.smtpUser;
  const transport = nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: Number(s.smtpPort) === 465,
    auth: { user: s.smtpUser, pass: s.smtpPass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  await transport.sendMail({ from: `MyJob <${s.smtpUser}>`, to, subject: sujet, text: texte });
  return to;
}

function texteRappel(dues) {
  const lignes = dues.map((o) => `- ${o.entreprise}${o.poste ? ` (${o.poste})` : ''} : relance prévue le ${fmtDate(o.dateRelance)}${o.contact ? `, contact : ${o.contact}` : ''}`);
  return `Bonjour,\n\n${dues.length} candidature${dues.length > 1 ? 's sont' : ' est'} à relancer :\n\n${lignes.join('\n')}\n\n${config.siteUrl ? `Ouvrir MyJob : ${config.siteUrl}\n` : ''}`;
}

async function tick() {
  if (new Date().getHours() < config.rappelHeure) return;
  for (const uid of allUserIds()) {
    const s = getSettings(uid);
    if (!s.emailRelances || getInternal(uid, 'dernierRappel') === today()) continue;
    const dues = relancesDues(uid);
    try {
      if (dues.length) await envoyerEmail(uid, `MyJob : ${dues.length} relance${dues.length > 1 ? 's' : ''} à faire`, texteRappel(dues));
      setInternal(uid, 'dernierRappel', today());
    } catch (err) {
      console.error(`Rappel e-mail impossible pour le compte ${uid} :`, err.message);
      setInternal(uid, 'dernierRappel', today()); // une seule tentative par jour
    }
  }
}

export function demarrerRappels() {
  setInterval(() => { tick().catch((e) => console.error(e)); }, 10 * 60 * 1000);
  setTimeout(() => { tick().catch((e) => console.error(e)); }, 30 * 1000);
}

export async function envoyerTest(uid) {
  const dues = relancesDues(uid);
  return envoyerEmail(uid, 'MyJob : e-mail de test',
    `Ceci est un e-mail de test : les rappels de relance fonctionnent.\n\n${dues.length ? texteRappel(dues) : 'Aucune relance à faire aujourd\'hui.'}`);
}
