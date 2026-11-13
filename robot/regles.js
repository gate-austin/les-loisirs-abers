// Installe les règles de sécurité de la base (fichier regles-base-de-donnees.json).
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

(async () => {
  const compte = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const { access_token } = await admin.credential.cert(compte).getAccessToken();
  const regles = fs.readFileSync(path.join(__dirname, '..', 'regles-base-de-donnees.json'), 'utf8');
  JSON.parse(regles); // vérifie que le fichier est un JSON valide
  const res = await fetch(`${process.env.DATABASE_URL}/.settings/rules.json`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: regles,
  });
  const texte = await res.text();
  console.log(`Réponse de Firebase (${res.status}) : ${texte}`);
  if (!res.ok) process.exit(1);
  console.log('Règles installées ✔');
})().catch((e) => { console.error(e); process.exit(1); });
