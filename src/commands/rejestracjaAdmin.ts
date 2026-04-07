import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../services/db';

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
                        .setRequired(true)
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
        // Owner/Admin role check
        const ownerId = '1490053669830393996';
        const isOwner = interaction.user.id === ownerId || 
                        (interaction.member?.roles && !Array.isArray(interaction.member.roles) && interaction.member.roles.cache.has(ownerId));
        
        if (!isOwner) {
            return interaction.reply({ content: '🚫 Brak dostępu do poleceń administracyjnych!', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'usun') {
            const plate = interaction.options.getString('tablica', true).toUpperCase();
            const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });

            if (!vehicle) {
                return interaction.reply({ content: `🚫 Nie znaleziono pojazdu o numerze rejestracyjnym: **${plate}**.`, ephemeral: true });
            }

            await (prisma as any).vehicle.delete({ where: { plate } });

            return interaction.reply({ 
                content: `🗑️ Wyrejestrowano i usunięto pojazd: **${vehicle.brand} ${vehicle.model}** (TAB: **${plate}**)\nWłaściciel: **${vehicle.ownerName}**`,
                ephemeral: true 
            });
        }

        if (subcommand === 'profil') {
            const target = interaction.options.getUser('użytkownik', true);
            const vehicles = await (prisma as any).vehicle.findMany({ where: { ownerId: target.id } });

            if (vehicles.length === 0) {
                return interaction.reply({ content: `Obywatel <@${target.id}> nie posiada żadnych zarejestrowanych pojazdów.`, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(`🚗 Profil Aut: ${target.username}`)
                .setDescription(`Wszystkie zarejestrowane pojazdy dla użytkownika <@${target.id}>`)
                .setColor('#f1c40f')
                .addFields(
                    vehicles.map((v: any) => ({
                        name: `${v.brand} ${v.model} (${v.plate})`,
                        value: `ID: \`${v.id}\` | Data: ${v.createdAt.toLocaleDateString('pl-PL')}`,
                        inline: false
                    }))
                );

            const rows = [];
            let currentRow = new ActionRowBuilder<ButtonBuilder>();
            for (let i = 0; i < vehicles.length; i++) {
                currentRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`veh_show|${vehicles[i].plate}`)
                        .setLabel(`Dowód ${vehicles[i].plate}`)
                        .setStyle(ButtonStyle.Secondary)
                );
                if (currentRow.components.length === 5 || i === vehicles.length - 1) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder<ButtonBuilder>();
                }
            }

            await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
        }
    }
};
