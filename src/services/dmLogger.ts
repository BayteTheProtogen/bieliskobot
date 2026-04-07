import { Client, TextChannel, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, EmbedBuilder } from 'discord.js';

export const DM_LOG_CHANNEL_ID = '1490640702135079042';

/**
 * Logs a DM sent by the bot to a dedicated administrative channel.
 * Adds a button to allow admins to delete the original DM.
 */
export async function logBotDM(client: Client, targetUserId: string, sentMessage: Message, type: 'ID_CARD' | 'FINE' | 'UNBAN' | 'ARREST') {
    try {
        const logChannel = await client.channels.fetch(DM_LOG_CHANNEL_ID) as TextChannel;
        if (!logChannel || !logChannel.isTextBased()) return;

        const attachments = Array.from(sentMessage.attachments.values()).map(att => 
            new AttachmentBuilder(att.url, { name: att.name || 'document.png' })
        );

        const logEmbed = new EmbedBuilder()
            .setTitle(`📑 Log wysłanej wiadomości DM (${type})`)
            .setColor(type === 'FINE' ? '#e74c3c' : '#3498db')
            .setDescription(`Wiadomość wysłana do: <@${targetUserId}> (\`${targetUserId}\`)`)
            .addFields({ name: 'Treść', value: sentMessage.content || '_Brak treści tekstowej_' })
            .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`delete_dm|${targetUserId}|${sentMessage.id}`)
                .setLabel('🗑️ Usuń oryginał (DM)')
                .setStyle(ButtonStyle.Danger)
        );

        await logChannel.send({ 
            embeds: [logEmbed], 
            files: attachments, 
            components: [row] 
        });
    } catch (e) {
        console.error('[DM Logger] Failed to log DM:', e);
    }
}
