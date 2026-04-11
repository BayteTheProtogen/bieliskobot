import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, AttachmentBuilder, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../services/db';
import { getUserIdByUsername, getAvatarBust } from '../services/roblox';
import { generateWantedPoster } from '../services/canvas';

export const poszukiwanieCommand = {
    data: new SlashCommandBuilder()
        .setName('poszukiwanie')
        .setDescription('System zarzadzania listami gończymi')
        .addSubcommand(subcommand =>
            subcommand
                .setName('dodaj')
                .setDescription('Wystaw list gończy za obywatelem')
                .addStringOption(option => 
                    option.setName('nick')
                        .setDescription('Nick Roblox poszukiwanego')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('powod')
                        .setDescription('Powód wystawienia listu gończego')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('lista')
                .setDescription('Wyświetl listę aktualnie poszukiwanych osób'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('usun')
                .setDescription('Usuń osobę z listy poszukiwanych')
                .addStringOption(option =>
                    option.setName('nick')
                        .setDescription('Nick Roblox osoby do usunięcia')
                        .setRequired(true))),

    async execute(interaction: ChatInputCommandInteraction) {
        const POLICJA_ROLE = '1490253667910029412';
        const POSZUKIWANI_CHANNEL_ID = '1491176702586523769';

        const member = await interaction.guild?.members.fetch(interaction.user.id);
        if (!member?.roles.cache.has(POLICJA_ROLE)) {
            return interaction.reply({ content: '🚫 Brak uprawnień do korzystania z systemu listów gończych!', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dodaj') {
            const nick = interaction.options.getString('nick', true);
            const reason = interaction.options.getString('powod', true);

            await interaction.deferReply({ ephemeral: true });

            try {
                // 1. Check if already wanted
                const existing = await (prisma as any).wantedPerson.findUnique({ where: { targetNick: nick } });
                if (existing) {
                    return interaction.editReply({ content: `⚠️ Obywatel **${nick}** jest już na liście poszukiwanych.` });
                }

                // 2. Resolve Roblox Data
                const robloxId = await getUserIdByUsername(nick);
                const avatarUrl = robloxId ? await getAvatarBust(robloxId) : null;

                // 3. Generate Poster
                const buffer = await generateWantedPoster(nick, reason, avatarUrl || '');
                const attachment = new AttachmentBuilder(buffer, { name: `wanted_${nick}.png` });

                // 4. Send to #poszukiwani
                const channel = await interaction.client.channels.fetch(POSZUKIWANI_CHANNEL_ID) as TextChannel;
                if (!channel) {
                    return interaction.editReply({ content: '❌ Nie odnaleziono kanału `#poszukiwani`.' });
                }

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`wanted_finish_${nick}`)
                        .setLabel('ZAKOŃCZ POSZUKIWANIA')
                        .setStyle(ButtonStyle.Danger)
                );

                const posterMsg = await channel.send({
                    content: `🚨 **NOWY LIST GOŃCZY**\nZ polecenia funkcjonariusza <@${interaction.user.id}>`,
                    files: [attachment],
                    components: [row]
                });

                // 5. Save to DB
                await (prisma as any).wantedPerson.create({
                    data: {
                        targetNick: nick,
                        robloxId: robloxId || null,
                        reason: reason,
                        officerDiscordId: interaction.user.id,
                        messageId: posterMsg.id
                    }
                });

                return interaction.editReply({ content: `✅ Pomyślnie wystawiono list gończy za **${nick}** na kanale <#${POSZUKIWANI_CHANNEL_ID}>.` });

            } catch (err) {
                console.error('Wanted error:', err);
                return interaction.editReply({ content: '❌ Wystąpił błąd podczas wystawiania listu gończego.' });
            }
        }

        if (subcommand === 'lista') {
            const wantedList = await (prisma as any).wantedPerson.findMany({
                orderBy: { createdAt: 'desc' }
            });

            if (wantedList.length === 0) {
                return interaction.reply({ content: '📜 Aktualnie nikt nie jest poszukiwany.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('⚖️ Rejestr Osób Poszukiwanych')
                .setColor('#c0392b')
                .setTimestamp();

            const description = wantedList.map((p: any, i: number) => 
                `${i+1}. **${p.targetNick}**\n└ Powód: *${p.reason}*\n└ Wystawił: <@${p.officerDiscordId}>\n`
            ).join('\n');

            embed.setDescription(description);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'usun') {
            const nick = interaction.options.getString('nick', true);

            try {
                const existing = await (prisma as any).wantedPerson.findUnique({ where: { targetNick: nick } });
                if (!existing) {
                    return interaction.reply({ content: `❌ Obywatel **${nick}** nie widnieje na liście poszukiwanych.`, ephemeral: true });
                }

                await (prisma as any).wantedPerson.delete({ where: { targetNick: nick } });

                // Try to notify the channel
                const channel = await interaction.client.channels.fetch(POSZUKIWANI_CHANNEL_ID) as TextChannel;
                if (channel) {
                    await channel.send({ 
                        content: `✅ **SCHWYTANY / WYCOFANY**\nObywatel **${nick}** został usunięty z listy poszukiwanych.`
                    });
                }

                return interaction.reply({ content: `✅ Pomyślnie usunięto **${nick}** z listy poszukiwanych.`, ephemeral: true });

            } catch (err) {
                console.error('Wanted delete error:', err);
                return interaction.reply({ content: '❌ Błąd podczas usuwania z bazy.', ephemeral: true });
            }
        }
    }
};
