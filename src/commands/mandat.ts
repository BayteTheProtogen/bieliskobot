import { SlashCommandBuilder, ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export const mandatCommand = {
    data: new SlashCommandBuilder()
        .setName('mandat')
        .setDescription('Wystaw mandat lub pouczenie obywatelowi'),

    async execute(interaction: ChatInputCommandInteraction) {
        // Role check (1490253667910029412)
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        if (!member?.roles.cache.has('1490253667910029412')) {
            return interaction.reply({ content: '🚫 Nie masz uprawnień (odpowiedniej odznaki), aby wystawiać mandaty!', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId('mandat_modal')
            .setTitle('Wystawianie Mandatu');

        const targetInput = new TextInputBuilder()
            .setCustomId('targetNick')
            .setLabel('Nick Roblox obywatela')
            .setPlaceholder('Wpisz nick osoby, która popełniła wykroczenie')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const reasonInput = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Powód wystawienia')
            .setPlaceholder('Np. Przekroczenie prędkości, brak dokumentów...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Kwota mandatu (0 = pouczenie)')
            .setPlaceholder('Sama liczba, np. 500')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(targetInput);
        const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
        const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);

        modal.addComponents(row1, row2, row3);

        await interaction.showModal(modal);
    }
};
