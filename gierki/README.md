# ☢ STREFA ZERO

Wieloosobowa strategia czasu rzeczywistego o globalnej wojnie nuklearnej, w przeglądarce. Mechanika jest inspirowana grami w stylu DEFCON: poziomy gotowości 5→1, ukryte silosy, radary, flota, lotnictwo i liczenie ofiar.
Grają 2–6 graczy, a puste miejsca mogą zająć boty. Gra działa na Firebase Realtime Database.

## Uruchomienie

1. Na https://console.firebase.google.com kliknij *Dodaj projekt*.
2. Włącz logowanie anonimowe: *Authentication → Sign-in method → Anonymous*.
3. Utwórz bazę: *Realtime Database → Utwórz bazę* (np. `europe-west1`). W zakładce *Reguły* wklej `database.rules.json`.
4. Wejdź w *Ustawienia projektu → Twoje aplikacje → `</>`* i skopiuj `firebaseConfig` (razem z `databaseURL`) do `js/firebase-config.js`.
5. Uruchom lokalnie: `npx serve .` albo `python -m http.server 8000`. Moduły ES nie działają z `file://`.
6. Publikacja: `npm i -g firebase-tools && firebase login && firebase use --add && firebase deploy`.

Każda karta przeglądarki to osobny gracz, więc do testów wystarczy kilka kart. Tryb **Gra lokalna z botami** działa bez Firebase.

## Rozgrywka

| Faza | Co się dzieje |
|---|---|
| DEFCON 5–4 | Rozmieszczasz 6 silosów, 4 radary, 3 lotniska, 5 pancerników i 3 okręty podwodne na swoim terytorium. Co zostanie nierozmieszczone, ustawi się samo. |
| DEFCON 3 | Zaczynają się walki flot i lotnictwa. Silosy w trybie obrony zestrzeliwują rakiety i samoloty. |
| DEFCON 2 | Ostatnie przygotowania. |
| DEFCON 1 | Broń jądrowa: silosy (tryb ataku, 10 rakiet), okręty podwodne (wynurzenie, 5 rakiet, zasięg 45°), bombowce. |

- **Punkty:** +2 za mln zabitych wrogów, −1 za mln własnych strat. Populacje terytoriów są wyrównane do 150 „mln”.
- **Koniec gry:** 90 s po zużyciu 80% arsenału albo po 20 min czasu gry.
- **Mgła wojny:** widzisz tylko to, co jest w zasięgu twoich radarów i jednostek. Okręt podwodny wykryją tylko okręty z bliska. Odpalenie rakiety zdradza pozycję silosu.
- **Sterowanie:** klik zaznacza jednostkę, Shift+przeciągnięcie zaznacza kilka, klik na oceanie wysyła okręty, kółko myszy to zoom, przeciąganie przesuwa mapę, H wraca na twoje terytorium, F pokazuje całą mapę, Esc lub prawy przycisk anuluje.

## Lobby

- Lobby jest publiczne. Każde z 6 terytoriów może być: wolne, zajęte przez gracza, botem albo zamknięte.
- Host może dodać bota, zamknąć terytorium, wyrzucić gracza i wypełnić wolne miejsca botami jednym przyciskiem („Uzupełnij botami”). Ustawia też tempo gry: ×1, ×2 lub ×3.
- Do trwającej gry można dołączyć jako **obserwator**. Obserwator widzi całą mapę.
- Jeśli gracz wyjdzie lub zamknie kartę, jego terytorium przejmuje bot. Gdy wróci w tej samej karcie (np. po odświeżeniu), odzyskuje kontrolę.
- Jeśli wyjdzie host albo jego karta zamrze, rolę hosta automatycznie przejmuje inny gracz.

## Jak działa sieć (lockstep)

Przez Firebase nie leci stan gry, tylko rozkazy graczy. Host co 300 ms zapisuje „turę” z listą rozkazów. Każda przeglądarka liczy u siebie tę samą deterministyczną symulację (`js/sim.js`). Dzięki temu transfer jest znikomy, a gra mieści się w darmowym planie Firebase.
Co minutę klienci porównują sumę kontrolną stanu. Przy rozbieżności pojawia się ostrzeżenie.

## Pliki

| Plik | Zawartość |
|---|---|
| `js/sim.js` | silnik gry, walka, boty (deterministyczne) |
| `js/render.js` | mapa, kamera, mgła wojny, mysz i dotyk |
| `js/app.js` | lobby, tury sieciowe, HUD, dźwięk |
| `js/world.js` | wygenerowana mapa (lądy, siatka terytoriów, miasta) |
| `tools/make_world.mjs` | generator `world.js` (dane: Natural Earth, domena publiczna) |

## Ograniczenia

- Reguły bazy są proste: każdy zalogowany może pisać w lobby i turach. To wystarczy do gry ze znajomymi, ale nie chroni przed oszustami.
- Przeglądarka zna pełny stan gry, więc ktoś z konsolą deweloperską mógłby podejrzeć ukryte jednostki.
