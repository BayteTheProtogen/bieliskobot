# 📖 Dokumentacja BieliskoBot

Witamy w oficjalnej dokumentacji **BieliskoBot** – wszechstronnej platformy AIO (All-in-One) dla serwerów Roleplay w środowisku Roblox (ER:LC).

---

## 🛠️ Konfiguracja Środowiska (.env)

Aby bot działał poprawnie, wymagane są następujące zmienne w pliku `.env`:

```env
DISCORD_TOKEN=twoj_token_bota
DISCORD_CLIENT_ID=id_aplikacji_bota
DATABASE_URL=postgresql://uzytkownik:haslo@host:port/baza
ERLC_SERVER_KEY=twoj_klucz_api_erlc
```

---

## 🆔 System Tożsamości (Identity)

Centralny punkt bota, pozwalający na rejestrację obywateli i generowanie unikalnych dokumentów.

### Komendy:
*   `/dowod wyrob [nick]` – Rozpoczyna proces wyrabiania dowodu (wymaga podania nicku Roblox).
*   `/dowod zaktualizuj [nick]` – Pozwala zmienić dane w istniejącym dowodzie.
*   `/dowod pokaz` – Wyświetla grafikę dowodu. **Admin:** Może wybrać dowolnego gracza z listy, aby sprawdzić jego dokument.
*   `/dowod uniewaznij` – Użytkownik może zgłosić swój dowód do unieważnienia. **Admin:** Może natychmiastowo unieważnić dowód wybranego gracza za pomocą menu wyboru.

### Funkcje Premium:
*   **Proceduralne ID**: Każdy dowód posiada unikalny numer, wzór giloszowy, hologram orła oraz strefę MRZ.
*   **Status Osadzonego**: Jeśli użytkownik posiada aktywnego bana (temp/perm), na jego dowodzie automatycznie pojawia się czerwony stempel **"OSADZONY"**.
*   **Weryfikacja Roblox**: System blokuje próby przypisania jednego konta Roblox do wielu użytkowników Discord.

---

## 💰 System Ekonomii (Economy)

Zaawansowany system finansowy z podziałem na gotówkę w kieszeni i środki w banku.

### Komendy Użytkownika:
*   `/portfel pokaz` – Sprawdzenie stanu konta (Kieszeń, Bank, Razem).
*   `/portfel wplac [kwota/all]` – Przelanie gotówki do banku.
*   `/portfel wyplac [kwota/all]` – Wypłata z banku do kieszeni.
*   `/przelej [odbiorca_nick] [kwota]` – Przelew gotówki innemu graczowi (wymaga potwierdzenia przyciskiem).

### Zarabianie:
*   `/praca` – Praca stała (podstawa 2 500 zł), dostępna co 24h. Wynagrodzenie skaluje się w zależności od posiadanej rangi (np. Policja: 4 200 zł, Ratownik: 4 000 zł, Pomoc Drogowa: 3 800 zł).
*   `/dorobka` – Szybkie zlecenia (250-500 zł), dostępne co 6h.
*   **Rybołówstwo**: Możliwość zakupu sprzętu w sklepie i składania raportów z połowów (`/ryby`).

### Administracja Portfelem:
*   `/eco-admin [opcja] [nick] [kwota]` – Opcje: `sprawdz`, `dodaj`, `zabierz`, `ustaw`. Dostępne tylko dla rangi Owner.

---

## ⚖️ Prawo i Moderacja (Law Enforcement)

Integracja z serwerem ER:LC oraz system karania.

### Mandaty i Pouczenia:
*   `/mandat` – Funkcjonariusz (rola `1490253667910029412`) wystawia mandat/pouczenie.
*   **Grafika Proceduralna**: Generuje profesjonalny dokument z pieczęcią "URZĄD RP".
*   **Automatyczne ściąganie należności**: Kwota mandatu jest pobierana z portfela/banku. Jeśli brak środków, powstaje zadłużenie (ujemny stan konta).

### Komendy Moderacji (!bb):
Dostępne wyłącznie na kanale administracyjnym (`1490274396391211158`).
*   `!bb kick [nick] [powód]` – Wyrzuca gracza z serwera Roblox.
*   `!bb tempban [nick] [czas_h] [powód]` – Banuje gracza na X godzin. Generuje grafikę "Zza Krat" na kanale `logi-akcji-roblox`.
*   `!bb permban [nick] [powód]` – Dożywotni ban (tylko Owner).
*   `!bb unban [nick]` – Zdjęcie kary. **Edytuje** oryginalny embed banu w `logi-akcji-roblox` zamiast wysyłania nowej wiadomości.
*   `!bb` *(bez argumentów)* – Wyświetla stronę pomocy.

### 🤖 Detekcja Banów In-Game:
Bot co **2 minuty** odpytuje ER:LC API w poszukiwaniu akcji moderacyjnych (`:ban`, `:kick`, `:unban`) wykonanych bezpośredniu w grze.
Jeśli wykryje nową akcję, wysyła **konwersację DM** do odpowiedzialnej osoby w celu uzupełnienia powodu i czasu kary.

### ⏱️ Dyżury i Wezwania:
*   `/dyzury [użytkownik]` – Wyświetla statystyki czasu pracy moderatora (całkowity czas, ostatnie 7 dni, obecny status).
*   `/wezwij [gracz]` – Oficjalne wezwanie gracza na VC (Kanał: `#Wezwania`). Wysyła PM w grze oraz DM na Discordzie z przyciskiem dołączenia do kanału głosowego.
*   **Personalizacja Logów**: Akcje moderacyjne są logowane z unikalnymi emotkami (🛑, 👟, ⚠️) oraz wyświetlają **Nick** moderatora zamiast ID.

> ⚠️ Wymaga, aby moderator miał wyrobiony dowód osobisty (konto Roblox powiązane z Discordem).

---

## 🌐 Web Panel Zarządzania

Zaawansowany pulpit nawigacyjny (Dashboard) umożliwiający zarządzanie serwerem bez otwierania Discorda czy Robloxa.

### Główne Moduły:
*   **Lista Graczy (Center)**: Podgląd graczy online na serwerze ER:LC wraz z ich uprawnieniami i opcjami szybkiej akcji (Ban/Kick/Warn).
*   **Logi Moderacyjne (Left sidebar)**: Historia akcji z bazy danych. Karta "Moje Akcje" oraz "Wszystkie" dla pełnego wglądu w pracę zespołu.
*   **Logi Serwerowe (Right sidebar)**: Podgląd na żywo wydarzeń z gry (Kill Log oraz Command Log).
*   **Status Dyżuru**: Możliwość ręcznego rozpoczęcia i zakończenia sesji pracy z poziomu panelu.

### Technologia:
*   **Real-time**: Logi serwerowe i lista graczy odświeżają się automatycznie.
*   **Bezpieczeństwo**: Dostęp autoryzowany unikalnym tokenem (komenda `/panel`), wygasającym po 12 godzinach.

---

## 🗃️ Baza Danych (Prisma)

Model `Citizen` przechowuje:
*   `discordId` (Podstawa identyfikacji)
*   `robloxNick`, `robloxId` (Zintegrowane z grą)
*   `pocket`, `bank` (Ekonomia)
*   `bannedUntil`, `isPermBanned` (Status prawny)
*   Dane personalne (Imię, Nazwisko, Data urodzenia, Płeć)

---
*Dokumentacja wygenerowana automatycznie przez BieliskoBot System.*
