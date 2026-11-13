// Reçoit les notifications quand l'appli est fermée.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDrRAFA_V6Jnj6P9oNR3ruJm4eyP2Ql0Nw",
  authDomain: "les-loisirs-abers.firebaseapp.com",
  databaseURL: "https://les-loisirs-abers-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "les-loisirs-abers",
  storageBucket: "les-loisirs-abers.firebasestorage.app",
  messagingSenderId: "321905687727",
  appId: "1:321905687727:web:51b43e10212605e05e285a"
});

firebase.messaging();

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const fenetres = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of fenetres) { if ('focus' in f) return f.focus(); }
    return clients.openWindow(self.registration.scope);
  })());
});
