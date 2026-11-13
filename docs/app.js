// =====================================================================
//  Les Loisirs – Entente des Abers : l'appli
// =====================================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, onValue, get, set, update, remove, push, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getMessaging, getToken, onMessage, isSupported } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
import { FIREBASE_CONFIG, VAPID_KEY, SAISON_INITIALE } from './config.js';

const fb = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(fb);
const db = getDatabase(fb);
const appEl = document.getElementById('app');

// ---------------------------------------------------------------------
//  État de l'appli
// ---------------------------------------------------------------------
const S = {
  uid: null,
  etape: 'chargement',      // chargement | installation | code-equipe | choix-joueur | appli
  moiId: null,
  data: {},                 // copie en direct de la base
  ui: { noms: {}, phase: null, journee: null, editSalle: null, editJoueur: null, ajoutJoueur: false, import: null, erreur: '' },
  joueursConnexion: null,
  abonnements: [],
  notifsOk: false,
  renduEnAttente: false,
};

// ---------------------------------------------------------------------
//  Petits outils
// ---------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const dateObj = (iso) => { const [a, m, j] = iso.split('-').map(Number); return new Date(a, m - 1, j); };
const dateLongue = (iso) => { const d = dateObj(iso); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const heureTxt = (h) => (h ? h.replace(':', ' h ') : '');
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

async function essai(fn, msgOk) {
  try { await fn(); if (msgOk) toast(msgOk); }
  catch (e) {
    console.error(e);
    toast(String(e.code || e.message).includes('PERMISSION') ? "Action refusée (droits insuffisants)." : "Oups, ça n'a pas marché. Réessaie.");
  }
}

const ICONES = {
  accueil: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  journees: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  cagnotte: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5a3 3 0 1 0 0 5M8 11h5M8 13.5h5"/>',
  salles: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  reglages: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  cloche: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  retour: '<path d="M15 18l-6-6 6-6"/>',
  suivant: '<path d="M9 18l6-6-6-6"/>',
  gps: '<path d="M3 11l18-8-8 18-2-8z"/>',
  crayon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  gens: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  coche: '<path d="M5 12l5 5 9-10"/>',
};
const ico = (n, t = 22) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[n]}</svg>`;

// ---------------------------------------------------------------------
//  Lecture des données
// ---------------------------------------------------------------------
const D = (k) => S.data[k] || {};
const meta = () => (D('saison').meta || {});
const nous = () => meta().equipe || 'Les Abers';
const moi = () => D('joueurs')[S.moiId] || {};
const peut = (role) => !!(moi().roles && (moi().roles.admin || moi().roles[role]));
const estAdmin = () => !!(moi().roles && moi().roles.admin);
const joueursTries = () => Object.entries(D('joueurs')).map(([id, j]) => ({ id, ...j })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
const nomDe = (id) => (D('joueurs')[id] || {}).nom || '?';

function journees() {
  const j = D('saison').journees || [];
  return Object.entries(j).map(([i, v]) => ({ i: Number(i), ...v, rencontres: Object.values(v.rencontres || {}) })).sort((a, b) => a.date.localeCompare(b.date));
}
function nosMatchs() {
  const n = nous();
  const out = [];
  for (const j of journees()) {
    const r = j.rencontres.find((x) => x.dom === n || x.ext === n);
    if (r) out.push({ i: j.i, date: j.date, phase: j.phase, dom: r.dom === n, recoit: r.dom, visiteur: r.ext, adversaire: r.dom === n ? r.ext : r.dom });
  }
  return out;
}
const matchParId = (i) => nosMatchs().find((m) => m.i === Number(i));
const prochainMatch = () => nosMatchs().find((m) => m.date >= aujourdhui());
const dernierMatch = () => [...nosMatchs()].reverse().find((m) => m.date < aujourdhui());
const infoMatch = (i) => D('matchs')[i] || {};
const salleDe = (nomEquipe) => (D('equipes')[slug(nomEquipe)] || {}).salle || '';
function heureMatch(m) { const h = infoMatch(m.i).heure || (m.dom ? meta().rdvDefaut : ''); return h ? `RDV ${heureTxt(h)}` : 'RDV à préciser'; }
const lieuMatch = (m) => infoMatch(m.i).lieu || salleDe(m.recoit) || 'Salle à préciser';
const lienGps = (lieu) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lieu)}`;
const reponses = (i) => D('reponses')[i] || {};
const repas = (i) => D('repas')[i] || {};

function bilan(i) {
  const rep = reponses(i);
  const b = { dispo: [], pasDispo: [], sansReponse: [], mange: [], mangePas: [] };
  for (const j of joueursTries()) {
    const r = rep[j.id];
    if (!r || r.dispo === undefined) b.sansReponse.push(j.nom);
    else if (r.dispo) b.dispo.push(j.nom); else b.pasDispo.push(j.nom);
    if (r && r.mange) b.mange.push(j.nom); else if (r && r.dispo !== undefined) b.mangePas.push(j.nom);
  }
  return b;
}
function collecteActive() {
  return Object.entries(D('cagnotte').collectes || {}).map(([id, c]) => ({ id, ...c })).filter((c) => c.active).sort((a, b) => (b.cree || 0) - (a.cree || 0))[0];
}
const aRecu = (cid, jid) => !!((D('cagnotte').recus || {})[cid] || {})[jid];

// ---------------------------------------------------------------------
//  Démarrage et connexion
// ---------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) { try { await signInAnonymously(auth); } catch (e) { console.error(e); appEl.innerHTML = '<div class="chargement">Connexion impossible. Vérifie ta connexion internet.</div>'; } return; }
  S.uid = user.uid;
  demarrer();
});

async function demarrer() {
  S.etape = 'chargement'; rendre();
  try {
    const init = await get(ref(db, 'etat/initialise'));
    if (!init.exists()) { S.etape = 'installation'; return rendre(); }
    try {
      await get(ref(db, 'saison/meta'));
      const lien = await get(ref(db, `liens/${S.uid}`));
      S.moiId = lien.val().joueur;
      S.etape = 'appli';
      abonner();
      preparerNotifs();
    } catch (e) {
      S.etape = 'code-equipe';
    }
  } catch (e) {
    console.error(e);
    appEl.innerHTML = '<div class="chargement">Impossible de joindre la base. Réessaie dans un instant.</div>';
    return;
  }
  rendre();
}

function abonner() {
  S.abonnements.forEach((u) => u()); S.abonnements = [];
  const chemins = ['joueurs', 'saison', 'matchs', 'reponses', 'repas', 'cagnotte', 'equipes'];
  for (const c of chemins) {
    S.abonnements.push(onValue(ref(db, c), (snap) => {
      S.data[c] = snap.val() || {};
      if (c === 'joueurs') abonnerAdmin();
      rendre();
    }, (err) => { console.error(c, err); if (c === 'saison') { S.etape = 'code-equipe'; rendre(); } }));
  }
}
let abonneSecret = false;
function abonnerAdmin() {
  if (estAdmin() && !abonneSecret) {
    abonneSecret = true;
    S.abonnements.push(onValue(ref(db, 'secret'), (s) => { S.data.secret = s.val() || {}; rendre(); }, () => {}));
  }
}

// ---------------------------------------------------------------------
//  Notifications
// ---------------------------------------------------------------------
let messaging = null;
const estIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const estInstallee = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function preparerNotifs() {
  try {
    if (!(await isSupported())) return;
    messaging = getMessaging(fb);
    onMessage(messaging, (p) => toast(`${p.notification?.title || 'Notification'} — ${p.notification?.body || ''}`));
    if (Notification.permission === 'granted') await enregistrerJeton(false);
  } catch (e) { console.warn(e); }
  rendre();
}
async function enregistrerJeton(bavard) {
  const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
  const jeton = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (jeton) { await set(ref(db, `tokens/${S.moiId}/${S.uid}`), jeton); S.notifsOk = true; if (bavard) toast('Notifications activées 👍'); }
}
async function activerNotifs() {
  if (!messaging) {
    if (estIos() && !estInstallee()) { location.hash = '#aide'; return; }
    toast("Ce navigateur ne gère pas les notifications."); return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifications refusées. Tu peux les autoriser dans les réglages du téléphone.'); return; }
  await essai(() => enregistrerJeton(true));
  rendre();
}
const envoyerNotif = (titre, corps, cible) => push(ref(db, 'notifs'), { titre, corps, ...(cible ? { cible } : {}), cree: serverTimestamp(), par: S.moiId });

// ---------------------------------------------------------------------
//  Rendu
// ---------------------------------------------------------------------
function rendre() {
  const actif = document.activeElement;
  if (actif && appEl.contains(actif) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(actif.tagName) && actif.type !== 'file') { S.renduEnAttente = true; return; }
  S.renduEnAttente = false;
  appEl.innerHTML = vue();
}
appEl.addEventListener('focusout', () => setTimeout(() => { if (S.renduEnAttente) rendre(); }, 50));
window.addEventListener('hashchange', () => { S.ui.erreur = ''; rendre(); window.scrollTo(0, 0); });

function vue() {
  switch (S.etape) {
    case 'chargement': return '<div class="chargement">Chargement…</div>';
    case 'installation': return vueInstallation();
    case 'code-equipe': return vueCodeEquipe();
    case 'choix-joueur': return vueChoixJoueur();
  }
  if (!D('joueurs')[S.moiId] && S.data.joueurs) { return vueCodeEquipe(); }
  const [route, param] = (location.hash.slice(1) || 'accueil').split('/');
  const pages = { accueil: vueAccueil, matchs: vueMatchs, match: () => vueMatch(param), journees: vueJournees, cagnotte: vueCagnotte, salles: vueSalles, admin: vueAdmin, aide: vueAide };
  return bandeau() + `<main class="contenu">${(pages[route] || vueAccueil)()}</main>` + onglets(route);
}

function bandeau() {
  const cloche = !S.notifsOk ? `<button class="icone" data-action="notifs" aria-label="Activer les notifications">${ico('cloche')}</button>` : '';
  const reglages = estAdmin() ? `<a class="icone" href="#admin" aria-label="Admin">${ico('reglages')}</a>` : '';
  return `<header class="bandeau"><img src="logo.png" alt="Logo Entente des Abers">
    <div class="noms"><span class="t1">Les Loisirs</span><span class="t2">Entente des Abers · saison ${esc(meta().nom || '')}</span></div>${cloche}${reglages}</header>`;
}
function onglets(route) {
  const o = [['accueil', 'Accueil', 'accueil'], ['matchs', 'Nos matchs', 'calendrier'], ['journees', 'Journées', 'journees'], ['cagnotte', 'Cagnotte', 'cagnotte'], ['salles', 'Salles', 'salles']];
  const r = route === 'match' ? 'matchs' : route;
  return `<nav class="onglets" aria-label="Navigation">${o.map(([h, l, i]) => `<a href="#${h}" class="${r === h ? 'actif' : ''}">${ico(i, 24)}${l}</a>`).join('')}</nav>`;
}

// ----- Installation (tout premier lancement) -----
function vueInstallation() {
  return `<div class="accueil-connexion"><img src="logo.png" alt="Logo Entente des Abers"><span class="t1">Les Loisirs</span><span>Première installation</span></div>
  <form class="contenu" data-form="installation" style="padding-bottom:32px">
    <p class="petit" style="margin:0">Tu es le premier : choisis le code de l'équipe et crée ton compte d'administrateur. La saison 2026/2027 sera chargée automatiquement.</p>
    <div class="champ"><label for="i-eq">Code équipe (à donner aux joueurs)</label><input id="i-eq" name="equipe" required minlength="4" inputmode="numeric" autocomplete="off"></div>
    <div class="champ"><label for="i-nom">Ton prénom</label><input id="i-nom" name="nom" required autocomplete="given-name"></div>
    <div class="champ"><label for="i-code">Ton code joueur (4 chiffres conseillés)</label><input id="i-code" name="code" required minlength="4" inputmode="numeric" autocomplete="off"></div>
    ${S.ui.erreur ? `<div class="erreur">${esc(S.ui.erreur)}</div>` : ''}
    <button class="btn" type="submit">Installer l'appli</button>
  </form>`;
}

// ----- Connexion -----
function vueCodeEquipe() {
  return `<div class="accueil-connexion"><img src="logo.png" alt="Logo Entente des Abers"><span class="t1">Les Loisirs</span><span>Entente des Abers</span></div>
  <form class="contenu" data-form="code-equipe" style="padding-bottom:32px">
    <div class="champ"><label for="c-eq">Code équipe</label><input id="c-eq" name="equipe" required inputmode="numeric" autocomplete="off"><span class="petit">Donné par Olivier, demandé une seule fois.</span></div>
    ${S.ui.erreur ? `<div class="erreur">${esc(S.ui.erreur)}</div>` : ''}
    <button class="btn" type="submit">Continuer</button>
    ${aideInstallation()}
  </form>`;
}
function vueChoixJoueur() {
  const js = Object.entries(S.joueursConnexion || {}).map(([id, j]) => ({ id, ...j })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return `<div class="accueil-connexion"><img src="logo.png" alt="Logo Entente des Abers"><span class="t1">Les Loisirs</span><span>Entente des Abers</span></div>
  <form class="contenu" data-form="choix-joueur" style="padding-bottom:32px">
    <div class="champ"><label for="c-j">Ton prénom</label><select id="c-j" name="joueur" required><option value="">Choisis…</option>${js.map((j) => `<option value="${esc(j.id)}">${esc(j.nom)}</option>`).join('')}</select></div>
    <div class="champ"><label for="c-code">Ton code joueur</label><input id="c-code" name="code" required inputmode="numeric" autocomplete="off"></div>
    ${S.ui.erreur ? `<div class="erreur">${esc(S.ui.erreur)}</div>` : ''}
    <button class="btn" type="submit">Entrer</button>
    <span class="petit" style="text-align:center">Ton téléphone s'en souviendra.</span>
  </form>`;
}
function aideInstallation() {
  return `<div class="banniere info">${ico('cloche', 26)}<span style="font-size:13px;line-height:1.45">Pour recevoir les notifications sur iPhone : dans <b>Safari</b>, touche <b>Partager</b> puis <b>Sur l'écran d'accueil</b>, et ouvre l'appli depuis son icône. Sur Android, accepte « Installer l'appli ».</span></div>`;
}
function vueAide() {
  return `<h1 class="page">Installer l'appli</h1>
  <div class="carte"><div class="pad">
    <span class="fort">Sur iPhone</span>
    <span>1. Ouvre ce lien dans <b>Safari</b>.</span>
    <span>2. Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</span>
    <span>3. Choisis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>.</span>
    <span>4. Ouvre l'appli depuis sa nouvelle icône, reconnecte-toi une fois, puis touche la cloche en haut pour activer les notifications.</span>
  </div></div>
  <div class="carte"><div class="pad">
    <span class="fort">Sur Android</span>
    <span>Dans Chrome, touche le menu <b>⋮</b> puis <b>Installer l'appli</b> (ou <b>Ajouter à l'écran d'accueil</b>), puis touche la cloche pour activer les notifications.</span>
  </div></div>
  <a class="btn sec" href="#accueil">Retour</a>`;
}

// ----- Accueil -----
function vueAccueil() {
  let h = '';
  const c = collecteActive();
  if (c && !aRecu(c.id, S.moiId)) h += `<a class="banniere" href="#cagnotte" style="text-decoration:none">${ico('cagnotte')}<span style="flex:1">Cagnotte : ${esc(c.libelle)} de <b>${esc(c.montant)} €</b> à donner à Aline</span><span class="fort">Voir</span></a>`;
  if (!S.notifsOk) h += `<button class="banniere info" data-action="notifs" style="text-align:left;cursor:pointer">${ico('cloche')}<span style="flex:1">Active les notifications pour être prévenu des sondages et des rappels.</span><span class="fort" style="color:var(--bleu)">Activer</span></button>`;
  const m = prochainMatch();
  if (!m) h += `<div class="carte"><div class="pad"><span class="fort">Plus de match prévu cette saison.</span><span class="petit">Bonne fin de saison !</span></div></div>`;
  else {
    h += `<span class="titre-section">Prochain match</span>` + carteMatch(m, false);
  }
  const d = dernierMatch();
  if (d) h += blocScore(d, true);
  return h;
}

// ----- Bloc « match » (accueil et page détail) -----
function enTeteMatch(m) {
  const lieu = lieuMatch(m);
  return `<div class="pad">
    <div class="ligne-haut"><span class="petit">${capital(dateLongue(m.date))} · ${heureMatch(m)}</span><span class="badge ${m.dom ? 'dom' : 'ext'}">${m.dom ? 'Domicile' : 'Extérieur'}</span></div>
    <span class="affiche">${esc(m.recoit)} – ${esc(m.visiteur)}</span>
    <span class="petit">${esc(lieu)}</span>
    <a href="${lienGps(lieu)}" target="_blank" rel="noopener" class="fort" style="display:flex;align-items:center;gap:6px;font-size:14px">${ico('salles', 18)}Y aller (GPS)</a>
  </div>`;
}
function carteMatch(m, complet) {
  const r = reponses(m.i)[S.moiId] || {};
  const b = bilan(m.i);
  const ouvert = S.ui.noms[m.i];
  let h = `<section class="carte">${enTeteMatch(m)}
    <div class="pad gris">
      <span class="fort" style="font-size:14px">Ta réponse${infoMatch(m.i).sondageOuvert ? '' : ' <span class="petit">(sondage pas encore lancé)</span>'}</span>
      <div class="grille2">
        <button class="btn ${r.dispo === true ? '' : 'neutre'}" data-action="repondre" data-m="${m.i}" data-v="1">${r.dispo === true ? ico('coche', 18) : ''}Dispo</button>
        <button class="btn ${r.dispo === false ? '' : 'neutre'}" data-action="repondre" data-m="${m.i}" data-v="0">${r.dispo === false ? ico('coche', 18) : ''}Pas dispo</button>
      </div>
      <button class="case" data-action="manger" data-m="${m.i}"><span class="boite ${r.mange ? 'on' : ''}">${r.mange ? ico('coche', 16) : ''}</span>Je reste manger après le match</button>
    </div></section>
  <section class="grille3">
    <div class="stat"><b style="color:var(--bleu)">${b.dispo.length}</b><span>dispos</span></div>
    <div class="stat"><b>${b.pasDispo.length}</b><span>pas dispo</span></div>
    <div class="stat"><b style="color:var(--rouge)">${b.sansReponse.length}</b><span>sans réponse</span></div>
  </section>
  <button class="btn sec" data-action="noms" data-m="${m.i}">${ico('gens', 18)}${ouvert ? 'Masquer les noms' : 'Voir les noms'}</button>`;
  if (ouvert) {
    const g = [['Dispo', b.dispo, 'ok'], ['Pas dispo', b.pasDispo, ''], ['Sans réponse', b.sansReponse, 'ko'], ['Restent manger', b.mange, ''], ['Ne restent pas manger', b.mangePas, '']];
    h += `<section class="carte liste">${g.map(([t, l, c]) => `<div class="el"><div class="grow"><span class="${c} petit" style="text-transform:uppercase;letter-spacing:.05em;font-weight:600">${t} (${l.length})</span><span>${l.length ? l.map(esc).join(', ') : '—'}</span></div></div>`).join('')}</section>`;
  }
  h += blocRepas(m, complet);
  if (complet && (peut('sondage'))) h += zoneSondage(m);
  if (complet && m.date <= aujourdhui()) h += blocScore(m, false);
  if (!complet) h += `<a class="btn neutre" href="#match/${m.i}">Détail du match</a>`;
  return h;
}
function blocRepas(m, complet) {
  const b = bilan(m.i);
  const rp = repas(m.i);
  if (!m.dom) {
    return `<section class="carte"><div class="pad" style="flex-direction:row;align-items:center;gap:12px">${ico('gens', 26)}<div style="display:flex;flex-direction:column;flex:1"><span class="fort">${b.mange.length} ${esc(nous())} restent manger</span><span class="petit">Chiffre à transmettre à ${esc(m.recoit)}</span></div></div></section>`;
  }
  const adv = Number(infoMatch(m.i).adversairesRepas || 0);
  const cuisinier = rp.cuisinier;
  const gateaux = Object.keys(rp.gateaux || {});
  const jeFaisGateau = gateaux.includes(S.moiId);
  let h = `<section class="grille2">
    <div class="carte"><div class="pad"><span class="petit">Repas</span><span class="fort">${cuisinier ? esc(nomDe(cuisinier)) : '<span class="ko">Personne pour l\'instant</span>'}</span>
      ${!cuisinier ? `<button class="btn petit-btn" data-action="repas" data-m="${m.i}">Je m'en charge</button>` : (cuisinier === S.moiId ? `<button class="btn neutre petit-btn" data-action="lacher-repas" data-m="${m.i}">Me retirer</button>` : '')}</div></div>
    <div class="carte"><div class="pad"><span class="petit">Gâteaux (2 personnes)</span><span class="fort">${gateaux.length ? gateaux.map((g) => esc(nomDe(g))).join(' · ') : ''}${gateaux.length < 2 ? `${gateaux.length ? ' · ' : ''}<span class="ko">${2 - gateaux.length} place${gateaux.length ? '' : 's'} libre${gateaux.length ? '' : 's'}</span>` : ''}</span>
      ${jeFaisGateau ? `<button class="btn neutre petit-btn" data-action="gateau" data-m="${m.i}">Me retirer</button>` : (gateaux.length < 2 ? `<button class="btn petit-btn" data-action="gateau" data-m="${m.i}">J'en fais un</button>` : '')}</div></div>
  </section>
  <section class="carte gris"><div class="pad"><span class="fort" style="font-size:14px">Qui reste manger</span>
    <div class="grille3" style="text-align:center">
      <div><b style="font-family:var(--titre);font-size:28px">${b.mange.length}</b><div class="petit">${esc(nous())}</div></div>
      <div><b style="font-family:var(--titre);font-size:28px">${adv}</b><div class="petit">${esc(m.adversaire)}</div></div>
      <div><b style="font-family:var(--titre);font-size:28px;color:var(--bleu)">${b.mange.length + adv}</b><div class="petit">au total</div></div>
    </div></div></section>`;
  return h;
}
function zoneSondage(m) {
  const info = infoMatch(m.i);
  return `<form class="zone" data-form="match" data-m="${m.i}">
    <span class="etiquette">Olivier / Arnaud</span>
    ${info.sondageOuvert ? `<span class="ok">${ico('coche', 16)} Sondage lancé</span>` : `<button type="button" class="btn" data-action="ouvrir-sondage" data-m="${m.i}">${ico('cloche', 18)}Lancer le sondage (notifie tout le monde)</button>`}
    <button type="button" class="btn sec" data-action="relancer" data-m="${m.i}">Relancer ceux qui n'ont pas répondu</button>
    <div class="ligne-champ"><label for="f-h">Heure du RDV</label><input id="f-h" type="time" name="heure" value="${esc(info.heure || (m.dom ? meta().rdvDefaut || '' : ''))}"></div>
    <div class="champ"><label for="f-l" style="font-weight:400">Lieu</label><input id="f-l" name="lieu" value="${esc(info.lieu || salleDe(m.recoit))}"></div>
    ${m.dom ? `<div class="ligne-champ"><label for="f-a">Adversaires qui restent manger</label><input id="f-a" name="adversaires" inputmode="numeric" value="${esc(info.adversairesRepas ?? '')}"></div>` : ''}
    <button class="btn" type="submit">Enregistrer</button>
    <span class="petit">Rappel automatique le mardi soir à 20 h pour ceux qui n'ont pas répondu.</span>
  </form>`;
}
function blocScore(m, avecTitre) {
  const sc = infoMatch(m.i).score || {};
  const aScore = sc.nous !== undefined && sc.nous !== '';
  const nomNous = esc(nous()), nomEux = esc(m.adversaire);
  return `<form class="carte" data-form="score" data-m="${m.i}"><div class="pad">
    ${avecTitre ? `<span class="petit">Dernier match · ${dateLongue(m.date)} · ${esc(m.recoit)} – ${esc(m.visiteur)}</span>` : '<span class="fort">Score</span>'}
    ${aScore ? `<span class="affiche" style="font-size:24px">${nomNous} ${esc(sc.nous)} – ${esc(sc.eux)} ${nomEux}</span>` : ''}
    <div class="score" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <input name="nous" inputmode="numeric" aria-label="Score ${nomNous}" placeholder="Nous" value="${aScore ? esc(sc.nous) : ''}"><span>–</span>
      <input name="eux" inputmode="numeric" aria-label="Score ${nomEux}" placeholder="Eux" value="${aScore ? esc(sc.eux) : ''}">
      <button class="btn petit-btn" type="submit">${aScore ? 'Corriger' : 'Enregistrer'}</button>
    </div></div></form>`;
}

// ----- Nos matchs -----
function vueMatchs() {
  const tous = nosMatchs();
  const p = prochainMatch();
  const phase = S.ui.phase || (p ? p.phase : 'aller');
  const liste = tous.filter((m) => m.phase === phase);
  return `<h1 class="page">Nos matchs</h1>
  <div class="grille2"><button class="btn ${phase === 'aller' ? '' : 'neutre'}" data-action="phase" data-v="aller">Aller</button><button class="btn ${phase === 'retour' ? '' : 'neutre'}" data-action="phase" data-v="retour">Retour</button></div>
  ${liste.map((m) => {
    const d = dateObj(m.date);
    const sc = infoMatch(m.i).score;
    const etat = p && p.i === m.i ? 'prochain' : (m.date < aujourdhui() ? 'passe' : '');
    const info = etat === 'prochain' ? 'Prochain match' : (sc && sc.nous !== undefined ? `Score : ${esc(sc.nous)} – ${esc(sc.eux)}` : (m.date < aujourdhui() ? 'Score à saisir' : heureMatch(m)));
    return `<a class="match-ligne ${etat}" href="#match/${m.i}"><div class="jour"><b>${d.getDate()}</b><span>${MOIS_COURT[d.getMonth()]}</span></div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column"><span class="fort">${esc(m.recoit)} – ${esc(m.visiteur)}</span><span class="petit">${info}</span></div>
      <span class="badge ${m.dom ? 'dom' : 'ext'}">${m.dom ? 'Dom.' : 'Ext.'}</span></a>`;
  }).join('')}`;
}
function vueMatch(i) {
  const m = matchParId(i);
  if (!m) return '<p>Match introuvable.</p><a class="btn" href="#matchs">Retour</a>';
  return `<a href="#matchs" style="display:flex;align-items:center;gap:4px;text-decoration:none">${ico('retour', 18)}Nos matchs</a>` + carteMatch(m, true);
}

// ----- Journées -----
function vueJournees() {
  const js = journees();
  if (!js.length) return '<p>Aucune journée chargée.</p>';
  let idx = S.ui.journee;
  if (idx === null || idx >= js.length) { idx = js.findIndex((j) => j.date >= aujourdhui()); if (idx < 0) idx = js.length - 1; }
  S.ui.journee = idx;
  const j = js[idx];
  const numero = js.filter((x) => x.phase === j.phase && x.date <= j.date).length;
  return `<div class="ligne-haut">
    <button class="btn neutre" style="width:46px;padding:0" data-action="journee" data-v="-1" aria-label="Journée précédente" ${idx === 0 ? 'disabled' : ''}>${ico('retour')}</button>
    <div style="display:flex;flex-direction:column;align-items:center"><span class="affiche" style="font-size:22px">Journée ${numero} · ${j.phase}</span><span class="petit">${capital(dateLongue(j.date))} ${dateObj(j.date).getFullYear()}</span></div>
    <button class="btn neutre" style="width:46px;padding:0" data-action="journee" data-v="1" aria-label="Journée suivante" ${idx === js.length - 1 ? 'disabled' : ''}>${ico('suivant')}</button>
  </div>
  ${j.rencontres.map((r) => `<div class="rencontre ${r.dom === nous() || r.ext === nous() ? 'nous' : ''}"><span>${esc(r.dom)}</span><i>vs</i><span>${esc(r.ext)}</span></div>`).join('')}
  <span class="petit" style="text-align:center">L'équipe qui reçoit est à gauche</span>`;
}

// ----- Cagnotte -----
function vueCagnotte() {
  const coll = Object.entries(D('cagnotte').collectes || {}).map(([id, c]) => ({ id, ...c })).sort((a, b) => (b.cree || 0) - (a.cree || 0));
  const js = joueursTries();
  let h = `<h1 class="page">Cagnotte apéro</h1>`;
  if (!coll.length) h += `<p class="petit">Aucune cagnotte pour l'instant.</p>`;
  for (const c of coll) {
    const nb = js.filter((j) => aRecu(c.id, j.id)).length;
    h += `<section class="carte"><div class="pad"><div class="ligne-haut"><span class="fort">${esc(c.libelle)} · ${esc(c.montant)} €</span><span class="${nb === js.length ? 'ok' : 'ko'}" style="font-size:13px">${nb} / ${js.length} reçus</span></div>
      ${!peut('cagnotte') ? `<span>${aRecu(c.id, S.moiId) ? '<span class="ok">Ton don est bien reçu ✓</span>' : `<span class="ko">À donner à Aline : ${esc(c.montant)} €</span>`}</span>` : ''}
      ${!c.active ? '<span class="petit">Clôturée</span>' : ''}</div>`;
    if (peut('cagnotte') && (c.active || S.ui.voirCollecte === c.id)) {
      h += `<div class="liste">${js.map((j) => `<button class="el case" style="width:100%" data-action="recu" data-c="${c.id}" data-j="${j.id}"><span class="boite ${aRecu(c.id, j.id) ? 'on' : ''}">${aRecu(c.id, j.id) ? ico('coche', 16) : ''}</span><span class="grow">${esc(j.nom)}</span><span class="${aRecu(c.id, j.id) ? 'ok' : 'ko'}" style="font-size:13px">${aRecu(c.id, j.id) ? 'Reçu' : 'En attente'}</span></button>`).join('')}</div>`;
      if (c.active) h += `<div class="pad"><button class="btn neutre petit-btn" data-action="cloturer" data-c="${c.id}">Clôturer cette cagnotte</button></div>`;
    } else if (peut('cagnotte')) {
      h += `<div class="pad"><button class="btn neutre petit-btn" data-action="voir-collecte" data-c="${c.id}">Voir la liste</button></div>`;
    }
    h += `</section>`;
  }
  if (peut('cagnotte')) {
    h += `<form class="zone" data-form="collecte"><span class="etiquette">Aline / Olivier</span>
      <div class="champ"><label for="g-l" style="font-weight:400">Intitulé</label><input id="g-l" name="libelle" value="${coll.length ? 'Complément' : 'Début de saison'}" required></div>
      <div class="ligne-champ"><label for="g-m">Montant par personne (€)</label><input id="g-m" name="montant" inputmode="decimal" required value="${coll.length ? '5' : '20'}"></div>
      <button class="btn" type="submit">Demander à tout le monde</button>
      <span class="petit">Tout le monde reçoit une notification ; un bandeau reste affiché tant que le don n'est pas coché.</span></form>`;
  }
  return h;
}

// ----- Salles -----
function vueSalles() {
  const eqs = new Set(journees().flatMap((j) => j.rencontres.flatMap((r) => [r.dom, r.ext])));
  const noms = [...eqs].sort((a, b) => (a === nous() ? -1 : b === nous() ? 1 : a.localeCompare(b, 'fr')));
  return `<h1 class="page">Équipes et salles</h1>` + noms.map((n) => {
    const e = D('equipes')[slug(n)] || {};
    if (S.ui.editSalle === slug(n)) {
      return `<form class="carte" data-form="salle" data-k="${slug(n)}" data-nom="${esc(n)}"><div class="pad"><span class="fort">${esc(n)}</span>
        <div class="champ"><label for="s-a" style="font-weight:400">Salle et adresse</label><input id="s-a" name="salle" value="${esc(e.salle || '')}"></div>
        <div class="grille2"><button type="button" class="btn neutre" data-action="edit-salle" data-k="">Annuler</button><button class="btn" type="submit">Enregistrer</button></div></div></form>`;
    }
    const etat = !e.salle ? '<span class="ko" style="font-size:12px">À compléter</span>' : (e.aVerifier ? '<span style="font-size:12px;color:#8A5A00;font-weight:600">Trouvée sur internet, à vérifier</span>' : '');
    return `<div class="carte" ${n === nous() ? 'style="border:2px solid var(--bleu)"' : ''}><div class="pad" style="flex-direction:row;align-items:center">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span class="fort">${esc(n)}</span><span class="petit">${esc(e.salle || 'Salle non renseignée')}</span>${etat}</div>
      ${peut('sondage') ? `<button class="btn neutre" style="width:46px;padding:0" data-action="edit-salle" data-k="${slug(n)}" aria-label="Modifier la salle de ${esc(n)}">${ico('crayon', 18)}</button>` : ''}
      ${e.salle ? `<a class="btn" style="width:46px;padding:0" href="${lienGps(e.salle)}" target="_blank" rel="noopener" aria-label="Y aller">${ico('gps', 18)}</a>` : ''}
    </div></div>`;
  }).join('') + (peut('sondage') ? '' : '<span class="petit" style="text-align:center">Olivier et Arnaud peuvent corriger une adresse.</span>');
}

// ----- Admin -----
const ROLES = [['admin', 'Admin'], ['sondage', 'Sondages'], ['cagnotte', 'Cagnotte']];
function formJoueur(j) {
  const roles = (j && j.roles) || {};
  const code = j ? ((D('secret').codes || {})[j.id] || '') : '';
  return `<form class="carte" data-form="joueur" data-j="${j ? j.id : ''}"><div class="pad">
    <div class="champ"><label for="j-n">Prénom</label><input id="j-n" name="nom" required value="${esc(j ? j.nom : '')}"></div>
    <div class="champ"><label for="j-c">Code joueur</label><input id="j-c" name="code" required minlength="4" inputmode="numeric" autocomplete="off" value="${esc(code)}"></div>
    <span class="fort" style="font-size:14px">Rôles</span>
    ${ROLES.map(([r, l]) => `<label class="case"><input type="checkbox" name="role-${r}" ${roles[r] ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--bleu)">${l}</label>`).join('')}
    <div class="grille2"><button type="button" class="btn neutre" data-action="annuler-joueur">Annuler</button><button class="btn" type="submit">Enregistrer</button></div>
    ${j ? `<button type="button" class="btn danger" data-action="supprimer-joueur" data-j="${j.id}">Supprimer ${esc(j.nom)}</button>` : ''}
  </div></form>`;
}
function vueAdmin() {
  if (!estAdmin()) return '<p>Réservé aux administrateurs.</p>';
  const js = joueursTries();
  const codes = D('secret').codes || {};
  let h = `<h1 class="page">Admin</h1>`;
  h += `<section class="carte"><div class="pad ligne-haut" style="flex-direction:row"><span class="fort">Joueurs (${js.length})</span>
    <button class="btn petit-btn" data-action="ajouter-joueur">+ Ajouter</button></div>`;
  h += `<div class="liste">${js.map((j) => S.ui.editJoueur === j.id ? '' : `<button class="el" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left;cursor:pointer" data-action="editer-joueur" data-j="${j.id}">
    <span class="grow"><span>${esc(j.nom)}</span><span class="petit">${ROLES.filter(([r]) => j.roles && j.roles[r]).map(([, l]) => l).join(' · ') || 'Joueur'}</span></span>
    <span style="font-family:ui-monospace,monospace;background:var(--bleu-pale);padding:4px 8px;border-radius:6px;font-size:14px">${esc(codes[j.id] || '—')}</span></button>`).join('')}</div></section>`;
  if (S.ui.ajoutJoueur) h += formJoueur(null);
  if (S.ui.editJoueur && D('joueurs')[S.ui.editJoueur]) h += formJoueur({ id: S.ui.editJoueur, ...D('joueurs')[S.ui.editJoueur] });

  h += `<form class="carte" data-form="reglages"><div class="pad"><span class="fort">Réglages</span>
    <div class="ligne-champ"><label for="r-eq">Code équipe</label><input id="r-eq" name="equipe" required minlength="4" value="${esc(D('secret').codeEquipe || '')}" style="width:120px"></div>
    <div class="ligne-champ"><label for="r-rdv">RDV par défaut à domicile</label><input id="r-rdv" type="time" name="rdv" value="${esc(meta().rdvDefaut || '20:15')}" style="width:120px"></div>
    <span class="petit">Changer le code équipe ne déconnecte personne, mais le nouveau code sera demandé aux nouveaux téléphones.</span>
    <button class="btn" type="submit">Enregistrer</button></div></form>`;

  const imp = S.ui.import;
  h += `<section class="zone"><span class="etiquette">Nouvelle saison</span>
    <span class="petit" style="line-height:1.45">Choisis le PDF du nouveau planning : l'appli lit les journées, tu vérifies, puis la saison en cours est archivée. Joueurs, codes et salles sont conservés.</span>
    <label class="btn sec" style="cursor:pointer">Choisir le PDF du planning<input type="file" accept="application/pdf" data-action-change="pdf" style="display:none"></label>`;
  if (imp && imp.erreur) h += `<div class="erreur">${esc(imp.erreur)}</div>`;
  if (imp && imp.lecture) h += `<span class="petit">Lecture du PDF…</span>`;
  if (imp && imp.journees) {
    const equipes = [...new Set(imp.journees.flatMap((j) => j.rencontres.flatMap((r) => [r.dom, r.ext])))].sort((a, b) => a.localeCompare(b, 'fr'));
    const nbR = imp.journees.reduce((s, j) => s + j.rencontres.length, 0);
    h += `<form data-form="import" style="display:flex;flex-direction:column;gap:10px">
      <span><b>${imp.journees.length}</b> journées, <b>${nbR}</b> rencontres, <b>${equipes.length}</b> équipes trouvées.</span>
      <div class="apercu">${imp.journees.map((j) => `<div><b>${j.date.split('-').reverse().join('/')}</b> (${j.phase}) : ${j.rencontres.map((r) => `${esc(r.dom)} – ${esc(r.ext)}`).join(' · ')}</div>`).join('')}</div>
      <div class="champ"><label for="im-n" style="font-weight:400">Nom de la saison</label><input id="im-n" name="nom" required value="${esc(imp.nomPropose)}"></div>
      <div class="champ"><label for="im-e" style="font-weight:400">Notre équipe dans ce planning</label><select id="im-e" name="equipe">${equipes.map((e) => `<option ${e === nous() ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
      <button class="btn" type="submit">Remplacer la saison</button>
      <button type="button" class="btn neutre" data-action="annuler-import">Annuler</button></form>`;
  }
  h += `</section>
  <button class="btn neutre" data-action="deconnexion">Déconnecter ce téléphone</button>`;
  return h;
}

// ---------------------------------------------------------------------
//  Lecture d'un planning PDF (nouvelle saison)
// ---------------------------------------------------------------------
async function lirePlanningPdf(fichier) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: await fichier.arrayBuffer() }).promise;
  const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const jours = {};
  const cur = { aller: null, retour: null };
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const largeur = page.getViewport({ scale: 1 }).width;
    const items = (await page.getTextContent()).items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, s: it.str.trim() }));
    const lignes = [];
    for (const it of items) {
      let l = lignes.find((x) => Math.abs(x.y - it.y) <= 3);
      if (!l) { l = { y: it.y, items: [] }; lignes.push(l); }
      l.items.push(it);
    }
    let separation = null;
    for (const l of lignes) {
      const ds = l.items.filter((i) => DATE.test(i.s)).sort((a, b) => a.x - b.x);
      if (ds.length === 2) separation = separation === null ? ds[1].x - 5 : Math.min(separation, ds[1].x - 5);
    }
    if (separation === null) separation = largeur / 2;
    lignes.sort((a, b) => b.y - a.y);
    for (const l of lignes) {
      const tri = l.items.sort((a, b) => a.x - b.x);
      for (const cote of ['aller', 'retour']) {
        const part = tri.filter((i) => (i.x >= separation) === (cote === 'retour'));
        if (!part.length) continue;
        const d = part.find((i) => DATE.test(i.s));
        if (d) { const [, jj, mm, aa] = d.s.match(DATE); const iso = `${aa}-${mm}-${jj}`; cur[cote] = iso; jours[iso] = jours[iso] || { date: iso, phase: cote, rencontres: [] }; continue; }
        const segs = [];
        for (const i of part) {
          const prec = segs[segs.length - 1];
          if (prec && i.x - (prec.x + prec.w) < 10) { prec.s += ' ' + i.s; prec.w = i.x + i.w - prec.x; }
          else segs.push({ ...i });
        }
        if (segs.length === 2 && cur[cote]) jours[cur[cote]].rencontres.push({ dom: segs[0].s, ext: segs[1].s });
      }
    }
  }
  return Object.keys(jours).sort().map((k) => jours[k]).filter((j) => j.rencontres.length);
}

// ---------------------------------------------------------------------
//  Actions (clics)
// ---------------------------------------------------------------------
const actions = {
  notifs: () => activerNotifs(),
  repondre: (d) => essai(() => update(ref(db, `reponses/${d.m}/${S.moiId}`), { dispo: d.v === '1' })),
  manger: (d) => { const r = reponses(d.m)[S.moiId] || {}; essai(() => update(ref(db, `reponses/${d.m}/${S.moiId}`), { mange: !r.mange })); },
  noms: (d) => { S.ui.noms[d.m] = !S.ui.noms[d.m]; rendre(); },
  repas: (d) => essai(() => set(ref(db, `repas/${d.m}/cuisinier`), S.moiId), 'Merci, tu fais le repas !'),
  'lacher-repas': (d) => essai(() => remove(ref(db, `repas/${d.m}/cuisinier`))),
  gateau: (d) => {
    const deja = !!(repas(d.m).gateaux || {})[S.moiId];
    essai(() => (deja ? remove(ref(db, `repas/${d.m}/gateaux/${S.moiId}`)) : set(ref(db, `repas/${d.m}/gateaux/${S.moiId}`), true)), deja ? null : 'Merci pour le gâteau !');
  },
  'ouvrir-sondage': (d) => {
    const m = matchParId(d.m);
    essai(async () => {
      await update(ref(db, `matchs/${m.i}`), { sondageOuvert: true });
      await envoyerNotif(`Sondage : ${dateLongue(m.date)}`, `${m.recoit} – ${m.visiteur} (${m.dom ? 'domicile' : 'extérieur'}). Tu es dispo ? Tu restes manger ?`);
    }, 'Sondage lancé, notification en route');
  },
  relancer: (d) => {
    const m = matchParId(d.m);
    const rep = reponses(m.i);
    const cible = {};
    joueursTries().forEach((j) => { if (!rep[j.id] || rep[j.id].dispo === undefined) cible[j.id] = true; });
    if (!Object.keys(cible).length) return toast('Tout le monde a répondu 👍');
    essai(() => envoyerNotif(`Rappel : ${dateLongue(m.date)}`, `Tu n'as pas encore répondu pour ${m.recoit} – ${m.visiteur}.`, cible), `Relance envoyée à ${Object.keys(cible).length} joueur(s)`);
  },
  phase: (d) => { S.ui.phase = d.v; rendre(); },
  journee: (d) => { S.ui.journee += Number(d.v); rendre(); },
  recu: (d) => { const deja = aRecu(d.c, d.j); essai(() => (deja ? remove(ref(db, `cagnotte/recus/${d.c}/${d.j}`)) : set(ref(db, `cagnotte/recus/${d.c}/${d.j}`), true))); },
  cloturer: (d) => { if (confirm('Clôturer cette cagnotte ?')) essai(() => update(ref(db, `cagnotte/collectes/${d.c}`), { active: false })); },
  'voir-collecte': (d) => { S.ui.voirCollecte = S.ui.voirCollecte === d.c ? null : d.c; rendre(); },
  'edit-salle': (d) => { S.ui.editSalle = d.k || null; rendre(); },
  'ajouter-joueur': () => { S.ui.ajoutJoueur = true; S.ui.editJoueur = null; rendre(); },
  'editer-joueur': (d) => { S.ui.editJoueur = d.j; S.ui.ajoutJoueur = false; rendre(); },
  'annuler-joueur': () => { S.ui.editJoueur = null; S.ui.ajoutJoueur = false; rendre(); },
  'supprimer-joueur': (d) => {
    if (d.j === S.moiId) return toast('Tu ne peux pas te supprimer toi-même.');
    if (!confirm(`Supprimer ${nomDe(d.j)} ?`)) return;
    essai(async () => {
      await update(ref(db), { [`joueurs/${d.j}`]: null, [`secret/codes/${d.j}`]: null, [`tokens/${d.j}`]: null });
      S.ui.editJoueur = null;
    }, 'Joueur supprimé');
  },
  'annuler-import': () => { S.ui.import = null; rendre(); },
  deconnexion: () => {
    if (!confirm('Déconnecter ce téléphone ?')) return;
    essai(async () => { await remove(ref(db, `tokens/${S.moiId}/${S.uid}`)).catch(() => {}); await remove(ref(db, `liens/${S.uid}`)); location.hash = ''; location.reload(); });
  },
};
appEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || !appEl.contains(b)) return;
  e.preventDefault();
  const f = actions[b.dataset.action];
  if (f) f(b.dataset, b);
});
appEl.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.actionChange === 'pdf' && el.files && el.files[0]) {
    const f = el.files[0];
    S.ui.import = { lecture: true }; rendre();
    try {
      const js = await lirePlanningPdf(f);
      if (!js.length) throw new Error('vide');
      const a1 = js[0].date.slice(0, 4), a2 = js[js.length - 1].date.slice(0, 4);
      S.ui.import = { journees: js, nomPropose: a1 === a2 ? a1 : `${a1}/${a2}` };
    } catch (err) {
      console.error(err);
      S.ui.import = { erreur: "Je n'ai pas réussi à lire ce PDF. Vérifie que c'est bien le planning (même présentation que d'habitude)." };
    }
    rendre();
  }
});

// ---------------------------------------------------------------------
//  Formulaires
// ---------------------------------------------------------------------
const formulaires = {
  async installation(f) {
    const v = Object.fromEntries(new FormData(f));
    const saison = await (await fetch(SAISON_INITIALE)).json();
    const jid = push(ref(db, 'joueurs')).key;
    const maj = {
      'etat/initialise': true,
      'secret/codeEquipe': v.equipe.trim(),
      [`secret/codes/${jid}`]: v.code.trim(),
      [`joueurs/${jid}`]: { nom: v.nom.trim(), roles: { admin: true } },
      [`liens/${S.uid}`]: { joueur: jid, code: v.code.trim(), equipe: v.equipe.trim() },
      'saison': { meta: saison.meta, journees: saison.journees },
      'equipes': saison.equipes,
    };
    await update(ref(db), maj);
    S.ui.erreur = '';
    await demarrer();
  },
  async 'code-equipe'(f) {
    const code = new FormData(f).get('equipe').trim();
    try {
      await set(ref(db, `tentatives/${S.uid}`), { equipe: code });
      S.joueursConnexion = (await get(ref(db, 'joueurs'))).val() || {};
      S.ui.erreur = ''; S.codeEquipe = code; S.etape = 'choix-joueur';
    } catch (e) { S.ui.erreur = 'Code équipe incorrect.'; }
    rendre();
  },
  async 'choix-joueur'(f) {
    const v = Object.fromEntries(new FormData(f));
    try {
      await set(ref(db, `liens/${S.uid}`), { joueur: v.joueur, code: v.code.trim(), equipe: S.codeEquipe });
      S.ui.erreur = '';
      await demarrer();
    } catch (e) { S.ui.erreur = 'Code joueur incorrect.'; rendre(); }
  },
  async match(f) {
    const v = Object.fromEntries(new FormData(f));
    const maj = { heure: v.heure || null, lieu: (v.lieu || '').trim() || null };
    if (v.adversaires !== undefined) maj.adversairesRepas = v.adversaires === '' ? null : Number(v.adversaires) || 0;
    await essai(() => update(ref(db, `matchs/${f.dataset.m}`), maj), 'Enregistré');
  },
  async score(f) {
    const v = Object.fromEntries(new FormData(f));
    if (v.nous === '' || v.eux === '') return toast('Indique les deux scores.');
    await essai(() => set(ref(db, `matchs/${f.dataset.m}/score`), { nous: Number(v.nous), eux: Number(v.eux) }), 'Score enregistré');
  },
  async collecte(f) {
    const v = Object.fromEntries(new FormData(f));
    const montant = String(v.montant).replace(',', '.').trim();
    await essai(async () => {
      const anciennes = D('cagnotte').collectes || {};
      const maj = {};
      Object.keys(anciennes).forEach((id) => { if (anciennes[id].active) maj[`collectes/${id}/active`] = false; });
      const id = push(ref(db, 'cagnotte/collectes')).key;
      maj[`collectes/${id}`] = { libelle: v.libelle.trim(), montant, active: true, cree: Date.now(), par: S.moiId };
      await update(ref(db, 'cagnotte'), maj);
      await envoyerNotif(`Cagnotte apéro : ${montant} €`, `${v.libelle.trim()} : merci de donner ${montant} € à Aline.`);
    }, 'Demande envoyée');
  },
  async salle(f) {
    const salle = new FormData(f).get('salle').trim();
    await essai(async () => { await update(ref(db, `equipes/${f.dataset.k}`), { nom: f.dataset.nom, salle, aVerifier: false }); S.ui.editSalle = null; }, 'Adresse enregistrée');
  },
  async joueur(f) {
    const v = Object.fromEntries(new FormData(f));
    const jid = f.dataset.j || push(ref(db, 'joueurs')).key;
    const roles = {};
    ROLES.forEach(([r]) => { if (v[`role-${r}`]) roles[r] = true; });
    if (jid === S.moiId && !roles.admin) return toast('Garde ton rôle Admin, sinon tu perdrais l\'accès.');
    await essai(async () => {
      await update(ref(db), { [`joueurs/${jid}/nom`]: v.nom.trim(), [`joueurs/${jid}/roles`]: Object.keys(roles).length ? roles : null, [`secret/codes/${jid}`]: v.code.trim() });
      S.ui.editJoueur = null; S.ui.ajoutJoueur = false;
    }, 'Joueur enregistré');
  },
  async reglages(f) {
    const v = Object.fromEntries(new FormData(f));
    await essai(() => update(ref(db), { 'secret/codeEquipe': v.equipe.trim(), 'saison/meta/rdvDefaut': v.rdv || '20:15' }), 'Réglages enregistrés');
  },
  async import(f) {
    const v = Object.fromEntries(new FormData(f));
    if (!confirm(`Remplacer la saison ${meta().nom} par ${v.nom} ? Les réponses, repas, scores et cagnottes de la saison actuelle seront archivés.`)) return;
    const js = S.ui.import.journees;
    await essai(async () => {
      const archive = { saison: D('saison'), matchs: D('matchs'), reponses: D('reponses'), repas: D('repas'), cagnotte: D('cagnotte') };
      const maj = {
        [`archives/${slug(meta().nom || 'ancienne')}-${Date.now()}`]: archive,
        'saison': { meta: { ...meta(), nom: v.nom.trim(), equipe: v.equipe }, journees: js },
        'matchs': null, 'reponses': null, 'repas': null, 'cagnotte': null, 'rappels': null,
      };
      const eqs = D('equipes');
      new Set(js.flatMap((j) => j.rencontres.flatMap((r) => [r.dom, r.ext]))).forEach((n) => { if (!eqs[slug(n)]) maj[`equipes/${slug(n)}`] = { nom: n, salle: '', aVerifier: true }; });
      await update(ref(db), maj);
      S.ui.import = null;
    }, 'Nouvelle saison chargée');
  },
};
appEl.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const bouton = f.querySelector('[type=submit]');
  if (bouton) bouton.disabled = true;
  document.activeElement && document.activeElement.blur();
  try { await formulaires[f.dataset.form](f); }
  catch (err) { console.error(err); S.ui.erreur = "Ça n'a pas marché. Vérifie ta connexion et réessaie."; toast(S.ui.erreur); }
  finally { if (bouton && document.body.contains(bouton)) bouton.disabled = false; }
  rendre();
});
