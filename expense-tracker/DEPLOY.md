# Step 4 — getting it onto your phone

## Why you cannot just use your PC's IP address

Serving from your PC over wifi (`http://192.168.1.x:8000`) will
**show** the app on your phone, but:

- it will not install to the home screen
- it will not work offline
- voice may be blocked

Browsers only allow service workers and microphone access on a
**secure origin**: `https://` or `localhost`. Your PC's local IP
is neither.

So the app needs a real HTTPS address. Both options below are
free and neither needs a credit card.

---

## Before you deploy: export your data

A new address means a new `localStorage`. Your existing
expenses will not follow automatically.

1. Open the app at `http://localhost:8000`
2. Scroll to **Backup** → **Export**
3. A `.json` file lands in Downloads — keep it

After deploying, open the new URL and use **Import** on that
file. Importing merges, so nothing is overwritten, and doing it
twice is harmless.

---

## Option A — Netlify Drop (2 minutes, no account)

The fastest way to get an HTTPS URL.

1. Go to **https://app.netlify.com/drop**
2. Drag the whole `expense-pwa` folder onto the page
3. Wait about 20 seconds

You get a URL like `https://gentle-panda-1a2b3c.netlify.app`

4. Open that URL **on your phone**
5. Chrome: menu → **Add to Home screen**
   Safari: share button → **Add to Home Screen**

Done. It now behaves like an installed app: own icon, no
address bar, works with no signal.

**Note:** without a free account the site is temporary. Sign up
(free) and claim it to keep the address permanently. Otherwise
you would have to re-import your data at a new URL later.

**To update it:** drag the folder again. Remember to bump
`CACHE_NAME` in `sw.js` first, or phones will keep serving the
old version.

---

## Option B — GitHub Pages (permanent, versioned)

More steps, but you get a fixed address and a history of every
change.

**You need:** a free GitHub account, and Git installed
(https://git-scm.com).

```powershell
cd "D:\Anas AI Builds\expense-pwa"

git init
git add .
git commit -m "Expense tracker PWA"
git branch -M main
git remote add origin https://github.com/YOURNAME/expenses.git
git push -u origin main
```

Then on github.com:

1. Your repository → **Settings** → **Pages**
2. **Source**: `Deploy from a branch`
3. **Branch**: `main`, folder `/ (root)` → **Save**
4. Wait a minute

Your app is at `https://YOURNAME.github.io/expenses/`

**To update it:**

```powershell
git add .
git commit -m "what changed"
git push
```

Live in under a minute.

---

## Which to choose

**Netlify Drop** to try it on your phone today.

**GitHub Pages** once you are keeping it — a permanent address,
and every change is recorded so you can go back if you break
something.

You can do both. Deploy to Netlify now, move to Pages later;
just export and re-import your data when the address changes.

---

## Testing on the phone

Once installed, check:

- [ ] Opens from the home screen icon, no browser bars
- [ ] Amount field opens the **number pad**, not the letter keyboard
- [ ] Category chips scroll sideways with a thumb
- [ ] Save works and TODAY updates
- [ ] **Aeroplane mode** → the app still opens and saves
- [ ] Voice — needs a connection, unlike the rest
- [ ] Import your backup file

---

## When you change the code

Every time you edit `app.js`, `app.css` or `index.html`:

1. Bump `CACHE_NAME` in `sw.js` — `expenses-v3` → `expenses-v4`
2. Re-deploy

Skip step 1 and phones will keep serving the cached old copy,
and you will think the change did not work.

---

## Where your data lives

On the device, in browser storage. Not on Netlify, not on
GitHub, not with me. Deploying uploads the **app**, never your
expenses.

Which also means: **there is no backup but the one you export.**
Clearing browser data, or losing the phone, loses the lot. Hit
Export occasionally.
