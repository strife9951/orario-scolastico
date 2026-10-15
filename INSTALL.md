# Il mio orario — deploy con GitHub + Vercel

App statica per studenti: orario, griglia settimanale, libri, export PDF.  
Funziona nel browser (dati salvati in localStorage). Nessun backend necessario.

## Contenuto dello zip

- `index.html` — l’app
- `vercel.json` — configurazione Vercel (sito statico)
- `INSTALL.md` — questa guida

`index.html` deve restare nella **radice** del repository.

---

## 1. Prova in locale

1. Estrai lo zip.
2. Apri `index.html` con Chrome o Firefox.
3. L’app funziona subito, senza account.

---

## 2. Account da creare

| Servizio | Link |
|----------|------|
| GitHub   | https://github.com/signup |
| Vercel   | https://vercel.com/signup (accedi con GitHub) |

Sul computer installa **Git**: https://git-scm.com/downloads  
(Opzionale) GitHub CLI: https://cli.github.com poi `gh auth login`

---

## 3. Carica il codice su GitHub

Nel terminale, nella cartella dell’app:

```bash
cd orario-scolastico
git init
git branch -M main
git add index.html vercel.json INSTALL.md
git commit -m "App orario scolastico"
```

### Con GitHub CLI (più semplice)

```bash
gh repo create orario-scolastico --public --source=. --remote=origin --push
```

### Senza CLI

1. Su GitHub: **New repository** → nome `orario-scolastico` → **Public** → crea **senza** README.
2. Poi:

```bash
git remote add origin https://github.com/TUO_USER/orario-scolastico.git
git push -u origin main
```

Se Git chiede la password, usa un **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens).

---

## 4. Pubblica su Vercel

1. Vai su https://vercel.com e accedi con **Continue with GitHub**.
2. Autorizza l’accesso ai repository.
3. **Add New… → Project**.
4. Seleziona il repository `orario-scolastico`.
5. Impostazioni:
   - Framework Preset: **Other**
   - Root Directory: `.`
   - Build Command: vuoto
   - Output Directory: vuoto
6. Clicca **Deploy**.

Ottieni un URL tipo: `https://orario-scolastico.vercel.app`

### Aggiornamenti successivi

```bash
git add -A
git commit -m "Aggiornamento"
git push
```

Vercel ridistribuisce automaticamente a ogni push su `main`.

---

## 5. Dominio personalizzato (facoltativo)

Nel progetto Vercel → **Settings → Domains** → aggiungi il tuo dominio e segui le istruzioni DNS.

---

## Note

- L’app è statica: orario e libri restano nel browser di chi la usa.
- Non serve Supabase.
- Se compare **404**, verifica che `index.html` sia nella radice del repo (non in una sottocartella).

## Problemi frequenti

| Problema | Soluzione |
|----------|-----------|
| 404 su Vercel | `index.html` deve essere nella radice |
| Repo non visibile | Riautorizza GitHub in Vercel |
| Push rifiutato | Usa un Personal Access Token invece della password |
| Build fallisce | Framework = Other, Build e Output vuoti |
