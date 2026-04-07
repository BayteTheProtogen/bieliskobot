import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../services/db';
import { getVehicleListPage } from '../utils/vehicleList';

export const rejestracjaAdminCommands = {
    data: new SlashCommandBuilder()
        .setName('ra-pojazd')
        .setDescription('Narzędzia administracyjne dla pojazdów')
        .addSubcommand(subcommand =>
            subcommand
                .setName('usun')
                .setDescription('Usuń rejestrację pojazdu (Wyrejestruj)')
                .addStringOption(option =>
                    option.setName('tablica')
                        .setDescription('Numer rejestracyjny pojazdu')
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option.setName('użytkownik')
                        .setDescription('Właściciel pojazdu do usunięcia')
                        .setRequired(false)
                ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('profil')
                .setDescription('Sprawdź profil zarejestrowanych aut użytkownika')
                .addUserOption(option =>
                    option.setName('użytkownik')
                        .setDescription('Osoba do sprawdzenia')
                        .setRequired(true)
                )),

    async execute(interaction: ChatInputCommandInteraction) {
        const ownerId = '1490053669830393996';
        const isOwner = interaction.user.id === ownerId || 
                        (interaction.member?.roles && !Array.isArray(interaction.member.roles) && interaction.member.roles.cache.has(ownerId));
        
        if (!isOwner) {
            return interaction.reply({ content: '🚫 Brak dostępu!', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'usun') {
            const plate = interaction.options.getString('tablica')?.toUpperCase();
            const target = interaction.options.getUser('użytkownik');

            if (!plate && !target) {
                return interaction.reply({ content: '🚫 Podaj tablicę lub osobę!', ephemeral: true });
            }

            if (target) {
                const result = await getVehicleListPage(interaction.user.id, target.id, 0, 'admin_usun');
                return interaction.reply({ ...result, ephemeral: true });
            }

            if (plate) {
                const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });
                if (!vehicle) return interaction.reply({ content: `🚫 Nie znaleziono: **${plate}**.`, ephemeral: true });

                await (prisma as any).vehicle.delete({ where: { plate } });
                return interaction.reply({ 
                    content: `🗑️ Usunięto pojazd: **${vehicle.brand} ${vehicle.model}** (**${plate}**)`,
                    ephemeral: true 
                });
            }
            return;
        }

        if (subcommand === 'profil') {
            const target = interaction.options.getUser('użytkownik', true);
            const result = await getVehicleListPage(interaction.user.id, target.id, 0, 'show');
            return interaction.reply({ ...result, ephemeral: true });
        }
    }
};
