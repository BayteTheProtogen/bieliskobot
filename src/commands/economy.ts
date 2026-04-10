import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../services/db';

export const economyCommands = {
    // ... data code same ...
    data: new SlashCommandBuilder()
        .setName('portfel')
        .setDescription('Zarządzaj swoimi finansami')
        .addSubcommand(sub =>
            sub.setName('pokaz')
               .setDescription('Sprawdź stan swoich oszczędności')
        )
        .addSubcommand(sub =>
            sub.setName('wplac')
               .setDescription('Wpłać pieniądze z kieszeni do banku')
               .addStringOption(opt => 
                    opt.setName('kwota')
                       .setDescription('Kwota którą chcesz wpłacić (liczba lub "all")')
                       .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('wyplac')
               .setDescription('Wypłać pieniądze z konta bankowego do kieszeni')
               .addStringOption(opt => 
                    opt.setName('kwota')
                       .setDescription('Kwota którą chcesz wypłacić (liczba lub "all")')
                       .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('przelej')
               .setDescription('Przelej pieniądze innemu obywatelowi (z Twojej kieszeni)')
               .addStringOption(opt => 
                    opt.setName('odbiorca')
                       .setDescription('Nick Roblox osoby, której chcesz przelać pieniądze')
                       .setRequired(true))
               .addIntegerOption(opt => 
                    opt.setName('kwota')
                       .setDescription('Kwota, którą chcesz przelać')
                       .setRequired(true))
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const discordId = interaction.user.id;
        const citizen = await prisma.citizen.findUnique({ where: { discordId } });

        if (!citizen) {
            return interaction.reply({ content: '🚫 Musisz posiadać wyrobiony dowód osobisty, aby zarządzać finansami!', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'pokaz') {
            const embed = new EmbedBuilder()
                .setTitle('👛 Twój Portfel i Konto Bankowe')
                .setColor('#2ecc71')
                .addFields(
                    { name: '💵 Kieszeń', value: `**${citizen.pocket.toLocaleString()} zł**`, inline: true },
                    { name: '🏦 Bank', value: `**${citizen.bank.toLocaleString()} zł**`, inline: true },
                    { name: '💰 Razem Majątek', value: `**${(citizen.pocket + citizen.bank).toLocaleString()} zł**`, inline: false }
                )
                .setFooter({ text: 'RP Bielisko - System Finansowy' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'wplac' || subcommand === 'wyplac') {
            const amountInput = interaction.options.getString('kwota', true);
            let amount = 0;

            if (amountInput.toLowerCase() === 'all') {
                amount = subcommand === 'wplac' ? citizen.pocket : citizen.bank;
            } else {
                amount = parseInt(amountInput);
            }

            if (isNaN(amount) || amount <= 0) {
                return interaction.reply({ content: '🚫 Podaj poprawną kwotę (liczbę lub słowo "all").', ephemeral: true });
            }

            if (subcommand === 'wplac') {
                if (citizen.pocket < amount) {
                    return interaction.reply({ content: `🚫 Nie masz tyle gotówki w kieszeni! (Posiadasz: ${citizen.pocket} zł)`, ephemeral: true });
                }
                await prisma.citizen.update({
                    where: { discordId },
                    data: { pocket: { decrement: amount }, bank: { increment: amount } }
                });
                return interaction.reply({ content: `✅ Wpłacono **${amount.toLocaleString()} zł** do Twojego banku.` });
            } else {
                if (citizen.bank < amount) {
                    return interaction.reply({ content: `🚫 Nie masz tyle w banku! (Posiadasz: ${citizen.bank} zł)`, ephemeral: true });
                }
                await prisma.citizen.update({
                    where: { discordId },
                    data: { bank: { decrement: amount }, pocket: { increment: amount } }
                });
                return interaction.reply({ content: `✅ Wypłacono **${amount.toLocaleString()} zł** z konta bankowego do kieszeni.` });
            }
        }

        if (subcommand === 'przelej') {
            const targetNick = interaction.options.getString('odbiorca', true);
            const amount = interaction.options.getInteger('kwota', true);

            if (amount <= 0) return interaction.reply({ content: '🚫 Kwota musi być większa niż 0.', ephemeral: true });
            if (amount > citizen.pocket) {
                return interaction.reply({ content: `🚫 Nie masz tyle w kieszeni! (Posiadasz: ${citizen.pocket} zł)`, ephemeral: true });
            }

            const targetCitizen = await prisma.citizen.findFirst({ where: { robloxNick: { equals: targetNick, mode: 'insensitive' } } });
            if (!targetCitizen) {
                return interaction.reply({ content: `🚫 Nie znaleziono obywatela o nicku Roblox: **${targetNick}**.`, ephemeral: true });
            }

            if (targetCitizen.discordId === discordId) {
                return interaction.reply({ content: '🚫 Nie możesz przelać pieniędzy samemu sobie!', ephemeral: true });
            }

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_transfer|${targetCitizen.discordId}|${amount}`)
                    .setLabel(`Potwierdź przelew: ${amount} zł dla ${targetCitizen.firstName} ${targetCitizen.lastName}`)
                    .setStyle(ButtonStyle.Primary)
            );

            return interaction.reply({
                content: `### 💸 Potwierdzenie przelewu\nCzy na pewno chcesz przelać **${amount} zł** ze swojej kieszeni do obywatela **${targetCitizen.firstName} ${targetCitizen.lastName}**?`,
                components: [row],
                ephemeral: true
            });
        }
    }
};

export const workCommands = {
    data: new SlashCommandBuilder()
        .setName('praca')
        .setDescription('Idź do pracy i zarób od 2500 do 4200 zł w zależności od frakcji (Dostępne co 24h)'),

    async execute(interaction: ChatInputCommandInteraction) {
        const discordId = interaction.user.id;
        const citizen = await prisma.citizen.findUnique({ where: { discordId } });

        if (!citizen) {
            return interaction.reply({ content: '🚫 Tylko zarejestrowani obywatele z dowodem mogą podjąć legalną pracę!', ephemeral: true });
        }

        const member = await interaction.guild?.members.fetch(discordId);
        if (!member?.roles.cache.has('1490075447629971467')) {
             return interaction.reply({ content: '⚠️ Tylko certyfikowani obywatele z rangą **Cywil** mogą odszukać urząd pracy!', ephemeral: true });
        }

        // Frakcje i stawki
        const rolesPay: { [key: string]: number } = {
            '1490253667910029412': 4200, // Policjant
            '1490253785962909847': 4000, // Ratownik medyczny
            '1490253850957840464': 3800, // Pomoc drogowa
            '1490253725405548704': 4200, // Strażak
            '1492152371143512174': 3500  // Operator numeru ratunkowego 112
        };

        let earned = 2500; // Domyślna stawka Cywila
        for (const [roleId, pay] of Object.entries(rolesPay)) {
            if (member.roles.cache.has(roleId)) {
                if (pay > earned) earned = pay;
            }
        }

        const now = new Date();
        const lastWork = citizen.lastWork;
        if (lastWork) {
            const diff = now.getTime() - lastWork.getTime();
            const cooldown = 24 * 60 * 60 * 1000;
            if (diff < cooldown) {
                const nextWork = new Date(lastWork.getTime() + cooldown);
                return interaction.reply({ 
                    content: `😴 Jesteś zmęczony! Do kolejnej pracy będziesz gotowy: <t:${Math.floor(nextWork.getTime() / 1000)}:R>.`, 
                    ephemeral: true 
                });
            }
        }

        await prisma.citizen.update({
            where: { discordId },
            data: { pocket: { increment: earned }, lastWork: now }
        });

        return interaction.reply({ content: `🔨 Przepracowałeś swoją zmianę! Jako rzetelny pracownik otrzymujesz **${earned.toLocaleString()} zł** bezpośrednio do kieszeni.` });
    }
};

export const extraWorkCommands = {
    data: new SlashCommandBuilder()
        .setName('dorobka')
        .setDescription('Wykonaj szybkie zlecenie i zarób 250-500 zł (Dostępne co 6h)'),

    async execute(interaction: ChatInputCommandInteraction) {
        const discordId = interaction.user.id;
        const citizen = await prisma.citizen.findUnique({ where: { discordId } });

        if (!citizen) {
            return interaction.reply({ content: '🚫 Nawet doróbka wymaga przynajmniej posiadania dowodu w systemie!', ephemeral: true });
        }

        const now = new Date();
        const lastExtra = citizen.lastExtra;
        if (lastExtra) {
            const diff = now.getTime() - lastExtra.getTime();
            const cooldown = 6 * 60 * 60 * 1000;
            if (diff < cooldown) {
                const nextExtra = new Date(lastExtra.getTime() + cooldown);
                return interaction.reply({ 
                    content: `⌛ Nie ma na razie żadnych zleceń. Zapytaj ponownie: <t:${Math.floor(nextExtra.getTime() / 1000)}:R>.`, 
                    ephemeral: true 
                });
            }
        }

        const earned = Math.floor(Math.random() * (500 - 250 + 1)) + 250;

        await prisma.citizen.update({
            where: { discordId },
            data: { pocket: { increment: earned }, lastExtra: now }
        });

        return interaction.reply({ content: `📦 Zrealizowałeś szybkie zlecenie! Zarobiłeś **${earned} zł**.` });
    }
};
