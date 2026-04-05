import { prisma } from './src/services/db';
console.log('Available models on prisma:', Object.keys(prisma).filter(k => !k.startsWith('$')));
