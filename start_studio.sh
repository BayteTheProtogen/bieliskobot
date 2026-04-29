#!/bin/bash
echo "Uruchamianie Prisma Studio..."
docker exec -it bieliskobot-app npx prisma studio -p 5555 -h 0.0.0.0
