import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';

const ECONOMY_CHANNEL_ID = '1490011312669855904'; 

export const sklepCommands = {
    data: new SlashCommandBuilder()
        .setName('sklep')
        .setDescription('Otwiera okno miejskiego sklepu, w którym można kupić dokumenty, broń oraz narzędzia.'),

    async execute(interaction: ChatInputCommandInteraction) {
        if (interaction.channelId !== ECONOMY_CHANNEL_ID) {
             return interaction.reply({ content: `🚫 Komendy sklepu można używać wyłącznie na kanale ds. ekonomii (<#${ECONOMY_CHANNEL_ID}>).`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🛒 Sklep Wielobranżowy Bielisko')
            .setDescription('Witaj! Wybierz kategorię asortymentu z menu poniżej, aby przeglądać i kupować przedmioty.\nPamiętaj, że wszystkie wpłacone środki nie podlegają zwrotowi.')
            .setColor('#f1c40f')
            .addFields(
                { name: '📄 Legalne', value: 'Dokumenty, licencje, ubezpieczenia.', inline: true },
                { name: '🔫 Broń', value: 'Broń palna i biała (Wymaga pozwolenia RP).', inline: true },
                { name: '🛠️ Narzędzia', value: 'Wytrychy, noże do szkła i inne narzędzia.', inline: true }
            )
            .setFooter({ text: 'RP Bielisko - System Sklepu' });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('shop_category_select')
            .setPlaceholder('Wybierz dział sklepu...')
            .addOptions([
                {
                    label: 'Dokumenty i Ubezpieczenia',
                    description: 'Kup licencje takie jak prawo jazdy, oraz ubezpieczenia.',
                    value: 'cat_legal',
                    emoji: '📄'
                },
                {
                    label: 'Sklep z Bronią',
                    description: 'Przeglądaj ofertę broni (Tylko dla certyfikowanych).',
                    value: 'cat_weapons',
                    emoji: '🔫'
                },
                {
                    label: 'Narzędzia i akcesoria',
                    description: 'Sprzęt różnego przeznaczenia (Lockpicki itp.).',
                    value: 'cat_tools',
                    emoji: '🛠️'
                }
            ]);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};
