import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, AttachmentBuilder, TextChannel } from 'discord.js';
import { generateRPStartCard } from '../services/canvas';

const HOSTING_CHANNEL_ID = '1490010330888274112';

export const rpStartCommand = {
    data: new SlashCommandBuilder()
        .setName('rp-start')
        .setDescription('Ogłasza rozpoczęcie sesji RolePlay.')
        .addStringOption(option => 
            option.setName('miejsce')
                .setDescription('Miejsce zbiórki (np. Urząd miasta)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('informacja')
                .setDescription('Dodatkowe informacje o sesji')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        const location = interaction.options.getString('miejsce') || 'Bielisko (Centrum)';
        const info = interaction.options.getString('informacja') || 'Zapraszamy do wspólnej gry!';
        const hostName = interaction.user.username;
        const dateStr = new Date().toLocaleString('pl-PL', { 
            hour: '2-digit', 
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        try {
            // 1. Generate Graphic
            const cardBuffer = await generateRPStartCard({
                hostName,
                location,
                info,
                date: dateStr
            });

            const attachment = new AttachmentBuilder(cardBuffer, { name: 'rp-start.png' });

            // 2. Send to hosting channel
            const channel = await interaction.client.channels.fetch(HOSTING_CHANNEL_ID).catch(() => null) as TextChannel;
            
            if (channel) {
                await channel.send({
                    content: `🔔 **NOWA SESJA ROLEPLAY!**\nHost: <@${interaction.user.id}>\nMiejsce: **${location}**\n\n${info}\n\n@everyone`,
                    files: [attachment]
                });

                await interaction.editReply({ content: '✅ Sesja została ogłoszona pomyślnie!' });
            } else {
                await interaction.editReply({ content: '❌ Nie znaleziono kanału ogłoszeniowego.' });
            }

        } catch (err) {
            console.error('Error in rpStartCommand:', err);
            await interaction.editReply({ content: '❌ Wystąpił błąd podczas generowania ogłoszenia.' });
        }
    }
};
