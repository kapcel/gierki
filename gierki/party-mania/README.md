# 🎉 Party Mania

Imprezowa gra w stylu Mario Party w przeglądarce: publiczne lobby, do 8 graczy, 30 minigier, Firebase Realtime Database.

## Uruchomienie (ok. 10 min)

1. **Projekt Firebase** — https://console.firebase.google.com → *Dodaj projekt*.
2. **Logowanie anonimowe** — *Authentication → Sign-in method → Anonymous → Włącz*.
3. **Baza** — *Realtime Database → Utwórz bazę* (lokalizacja np. `europe-west1`) → zakładka *Reguły* → wklej zawartość `database.rules.json` → *Opublikuj*.
4. **Konfiguracja** — *Ustawienia projektu → Twoje aplikacje → `</>` (aplikacja internetowa)* → skopiuj obiekt `firebaseConfig` do `js/firebase-config.js`. Musi zawierać `databaseURL`.
5. **Start lokalnie** (moduły ES nie działają z `file://`):
   ```
   npx serve .          # albo: python -m http.server 8000
   ```
6. **Publikacja w sieci** (Firebase Hosting):
   ```
   npm i -g firebase-tools
   firebase login
   firebase use --add          # wybierz swój projekt
   firebase deploy
   ```

Każda karta przeglądarki to osobny gracz — możesz testować sam, otwierając kilka kart.

## Jak to działa

- **Lobby**: nazwa, maks. graczy (2–8), liczba rund (3–30). Widoczne na liście publicznej, dopóki gra nie wystartuje.
- **Runda = 1 minigra**: 8 s zasad → 10–45 s gry → 9 s wyników. Jedna runda trwa ok. 30–60 s, nigdy dłużej niż 5 min.
- **Dobór minigier**: host losuje grę spośród pasujących do aktualnej liczby graczy (np. „Najwyższa unikalna” od 3 osób, „Przeciąganie liny” od 4, drużyny losowane automatycznie) i nie powtarza gier, dopóki pula się nie wyczerpie.
- **Punkty za miejsce**: 10 / 7 / 5 / 4 / 3 / 2 / 1 / 1 (remis = to samo miejsce).
- **Host 👑** steruje fazami gry. Gdy wyjdzie, rolę przejmuje następny gracz.
- **Trening**: każdą minigrę można przetestować solo, także bez Firebase.

## Struktura

| Plik | Zawartość |
|---|---|
| `js/app.js` | lobby, rundy, punktacja, logika hosta |
| `js/games.js` | 30 minigier (każda to obiekt z `play(ctx)`) |
| `js/runner.js` | uruchamianie minigry + pomocniki (timery, canvas, klawisze, wspólny stan) |
| `js/net.js` | połączenie z Firebase |
| `style.css` | wygląd |

### Dodanie własnej minigry
W `js/games.js` dopisz `def({ id, name, icon, desc, time, min, max, play(c) { … } })`.
W `play` budujesz UI w `c.el`, losujesz przez `c.rng()` (ten sam seed u wszystkich) i zgłaszasz wynik `c.score(liczba, 'opis')` — większa liczba = lepiej. `c.done()` kończy grę wcześniej.

## Ograniczenia
- Reguły bazy są proste (każdy zalogowany może pisać w lobby) — wystarczą do gry ze znajomymi, ale nie chronią przed oszukiwaniem.
- Wyniki liczone są po stronie graczy, więc ktoś z konsolą przeglądarki może je podrobić.
