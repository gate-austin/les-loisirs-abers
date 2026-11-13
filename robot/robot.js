// Robot des notifications : lancé par GitHub toutes les 15 minutes environ.
// 1. Envoie les notifications en attente (sondage lancé, relance, cagnotte…).
// 2. Le mardi à partir de 20 h, rappelle le match du jeudi à ceux qui n'ont pas répondu.
const admin = require('firebase-admin');

const compte = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(compte), databaseURL: process.env.DATABASE_URL });
const db = admin.database();
const APP_URL = process.env.APP_URL;

async function jetons(cible) {
  const snap = await db.ref('tokens').get();
  const liste = [];
  snap.forEach((j) => {
    if (cible && !cible[j.key]) return;
    j.forEach((t) => { if (typeof t.val() === 'string') liste.push({ jid: j.key, uid: t.key, token: t.val() }); });
  });
  return liste;
}

async function envoyer(titre, corps, cible) {
  const liste = await jetons(cible);
  if (!liste.length) return 0;
  let ok = 0;
  for (let i = 0; i < liste.length; i += 500) {
    const paquet = liste.slice(i, i + 500);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: paquet.map((p) => p.token),
      webpush: {
        notification: { title: titre, body: corps, icon: `${APP_URL}icon-192.png` },
        fcmOptions: { link: APP_URL },
      },
    });
    ok += res.successCount;
    await Promise.all(res.responses.map((r, k) => {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument') {
        return db.ref(`tokens/${paquet[k].jid}/${paquet[k].uid}`).remove();
      }
      return null;
    }));
  }
  return ok;
}

function heureDeParis() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'long',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour), jour: p.weekday };
}
function plusJours(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function notificationsEnAttente() {
  const snap = await db.ref('notifs').get();
  const taches = [];
  snap.forEach((n) => { taches.push(n); });
  for (const n of taches) {
    const v = n.val() || {};
    const nb = await envoyer(v.titre || 'Les Loisirs', v.corps || '', v.cible || null);
    console.log(`Notification « ${v.titre} » envoyée à ${nb} appareil(s).`);
    await n.ref.remove();
  }
}

async function rappelDuMardi() {
  const p = heureDeParis();
  if (p.jour !== 'Tuesday' || p.heure < 20) return;
  const jeudi = plusJours(p.date, 2);
  const saison = (await db.ref('saison').get()).val() || {};
  const nous = (saison.meta && saison.meta.equipe) || 'Les Abers';
  const journees = saison.journees || [];
  const idx = Object.keys(journees).find((k) => journees[k].date === jeudi && Object.values(journees[k].rencontres || {}).some((r) => r.dom === nous || r.ext === nous));
  if (idx === undefined) return;
  if ((await db.ref(`rappels/${idx}`).get()).exists()) return;
  const rencontre = Object.values(journees[idx].rencontres).find((r) => r.dom === nous || r.ext === nous);
  const joueurs = (await db.ref('joueurs').get()).val() || {};
  const rep = (await db.ref(`reponses/${idx}`).get()).val() || {};
  const cible = {};
  Object.keys(joueurs).forEach((j) => { if (!rep[j] || rep[j].dispo === undefined) cible[j] = true; });
  if (Object.keys(cible).length) {
    const nb = await envoyer('Rappel : match jeudi', `Tu n'as pas encore répondu pour ${rencontre.dom} – ${rencontre.ext}. Dispo ? Tu restes manger ?`, cible);
    console.log(`Rappel du mardi envoyé à ${nb} appareil(s).`);
  }
  await db.ref(`rappels/${idx}`).set(Date.now());
}

(async () => {
  try {
    await notificationsEnAttente();
    await rappelDuMardi();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await admin.app().delete();
  }
})();
