import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../services/db';
import { getVehicleListPage } from '../utils/vehicleList';

export const rejestracjaAdminCommands = {
    data: new SlashCommandBuilder()
        .setName('rejestracja-adm')
        .setDescription('Zintegrowany panel administracyjny pojazdów')
        .addStringOption(option =>
            option.setName('tablica')
                .setDescription('Numer rejestracyjny pojazdu')
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName('użytkownik')
                .setDescription('Właściciel do sprawdzenia')
                .setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const ownerId = '1490053669830393996';
        const isOwner = interaction.user.id === ownerId || 
                        (interaction.member?.roles && !Array.isArray(interaction.member.roles) && interaction.member.roles.cache.has(ownerId));
        
        if (!isOwner) {
            return interaction.reply({ content: '🚫 Brak dostępu!', ephemeral: true });
        }

        const plate = interaction.options.getString('tablica')?.toUpperCase();
        const target = interaction.options.getUser('użytkownik');

        if (!plate && !target) {
            return interaction.reply({ 
                content: '❓ **Jak używać panelu administracyjnego?**\n\n• `/rejestracja-adm` `tablica:AAA 111` - Zarządzaj konkretnym autem.\n• `/rejestracja-adm` `użytkownik:@Gracz` - Zarządzaj wszystkimi autami gracza.', 
                ephemeral: true 
            });
        }

        if (target) {
            const result = await getVehicleListPage(interaction.user.id, target.id, 0, 'admin_manage');
            return interaction.reply({ ...result, ephemeral: true });
        }

        if (plate) {
            const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });
            if (!vehicle) return interaction.reply({ content: `🚫 Nie znaleziono pojazdu **${plate}**.`, ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle(`⚙️ Zarządzanie: ${vehicle.brand} ${vehicle.model}`)
                .setDescription(`Aktualny status pojazdu o tablicy **${vehicle.plate}**`)
                .addFields(
                    { name: '👤 Właściciel', value: `**${vehicle.ownerName}** (<@${vehicle.ownerId}>)`, inline: true },
                    { name: '📅 Zarejestrowano', value: vehicle.createdAt.toLocaleDateString('pl-PL'), inline: true },
                    { name: '🖼️ Zdjęcie', value: vehicle.imageUrl ? '[Otwórz zdjęcie](' + vehicle.imageUrl + ')' : '❌ Brak zdjęcia', inline: false }
                )
                .setColor('#2c3e50');

            if (vehicle.imageUrl) embed.setThumbnail(vehicle.imageUrl);

            const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`veh_show|${plate}`).setLabel('👁️ Pokaż Dowód').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`admin_veh_edit|${plate}`).setLabel('✏️ Edytuj Dane').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`admin_veh_del_img|${plate}`).setLabel('🖼️ Usuń Zdjęcie').setStyle(ButtonStyle.Secondary)
            );

            const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`admin_veh_usun|${plate}`).setLabel('🗑️ Usuń Pojazd').setStyle(ButtonStyle.Danger)
            );

            return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
        }
    }
};
