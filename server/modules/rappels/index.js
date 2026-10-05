// Module Rappels : e-mail quotidien listant les relances à faire, envoyé
// depuis le compte Gmail de l'utilisateur (mot de passe d'application).

import { demarrerRappels, envoyerTest } from './envoi.js';

export default {
  nom: 'rappels',
  description: 'Rappels de relance par e-mail (Gmail)',
  ordre: 40,
  reglages: {
    emailRelances: false,
    emailDestinataire: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpUser: '',
    smtpPass: '',
  },
  secrets: ['smtpPass'],

  routes(router, { httpError }) {
    router.post('/rappels/test', async (req, res) => {
      try {
        const to = await envoyerTest(req.user.id);
        res.json({ ok: true, destinataire: to });
      } catch (err) {
        throw httpError(err.status || 502, `Envoi impossible : ${err.message}`);
      }
    });
  },

  demarrer() {
    if (process.env.MYJOB_SANS_RAPPELS !== '1') demarrerRappels();
  },
};
