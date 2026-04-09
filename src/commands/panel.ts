import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { prisma } from '../services/db';

export const panelCommand = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Uzyskaj dostęp do bezhasłowego Web Panelu Moderatora'),

    async execute(interaction: ChatInputCommandInteraction) {
        const { PermissionsBitField } = require('discord.js');
        const MOD_ROLES = ['1490253667910029412', '1490053669830393996']; // Role: Policja + Właściciel
        
        console.log(`[Panel Auth] Sprawdzanie uprawnień dla: ${interaction.user.username} (ID: ${interaction.user.id})`);
        
        const rawMember = interaction.member as any;
        let hasRole = false;
        let isAdmin = false;
        let rolesLog = 'none';

        if (rawMember) {
            if (rawMember.roles && Array.isArray(rawMember.roles)) {
                hasRole = MOD_ROLES.some(r => rawMember.roles.includes(r));
                rolesLog = rawMember.roles.join(', ');
                isAdmin = rawMember.permissions && (BigInt(rawMember.permissions) & BigInt(8)) === BigInt(8);
            } else if (rawMember.roles && 'cache' in rawMember.roles) {
                hasRole = MOD_ROLES.some(r => rawMember.roles.cache.has(r));
                rolesLog = rawMember.roles.cache.map((r: any) => r.id).join(', ');
                isAdmin = rawMember.permissions && rawMember.permissions.has(PermissionsBitField.Flags.Administrator);
            }
        }

        const isOwner = interaction.user.id === '1490053669830393996';

        if (!hasRole && !isOwner && !isAdmin) {
            console.log(`[Panel Auth] ODMOWA dla ${interaction.user.username}. Rozpoznane role użytkownika: ${rolesLog}`);
            return interaction.reply({ content: '🚫 Brak dostępu do Panelu Moderatora! Spróbuj ponownie lub skontaktuj się z Zarządem.', ephemeral: true });
        }

        // Generate magic token
        // A simple random token (UUID-like) or high entropy hex
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');

        // Create token in Database
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 12); // Wygasa po 12h

        await (prisma as any).webSession.create({
            data: {
                token,
                discordId: interaction.user.id,
                expiresAt
            }
        });

        const baseUrl = process.env.WEB_URL || 'https://bieliskobot-production.up.railway.app';
        const panelUrl = `${baseUrl}/?token=${token}`;

        const embed = new EmbedBuilder()
            .setTitle('🌐 Dostęp do Web Panelu')
            .setDescription(`Zalogowano pomyślnie. Nie udostępniaj tego linku nikomu!\n\nKliknij poniżej, aby otworzyć bezpieczny panel:\n\n**[ZALOGUJ DO PANELU](${panelUrl})**\n*(Link wygaśnie po 12 godzinach)*`)
            .setColor('#2ecc71');

        try {
            await interaction.user.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Link do panelu został wysłany w Twojej wiadomości prywatnej!', ephemeral: true });
        } catch (err) {
            await interaction.reply({ content: '⚠️ Włącz wiadomości prywatne, aby otrzymać link do panelu!', ephemeral: true });
        }
    }
};
