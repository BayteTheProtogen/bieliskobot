# AI Context: BieliskoBot Development

Ten plik służy jako kompletny kontekst dla modeli AI (LLMs), które będą kontynuować rozwój BieliskoBot.

## 🏗️ Architektura
*   **Framework**: `discord.js` v14.
*   **Baza Danych**: PostgreSQL + Prisma ORM.
*   **Grafika**: `@napi-rs/canvas` (proceduralne generowanie dokumentów).
*   **Integracja Roblox**: ER:LC API V2 (`api.policeroleplay.community`).

## 📁 Struktura Plików
*   `prisma/schema.prisma`: Definicja modelu `Citizen`.
*   `src/index.ts`: Główny punkt wejścia, obsługa Slash Commands i `!bb`.
*   `src/services/canvas.ts`: Logika rysowania dokumentów (ID, Mandaty, Prisoner).
*   `src/services/db.ts`: Inicjalizacja Prisma Client.
*   `src/services/erlc.ts`: Usługa komunikacji z API Roblox.
*   `src/commands/`: Definicje komend (dowod, economy, economyAdmin, mandat).
*   `src/handlers/interactions.ts`: Obsługa modali, przycisków i select menu.

## 🗝️ Kluczowe Pola w DB
*   `pocket`/`bank`: Integer (złotówki).
*   `bannedUntil`: DateTime? (Koniec tempbana).
*   `isPermBanned`: Boolean (Status permbana).
*   `robloxId`: String (Unikalny identyfikator konta Roblox).

## 🎨 Logika Graficzna (Canvas)
Wszystkie dokumenty są rysowane proceduralnie. Nie używamy stałych grafik tła (oprócz ewentualnych tekstur).
*   `generateIDCard`: Rysuje dowód z giloszem, hologramem i MRZ. Dodaje stempel "OSADZONY" (red).
*   `generateFineCard`: Rysuje mandat/pouczenie z metalicznym nagłówkiem i pieczęcią RP.
*   `generatePrisonerCard`: Rysuje avatar Roblox "zza krat".

## 👮 System Moderacji (ER:LC)
*   **Komendy**: Wysyłane jako `POST` do `/v2/server/command`.
*   **Formaty**:
    *   `:kick [user] [reason]`
    *   `:ban [user] [time] [reason]`
    *   `:pban [user] [reason]`
    *   `:unban [user]`

## ⚠️ Ważne Reguły
*   Każda zmiana w `schema.prisma` wymaga `npx prisma db push`.
*   Komendy `!bb` działają tylko na kanale `1490274396391211158`.
*   `/eco-admin` i `!bb permban` wymagają roli Ownera.
*   Wyszukiwanie `robloxNick` musi być case-insensitive (`mode: 'insensitive'`).

---
*Created by Antigravity AI for BieliskoBot.*
