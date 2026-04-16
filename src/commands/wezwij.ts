import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { prisma } from '../services/db';
import { executeERLCCommand } from '../services/erlc';
import { generateSummonsCard } from '../services/canvas';

const CALL_CHANNEL_ID = '1490073424779804873';
const VC_CHANNEL_ID = '1492547567626752140';
const LOG_WWW_CHANNEL = '1490076757955575849';
const OWNER_ROLE_ID = '1490053669830393996';

export const wezwijCommand = {
    data: new SlashCommandBuilder()
        .setName('wezwij')
        .setDescription('Oficjalne wezwanie gracza na kanał głosowy (VC).')
        .addStringOption(option => 
            option.setName('gracz')
                .setDescription('Nick gracza w grze Roblox')
                .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        // 1. Permission Check
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || 
                        (interaction.member?.roles as any)?.cache?.has(OWNER_ROLE_ID);

        if (!isAdmin) {
            return interaction.reply({ content: '🚫 Ta komenda jest zarezerwowana dla Administracji!', ephemeral: true });
        }

        // 2. Channel Check
        if (interaction.channelId !== CALL_CHANNEL_ID) {
            return interaction.reply({ content: `🚫 Tej komendy można używać wyłącznie na kanale <#${CALL_CHANNEL_ID}>!`, ephemeral: true });
        }

        const targetNick = interaction.options.getString('gracz', true);
        await interaction.deferReply({ ephemeral: false });

        try {
            // 3. ERLC PM
            const erlcMsg = `Wezwanie od Administracji! Masz 5 min na wejscie na VC na decek. Brak stawiennictwa = BAN.`;
            const erlcResult = await executeERLCCommand(`:pm ${targetNick} ${erlcMsg}`);

            // 4. Discord DM & Graphic
            let dmStatus = 'Nie znaleziono konta Discord (brak DM)';
            let avatarUrl: string | null = null;

            const citizen = await (prisma as any).citizen.findFirst({
                where: { robloxNick: { equals: targetNick, mode: 'insensitive' } }
            });

            if (citizen) {
                const targetUser = await interaction.client.users.fetch(citizen.discordId).catch(() => null);
                if (targetUser) {
                    avatarUrl = targetUser.displayAvatarURL({ size: 256, extension: 'png' });
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ OFICJALNE WEZWANIE')
                        .setDescription(`Zostałeś wezwany przez administratora **${interaction.user.username}**!\n\nMasz **5 minut** na dołączenie do kanału głosowego. BRAK STAWINNICTWA MOŻE SKUTKOWAĆ BANEM.`)
                        .setColor('#e74c3c')
                        .setTimestamp();

                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setLabel('DOŁĄCZ DO KANAŁU VC')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://discord.com/channels/${interaction.guildId}/${VC_CHANNEL_ID}`)
                    );

                    try {
                        const sentMsg = await targetUser.send({ embeds: [embed], components: [row] });
                        const { logBotDM } = require('../services/dmLogger');
                        await logBotDM(interaction.client, citizen.discordId, sentMsg, 'SUMMON');
                        dmStatus = '✅ Wysłano DM na Discordzie';
                    } catch (dmErr) {
                        dmStatus = '❌ Zablokowane wiadomości DM';
                    }
                }
            }

            // 5. Generate Procedural Graphic
            const cardBuffer = await generateSummonsCard({
                targetNick: targetNick,
                adminName: interaction.user.username,
                date: new Date().toLocaleString('pl-PL'),
                avatarUrl: avatarUrl
            });
            const attachment = new AttachmentBuilder(cardBuffer, { name: 'wezwanie.png' });

            // 6. Logging
            const logChannel = await interaction.client.channels.fetch(LOG_WWW_CHANNEL).catch(() => null);
            if (logChannel && logChannel.isTextBased()) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('📢 Wezwanie gracza')
                    .setDescription(`Administrator **${interaction.user.username}** wezwał gracza **${targetNick}**.`)
                    .addFields(
                        { name: 'Gra (PM)', value: erlcResult.success ? '✅ Wysłano' : `❌ Błąd: ${erlcResult.error}`, inline: true },
                        { name: 'Discord (DM)', value: dmStatus, inline: true }
                    )
                    .setColor('#f1c40f')
                    .setTimestamp();
                await (logChannel as any).send({ embeds: [logEmbed] });
            }

            const mention = citizen ? `<@${citizen.discordId}>` : `**${targetNick}**`;
            await interaction.editReply({ 
                content: `🔔 **OFICJALNE WEZWANIE OBYWATELA ${mention}**\nERLC: ${erlcResult.success ? '✅' : '❌ ' + erlcResult.error}\nDiscord: ${dmStatus}`,
                files: [attachment]
            });

        } catch (err: any) {
            console.error('Error in wezwijCommand:', err);
            await interaction.editReply({ content: '❌ Wystąpił błąd podczas procesowania wezwania.' });
        }
    }
};
