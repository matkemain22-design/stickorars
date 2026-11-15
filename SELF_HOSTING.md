# Stickora.rs — samostalno hostovanje

## Šta je pripremljeno

- `backend/`: samostalan Node 22 servis. Porudžbine su u SQLite bazi, dizajni u privatnom direktorijumu na trajnom disku. Nisu potrebni Lovable Cloud, Lovable nalog niti Lovable API ključ.
- Google Drive se poziva direktno uz vaš Google OAuth nalog. Svaka porudžbina ima folder nazvan istim brojem koji kupac vidi, sa dizajnom i `podaci-porudzbine.txt` (uključuje kontakt mejl).
- Red za Drive je trajan. Ako Google nije dostupan, porudžbina i fajl ostaju sačuvani, a servis kasnije pokušava ponovo. Sačuvani ID-jevi i oznake fajlova sprečavaju dupliranje pri ponovljenim pokušajima.
- `deploy/`: Docker Compose pokreće sajt, servis i Caddy za HTTPS. Logo je sačuvan lokalno i nije vezan za Lovable putanju.
- Postojeći Lovable sajt nastavlja da koristi sadašnji sistem dok se spoljašnji servis ne podesi. Nema automatskog prebacivanja ili prenosa starih podataka.

## 1. Hosting

Potreban je Linux VPS sa Docker Engine + Docker Compose v2, trajnim diskom, javnom adresom i otvorenim portovima 80/443. Jedna instanca servisa koristi jedan disk — ne povećavati broj replika i ne koristiti mrežni disk za SQLite. GitHub čuva kod; GitHub Pages ne može pokretati ovaj sistem.

Sačuvajte izvorni kod na svom serveru. Ne prenosite `.git`, `node_modules`, `.env`, `.lovable`, `.workspace`, stare izlazne foldere ili tajne. Pri postavljanju iz repozitorijuma dodajte `.env`, `**/.env`, `backend/data/` i `*.sqlite*` u svoj lokalni `.gitignore` pre unosa tajni. Samo `.env.example` sme u repozitorijum.

```sh
cp deploy/.env.example deploy/.env
openssl rand -hex 32
openssl rand -hex 32
```

U `deploy/.env` postavite dve različite dobijene tajne kao `ORDERS_API_TOKEN` i `ADMIN_API_TOKEN`. Ne koristite ih u kodu niti browser promenljivama. Postavite `PUBLIC_DOMAIN` na svoj kupljeni domen. DNS A/AAAA treba da pokazuje na server (AAAA samo ako IPv6 stvarno radi). Caddy pribavlja HTTPS sertifikat.

## 2. Novi Google Drive pristup

Postojeći Lovable connector ključ **nije Google OAuth ključ** i ne može se preneti. Potrebna je nova dozvola direktno od vlasnika Drive naloga:

1. U Google Cloud Console napravite projekat, uključite Google Drive API i podesite OAuth consent screen.
2. Napravite OAuth client tipa Web application. Za jednokratno dobijanje tokena može se koristiti Google OAuth 2.0 Playground uz redirect URI `https://developers.google.com/oauthplayground`.
3. U Playground podešavanjima uključite **Use your own OAuth credentials** i unesite svoj client ID/secret. Izaberite scope `https://www.googleapis.com/auth/drive`, autorizujte baš vlasnikov nalog uz offline pristup i razmenite kod za refresh token. Ovaj širi scope je potreban za pristup već postojećem folderu; tajne držite samo na svom serveru.
4. U Google Drive-u vlasnik pravi folder `Stickora porudžbine`. Iz URL-a foldera kopirajte njegov ID.
5. U `deploy/.env` postavite `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID`.

Google aplikacije sa External consent screen u Testing režimu mogu dobijati refresh tokene koji ističu posle 7 dana. Pre stalnog rada prebacite consent screen u odgovarajući produkcijski režim; Google može tražiti verifikaciju osetljivih/restricted scope-ova. Ne koristite tuđi Google nalog bez odobrenja. Servis sam osvežava access token. Ukoliko pristup bude opozvan, nove porudžbine ostaju na disku dok se token ne zameni.

Ako su sva četiri Google polja prazna, servis prima porudžbine, ali Drive ostaje `pending`. Delimično popunjena podešavanja zaustavljaju servis da bi pogrešna konfiguracija bila vidljiva.

## 3. Pokretanje

Iz korena projekta:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yaml logs --tail=50
```

Sajt je na vašem domenu. Servis nije javno izložen: administracija sluša na `127.0.0.1:4000` servera. Ne otvarajte port 4000 na firewall-u.

Samostalan servis bez Docker-a:

```sh
cd backend
npm install
# Set variables from .env.example in your host's environment, or:
node --env-file=.env src/main.mjs
```

Za sajt bez Docker-a: `bun install --frozen-lockfile`, `bun run build:selfhost`, pa sa server promenljivama `ORDERS_BACKEND_MODE=independent`, `ORDERS_BACKEND_URL=https://adresa-vaseg-servisa`, `ORDERS_API_TOKEN=...` pokrenite `bun run start:selfhost`. Između dva servisa na istom hostu može `http://127.0.0.1:4000`; ostale spoljašnje adrese zahtevaju HTTPS. Token nije `VITE_` promenljiva. Ne koristi se Lovable auth u ovom režimu.

Ne zamenjujte podrazumevani `vite.config.ts` — namenjen je postojećem Lovable preview-u. Samostalna konfiguracija je `vite.selfhost.config.ts`.

## 4. Provera i administracija

Na serveru:

```sh
curl http://127.0.0.1:4000/health
# ADMIN_API_TOKEN is already set in your shell; do not paste it into saved scripts.
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://127.0.0.1:4000/v1/admin/orders
```

Admin API (uvek sa admin tokenom):
- `GET /v1/admin/orders?limit=50&offset=0`: lista porudžbina, Drive stanje i greška ako postoji.
- `GET /v1/admin/orders/{uuid}`: kompletna porudžbina.
- `GET /v1/admin/orders/{uuid}/design`: privatno preuzimanje dizajna kao attachment.
- `POST /v1/admin/orders/{uuid}/retry-drive`: odmah vrati porudžbinu u Drive red, bez pravljenja novog broja.

Nije dodata nova administratorska stranica: drug i dalje radi kroz Google Drive. Za lokalnu administraciju može SSH tunnel `ssh -L 4000:127.0.0.1:4000 korisnik@server`.

Pre promene DNS-a proverite oba tipa porudžbina kroz sajt: dizajn fajl i zahtev za izradu. Uporedite broj potvrde sa folderom u Drive-u i proverite mejl, dimenzije, količinu i fajl. Zatim restartujte servis i potvrdite da stare porudžbine ostaju dostupne. Nemojte brisati Docker volume.

## 5. Prenos postojećih porudžbina i dizajna

Stari podaci nisu automatski kopirani. Pre konačnog prelaska privremeno zaustavite nova poručivanja, iz Lovable Cloud izvezite `sticker_orders` kao JSON niz i privatne fajlove iz `designs`, čuvajući njihove originalne putanje (`uuid/ime-fajla`). Ako dobijete CSV, pretvorite ga u JSON niz uz brojčana polja širine/visine/količine. Mejlovi i fajlovi su privatni — izvoz ne ide u GitHub.

Na novom serveru zaustavite **orders** servis (sajt ne sme primati porudžbine tokom prenosa). Sa Node 22 i instaliranim `backend/` zavisnostima, postavite `DATA_DIR` na direktorijum koji zaista odgovara `orders-data` Docker volumenu, pa:

```sh
cd backend
DATA_DIR=/putanja/do/trajnog-volumena npm run import -- /privatno/orders.json /privatno/designs
```

Alternativa je izvršiti import u privremenom Node kontejneru sa tim istim volumenom i privatnim izvozom montiranim read-only. Nikada ne uvozite u drugi direktorijum i ne očekujte da ga produkcijski kontejner vidi. Proverite vlasništvo fajlova: kontejner radi kao `node` korisnik (UID 1000).

Import čuva pune ID-jeve, brojeve i datume; preskače već uvezene ID-jeve. Ako fajl nedostaje ili postoji nepodržan stari materijal, zaustavlja se sa greškom umesto tihog gubitka. Već uvezeni redovi ostaju sačuvani; nakon ispravke izvoz možete ponoviti. Stari Drive folderi nemaju nove oznake, zato import može napraviti novi folder istog broja — koristite **novi korenski Drive folder za migraciju** da ne pomešate stare i nove kopije.

## 6. Backup i ažuriranje

Napravite dnevni backup celog `orders-data` volumena (baza + dizajni zajedno), šifrovan i van servera. Najjednostavniji konzistentan backup: privremeno zaustaviti servis, kopirati ceo volumen, ponovo ga pokrenuti. SQLite koristi WAL, zato ne kopirajte samo `orders.sqlite` dok servis radi. Testirajte vraćanje rezervne kopije. Drive nije zamena za backup baze.

Nikad `docker compose down -v` na produkciji: briše trajne podatke. Ažuriranja: isti Compose fajl i iste vrednosti tajni, `up -d --build` bez brisanja volumena. Ovo je jednoprocesni servis; za visoku dostupnost/multiple replike potreban je drugi način čuvanja baze/fajlova.

## Status i ograničenja

Testovi pokrivaju čuvanje porudžbine/fajla, kontrolu pristupa, čitanje nakon restarta, obavezni mejl, samo papir, limit 20MB i Drive ponovne pokušaje. Drive ponašanje u testu koristi simulirane Google odgovore — novi stvarni Google nalog još nije autorizovan. Docker produkcijsko postavljanje i slanje na novi Drive treba proveriti na izabranom hostingu nakon unosa novih tajni. Mejl obaveštenja nisu uključena; kontakt mejl kupca ostaje sačuvan.