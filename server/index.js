// Point d'entrée : démarre le serveur MyJob.

import { createApp } from './app.js';
import { config } from './core/config.js';
import { userCount } from './core/auth.js';

const app = await createApp();

app.listen(config.port, config.host, () => {
  console.log(`MyJob démarré sur http://${config.host}:${config.port}`);
  if (userCount() === 0) {
    console.log('Aucun compte : créez-en un avec « npm run user -- create <identifiant> --admin ».');
  }
});
