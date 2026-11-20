// Połączenie z Firebase (Realtime Database + logowanie anonimowe).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { initializeAuth, browserSessionPersistence, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase, ref as _ref, set, update, remove, push, get, onValue, onChildAdded, onDisconnect,
  runTransaction, serverTimestamp, query, orderByChild, equalTo,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('WSTAW')) {
  throw new Error('Brak konfiguracji Firebase — uzupełnij js/firebase-config.js');
}
const app = initializeApp(firebaseConfig);
// sessionStorage => każda karta to osobny gracz, a odświeżenie strony zachowuje tożsamość
const auth = initializeAuth(app, { persistence: browserSessionPersistence });
export const db = getDatabase(app);
export const uid = await new Promise((resolve, reject) => {
  const off = onAuthStateChanged(auth, (u) => { if (u) { off(); resolve(u.uid); } });
  signInAnonymously(auth).catch(reject);
});
let offset = 0;
onValue(_ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
export const now = () => Date.now() + offset;
export const ref = (path) => _ref(db, path);
export { set, update, remove, push, get, onValue, onChildAdded, onDisconnect, runTransaction, serverTimestamp, query, orderByChild, equalTo };
