import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { prisma } from '../services/db';

const ADMIN_ID = '1490053669830393996';

export const economyAdminCommands = {
    data: new SlashCommandBuilder()
        .setName('eco-admin')
        .setDescription('Narzędzia administracyjne ekonomii (Tylko dla uprawnionych)')
        .setDefaultMemberPermissions(0) // Hide for non-admins (optional but good practice)
        .addSubcommand(sub =>
            sub.setName('sprawdz')
               .setDescription('Sprawdź stan majątku dowolnego gracza')
               .addStringOption(opt => opt.setName('nick').setDescription('Nick Roblox gracza').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('ustaw')
               .setDescription('Ustaw konkretną kwotę na koncie gracza')
               .addStringOption(opt => opt.setName('nick').setDescription('Nick Roblox gracza').setRequired(true))
               .addStringOption(opt => opt.setName('miejsce')
                    .setDescription('Kieszeń czy Bank?')
                    .setRequired(true)
                    .addChoices({ name: 'Kieszeń', value: 'pocket' }, { name: 'Bank', value: 'bank' }))
               .addIntegerOption(opt => opt.setName('kwota').setDescription('Nowa kwota').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('dodaj')
               .setDescription('Dodaj pieniądze do konta gracza')
               .addStringOption(opt => opt.setName('nick').setDescription('Nick Roblox gracza').setRequired(true))
               .addStringOption(opt => opt.setName('miejsce')
                    .setDescription('Gdzie dodać?')
                    .setRequired(true)
                    .addChoices({ name: 'Kieszeń', value: 'pocket' }, { name: 'Bank', value: 'bank' }))
               .addIntegerOption(opt => opt.setName('kwota').setDescription('Kwota do dodania').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('zabierz')
               .setDescription('Odejmij pieniądze z konta gracza')
               .addStringOption(opt => opt.setName('nick').setDescription('Nick Roblox gracza').setRequired(true))
               .addStringOption(opt => opt.setName('miejsce')
                    .setDescription('Skąd zabrać?')
                    .setRequired(true)
                    .addChoices({ name: 'Kieszeń', value: 'pocket' }, { name: 'Bank', value: 'bank' }))
               .addIntegerOption(opt => opt.setName('kwota').setDescription('Kwota do zabrania').setRequired(true))
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        // PERMISSIONS CHECK
        const isOwner = interaction.user.id === ADMIN_ID || (interaction.member?.roles as any).cache.has(ADMIN_ID);
        if (!isOwner) {
            return interaction.reply({ content: '🚫 Nie masz uprawnień do korzystania z narzędzi administracyjnych ekonomii!', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        const targetNick = interaction.options.getString('nick', true);
        const amount = interaction.options.getInteger('kwota') || 0;
        const place = interaction.options.getString('miejsce') || '';

        const target = await prisma.citizen.findFirst({ where: { robloxNick: { equals: targetNick, mode: 'insensitive' } } });

        if (!target) {
            return interaction.reply({ content: `🚫 Nie znaleziono w bazie obywatela o nicku Roblox: **${targetNick}**.`, ephemeral: true });
        }

        if (subcommand === 'sprawdz') {
            const embed = new EmbedBuilder()
                .setTitle(`📊 Majątek Obywatela: ${target.firstName} ${target.lastName}`)
                .setColor('#f1c40f')
                .addFields(
                    { name: '👤 Roblox Nick', value: `@${target.robloxNick}`, inline: true },
                    { name: '🆔 Discord', value: `<@${target.discordId}>`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: false },
                    { name: '💵 Kieszeń', value: `**${target.pocket.toLocaleString()} zł**`, inline: true },
                    { name: '🏦 Bank', value: `**${target.bank.toLocaleString()} zł**`, inline: true },
                    { name: '💰 RAZEM', value: `**${(target.pocket + target.bank).toLocaleString()} zł**`, inline: false }
                )
                .setFooter({ text: `Numer dowodu: ${target.citizenNumber}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Transactions
        let updateData = {};
        let placeName = place === 'pocket' ? 'Kieszeń' : 'Bank';

        if (subcommand === 'ustaw') {
            updateData = { [place]: amount };
            await prisma.citizen.update({ where: { discordId: target.discordId }, data: updateData });
            return interaction.reply({ content: `✅ Ustawiono majątek obywatela **${target.firstName} ${target.lastName}** (@${target.robloxNick}).\nNowy stan w: **${placeName}** wynosi **${amount.toLocaleString()} zł**.` });
        }

        if (subcommand === 'dodaj') {
            updateData = { [place]: { increment: amount } };
            await prisma.citizen.update({ where: { discordId: target.discordId }, data: updateData });
            return interaction.reply({ content: `✅ Dodano **${amount.toLocaleString()} zł** do obywatela **${target.firstName} ${target.lastName}** (@${target.robloxNick}) w lokalizacji: **${placeName}**.` });
        }

        if (subcommand === 'zabierz') {
            updateData = { [place]: { decrement: amount } };
            await prisma.citizen.update({ where: { discordId: target.discordId }, data: updateData });
            return interaction.reply({ content: `✅ Zabrano **${amount.toLocaleString()} zł** od obywatela **${target.firstName} ${target.lastName}** (@${target.robloxNick}) z lokalizacji: **${placeName}**.` });
        }
    }
};
