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
*   `/praca` – Praca stała (2 500 zł), dostępna co 24h. Wymaga rangi **Cywil**.
*   `/dorobka` – Szybkie zlecenia (250-500 zł), dostępne co 6h.

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
*   `!bb tempban [nick] [czas_h] [powód]` – Banuje gracza na X godzin. Generuje grafikę "Zza Krat" na kanale `banroom`.
*   `!bb permban [nick] [powód]` – Dożywotni ban (tylko Owner).
*   `!bb unban [nick]` – Zdjęcie kary. **Nowość:** Automatycznie edytuje wszystkie historyczne logi baczności gracza, dodając dopisek `🔓 ODBANOWANO`.

### 🌐 Synchronizacja In-Game (ER:LC Sync):
BieliskoBot automatycznie monitoruje działania administracyjne wykonane bezpośrednio na serwerze Roblox (co 10 minut).
*   **Wykrywanie Kary**: Jeśli admin użyje komendy `:kick` lub `:ban` w grze, bot wykryje to przez API ER:LC.
*   **Interakcja z Adminem**: Bot wysyła **prywatną wiadomość (DM)** do admina na Discordzie z prośbą o podanie powodu i czasu kary.
*   **Logowanie**: Po uzyskaniu odpowiedzi, bot generuje pełny log na kanale `banroom` (wraz z grafiką osadzonego) i zapisuje karę w bazie.
*   **Pouczenie**: Admin otrzymuje przypomnienie o zalecanym używaniu komendy `!bb` na Discordzie dla pełnej wygody.

*Uwaga: Aby funkcja działała, admin musi mieć założony profil w bota (powiązany `robloxId`).*

---

---

## 🗃️ Baza Danych (Prisma)

Model `Citizen` przechowuje:
*   `discordId` (Podstawa identyfikacji)
*   `robloxNick`, `robloxId` (Zintegrowane z grą)
*   `pocket`, `bank` (Ekonomia)
*   `bannedUntil`, `isPermBanned` (Status prawny)
*   Dane personalne (Imię, Nazwisko, Data urodzenia, Płeć)

### Tabela `Punishment`:
Przechowuje pełną historię kar dla każdego obywatela:
*   `type` (KICK / BAN / PERMBAN)
*   `reason`, `duration`
*   `messageId` (ID powiązanej wiadomości na kanale logów – pozwala na późniejszą edycję statusu)
*   `isActive` (Flaga określająca, czy kara jest wciąż w toku)

---
*Dokumentacja wygenerowana automatycznie przez BieliskoBot System.*
