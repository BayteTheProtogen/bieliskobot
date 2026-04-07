import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } from 'discord.js';
import { prisma } from '../services/db';
import { getUserIdByUsername, getAvatarBust } from '../services/roblox';
import { generateIDCard } from '../services/canvas';

export const dowodCommand = {
    data: new SlashCommandBuilder()
        .setName('dowod')
        .setDescription('Zarządzanie swoim dowodem osobistym postaci RP')
        .addSubcommand(subcommand =>
            subcommand
                .setName('wyrob')
                .setDescription('Wyrób nowy dowód osobisty')
                .addStringOption(option =>
                    option.setName('nick')
                        .setDescription('Twój nick włączony z postaciami z Robloxa')
                        .setRequired(true)
                ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('zaktualizuj')
                .setDescription('Zaktualizuj swoje aktualne dane w dowodzie osobistym')
                .addStringOption(option =>
                    option.setName('nick')
                        .setDescription('Twój obecny lub nowy nick w Robloxa')
                        .setRequired(true)
                ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pokaz')
                .setDescription('Wyświetla Twój aktualny dowód osobisty')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('uniewaznij')
                .setDescription('Unieważnij swój obecny dowód osobisty (wymaga zatwierdzenia przez urząd)')
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();
        const discordId = interaction.user.id;

        if (subcommand === 'pokaz') {
            const ownerId = '1490053669830393996';
            const POLICJA_ROLE = '1490253667910029412';
            const isOwner = interaction.user.id === ownerId || 
                            (interaction.member?.roles as any).cache.has(ownerId) ||
                            (interaction.member?.roles as any).cache.has(POLICJA_ROLE);

            if (isOwner) {
                const select = new UserSelectMenuBuilder()
                    .setCustomId('admin_select_pokaz')
                    .setPlaceholder('Wybierz osobę, której chcesz podejrzeć dowód')
                    .setMinValues(1)
                    .setMaxValues(1);

                const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select);

                return interaction.reply({
                    content: '### 🛠️ Administracyjny podgląd dowodu\nWybierz z poniższej listy osobę, której dokument chcesz zobaczyć:',
                    components: [row],
                    ephemeral: true
                });
            }

            await interaction.deferReply();
            try {
                const citizen = await prisma.citizen.findUnique({ where: { discordId } });
                if (!citizen) {
                    return interaction.editReply({ content: 'Nie posiadasz wyrobiongo dowodu osobistego! Użyj najpierw `/dowod wyrob`.' });
                }

                // Generowanie obrazka ponownie
                const avatarBustUrl = await getAvatarBust(citizen.robloxId);
                if (!avatarBustUrl) {
                    return interaction.editReply({ content: 'Nie udało się pobrać avatara Twojej postaci z Robloxa, być może coś się zepsuło po stronie Roblox API.' });
                }

                const buffer = await generateIDCard(citizen, avatarBustUrl);
                const attachment = new AttachmentBuilder(buffer, { name: 'dowod.png' });

                await interaction.editReply({
                    content: `Dowód osobisty obywatela: **${citizen.firstName} ${citizen.lastName}**`,
                    files: [attachment]
                });
            } catch (e) {
                console.error(e);
                await interaction.editReply({ content: 'Wystąpił błąd bazy danych.' });
            }
            return;
        }

        if (subcommand === 'wyrob' || subcommand === 'zaktualizuj') {
            // Check if exists for 'wyrob'
            const existingCitizen = await prisma.citizen.findUnique({ where: { discordId } });

            if (subcommand === 'wyrob' && existingCitizen) {
                return interaction.reply({
                    content: '🚫 Posiadasz już wyrobiony dowód osobisty na tym koncie! Tworzenie drugiego dowodu jest zablokowane. Jeśli chcesz zaktualizować swoje dane lub poprawić postać, skorzystaj z dedykowanej dla tego komendy `/dowod zaktualizuj nick:`',
                    ephemeral: true
                });
            } else if (subcommand === 'zaktualizuj' && !existingCitizen) {
                return interaction.reply({
                    content: '🚫 Nie posiadasz jeszcze wyrobionego dowodu osobistego! Użyj najpierw komendy `/dowod wyrob nick:`',
                    ephemeral: true
                });
            } else if (subcommand === 'zaktualizuj') {
                const pending = await prisma.pendingUpdate.findFirst({ where: { discordId } });
                if (pending) {
                    return interaction.reply({
                        content: '🚫 Masz już złożone, aktywne podanie o aktualizację w Urzędzie! Poczekaj na jego weryfikację przez administratora, zanim złożysz kolejne.',
                        ephemeral: true
                    });
                }
                await interaction.reply({ content: 'Szukam postaci...', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Szukam postaci...', ephemeral: true });
            }

            const nick = interaction.options.getString('nick', true);
            const robloxUserId = await getUserIdByUsername(nick);

            if (!robloxUserId) {
                return interaction.editReply({ content: `Nie znaleziono gracza o nicku **${nick}**.` });
            }

            const avatarUrl = await getAvatarBust(robloxUserId);
            
            if (!avatarUrl) {
                return interaction.editReply({ content: 'Znaleziono gracza, ale nie udało się pobrać jego zdjęcia (popiersia).' });
            }

            const embed = new EmbedBuilder()
                .setTitle('Weryfikacja postaci')
                .setDescription(`Czy to Twoja postać? (*Zostanie użyta do zdjęcia w dowodzie*)`)
                .setImage(avatarUrl)
                .setColor('#00bfff');

            // Limit długości to 100 characterów. Action to create lub update
            const action = subcommand === 'wyrob' ? 'create' : 'update';
            // max length 100: roblox_yes|{15}|{20}|create
            const customId = `roblox_yes|${robloxUserId}|${nick.substring(0, 20)}|${action}`;

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(customId)
                        .setLabel('✅ Tak, to moja postać')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('roblox_no')
                        .setLabel('❌ Nie')
                        .setStyle(ButtonStyle.Danger)
                );

            await interaction.editReply({
                content: '',
                embeds: [embed],
                components: [row]
            });
            return;
        }

        if (subcommand === 'uniewaznij') {
            const ownerId = '1490053669830393996';
            const isOwner = interaction.user.id === ownerId || (interaction.member?.roles as any).cache.has(ownerId);
            if (isOwner) {
                // Owner flow - Show User Select Menu
                const select = new UserSelectMenuBuilder()
                    .setCustomId('admin_select_uniewaznij')
                    .setPlaceholder('Wybierz osobę, której chcesz unieważnić dowód')
                    .setMinValues(1)
                    .setMaxValues(1);

                const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select);

                await interaction.reply({
                    content: '### 🛠️ Administracyjne unieważnienie\nWybierz z poniższej listy osobę, której dokumenty mają zostać unieważnione:',
                    components: [row],
                    ephemeral: true
                });
            } else {
                // User flow - Check if has ID
                const citizen = await prisma.citizen.findUnique({ where: { discordId } });
                if (!citizen) {
                    return interaction.reply({ content: '🚫 Nie posiadasz wyrobionego dowodu osobistego, więc nie możesz go unieważnić!', ephemeral: true });
                }

                // Check if already pending
                const pending = await prisma.pendingInvalidation.findFirst({ where: { discordId } });
                if (pending) {
                    return interaction.reply({ content: '🚫 Twoje podanie o unieważnienie dowodu jest już procesowane w Urzędzie!', ephemeral: true });
                }

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId('user_confirm_uniewaznij')
                        .setLabel('⚠️ Potwierdzam chęć unieważnienia')
                        .setStyle(ButtonStyle.Danger)
                );

                await interaction.reply({
                    content: '### ⚠️ Czy na pewno chcesz unieważnić swój dowód?\nTa operacja spowoduje wysłanie wniosku do Urzędu. Po jego zatwierdzeniu stracisz dostęp do obecnej tożsamości i będziesz musiał wyrabiać nowy dowód.',
                    components: [row],
                    ephemeral: true
                });
            }
        }
    }
};
