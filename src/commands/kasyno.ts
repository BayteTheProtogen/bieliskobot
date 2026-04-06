import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../services/db';

export const kasynoCommand = {
    data: new SlashCommandBuilder()
        .setName('kasyno')
        .setDescription('Zaryzykuj gotówkę ze swojej kieszeni w grach losowych.'),
        
    async execute(interaction: ChatInputCommandInteraction) {
        const discordId = interaction.user.id;
        const citizen = await prisma.citizen.findUnique({ where: { discordId } });

        if (!citizen) {
            return interaction.reply({ content: '🚫 Masz zablokowany wstęp do kasyna - nie posiadasz dowodu osobistego Bieliska.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎰 Kasyno - BieliskoBet')
            .setDescription(`Witamy w podziemnym kasynie! \n\n*Uwaga: Minigry bazują na bilansie Twojej kieszeni.* Posiadasz aktualnie **${citizen.pocket.toLocaleString()} zł** gotówki. Wybierz grę na którą masz ochotę:`)
            .setColor('#f1c40f')
            .setFooter({ text: 'Zawsze graj odpowiedzialnie!' });

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('kasyno_slots')
                    .setLabel('Sloty 🎰')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('kasyno_roulette')
                    .setLabel('Ruletka 🎲')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('kasyno_coinflip')
                    .setLabel('Moneta 🪙')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};
