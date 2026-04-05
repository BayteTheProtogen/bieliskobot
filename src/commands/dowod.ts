import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
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
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();
        const discordId = interaction.user.id;

        if (subcommand === 'pokaz') {
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

            let warnMessage = '';
            if (subcommand === 'wyrob' && existingCitizen) {
                warnMessage = '⚠️ **UWAGA: Posiadasz już wyrobiony dowód.** Zatwierdzenie nowej postaci spowoduje bezpowrotne **nadpisanie** Twojego starego dowodu!\n\n';
            }

            await interaction.reply({ content: warnMessage + 'Szukam postaci...', ephemeral: true });

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
                content: warnMessage,
                embeds: [embed],
                components: [row]
            });
        }
    }
};
