# Skru Op Club

Et fællesskab, hvor vi får hinandens projekter i mål. Vi kommer og skruer op!

En lille web-app til Netlify: medlemmer laver en profil, opretter opgaver (dato, sted, opgave, medbring, værtens plan) og melder sig på hinandens opgaver. "Den der giver, får": hver profil viser, hvor mange gange man har givet og fået hjælp.

## Sådan er den bygget

| Del | Hvad |
|---|---|
| `public/index.html` | Hele appen (HTML, CSS, JS i én fil). Mobil først. |
| `netlify/functions/api.mjs` | API bag `/api/*`. Tjekker login og regler. |
| Netlify Identity | Login med e-mail og adgangskode. Inviter-kun anbefales. |
| Netlify Blobs | Data: `members/<id>`, `tasks/<id>`, `signups/<opgave>__<id>` |

Regler i API'et: man skal være logget ind, have en profil for at oprette eller melde sig, værten kan ikke melde sig på egen opgave, et fuldt hold lukker for flere, og kun værten (eller en admin) kan markere som skruet op eller slette.

## Opsætning (10 minutter)

1. **Deploy**: læg mappen i et GitHub-repo og vælg *Add new project → Import an existing project* på app.netlify.com. Eller kør `npx netlify deploy --prod` fra mappen. (Træk-og-slip-deploy virker ikke, fordi API-funktionen skal bygges.)
2. **Slå login til**: *Project configuration → Identity → Enable Identity*.
3. **Kun inviterede**: under *Identity → Registration* vælg **Invite only**. Så inviterer Anna Mai de første 6–8 medlemmer på e-mail under *Identity → Invite users*. (Vil I have åben tilmelding, så vælg *Open*.)
4. **Gør Anna Mai til admin**: under *Project configuration → Environment variables* tilføj `ADMIN_EMAILS` med hendes mail (flere adskilles med komma), og deploy igen. Admin kan slette og afslutte alle opgaver og ser fanen *Alle indkomne* med den nyeste opgave først. (Alternativ: giv hende rollen `admin` under *Identity*.)
5. **Bekræftelsesmails på dansk** (valgfrit): *Identity → Emails* lader jer skrive invitations- og bekræftelsesmails selv.
6. **Eget domæne** (valgfrit): *Domain management → Add a domain*, fx skruop.club.

Netlify Blobs kræver ingen opsætning: lageret oprettes første gang, nogen gemmer noget.

## Udvikling lokalt

```
npm install
npx netlify dev
```

Login virker lokalt først, når projektet er linket til et Netlify-site med Identity slået til (`npx netlify link`).

## Næste skridt, man kunne bygge

- Mail til værten, når nogen melder sig (Netlify Functions + fx Resend)
- Påmindelse dagen før
- Kalender-fil (.ics) til "Jeg kommer"
- Billeder fra dagen på afsluttede opgaver
