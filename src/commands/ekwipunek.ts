import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { prisma } from '../services/db';

export const ekwipunekCommands = {
    data: new SlashCommandBuilder()
        .setName('ekwipunek')
        .setDescription('Sprawdź swoje nabyte przedmioty, licencje i ubezpieczenia.'),

    async execute(interaction: ChatInputCommandInteraction) {
        const discordId = interaction.user.id;
        
        await interaction.deferReply();

        const citizen = await prisma.citizen.findUnique({ where: { discordId } });
        if (!citizen) {
            return interaction.editReply({ content: '🚫 Nie posiadasz dowodu osobistego, a zatem nie figurujesz w systemie jako obywatel.' });
        }

        const items = await prisma.inventory.findMany({ 
            where: { discordId },
            orderBy: { createdAt: 'desc' }
        });

        if (items.length === 0) {
            const emptyEmbed = new EmbedBuilder()
                .setTitle(`🎒 Ekwipunek: ${citizen.firstName} ${citizen.lastName}`)
                .setDescription('Twój ekwipunek jest obecnie pusty. Udaj się do `/sklep`, aby zakupić przedmioty.')
                .setColor('#95a5a6');
            return interaction.editReply({ embeds: [emptyEmbed] });
        }

        const now = new Date();
        const activeItems = [];
        const expiredItems = [];

        // Filtrowanie wygasłych ubezpieczeń
        for (const item of items) {
            if (item.expiresAt && item.expiresAt < now) {
                expiredItems.push(item);
                // Systematyczne usuwanie wygasięć z DB jeśli tak wolimy, poniżej można dodać:
                // await prisma.inventory.delete({ where: { id: item.id } });
            } else {
                activeItems.push(item);
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎒 Ekwipunek: ${citizen.firstName} ${citizen.lastName}`)
            .setColor('#3498db')
            .setFooter({ text: 'RP Bielisko - Ekwipunek Obywatela' })
            .setTimestamp();

        // Grupowanie przedmiotów według kategorii
        const documents = activeItems.filter(i => i.type === 'LICENSE');
        const weapons = activeItems.filter(i => i.type === 'WEAPON');
        const tools = activeItems.filter(i => i.type === 'TOOL');
        const insurances = activeItems.filter(i => i.type === 'INSURANCE');

        if (documents.length > 0) {
            embed.addFields({
                name: '📄 Licencje i Dokumenty',
                value: documents.map(d => `• **${d.itemName}**`).join('\n')
            });
        }
        if (weapons.length > 0) {
            embed.addFields({
                name: '🔫 Broń',
                value: weapons.map(d => `• **${d.itemName}**`).join('\n')
            });
        }
        if (tools.length > 0) {
            embed.addFields({
                name: '🛠️ Narzędzia',
                value: tools.map(d => `• **${d.itemName}**`).join('\n')
            });
        }
        if (insurances.length > 0) {
            embed.addFields({
                name: '🏥 Ubezpieczenia',
                value: insurances.map(d => {
                    const expires = d.expiresAt ? `<t:${Math.floor(d.expiresAt.getTime() / 1000)}:R>` : 'Brak danych';
                    return `• **${d.itemName}** (Ważne ${expires})`;
                }).join('\n')
            });
        }

        if (expiredItems.length > 0) {
            embed.addFields({
                name: '❌ Wygasłe',
                value: `Twój czas ochrony niektórych ubezpieczeń minął (usunięto ${expiredItems.length} wpisów).`
            });

            // Usuwamy wygasłe od razu z bazy, by nie zaśmiecały
            const idsToDelete = expiredItems.map(i => i.id);
            await prisma.inventory.deleteMany({ where: { id: { in: idsToDelete } } });
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
