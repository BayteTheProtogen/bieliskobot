import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../services/db';
import { generateKartotekaCard } from '../services/canvas';

export const kartotekaCommand = {
    data: new SlashCommandBuilder()
        .setName('kartoteka')
        .setDescription('Sprawdza pełną kartotekę kryminalną gracza')
        .addStringOption(option => 
            option.setName('gracz')
                .setDescription('Nick gracza z Robloxa')
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName('uzytkownik')
                .setDescription('Wzmianka użytkownika Discord')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('numer')
                .setDescription('Numer Obywatela (np. 12345)')
                .setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const POLICJA_ROLE = '1490253667910029412';
        const robloxNick = interaction.options.getString('gracz');
        const discordId = interaction.options.getUser('uzytkownik')?.id;
        const citizenNumber = interaction.options.getString('numer');

        if (!robloxNick && !discordId && !citizenNumber) {
            return interaction.reply({ content: '❌ Musisz podać przynajmniej jeden parametr (Nick, Użytkownik lub Numer Obywatela).', ephemeral: true });
        }

        let citizen;
        if (robloxNick) {
            citizen = await prisma.citizen.findFirst({
                where: { robloxNick: { equals: robloxNick, mode: 'insensitive' } }
            });
        } else if (discordId) {
            citizen = await prisma.citizen.findUnique({ where: { discordId } });
        } else if (citizenNumber) {
            citizen = await prisma.citizen.findFirst({ where: { citizenNumber } });
        }

        if (!citizen) {
            return interaction.reply({ content: `🚫 Nie znaleziono obywatela w bazie danych.`, ephemeral: true });
        }

        await interaction.deferReply();

        const nick = citizen.robloxNick;

        // Sprawdzenie czy poszukiwany
        const wanted = await (prisma as any).wantedPerson.findUnique({ where: { targetNick: nick } });

        // Zebranie danych sumarycznych
        const bansCount = await prisma.banLog.count({
            where: { playerNick: { equals: nick, mode: 'insensitive' } }
        });
        
        const arrestsCount = await prisma.arrestLog.count({
            where: { playerNick: { equals: nick, mode: 'insensitive' } }
        });

        const fines = await prisma.fineLog.findMany({
            where: { playerNick: { equals: nick, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' }
        });

        const arrests = await prisma.arrestLog.findMany({
            where: { playerNick: { equals: nick, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' }
        });

        const bans = await prisma.banLog.findMany({
            where: { playerNick: { equals: nick, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        const arrestsText = arrests.slice(0, 5).map(a => `• **${a.time} mies.** - ${a.reason} (<t:${Math.floor(a.createdAt.getTime() / 1000)}:d>)`).join('\n') || 'Brak wpisów.';
        const finesText = fines.slice(0, 5).map(f => {
            const prefix = f.reason.startsWith('[NOTATKA]') ? '📝' : '💰';
            const val = f.amount > 0 ? `**${f.amount} zł**` : '';
            return `${prefix} ${val} ${f.reason.replace('[NOTATKA]', '').trim()} (<t:${Math.floor(f.createdAt.getTime() / 1000)}:d>)`;
        }).join('\n') || 'Brak wpisów.';
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
            .setColor(wanted ? '#c0392b' : '#e4c590')
            .setTitle(`📂 Kartoteka: ${citizen.firstName} ${citizen.lastName} (@${citizen.robloxNick})`)
            .setDescription(`**Status:** ${wanted ? '🔴 **POSZUKIWANY**' : '🟢 **CZYSTY**'}\n**ID:** \`${citizen.citizenNumber}\``)
            .addFields(
                { name: '💰 Mandaty i Notatki', value: finesText },
                { name: '🚓 Ostatnie Aresztowania', value: arrestsText },
                { name: '🔨 Najnowsze Bany', value: bansText }
            )
            .setImage('attachment://kartoteka.png')
            .setFooter({ text: 'CONFIDENTIAL • Zintegrowany System Bezpieczeństwa Bieliska' });

        const components: ActionRowBuilder<ButtonBuilder>[] = [];
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        
        if (member?.roles.cache.has(POLICJA_ROLE)) {
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`kartoteka_wanted_toggle|${citizen.robloxNick}`)
                    .setLabel(wanted ? 'WYCOFAJ LIST GOŃCZY' : 'WYSTAW LIST GOŃCZY')
                    .setStyle(wanted ? ButtonStyle.Success : ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`kartoteka_add_note|${citizen.robloxNick}`)
                    .setLabel('DODAJ NOTATKĘ')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`kartoteka_clear_req|${citizen.robloxNick}`)
                    .setLabel('CZYŚĆ REKORDY')
                    .setStyle(ButtonStyle.Secondary)
            );
            components.push(row);
        }

        await interaction.editReply({ 
            embeds: [embed], 
            files: [attachment],
            components: components
        });
    }
};
