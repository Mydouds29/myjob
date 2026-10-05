// Module Comptes : connexion, déconnexion, changement de mot de passe,
// réglages du compte et gestion des comptes par l'administrateur.

export default {
  nom: 'comptes',
  description: 'Connexion, réglages du compte et gestion des utilisateurs',
  ordre: 0,
  reglages: {
    theme: 'auto',
    nomComplet: '',
    ville: '',
    profil: '',
  },

  routesPubliques(router, { auth }) {
    router.post('/connexion', (req, res) => {
      const ip = req.ip;
      if (!auth.loginAllowed(ip)) {
        return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
      }
      const { username, password } = req.body || {};
      const user = auth.findUser(username);
      if (!user || !auth.verifyPassword(String(password || ''), user.password_hash)) {
        auth.loginFailed(ip);
        return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
      }
      auth.loginSucceeded(ip);
      auth.startSession(res, user.id);
      res.json({ ok: true });
    });

    router.post('/deconnexion', (req, res) => {
      auth.endSession(req, res);
      res.json({ ok: true });
    });
  },

  routes(router, { auth, getSettings, saveSettings, httpError }) {
    router.get('/reglages', (req, res) => res.json(getSettings(req.user.id)));
    router.put('/reglages', (req, res) => res.json(saveSettings(req.user.id, req.body || {})));

    router.post('/compte/mot-de-passe', (req, res) => {
      const { actuel, nouveau } = req.body || {};
      const user = auth.findUser(req.user.username);
      if (!auth.verifyPassword(String(actuel || ''), user.password_hash)) {
        throw httpError(400, 'Mot de passe actuel incorrect.');
      }
      auth.setPassword(req.user.id, nouveau);
      auth.startSession(res, req.user.id);
      res.json({ ok: true });
    });

    // Gestion des comptes (administrateur).
    router.get('/utilisateurs', auth.requireAdmin, (req, res) => res.json(auth.listUsers()));
    router.post('/utilisateurs', auth.requireAdmin, (req, res) => {
      const { username, password, isAdmin } = req.body || {};
      auth.createUser(username, password, Boolean(isAdmin));
      res.status(201).json(auth.listUsers());
    });
    router.delete('/utilisateurs/:id', auth.requireAdmin, (req, res) => {
      const id = Number(req.params.id);
      if (id === req.user.id) throw httpError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
      auth.deleteUser(id);
      res.json(auth.listUsers());
    });
  },
};
