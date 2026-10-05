// Applique le thème mémorisé avant l'affichage, pour éviter un flash de couleurs.
try {
  const t = localStorage.getItem('myjob.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch { /* stockage indisponible */ }
