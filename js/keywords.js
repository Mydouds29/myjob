// Analyse locale des mots-clés d'une offre d'emploi (sans service externe).
// Repère les compétences techniques IT et les qualités attendues à partir
// d'un dictionnaire, puis les mots les plus répétés du texte.

const KW_TECH = {
  'Windows': ['windows 10', 'windows 11', 'windows'],
  'Windows Server': ['windows server'],
  'Linux': ['linux', 'debian', 'ubuntu', 'red hat', 'redhat', 'centos', 'rhel'],
  'macOS': ['macos', 'mac os', 'apple'],
  'Active Directory': ['active directory', 'ad ds', 'annuaire ad'],
  'GPO': ['gpo', 'strategies de groupe', 'group policy'],
  'Microsoft 365': ['office 365', 'microsoft 365', 'o365', 'm365', 'sharepoint', 'teams', 'onedrive'],
  'Exchange': ['exchange'],
  'Entra ID / Azure AD': ['entra id', 'azure ad', 'azure active directory'],
  'Azure': ['azure'],
  'AWS': ['aws', 'amazon web services'],
  'Intune': ['intune', 'endpoint manager'],
  'SCCM / MECM': ['sccm', 'mecm', 'configuration manager'],
  'WSUS': ['wsus'],
  'VMware': ['vmware', 'vsphere', 'esxi', 'vcenter'],
  'Hyper-V': ['hyper-v', 'hyperv'],
  'Proxmox': ['proxmox'],
  'Virtualisation': ['virtualisation', 'virtualization'],
  'Docker': ['docker', 'conteneur', 'conteneurs'],
  'Kubernetes': ['kubernetes', 'k8s'],
  'PowerShell': ['powershell'],
  'Bash / Shell': ['bash', 'shell'],
  'Python': ['python'],
  'Scripting': ['script', 'scripts', 'scripting', 'automatisation'],
  'SQL': ['sql', 'mysql', 'mariadb', 'postgresql', 'postgres'],
  'Réseau': ['reseau', 'reseaux', 'lan', 'wan'],
  'TCP/IP': ['tcp/ip', 'tcp', 'ip'],
  'DNS / DHCP': ['dns', 'dhcp'],
  'VLAN': ['vlan', 'vlans'],
  'Wi-Fi': ['wifi', 'wi-fi', 'wlan'],
  'Cisco': ['cisco'],
  'HP / Aruba': ['aruba', 'procurve'],
  'Fortinet': ['fortinet', 'fortigate'],
  'Stormshield': ['stormshield'],
  'Pare-feu': ['pare-feu', 'firewall', 'pfsense', 'opnsense'],
  'VPN': ['vpn'],
  'Sécurité': ['securite', 'cybersecurite', 'antivirus', 'edr', 'siem', 'iso 27001'],
  'Sauvegarde': ['sauvegarde', 'sauvegardes', 'backup', 'veeam', 'pra', 'pca'],
  'Supervision': ['supervision', 'monitoring', 'zabbix', 'centreon', 'nagios', 'prtg', 'grafana'],
  'ITIL': ['itil'],
  'GLPI': ['glpi'],
  'ServiceNow': ['servicenow'],
  'Ticketing': ['ticket', 'tickets', 'ticketing', 'gestion des incidents'],
  'Support N1': ['niveau 1', 'n1'],
  'Support N2': ['niveau 2', 'n2'],
  'Support N3': ['niveau 3', 'n3'],
  'Helpdesk': ['helpdesk', 'help desk', 'service desk', 'hotline', 'support utilisateurs', 'assistance utilisateurs'],
  'Déploiement de postes': ['deploiement', 'masterisation', 'mastering', 'installation de postes', 'parc informatique', 'gestion de parc'],
  'Matériel': ['materiel', 'hardware', 'imprimante', 'imprimantes', 'peripheriques'],
  'Téléphonie / ToIP': ['telephonie', 'toip', 'voip', '3cx'],
  'Stockage / NAS': ['nas', 'san', 'stockage', 'synology'],
  'Cloud': ['cloud'],
  'RGPD': ['rgpd', 'gdpr'],
  'Anglais': ['anglais', 'english'],
  'Permis B': ['permis b', 'permis de conduire', 'vehicule'],
  'Déplacements': ['deplacements', 'deplacement', 'itinerant', 'intervention sur site', 'interventions sur site'],
  'Astreintes': ['astreinte', 'astreintes'],
};

const KW_SOFT = {
  'Autonomie': ['autonome', 'autonomie'],
  'Rigueur': ['rigoureux', 'rigoureuse', 'rigueur'],
  'Travail en équipe': ['equipe', 'collaboratif', 'collaboration'],
  'Relationnel': ['relationnel', 'relation client', 'sens du service', 'orientation client', 'contact'],
  'Communication': ['communication', 'communiquer'],
  'Pédagogie': ['pedagogue', 'pedagogie', 'former', 'formation des utilisateurs', 'accompagner', 'accompagnement'],
  'Réactivité': ['reactif', 'reactive', 'reactivite'],
  'Organisation': ['organise', 'organisee', 'organisation', 'priorites', 'prioriser'],
  'Curiosité': ['curieux', 'curieuse', 'curiosite', 'veille'],
  'Esprit d\'analyse': ['analyse', 'analytique', 'diagnostic', 'diagnostiquer', 'resolution de problemes'],
  'Adaptabilité': ['adaptabilite', 'adaptable', 'polyvalent', 'polyvalente', 'polyvalence'],
  'Documentation': ['documentation', 'documenter', 'procedures'],
};

const KW_STOP = new Set(`
a afin ai ainsi alors au aussi autre autres aux avec avez avoir bien bon bonne c ca car ce cela celle celles celui ces cet cette chez comme comment
d dans de des deja depuis donc dont du elle elles en encore entre est et etc etre eu fait faire il ils je jour jours l la le les leur leurs lui
m ma mais me meme mes moi mon n ne ni nos notre nous on ou par parmi pas pendant peu peut plus pour pourquoi pouvez qu que quel quelle quelles
quels qui quoi s sa sans se ses si son sont sous sur ta te tes toi ton tous tout toute toutes tres tu un une unes uns vos votre vous y
poste postes profil mission missions vous votre entreprise societe groupe client clients candidat candidate candidature recherche recherchons
h f hf cdi cdd temps plein partiel salaire remuneration avantages experience experiences ans annee annees minimum souhaitee souhaite requise
requis etes serez sera seront avoir assurer assurez participer participerez rejoindre rejoignez nos notre equipe postuler offre emploi
dans le la les des aux sein cadre type lieu date debut niveau bac connaissance connaissances competences competence maitrise maitriser
travail travailler afin selon etc ainsi egalement notamment plusieurs chaque tant ensemble premier premiere nouveau nouvelle nouveaux
the and for with you your our are will this that from have has job role team work skills
`.split(/\s+/).filter(Boolean));

function kwNormalize(text) {
  return ' ' + String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9+/#.\- ]+/g, ' ')
    .replace(/\s+/g, ' ') + ' ';
}

function kwCount(norm, term) {
  // Correspondance sur mot entier : le terme doit être entouré de séparateurs.
  const escaped = term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`(?<=[\\s.,;:/()-])${escaped}(?=[\\s.,;:/()-])`, 'g');
  return (norm.match(re) || []).length;
}

function kwMatchDict(norm, dict) {
  return Object.entries(dict)
    .map(([label, terms]) => ({ label, n: terms.reduce((sum, t) => sum + kwCount(norm, t), 0) }))
    .filter((k) => k.n > 0)
    .sort((a, b) => b.n - a.n);
}

function analyseOffre(text) {
  const norm = kwNormalize(text);
  const tech = kwMatchDict(norm, KW_TECH);
  const soft = kwMatchDict(norm, KW_SOFT);

  const counts = {};
  norm.split(/[\s.,;:()/]+/).forEach((w) => {
    w = w.replace(/^[-.]+|[-.]+$/g, '');
    if (w.length < 4 || KW_STOP.has(w) || /^\d+$/.test(w)) return;
    counts[w] = (counts[w] || 0) + 1;
  });
  const frequents = Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([label, n]) => ({ label, n }));

  return { tech, soft, frequents };
}
