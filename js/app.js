import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  updateProfile, setPersistence, inMemoryPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDNu_0DcZJ1xI4AxY53RlNjFX0ZBt9EKt4",
  authDomain: "gachi2-7e506.firebaseapp.com",
  projectId: "gachi2-7e506",
  storageBucket: "gachi2-7e506.firebasestorage.app",
  messagingSenderId: "94579004295",
  appId: "1:94579004295:web:311233c07ffab8c9497922"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence)
  .catch(() => setPersistence(auth, inMemoryPersistence).catch(() => {}));

export const state = { user: null, profile: null, ready: false };
const listeners = [];
export function onUser(cb) {
  listeners.push(cb);
  if (state.ready) queueMicrotask(() => cb(state.user, state.profile));
  return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
}
function emit() { listeners.forEach(cb => cb(state.user, state.profile)); }

onAuthStateChanged(auth, async user => {
  if (!user) { state.user = null; state.profile = null; state.ready = true; return emit(); }
  state.user = user;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) state.profile = snap.data();
    else {
      const p = {
        email: user.email,
        displayName: user.displayName || (user.email || '').split('@')[0],
        role: 'user',
        createdAt: serverTimestamp()
      };
      await setDoc(ref, p);
      state.profile = p;
    }
  } catch (e) { console.warn('users profile:', e.message); state.profile = null; }
  state.ready = true;
  emit();
});

export async function register(email, password, displayName) {
  const c = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(c.user, { displayName });
  await setDoc(doc(db, 'users', c.user.uid), {
    email, displayName, role: 'user', createdAt: serverTimestamp()
  });
  return c.user;
}
export const login = (e, p) => signInWithEmailAndPassword(auth, e, p);
export const logout = () => signOut(auth);
export const resetPassword = e => sendPasswordResetEmail(auth, e);
export const isAdmin = () => state.profile?.role === 'admin';

/* ====== UI helpers ====== */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
  ));
}
export function fmtPrice(n, cur = 'KZT') {
  return Number(n || 0).toLocaleString('ru-RU') + ' ' + cur;
}
export function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('ru-RU');
}
export function toast(msg, type = 'info') {
  let box = document.getElementById('toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.appendChild(box); }
  box.textContent = msg;
  box.className = 'toast toast--' + type + ' show';
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.remove('show'), 3200);
}

/* ====== Cart: users/{uid}/carts/active ====== */
const CART_DOC_ID = 'active';
export function cartRef() {
  if (!state.user) throw new Error('Требуется вход');
  return doc(db, 'users', state.user.uid, 'carts', CART_DOC_ID);
}
export async function getCart() {
  if (!state.user) return [];
  const snap = await getDoc(cartRef());
  return snap.exists() ? (snap.data().items || []) : [];
}
export async function setCart(items) {
  if (!state.user) throw new Error('Требуется вход');
  await setDoc(cartRef(), { items, updatedAt: serverTimestamp() });
}

/* ====== Header ====== */
const NAV = [
  ['index.html',   'Каталог'],
  ['cart.html',    'Корзина',  true],
  ['profile.html', 'Кабинет',  true],
  ['admin.html',   'Админка',  true, 'admin']
];

export function mountHeader(active) {
  const host = document.getElementById('site-header');
  if (!host) return;
  host.innerHTML = `
    <header class="topbar">
      <a class="logo" href="index.html">Gachimuchenik<span>.</span></a>
      <nav class="nav" id="topnav"></nav>
      <div class="nav-right" id="nav-right"></div>
    </header>
  `;
  onUser((user, profile) => {
    const nav = document.getElementById('topnav');
    nav.innerHTML = NAV
      .filter(([, , authOnly, role]) => (!authOnly || user) && (!role || isAdmin()))
      .map(([h, t]) => `<a href="${h}" class="${active === h ? 'active' : ''}">${t}</a>`)
      .join('');

    const right = document.getElementById('nav-right');
    if (user) {
      right.innerHTML = `
        <a href="cart.html" class="cart-badge" id="cartBadge" style="display:none">0</a>
        <span class="who">${esc(profile?.displayName || user.email)}</span>
        <button class="btn-ghost" id="logoutBtn" style="padding:8px 14px">Выйти</button>
      `;
      right.querySelector('#logoutBtn').onclick = async () => {
        await logout(); location.href = 'index.html';
      };
      onSnapshot(cartRef(), snap => {
        const items = snap.exists() ? (snap.data().items || []) : [];
        const total = items.reduce((s, i) => s + i.qty, 0);
        const b = document.getElementById('cartBadge');
        if (!b) return;
        b.textContent = total;
        b.style.display = total ? 'inline-block' : 'none';
      });
    } else {
      right.innerHTML = `<a class="btn-primary" href="login.html">Войти</a>`;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
});