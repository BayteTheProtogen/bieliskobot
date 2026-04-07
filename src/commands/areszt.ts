import { SlashCommandBuilder, ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export const aresztCommand = {
    data: new SlashCommandBuilder()
        .setName('areszt')
        .setDescription('Wystaw nakaz osadzenia w więzieniu obywatela'),

    async execute(interaction: ChatInputCommandInteraction) {
        // Zabezpieczenie role (np odznaka LEO: 1490253667910029412) tak samo jak przy mandacie
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        if (!member?.roles.cache.has('1490253667910029412')) {
            return interaction.reply({ content: '🚫 Nie masz uprawnień (odpowiedniej odznaki), aby zamykać ludzi w więzieniu!', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId('areszt_modal')
            .setTitle('Oświadczenie Osadzenia');

        const targetInput = new TextInputBuilder()
            .setCustomId('targetNick')
            .setLabel('Nick Roblox obywatela')
            .setPlaceholder('Wpisz nick osadzanego')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const reasonInput = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Powód aresztu (Wyrok)')
            .setPlaceholder('Np. Posiadanie broni długiej, Ucieczka przed LEO...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const timeInput = new TextInputBuilder()
            .setCustomId('time')
            .setLabel('Czas odsiadki (W miesiącach / minutach)')
            .setPlaceholder('Same cyfry, np. 15')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(targetInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput)
        );

        await interaction.showModal(modal);
    }
};
