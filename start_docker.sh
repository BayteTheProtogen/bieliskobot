#!/bin/bash

echo "🚀 Przygotowywanie środowiska Docker dla BieliskoBot..."

# Sprawdzanie czy Docker jest zainstalowany
if ! command -v docker &> /dev/null; then
    echo "❌ Docker nie jest zainstalowany! Zainstaluj go za pomocą:"
    echo "sudo zypper in docker docker-compose"
    echo "sudo systemctl enable docker --now"
    exit 1
fi

echo "📦 Budowanie i uruchamianie kontenerów..."
docker-compose up -d --build

echo "✅ Bot i baza danych zostały uruchomione w tle."
echo "📜 Aby sprawdzić logi bota użyj komendy: docker-compose logs -f app"
