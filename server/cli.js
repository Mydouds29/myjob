// Gestion des comptes en ligne de commande (sur le serveur).
//   npm run user -- create <identifiant> [--admin]
//   npm run user -- password <identifiant>
//   npm run user -- list
//   npm run user -- delete <identifiant>

import readline from 'node:readline';
import { createUser, setPassword, findUser, listUsers, deleteUser } from './core/auth.js';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function askNewPassword() {
  if (process.env.MYJOB_PASSWORD) return process.env.MYJOB_PASSWORD;
  const p1 = await askHidden('Mot de passe (10 caractères minimum) : ');
  const p2 = await askHidden('Confirmez le mot de passe : ');
  if (p1 !== p2) throw new Error('Les mots de passe ne correspondent pas.');
  return p1;
}

const [cmd, name, ...flags] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'create':
      if (!name) throw new Error('Indiquez un identifiant.');
      createUser(name, await askNewPassword(), flags.includes('--admin'));
      console.log(`Compte « ${name} » créé${flags.includes('--admin') ? ' (administrateur)' : ''}.`);
      break;
    case 'password': {
      const u = findUser(name);
      if (!u) throw new Error('Compte introuvable.');
      setPassword(u.id, await askNewPassword());
      console.log('Mot de passe modifié.');
      break;
    }
    case 'count':
      console.log(listUsers().length);
      break;
    case 'list':
      listUsers().forEach((u) => console.log(`${u.username}${u.isAdmin ? ' (admin)' : ''} - créé le ${u.createdAt}`));
      break;
    case 'delete': {
      const u = findUser(name);
      if (!u) throw new Error('Compte introuvable.');
      deleteUser(u.id);
      console.log(`Compte « ${name} » supprimé avec ses données.`);
      break;
    }
    default:
      console.log('Usage : npm run user -- create <identifiant> [--admin] | password <identifiant> | list | delete <identifiant>');
  }
} catch (err) {
  console.error(`Erreur : ${err.message}`);
  process.exitCode = 1;
}
