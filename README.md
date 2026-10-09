# villadsclaes.dk – landingsside

En animeret forside i roden af **villadsclaes.dk**, der viser alle de sites og projekter jeg hoster. Siden bygger sig selv ud fra GitHub og opdaterer sig automatisk.

## Sådan virker det

`npm run build` (`scripts/build.mjs`) laver mappen `dist/`:

1. Kopierer de statiske filer fra `site/` (HTML, CSS, JS, 404-side og favicon).
2. Henter alle offentlige repos fra GitHub og lægger `sites.config.json` ovenpå.
3. Tjekker om hvert site svarer (online, fejler, parkeret hos Simply eller slet ikke sat op).
4. Tager et skærmbillede af hvert site der er online (Playwright/Chromium).
5. Skriver alt til `dist/data/sites.json`, som forsiden læser ved indlæsning.

GitHub Actions (`.github/workflows/udgiv.yml`) kører buildet ved hvert push, **hver 6. time**, manuelt fra fanen *Actions* og når et andet repo sender et `repository_dispatch`. Resultatet uploades via FTPS til `public_html/` på Simply.com, som er webroden for villadsclaes.dk. Der slettes aldrig filer på serveren, som buildet ikke selv har lagt der, så undermapper som `quiz/` er i sikkerhed.

## Et nyt site dukker op af sig selv, når …

- repoet er offentligt, og der står en adresse i feltet **Website** på repoets GitHub-side (tandhjulet ved *About*), **eller**
- sitet ligger på `<reponavn>.villadsclaes.dk` og svarer med sit eget indhold.

Alt andet (titel, kort beskrivelse, farve, fremhævning, skjul) styres i `sites.config.json`. Sites uden et offentligt repo, fx TechTree, står under `extra`.

| Felt | Betydning |
| --- | --- |
| `title` | Navnet på kortet |
| `url` | Adressen på sitet |
| `tagline` | Kort beskrivelse (ellers bruges repoets beskrivelse) |
| `accent` | Kortets farve, fx `#ff5c8a` |
| `featured` | Vises først og stort |
| `hidden` | Skjul repoet helt |

## Opsætning af udgivelsen

Workflowet bygger altid, men uploader først når disse **repository secrets** findes (Settings → Secrets and variables → Actions). Det er de samme oplysninger som i `hjemmeside`-repoet:

| Secret | Værdi |
| --- | --- |
| `FTP_SERVER` | `ftp.villadsclaes.dk` (eller `linux123.unoeuro-server.com`) |
| `FTP_BRUGER` | `villadsclaes.dk` |
| `FTP_ADGANGSKODE` | FTP-adgangskoden fra Simply.com |

Mappen kan ændres med repository-variablen `FTP_MAPPE` (standard `public_html/`, med afsluttende `/`).

## Besøgende, sprog og privatliv

- **Ingen cookies og ingen sporing.** Skrifttyperne ligger i `site/fonts/`, så der hentes intet fra Google. Se `site/privatliv.html`.
- **Velkomst på eget sprog** (`site/welcome.js`): vises for europæiske browsersprog (ikke dansk). Knappen oversætter med Chromes indbyggede oversætter, hvis sprogmodellen er hentet, og ellers åbnes Google Oversæt. Navne, adresser og sprognavne er markeret med `translate="no"`, så browserens oversætter lader dem være.
- **Delingsbillede** (`og.jpg`, 1200×630) tegnes af `scripts/build.mjs` ud fra de friske skærmbilleder.
- **Bots og svindlere** (`site/web.config`): sikkerhedsheadere mod indlejring i fremmede sider, og forespørgsler efter WordPress, `.env`, `.git` osv. samt kendte angrebsværktøjer afvises med 404.

## Kør lokalt

```bash
npm install
npx playwright install chromium   # kun hvis du vil have skærmbilleder
npm run build                      # eller npm run build:fast uden skærmbilleder
npm run serve                      # http://localhost:8080
```

Sæt `GH_TOKEN` (fx `GH_TOKEN=$(gh auth token)`) for at undgå GitHubs grænse for anonyme kald.
