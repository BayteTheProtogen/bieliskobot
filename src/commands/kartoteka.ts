import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { prisma } from '../services/db';
import { generateKartotekaCard } from '../services/canvas';

export const kartotekaCommand = {
    data: new SlashCommandBuilder()
        .setName('kartoteka')
        .setDescription('Sprawdza pełną kartotekę kryminalną (mandaty, aresztowania, bany) gracza')
        .addStringOption(option => 
            option.setName('gracz')
                .setDescription('Nick gracza z Robloxa')
                .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const robloxNick = interaction.options.getString('gracz') || '';

        const citizen = await prisma.citizen.findFirst({
            where: { robloxNick: { equals: robloxNick, mode: 'insensitive' } }
        });

        if (!citizen) {
            return interaction.reply({ content: `🚫 Nie znaleziono w bazie obywatela o nicku: **${robloxNick}**!`, ephemeral: true });
        }

        await interaction.deferReply();

        // Zebranie danych sumarycznych (counts)
        const bansCount = await prisma.banLog.count({
            where: { playerNick: { equals: robloxNick, mode: 'insensitive' } }
        });
        
        const arrestsCount = await prisma.arrestLog.count({
            where: { playerNick: { equals: robloxNick, mode: 'insensitive' } }
        });

        const fines = await prisma.fineLog.findMany({
            where: { playerNick: { equals: robloxNick, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' }
        });

        const arrests = await prisma.arrestLog.findMany({
            where: { playerNick: { equals: robloxNick, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' }
        });

        const bans = await prisma.banLog.findMany({
            where: { playerNick: { equals: robloxNick, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        const arrestsText = arrests.slice(0, 5).map(a => `• **${a.time} mies.** - ${a.reason} (<t:${Math.floor(a.createdAt.getTime() / 1000)}:d>)`).join('\n') || 'Brak wpisów.';
        const finesText = fines.slice(0, 5).map(f => `• **${f.amount} zł** - ${f.reason} (<t:${Math.floor(f.createdAt.getTime() / 1000)}:d>)`).join('\n') || 'Brak wpisów.';
        const bansText = bans.map(b => `• **Za:** ${b.reason} (<t:${Math.floor(b.createdAt.getTime() / 1000)}:d>)`).join('\n') || 'Brak wpisów.';

        const buffer = await generateKartotekaCard({
            targetName: `${citizen.firstName} ${citizen.lastName}`,
            targetNick: citizen.robloxNick,
            bans: bansCount,
            arrests: arrestsCount,
            fines: fines.length
        });

        const attachment = new AttachmentBuilder(buffer, { name: 'kartoteka.png' });

        const embed = new EmbedBuilder()
            .setColor('#e4c590')
            .setTitle(`📂 Kartoteka: ${citizen.firstName} ${citizen.lastName} (@${citizen.robloxNick})`)
            .addFields(
                { name: '💰 Ostatnie Mandaty', value: finesText },
                { name: '🚓 Ostatnie Aresztowania', value: arrestsText },
                { name: '🔨 Najnowsze Bany', value: bansText }
            )
            .setImage('attachment://kartoteka.png')
            .setFooter({ text: 'CONFIDENTIAL • Zintegrowany System Bezpieczeństwa Bieliska' });

        await interaction.editReply({ embeds: [embed], files: [attachment] });
    }
};
