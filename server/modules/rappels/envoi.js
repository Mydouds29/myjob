// Envoi des rappels de relance par e-mail : une fois par jour, à l'heure réglée
// (MYJOB_RAPPEL_HEURE), chaque compte qui l'a activé reçoit la liste des
// candidatures à relancer et les entretiens du jour et du lendemain, via son
// propre compte d'envoi (Gmail).

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

// Entretiens d'aujourd'hui et de demain.
export function entretiensProches(uid) {
  const now = today();
  const d = new Date(`${now}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const demain = d.toLocaleDateString('sv-SE');
  return offres.all(uid)
    .flatMap((o) => (o.entretiens || []).filter((e) => e.date === now || e.date === demain).map((e) => ({ ...e, offre: o })))
    .sort((a, b) => `${a.date}${a.heure}`.localeCompare(`${b.date}${b.heure}`));
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

function texteRappel(dues, entretiens) {
  const parties = ['Bonjour,'];
  if (entretiens.length) {
    const lignes = entretiens.map((e) => `- ${e.date === today() ? 'Aujourd\'hui' : 'Demain'}${e.heure ? ` à ${e.heure.replace(':', 'h')}` : ''} : ${e.etape} chez ${e.offre.entreprise} (${e.format})${e.lieu ? `, ${e.lieu}` : ''}${e.interlocuteurs ? `, avec ${e.interlocuteurs}` : ''}`);
    parties.push(`Entretien${entretiens.length > 1 ? 's' : ''} à venir :\n\n${lignes.join('\n')}`);
  }
  if (dues.length) {
    const lignes = dues.map((o) => `- ${o.entreprise}${o.poste ? ` (${o.poste})` : ''} : relance prévue le ${fmtDate(o.dateRelance)}${o.contact ? `, contact : ${o.contact}` : ''}`);
    parties.push(`${dues.length} candidature${dues.length > 1 ? 's sont' : ' est'} à relancer :\n\n${lignes.join('\n')}`);
  }
  if (config.siteUrl) parties.push(`Ouvrir MyJob : ${config.siteUrl}`);
  return `${parties.join('\n\n')}\n`;
}

function sujetRappel(dues, entretiens) {
  return 'MyJob : ' + [
    entretiens.length && `${entretiens.length} entretien${entretiens.length > 1 ? 's' : ''}`,
    dues.length && `${dues.length} relance${dues.length > 1 ? 's' : ''} à faire`,
  ].filter(Boolean).join(', ');
}

async function tick() {
  if (new Date().getHours() < config.rappelHeure) return;
  for (const uid of allUserIds()) {
    const s = getSettings(uid);
    if (!s.emailRelances || getInternal(uid, 'dernierRappel') === today()) continue;
    const dues = relancesDues(uid);
    const entretiens = entretiensProches(uid);
    try {
      if (dues.length || entretiens.length) await envoyerEmail(uid, sujetRappel(dues, entretiens), texteRappel(dues, entretiens));
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
  const entretiens = entretiensProches(uid);
  return envoyerEmail(uid, 'MyJob : e-mail de test',
    `Ceci est un e-mail de test : les rappels fonctionnent.\n\n${dues.length || entretiens.length ? texteRappel(dues, entretiens) : 'Aucune relance ni entretien à venir.'}`);
}
