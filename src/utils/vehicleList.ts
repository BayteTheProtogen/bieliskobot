import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../services/db';

export type VehicleListType = 'show' | 'popraw' | 'admin_usun' | 'admin_manage';

export async function getVehicleListPage(userId: string, targetId: string, page: number = 0, type: VehicleListType = 'show') {
    const itemsPerPage = 8; // Fewer items per page to accommodate more buttons
    const totalVehicles = await (prisma as any).vehicle.count({ where: { ownerId: targetId } });
    const totalPages = Math.ceil(totalVehicles / itemsPerPage);
    
    const vehicles = await (prisma as any).vehicle.findMany({
        where: { ownerId: targetId },
        skip: page * itemsPerPage,
        take: itemsPerPage,
        orderBy: { createdAt: 'desc' }
    });

    const isOwn = userId === targetId;
    
    let title = '📋 Lista Pojazdów';
    let color = '#3498db';
    let description = 'Wybierz pojazd z listy poniżej.';

    if (type === 'popraw') {
        title = '📝 Wybierz Pojazd do Poprawy';
        color = '#0984e3';
    } else if (type === 'admin_usun') {
        title = '🗑️ Zarządzanie Autami (Admin)';
        color = '#e74c3c';
        description = `Wybierz pojazd użytkownika <@${targetId}> do usunięcia.`;
    } else if (type === 'admin_manage') {
        title = '⚙️ Panel Zarządzania (Admin)';
        color = '#2c3e50';
        description = `Zarządzaj pojazdami użytkownika <@${targetId}>.`;
    } else if (!isOwn) {
        title = `🚗 Pojazdy Obywatela`;
        color = '#f1c40f';
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`${description}\nStrona **${page + 1}** z **${totalPages}** (Suma: **${totalVehicles}**)`)
        .setColor(color as any);

    if (type === 'show' || type === 'admin_manage') {
        embed.addFields(
            vehicles.map((v: any) => ({
                name: `${v.brand} ${v.model} (**${v.plate}**)`,
                value: `Data: \`${v.createdAt.toLocaleDateString('pl-PL')}\`${v.imageUrl ? ' | 🖼️ Ma zdjęcie' : ' | ❌ Brak zdjęcia'}`,
                inline: true
            }))
        );
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();

    for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        
        if (type === 'admin_manage') {
            // Admin manage gets 2 buttons per car: Show and Manage
            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`veh_show|${v.plate}`)
                    .setLabel(`🔍 ${v.plate}`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`admin_veh_panel|${v.plate}`)
                    .setLabel(`⚙️`)
                    .setStyle(ButtonStyle.Primary)
            );
        } else {
            let customId = `veh_show|${v.plate}`;
            let label = `🔍 ${v.plate}`;
            let style = ButtonStyle.Secondary;

            if (type === 'popraw') {
                customId = `veh_popraw_list|${v.plate}`;
                label = `📝 ${v.plate}`;
                style = ButtonStyle.Primary;
            } else if (type === 'admin_usun') {
                customId = `admin_veh_usun|${v.plate}`;
                label = `🗑️ ${v.plate}`;
                style = ButtonStyle.Danger;
            }

            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel(label)
                    .setStyle(style)
            );
        }

        // Limit row size: 5 components max. 
        // For admin_manage we use 2, so 2 cars per row = 4 buttons.
        const rowLimit = type === 'admin_manage' ? 4 : 4;
        if (currentRow.components.length >= rowLimit || i === vehicles.length - 1) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder<ButtonBuilder>();
        }
    }

    // Navigation Row
    if (totalPages > 1) {
        const navRow = new ActionRowBuilder<ButtonBuilder>();
        
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`veh_page|${targetId}|${page - 1}|${type}`)
                .setLabel('⬅️ Poprzednia')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`veh_page|${targetId}|${page + 1}|${type}`)
                .setLabel('Następna ➡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        );
        
        rows.push(navRow);
    }

    return { embeds: [embed], components: rows };
}
