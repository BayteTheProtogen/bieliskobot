import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, AttachmentBuilder, TextChannel } from 'discord.js';
import { generateRPStopCard } from '../services/canvas';

const HOSTING_CHANNEL_ID = '1490010330888274112';

export const rpStopCommand = {
    data: new SlashCommandBuilder()
        .setName('rp-stop')
        .setDescription('Ogłasza zakończenie bieżącej sesji RolePlay.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        const dateStr = new Date().toLocaleString('pl-PL', { 
            hour: '2-digit', 
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Europe/Warsaw'
        });

        try {
            // 1. Generate Graphic
            const cardBuffer = await generateRPStopCard(dateStr);
            const attachment = new AttachmentBuilder(cardBuffer, { name: 'rp-stop.png' });

            // 2. Send to hosting channel
            const channel = await interaction.client.channels.fetch(HOSTING_CHANNEL_ID).catch(() => null) as TextChannel;
            
            if (channel) {
                await channel.send({
                    content: `🏁 **SESJA ROLEPLAY ZAKOŃCZONA**\nZakończona przez: <@${interaction.user.id}>\nData: **${dateStr}**\n\n@everyone`,
                    files: [attachment]
                });

                await interaction.editReply({ content: '✅ Zakończenie sesji zostało ogłoszone!' });
            } else {
                await interaction.editReply({ content: '❌ Nie znaleziono kanału ogłoszeniowego.' });
            }

        } catch (err) {
            console.error('Error in rpStopCommand:', err);
            await interaction.editReply({ content: '❌ Wystąpił błąd podczas generowania ogłoszenia.' });
        }
    }
};
