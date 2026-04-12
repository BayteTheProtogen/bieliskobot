import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuInteraction, StringSelectMenuInteraction, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { prisma } from '../services/db';
import { generateIDCard, generateFineCard, generateArrestCard, generateVehicleCard, generateReceiptCard } from '../services/canvas';
import { getVehicleListPage, VehicleListType } from '../utils/vehicleList';
import { getAvatarBust, getUserInfo } from '../services/roblox';
import { logBotDM } from '../services/dmLogger';
import { getItemsByCategory, getItemById } from '../data/shopData';
import { detectVehicle } from '../services/vision';

export async function handleInteractions(interaction: Interaction) {
    try {
        if (interaction.isUserSelectMenu()) {
            if (interaction.customId === 'admin_select_uniewaznij') {
                const targetDiscordId = interaction.values[0];
                const citizen = await prisma.citizen.findUnique({ where: { discordId: targetDiscordId } });

                if (!citizen) {
                    return interaction.reply({ content: '🚫 Ten użytkownik nie posiada wyrobionego dowodu osobistego w bazie.', ephemeral: true });
                }

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`owner_confirm_uniewaznij|${targetDiscordId}`)
                        .setLabel(`🔴 Potwierdzam: Unieważnij dowód ${citizen.firstName} ${citizen.lastName}`)
                        .setStyle(ButtonStyle.Danger)
                );

                await interaction.reply({
                    content: `### 🛠️ Administracyjne unieważnienie\nWybrano obywatela: **${citizen.firstName} ${citizen.lastName}** (@${citizen.robloxNick})\nCzy na pewno chcesz natychmiastowo unieważnić jego dokumenty?`,
                    components: [row],
                    ephemeral: true
                });
                return;
            }

            if (interaction.customId === 'admin_select_pokaz') {
                const targetDiscordId = interaction.values[0];
                await interaction.deferReply({ ephemeral: true });

                const citizen = await prisma.citizen.findUnique({ where: { discordId: targetDiscordId } });

                if (!citizen) {
                    return interaction.editReply({ content: '🚫 Ten użytkownik nie posiada wyrobionego dowodu osobistego.' });
                }

                try {
                    const avatarBustUrl = await getAvatarBust(citizen.robloxId);
                    const buffer = await generateIDCard(citizen, avatarBustUrl || '');
                    const attachment = new AttachmentBuilder(buffer, { name: 'dowod.png' });

                    await interaction.editReply({
                        content: `### 🪪 Podgląd dowodu: ${citizen.firstName} ${citizen.lastName}\nOto aktualny dokument obywatela:`,
                        files: [attachment]
                    });
                } catch (e) {
                    await interaction.editReply({ content: 'Wystąpił błąd podczas generowania dowodu.' });
                }
                return;
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'shop_category_select') {
                await interaction.deferReply({ ephemeral: true });
                
                const selectedCategory = interaction.values[0].replace('cat_', '');
                if (!['legal', 'weapons', 'tools'].includes(selectedCategory)) {
                    return interaction.editReply({ content: 'Nieznana kategoria.' });
                }

                const items = getItemsByCategory(selectedCategory as 'legal' | 'weapons' | 'tools');
                
                if (items.length === 0) {
                    return interaction.editReply({ content: 'Ta kategoria jest obecnie pusta.' });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`🛍️ Oferta Sklepu`)
                    .setDescription('Oto dostępne przedmioty w tej sekcji. Pamiętaj, aby upewnić się, że posiadasz odpowiednie uprawnienia RP do posiadania niektórych przedmiotów (np. broni).')
                    .setColor('#f1c40f');

                const components: ActionRowBuilder<ButtonBuilder>[] = [];
                
                // Max 5 buttons per ActionRow, Discord limit is 5 ActionRows per message (25 items max)
                let currentRow = new ActionRowBuilder<ButtonBuilder>();
                
                items.forEach((item, index) => {
                    embed.addFields({
                        name: `${item.name} - ${item.price.toLocaleString()} zł`,
                        value: item.description,
                        inline: false
                    });

                    currentRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`shop_buy|${item.id}`)
                            .setLabel(`Kup ${item.name}`)
                            .setStyle(ButtonStyle.Success)
                    );

                    if ((index + 1) % 5 === 0 || index === items.length - 1) {
                        components.push(currentRow);
                        currentRow = new ActionRowBuilder<ButtonBuilder>();
                    }
                });

                await interaction.editReply({ embeds: [embed], components });
                return;
            }

            if (interaction.customId.startsWith('admin_shop_add_select|')) {
                const targetDiscordId = interaction.customId.split('|')[1];
                const selectedItemId = interaction.values[0];
                await interaction.deferUpdate();

                const citizen = await prisma.citizen.findUnique({ where: { discordId: targetDiscordId } });
                if (!citizen) return interaction.editReply({ content: 'Błąd bazy - nie znaleziono użytkownika.', embeds: [], components: [] });

                const item = getItemById(selectedItemId);
                if (!item) return interaction.editReply({ content: 'Przedmiot nie istnieje w bazie.', embeds: [], components: [] });

                // Check duplicates for unique items
                if (item.type === 'LICENSE' || item.type === 'WEAPON' || item.type === 'TOOL') {
                    const hasItem = await prisma.inventory.findFirst({ where: { discordId: targetDiscordId, itemKey: item.id } });
                    if (hasItem) return interaction.editReply({ content: `🚫 Obywatel posiada już ten przedmiot.`, embeds: [], components: [] });
                }

                let expiresAt: Date | undefined = undefined;
                if (item.type === 'INSURANCE' && item.durationHours) {
                    const now = new Date();
                    expiresAt = new Date(now.getTime() + item.durationHours * 60 * 60 * 1000);
                }

                await prisma.inventory.create({
                    data: {
                        discordId: targetDiscordId,
                        itemKey: item.id,
                        itemName: item.name,
                        type: item.type,
                        roleId: item.roleId,
                        expiresAt: expiresAt
                    }
                });

                if (item.roleId && interaction.guild) {
                    try {
                        const member = await interaction.guild.members.fetch(targetDiscordId);
                        if (member && !member.roles.cache.has(item.roleId)) {
                            await member.roles.add(item.roleId);
                        }
                    } catch (e) { console.error('Błąd Roli AdminAdd:', e); }
                }

                try {
                    const targetUser = await interaction.client.users.fetch(targetDiscordId);
                    if (targetUser) await targetUser.send(`🎁 **Administracja Obywatelstwa** nadała Ci nowy przedmiot: **${item.name}**.`);
                } catch (dmErr) { console.error('Nie udało się wysłać DM (Sklep Dodaj):', dmErr); }
                return interaction.editReply({ content: `✅ Pomyślnie dodano **${item.name}** do ekwipunku gracza <@${targetDiscordId}>.`, components: [] });
            }

            if (interaction.customId.startsWith('admin_shop_remove_select|')) {
                const targetDiscordId = interaction.customId.split('|')[1];
                const selectedRecordId = parseInt(interaction.values[0], 10);
                await interaction.deferUpdate();

                const inventoryRecord = await prisma.inventory.findUnique({ where: { id: selectedRecordId } });
                if (!inventoryRecord || inventoryRecord.discordId !== targetDiscordId) {
                    return interaction.editReply({ content: '🚫 Rekord nie istnieje lub nie należy do gracza.', embeds: [], components: [] });
                }

                await prisma.inventory.delete({ where: { id: selectedRecordId } });

                if (inventoryRecord.roleId && interaction.guild) {
                    try {
                        const member = await interaction.guild.members.fetch(targetDiscordId);
                        if (member && member.roles.cache.has(inventoryRecord.roleId)) {
                            await member.roles.remove(inventoryRecord.roleId);
                        }
                    } catch (e) { console.error('Błąd Roli AdminRemove:', e); }
                }

                try {
                    const targetUser = await interaction.client.users.fetch(targetDiscordId);
                    if (targetUser) await targetUser.send(`➖ **Administracja Obywatelstwa** usunęła przedmiot z Twojego ekwipunku: **${inventoryRecord.itemName}**.`);
                } catch (dmErr) { console.error('Nie udało się wysłać DM (Sklep Usuń):', dmErr); }
                return interaction.editReply({ content: `✅ Pomyślnie zabrano **${inventoryRecord.itemName}** z ekwipunku gracza <@${targetDiscordId}>.`, components: [] });
            }
        }

        if (interaction.isButton()) {
            const { customId } = interaction;

            // Handlery kartoteki (wanted_toggle, add_note, clear_req, clear_execute) tymczasowo usunięte.
            
            if (customId.startsWith('veh_form|')) {
                const pendingId = customId.split('|')[1];
                const modal = new ModalBuilder()
                    .setCustomId(`veh_registration_modal|${pendingId}`)
                    .setTitle('Dane Pojazdu');

                const brandInput = new TextInputBuilder()
                    .setCustomId('brand')
                    .setLabel('Marka Pojazdu')
                    .setPlaceholder('Np. BMW, Audi...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const modelInput = new TextInputBuilder()
                    .setCustomId('model')
                    .setLabel('Model Pojazdu')
                    .setPlaceholder('Np. M5, A6...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(brandInput),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(modelInput)
                );

                await interaction.showModal(modal);
                return;
            }

            if (customId.startsWith('veh_show|')) {
                const plate = customId.split('|')[1];
                await interaction.deferReply({ ephemeral: true });

                const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });
                if (!vehicle) {
                    return interaction.editReply({ content: '🚫 Nie znaleziono danych tego pojazdu.' });
                }

                try {
                    const buffer = await generateVehicleCard({
                        ownerName: vehicle.ownerName,
                        brand: vehicle.brand,
                        model: vehicle.model,
                        plate: vehicle.plate,
                        issuedAt: vehicle.createdAt.toLocaleDateString('pl-PL'),
                        carImageUrl: vehicle.imageUrl
                    });
                    const attachment = new AttachmentBuilder(buffer, { name: `dowod_${plate}.png` });
                    await interaction.editReply({ files: [attachment] });
                } catch (e) {
                    await interaction.editReply({ content: 'Błąd generowania dokumentu.' });
                }
                return;
            }

            if (customId.startsWith('veh_popraw_list|')) {
                const plate = customId.split('|')[1];
                const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });
                
                if (!vehicle) return interaction.reply({ content: '🚫 Pojazd nie istnieje.', ephemeral: true });

                const modal = {
                    title: `Korekta: ${plate}`,
                    custom_id: `veh_correction_modal|${plate}`,
                    components: [
                        {
                            type: 1,
                            components: [
                                {
                                    type: 4,
                                    custom_id: 'brand',
                                    label: 'Nowa Marka',
                                    style: 1,
                                    value: vehicle.brand,
                                    required: true
                                }
                            ]
                        },
                        {
                            type: 1,
                            components: [
                                {
                                    type: 4,
                                    custom_id: 'model',
                                    label: 'Nowy Model',
                                    style: 1,
                                    value: vehicle.model,
                                    required: true
                                }
                            ]
                        }
                    ]
                };

                await interaction.showModal(modal as any);
                return;
            }

            if (customId.startsWith('admin_veh_usun|')) {
                const plate = customId.split('|')[1];
                const OWNER_ROLE_ID = '1490053669830393996';
                const isOwner = interaction.user.id === OWNER_ROLE_ID || 
                                (interaction.member?.roles && !Array.isArray(interaction.member.roles) && interaction.member.roles.cache.has(OWNER_ROLE_ID));
                
                if (!isOwner) return interaction.reply({ content: '🚫 Brak dostępu.', ephemeral: true });

                const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });
                if (!vehicle) return interaction.reply({ content: '🚫 Pojazd już nie istnieje.', ephemeral: true });

                await (prisma as any).vehicle.delete({ where: { plate } });
                await interaction.reply({ content: `🗑️ Wyrejestrowano i usunięto pojazd: **${vehicle.brand} ${vehicle.model}** (**${plate}**).`, ephemeral: true });
                return;
            }

            if (customId.startsWith('admin_veh_panel|')) {
                const plate = customId.split('|')[1];
                const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });
                if (!vehicle) return interaction.reply({ content: '🚫 Nie znaleziono pojazdu.', ephemeral: true });

                const embed = new EmbedBuilder()
                    .setTitle(`⚙️ Zarządzanie: ${vehicle.brand} ${vehicle.model}`)
                    .setDescription(`Panel administracyjny dla tablicy **${vehicle.plate}**`)
                    .addFields(
                        { name: '👤 Właściciel', value: `**${vehicle.ownerName}** (<@${vehicle.ownerId}>)`, inline: true },
                        { name: '📅 Zarejestrowano', value: vehicle.createdAt.toLocaleDateString('pl-PL'), inline: true },
                        { name: '🖼️ Zdjęcie', value: vehicle.imageUrl ? '[Otwórz zdjęcie](' + vehicle.imageUrl + ')' : '❌ Brak zdjęcia', inline: false }
                    )
                    .setColor('#2c3e50');

                if (vehicle.imageUrl) embed.setThumbnail(vehicle.imageUrl);

                const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId(`veh_show|${plate}`).setLabel('👁️ Dowód').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`admin_veh_edit|${plate}`).setLabel('✏️ Edytuj').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`admin_veh_del_img|${plate}`).setLabel('🖼️ Usuń Foto').setStyle(ButtonStyle.Secondary)
                );

                const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId(`admin_veh_usun|${plate}`).setLabel('🗑️ Usuń Auto').setStyle(ButtonStyle.Danger)
                );

                await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
                return;
            }

            if (customId.startsWith('admin_veh_edit|')) {
                const plate = customId.split('|')[1];
                const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });
                if (!vehicle) return interaction.reply({ content: '🚫 Nie znaleziono pojazdu.', ephemeral: true });

                const modal = new ModalBuilder()
                    .setCustomId(`admin_veh_edit_modal|${plate}`)
                    .setTitle(`Edycja: ${plate}`);

                const brandInput = new TextInputBuilder().setCustomId('brand').setLabel('Marka').setStyle(TextInputStyle.Short).setValue(vehicle.brand).setRequired(true);
                const modelInput = new TextInputBuilder().setCustomId('model').setLabel('Model').setStyle(TextInputStyle.Short).setValue(vehicle.model).setRequired(true);
                const plateInput = new TextInputBuilder().setCustomId('plate').setLabel('Tablica (Plate)').setStyle(TextInputStyle.Short).setValue(vehicle.plate).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(brandInput),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(modelInput),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(plateInput)
                );

                await interaction.showModal(modal);
                return;
            }

            if (customId.startsWith('admin_veh_del_img|')) {
                const plate = customId.split('|')[1];
                await (prisma as any).vehicle.update({ where: { plate }, data: { imageUrl: null } });
                await interaction.reply({ content: `🖼️ Usunięto zdjęcie dla pojazdu **${plate}**.`, ephemeral: true });
                return;
            }

            if (customId.startsWith('veh_page|')) {
                const [, targetId, pageStr, type] = customId.split('|');
                const page = parseInt(pageStr);
                const result = await getVehicleListPage(interaction.user.id, targetId, page, type as VehicleListType);
                await (interaction as any).update({ ...result });
                return;
            }

            if (customId.startsWith('veh_page|')) {
                const [, targetId, pageStr, type] = customId.split('|');
                const page = parseInt(pageStr);
                const result = await getVehicleListPage(interaction.user.id, targetId, page, type as VehicleListType);
                await (interaction as any).update({ ...result });
                return;
            }

            if (customId.startsWith('urzad_approve|') || customId.startsWith('urzad_reject|')) {
                const [action, plate, newBrand, newModel, requesterId] = customId.split('|');
                
                const URZAD_CHANNEL_ID = '1490393894448271370';
                if (interaction.channelId !== URZAD_CHANNEL_ID) return;

                if (action === 'urzad_reject') {
                    await (interaction as any).update({ content: `❌ **Wniosek o korektę ${plate} odrzucony** przez <@${interaction.user.id}>.`, components: [] });
                    try {
                        const user = await interaction.client.users.fetch(requesterId);
                        await user.send(`❌ Twój wniosek o korektę pojazdu **${plate}** został odrzucony przez Urząd.`);
                    } catch {}
                    return;
                }

                await (prisma as any).vehicle.update({
                    where: { plate },
                    data: { brand: newBrand, model: newModel }
                });

                await (interaction as any).update({ content: `✅ **Wniosek o korektę ${plate} zatwierdzony**! Dane zmienione na: ${newBrand} ${newModel}.`, components: [] });
                
                try {
                    const user = await interaction.client.users.fetch(requesterId);
                    await user.send(`✅ Twój wniosek o korektę pojazdu **${plate}** został pomyślnie zatwierdzony przez Urząd!`);
                } catch {}
                return;
            }

            if (customId.startsWith('fish_review|') || customId.startsWith('fish_approve|') || customId.startsWith('fish_reject|')) {
                const [action, targetIdOrRequestId] = customId.split('|');
                const SPRAWDZANIE_RYB_CHANNEL_ID = '1492254600458408059';
                if (interaction.channelId !== SPRAWDZANIE_RYB_CHANNEL_ID) return;

                await interaction.deferUpdate();

                if (action === 'fish_review') {
                    const targetDiscordId = targetIdOrRequestId;
                    const request = await (prisma as any).fishingRequest.findFirst({
                        where: { discordId: targetDiscordId, status: 'PENDING' },
                        orderBy: { createdAt: 'asc' }
                    });

                    if (!request) return interaction.editReply({ content: '❌ Brak oczekujących wniosków dla tego gracza.', embeds: [], components: [] });
                    
                    const { embed, components } = await getFishReviewUI(request);
                    await interaction.editReply({ embeds: [embed], components });
                    return;
                }

                if (action === 'fish_approve' || action === 'fish_reject') {
                    const requestId = targetIdOrRequestId;
                    const request = await (prisma as any).fishingRequest.findUnique({ where: { id: requestId } });
                    if (!request || request.status !== 'PENDING') return interaction.editReply({ content: '❌ Wniosek już przetworzony lub nie istnieje.' });

                    const targetDiscordId = request.discordId;

                    if (action === 'fish_approve') {
                        await prisma.$transaction([
                            prisma.citizen.update({
                                where: { discordId: targetDiscordId },
                                data: { pocket: { increment: request.taxedAmount } }
                            }),
                            (prisma as any).fishingRequest.update({
                                where: { id: requestId },
                                data: { status: 'APPROVED' }
                            })
                        ]);

                        try {
                            const user = await interaction.client.users.fetch(targetDiscordId);
                            if (user) await user.send(`✅ Twój wniosek o sprzedaż ryb (**${request.amount} zł** brutto) został zaakceptowany!\nOtrzymałeś **${request.taxedAmount.toLocaleString()} zł** (po podatku 40%) do kieszeni.`);
                        } catch {}
                    } else {
                        await (prisma as any).fishingRequest.update({
                            where: { id: requestId },
                            data: { status: 'REJECTED' }
                        });

                        try {
                            const user = await interaction.client.users.fetch(targetDiscordId);
                            if (user) await user.send(`❌ Twój wniosek o sprzedaż ryb (**${request.amount} zł** brutto) został odrzucony przez administrację.`);
                        } catch {}
                    }

                    // Załaduj kolejny wniosek tego samego gracza
                    const nextRequest = await (prisma as any).fishingRequest.findFirst({
                        where: { discordId: targetDiscordId, status: 'PENDING' },
                        orderBy: { createdAt: 'asc' }
                    });

                    if (nextRequest) {
                        const { embed: nextEmbed, components: nextComponents } = await getFishReviewUI(nextRequest);
                        await interaction.editReply({ embeds: [nextEmbed], components: nextComponents });
                    } else {
                        await (prisma as any).fishingSummary.delete({ where: { discordId: targetDiscordId } }).catch(() => null);
                        await interaction.editReply({ content: `✅ Zakończono sprawdzanie wniosków gracza <@${targetDiscordId}>. Wszystkie zostały przetworzone.`, embeds: [], components: [] });
                    }
                    return;
                }
            }

            if (customId.startsWith('urzad_reg_approve|') || customId.startsWith('urzad_reg_reject|')) {
                const [action, pendingIdStr] = customId.split('|');
                const pendingId = parseInt(pendingIdStr);

                const URZAD_CHANNEL_ID = '1490393894448271370';
                if (interaction.channelId !== URZAD_CHANNEL_ID) return;

                await interaction.deferReply({ ephemeral: true });

                const pending = await (prisma as any).pendingVehicle.findUnique({ where: { id: pendingId } });
                if (!pending) return interaction.editReply({ content: '🚫 Nie znaleziono wniosku (mógł zostać już przetworzony).' });

                const targetUser = await interaction.client.users.fetch(pending.ownerId);

                if (action === 'urzad_reg_approve') {
                    const citizen = await prisma.citizen.findUnique({ where: { discordId: pending.ownerId } });
                    
                    // Generate Plate
                    let plate = '';
                    let attempts = 0;
                    while (attempts < 10) {
                        const randomPart = Math.floor(10000 + Math.random() * 90000);
                        const testPlate = `BI ${randomPart}`;
                        const exists = await (prisma as any).vehicle.findUnique({ where: { plate: testPlate } });
                        if (!exists) {
                            plate = testPlate;
                            break;
                        }
                        attempts++;
                    }

                    if (!plate) return interaction.editReply({ content: 'Błąd: Nie udało się wygenerować unikalnej tablicy.' });

                    const vehicle = await (prisma as any).vehicle.create({
                        data: {
                            ownerId: pending.ownerId,
                            ownerName: citizen ? `${citizen.firstName} ${citizen.lastName}` : 'Nieznany Obywatel',
                            brand: pending.brand,
                            model: pending.model,
                            plate: plate,
                            imageUrl: pending.imageUrl
                        }
                    });

                    const buffer = await generateVehicleCard({
                        ownerName: vehicle.ownerName,
                        brand: vehicle.brand,
                        model: vehicle.model,
                        plate: vehicle.plate,
                        issuedAt: vehicle.createdAt.toLocaleDateString('pl-PL'),
                        carImageUrl: vehicle.imageUrl
                    });

                    const attachment = new AttachmentBuilder(buffer, { name: `dowod_${plate.replace(' ', '_')}.png` });

                    if (targetUser) {
                        try {
                            await targetUser.send({
                                content: `✅ Twój wniosek o rejestrację pojazdu **${pending.brand} ${pending.model}** został zaakceptowany przez Urząd!\nTwoja nowa tablica to: **${plate}**`,
                                files: [attachment]
                            });
                        } catch (e) {}
                    }

                    await (prisma as any).pendingVehicle.delete({ where: { id: pendingId } });
                    await interaction.editReply({ content: '✅ Pojazd został pomyślnie zarejestrowany i dowód wysłany do gracza.' });
                } else {
                    if (targetUser) {
                        try {
                            await targetUser.send(`❌ Twój wniosek o rejestrację pojazdu **${pending.brand} ${pending.model}** został odrzucony przez Urząd.`);
                        } catch (e) {}
                    }

                    // Usuwanie zdjęcia z cloud storage przy odrzuceniu
                    if (pending.storageMessageId) {
                        const STORAGE_CHANNEL_ID = '1491131655778209923';
                        try {
                            const storageChannel = await interaction.client.channels.fetch(STORAGE_CHANNEL_ID);
                            if (storageChannel && storageChannel.isTextBased()) {
                                const msg = await (storageChannel as any).messages.fetch(pending.storageMessageId);
                                if (msg) await msg.delete();
                            }
                        } catch (err) {
                            console.error('Failed to delete rejected image from storage:', err);
                        }
                    }

                    await (prisma as any).pendingVehicle.delete({ where: { id: pendingId } });
                    await interaction.editReply({ content: '❌ Rejestracja została odrzucona (zdjęcie usunięte z chmury).' });
                }

                await interaction.message.edit({ components: [] });
                return;
            }

            if (customId === 'shop_admin_tools') {
                const OWNER_ROLE_ID = '1490053669830393996';
                const isOwner = interaction.user.id === OWNER_ROLE_ID || 
                                (interaction.member?.roles && !Array.isArray(interaction.member.roles) && interaction.member.roles.cache.has(OWNER_ROLE_ID));
                
                if (!isOwner) {
                     return interaction.reply({ content: '🚫 Brak dostępu.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle('🛠️ Narzędzia Administracyjne Sklepu')
                    .setDescription('Wybierz akcję, którą chcesz wykonać. System poprosi Cię później o Discord ID lub Nick postaci, na której chcesz przeprowadzić operację.')
                    .setColor('#e74c3c');

                const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId('admin_shop_check_btn').setLabel('Sprawdź EQ gracza').setStyle(ButtonStyle.Primary).setEmoji('👁️'),
                    new ButtonBuilder().setCustomId('admin_shop_add_btn').setLabel('Dodaj do EQ').setStyle(ButtonStyle.Success).setEmoji('➕')
                );

                const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId('admin_shop_remove_btn').setLabel('Usuń z EQ').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
                    new ButtonBuilder().setCustomId('admin_shop_wipe_btn').setLabel('Wymaż całę EQ').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
                );

                return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
            }

            if (['admin_shop_check_btn', 'admin_shop_add_btn', 'admin_shop_remove_btn', 'admin_shop_wipe_btn'].includes(customId)) {
                const actionMapping: Record<string, { id: string, title: string }> = {
                    'admin_shop_check_btn': { id: 'admin_shop_check_modal', title: '👁️ Sprawdź EQ Gracza' },
                    'admin_shop_add_btn': { id: 'admin_shop_add_modal', title: '➕ Dodaj do EQ' },
                    'admin_shop_remove_btn': { id: 'admin_shop_remove_modal', title: '➖ Usuń z EQ' },
                    'admin_shop_wipe_btn': { id: 'admin_shop_wipe_modal', title: '🗑️ Wymaż całę EQ' }
                };
                
                const meta = actionMapping[customId];
                const modal = new ModalBuilder().setCustomId(meta.id).setTitle(meta.title);

                const input = new TextInputBuilder()
                    .setCustomId('target_player')
                    .setLabel('Discord ID lub Nick w Roblox:')
                    .setPlaceholder('np. 1234567890 albo JanekKowalski')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
                modal.addComponents(row);

                await interaction.showModal(modal);
                return;
            }

            if (customId.startsWith('admin_shop_wipe_confirm|')) {
                const targetDiscordId = customId.split('|')[1];
                await interaction.deferUpdate();

                const items = await prisma.inventory.findMany({ where: { discordId: targetDiscordId } });
                
                // Zdejmij wszystkie role
                if (interaction.guild) {
                    try {
                        const member = await interaction.guild.members.fetch(targetDiscordId);
                        if (member) {
                            for (const item of items) {
                                if (item.roleId && member.roles.cache.has(item.roleId)) {
                                    await member.roles.remove(item.roleId);
                                }
                            }
                        }
                    } catch (e) {
                         console.error('Błąd pobierania membera podczas wymazywania EQ', e);
                    }
                }

                await prisma.inventory.deleteMany({ where: { discordId: targetDiscordId } });
                
                // Powiadomienie DM (logBotDM)
                const citizen = await prisma.citizen.findUnique({ where: { discordId: targetDiscordId } });
                if (citizen) {
                    try {
                        const targetUser = await interaction.client.users.fetch(targetDiscordId);
                        if (targetUser) await targetUser.send(`🗑️ Administracja Obywatelstwa **całkowicie wyczyściła** Twój ekwipunek oraz wszystkie z nim związane licencje.`);
                    } catch (dmErr) { console.error('Nie udało się wysłać DM (Sklep Wipe):', dmErr); }
                }

                return interaction.editReply({ content: `✅ Ekwipunek gracza <@${targetDiscordId}> został w pełni wykreślony z systemu, a powiązane rangi odebrane.`, embeds: [], components: [] });
            }

            if (customId.startsWith('shop_buy|')) {
                const itemId = customId.split('|')[1];
                const item = getItemById(itemId);

                if (!item) {
                    return interaction.reply({ content: '🚫 Ten przedmiot nie istnieje lub został wycofany z oferty.', ephemeral: true });
                }

                const citizen = await prisma.citizen.findUnique({ where: { discordId: interaction.user.id } });
                if (!citizen) {
                    return interaction.reply({ content: '🚫 Musisz posiadać wyrobiony dowód osobisty w systemie Obywatela.', ephemeral: true });
                }

                // Oferujemy wybór płatności -> Gotówka czy Karta (Bank)
                const embed = new EmbedBuilder()
                    .setTitle(`💳 Płatność: ${item.name}`)
                    .setDescription(`Kwota do zapłaty: **${item.price.toLocaleString()} zł**\n\nWybierz formę płatności poniżej. Upewnij się, że masz wystarczające środki.`)
                    .setColor('#e67e22');

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId(`shop_pay_pocket|${item.id}`).setLabel('💵 Gotówka z kieszeni').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`shop_pay_bank|${item.id}`).setLabel('💳 Karta Bankowa').setStyle(ButtonStyle.Secondary)
                );

                await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
                return;
            }

            if (customId.startsWith('shop_pay_pocket|') || customId.startsWith('shop_pay_bank|')) {
                await interaction.deferUpdate();
                
                const isPocket = customId.startsWith('shop_pay_pocket|');
                const itemId = customId.split('|')[1];
                const item = getItemById(itemId);

                if (!item) {
                     return interaction.editReply({ content: '🚫 Błąd katalogu sklepu.', embeds: [], components: [] });
                }

                const citizen = await prisma.citizen.findUnique({ where: { discordId: interaction.user.id } });
                if (!citizen) return interaction.editReply({ content: 'Błąd bazy danych (1).', embeds: [], components: [] });

                if (isPocket && citizen.pocket < item.price) {
                     return interaction.editReply({ content: `🚫 Nie masz wystarczająco dużo gotówki w kieszeni! (Potrzeba: ${item.price} zł)`, embeds: [], components: [] });
                } else if (!isPocket && citizen.bank < item.price) {
                     return interaction.editReply({ content: `🚫 Na Twoim koncie w banku brakuje środków! (Potrzeba: ${item.price} zł)`, embeds: [], components: [] });
                }

                // Check duplicates (don't allow buying second license if already active)
                if (item.type === 'LICENSE' || item.type === 'WEAPON' || item.type === 'TOOL') {
                    const hasItem = await prisma.inventory.findFirst({
                        where: { discordId: citizen.discordId, itemKey: item.id }
                    });
                    if (hasItem) {
                         return interaction.editReply({ content: `🚫 Posiadasz już ten przedmiot w swoim ekwipunku!`, embeds: [], components: [] });
                    }
                }

                // Handle Insurance (extend or fresh buy)
                let expiresAt: Date | undefined = undefined;
                if (item.type === 'INSURANCE' && item.durationHours) {
                    const existingInsurance = await prisma.inventory.findFirst({
                        where: { discordId: citizen.discordId, type: 'INSURANCE' },
                        orderBy: { expiresAt: 'desc' }
                    });
                    
                    const now = new Date();
                    const baseDate = (existingInsurance?.expiresAt && existingInsurance.expiresAt > now) ? existingInsurance.expiresAt : now;
                    expiresAt = new Date(baseDate.getTime() + item.durationHours * 60 * 60 * 1000);
                }

                try {
                    // Start transaction
                    await prisma.$transaction([
                        prisma.citizen.update({
                            where: { discordId: citizen.discordId },
                            data: isPocket ? { pocket: { decrement: item.price } } : { bank: { decrement: item.price } }
                        }),
                        prisma.inventory.create({
                            data: {
                                discordId: citizen.discordId,
                                itemKey: item.id,
                                itemName: item.name,
                                type: item.type,
                                roleId: item.roleId,
                                expiresAt: expiresAt
                            }
                        })
                    ]);
                    
                    // Nadanie rangi (jeśli przypisana do przedmiotu)
                    if (item.roleId && interaction.guild) {
                        try {
                            const member = await interaction.guild.members.fetch(interaction.user.id);
                            if (member && !member.roles.cache.has(item.roleId)) {
                                await member.roles.add(item.roleId);
                            }
                        } catch (roleErr) {
                            console.error('Błąd podczas nadawania rangi po zakupie:', roleErr);
                        }
                    }

                    // Proceduralny Paragon (Graphic)
                    const buffer = await generateReceiptCard({
                        itemName: item.name,
                        price: item.price,
                        paymentMethod: isPocket ? 'Gotówka' : 'Karta Bankowa',
                        citizenName: `${citizen.firstName} ${citizen.lastName}`,
                        citizenNumber: citizen.citizenNumber,
                        date: new Date().toLocaleString('pl-PL')
                    });
                    const attachment = new AttachmentBuilder(buffer, { name: 'paragon.png' });

                    const successEmbed = new EmbedBuilder()
                        .setTitle('💼 Zakup udany!')
                        .setDescription(`Pomyślnie kupiono przedmiot: **${item.name}**\nKwota: **${item.price.toLocaleString()} zł**\nMetoda: **${isPocket ? 'Gotówka' : 'Karta Bankowa'}**\n\nPrzedmiot znajduje się w Twoim ekwipunku (\`/ekwipunek\`).`)
                        .setImage('attachment://paragon.png')
                        .setColor('#2ecc71');

                    return interaction.editReply({ embeds: [successEmbed], files: [attachment], components: [] });
                } catch (e) {
                    console.error('Błąd podczas zakupu', e);
                    await interaction.editReply({ content: '🚫 Wystąpił krytyczny błąd bazy danych podczas zakupu!', embeds: [], components: [] });
                }
                return;
            }

            if (customId === 'roblox_no') {
                await interaction.update({ content: 'Anulowano. Spróbuj podać dokładny Nick.', embeds: [], components: [] });
                return;
            }

            if (customId.startsWith('roblox_yes|')) {
                const parts = customId.split('|');
                const robloxUserId = parts[1];
                const nick = parts[2];

                const action = parts[3];

                if (action === 'create') {
                    const existing = await prisma.citizen.findUnique({ where: { discordId: interaction.user.id } });
                    if (existing) {
                        return interaction.update({ content: '🚫 Posiadasz już wyrobiony dowód osobisty! Jeśli chcesz zmienić dane, użyj `/dowod zaktualizuj`.', embeds: [], components: [] });
                    }
                }

                // Pokaż modal formularz
                const modal = new ModalBuilder()
                    .setCustomId(`modal_id_${robloxUserId}|${nick}|${action}`)
                    .setTitle('Dane do Dowodu Osobistego');

                const firstNameInput = new TextInputBuilder()
                    .setCustomId('firstName')
                    .setLabel("Imię postaci")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const lastNameInput = new TextInputBuilder()
                    .setCustomId('lastName')
                    .setLabel("Nazwisko postaci")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const dobInput = new TextInputBuilder()
                    .setCustomId('dob')
                    .setLabel("Data urodzenia (np. 15.04.1998)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(10)
                    .setMaxLength(10);

                const genderInput = new TextInputBuilder()
                    .setCustomId('gender')
                    .setLabel("Płeć (M / K / X)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(1);

                const citizenshipInput = new TextInputBuilder()
                    .setCustomId('citizenship')
                    .setLabel("Obywatelstwo")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setValue("Polskie");

                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(firstNameInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(lastNameInput);
                const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(dobInput);
                const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(genderInput);
                const row5 = new ActionRowBuilder<TextInputBuilder>().addComponents(citizenshipInput);

                modal.addComponents(row1, row2, row3, row4, row5);

                await interaction.showModal(modal);
            }

            if (customId.startsWith('admin_') && !customId.startsWith('admin_approve_inv_') && !customId.startsWith('admin_reject_inv_')) {
                const isApprove = customId.startsWith('admin_approve_');
                const isReject = customId.startsWith('admin_reject_');
                const isReason = customId.startsWith('admin_reason_');
                
                const updateIdStr = customId.split('_').pop() || '0';
                const updateId = parseInt(updateIdStr, 10);
                
                const pending = await prisma.pendingUpdate.findUnique({ where: { id: updateId } });
                if (!pending) {
                    await interaction.update({ content: 'Podanie wygasło lub zostało zrealizowane.', embeds: [], components: [] });
                    return;
                }

                if (isApprove) {
                    await interaction.deferUpdate();
                    
                    const dobParts = pending.newDob.split('.');
                    const YY = dobParts[2].substring(2, 4);
                    const MM = dobParts[1];
                    const DD = dobParts[0];
                    let endID = pending.newRobloxId.substring(pending.newRobloxId.length - 4);
                    if (endID.length < 4) endID = endID.padStart(4, '0');
                    const citizenNumber = `${YY}${MM}${DD}${endID}`;

                    const citizenData = {
                        discordId: pending.discordId,
                        robloxNick: pending.newRobloxNick,
                        robloxId: pending.newRobloxId,
                        firstName: pending.newFirstName,
                        lastName: pending.newLastName,
                        dob: pending.newDob,
                        gender: pending.newGender,
                        citizenship: pending.newCitizenship,
                        citizenNumber,
                    };

                    const savedCitizen = await prisma.citizen.upsert({
                        where: { discordId: pending.discordId },
                        update: citizenData,
                        create: citizenData,
                    });

                    await prisma.pendingUpdate.delete({ where: { id: updateId } });

                    const oldEmbed = interaction.message.embeds[0];
                    const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#00ff00').setTitle('Urząd: Podanie Zatwierdzone ✅');
                    await interaction.editReply({ embeds: [newEmbed], components: [] });

                    try {
                        const avatarBustUrl = await getAvatarBust(pending.newRobloxId);
                        const buffer = await generateIDCard(savedCitizen, avatarBustUrl || '');
                        const attachment = new AttachmentBuilder(buffer, { name: 'dowod.png' });

                        const citizenUser = await interaction.client.users.fetch(pending.discordId);
                        if (citizenUser) {
                            try {
                                const sentMsg = await citizenUser.send({ content: '✅ Urząd zatwierdził Twoje podanie o aktualizację dowodu! Oto nowy dokument:', files: [attachment] });
                                await logBotDM(interaction.client, pending.discordId, sentMsg, 'ID_CARD');
                            } catch(e) {
                                console.error('Failed to DM updated card:', e);
                            }
                        }

                        try {
                            const guild = interaction.guild;
                            if (guild) {
                                const member = await guild.members.fetch(pending.discordId);
                                const roleId = '1490075447629971467';
                                if (!member.roles.cache.has(roleId)) await member.roles.add(roleId);
                                const robloxUser = await getUserInfo(pending.newRobloxId);
                                if (robloxUser) await member.setNickname(`${robloxUser.displayName} (@${robloxUser.name})`);
                            }
                        } catch(e) {}
                    } catch(e) {
                        console.error('Error post-approve', e);
                    }

                } else if (isReject) {
                    await prisma.pendingUpdate.delete({ where: { id: updateId } });
                    
                    const oldEmbed = interaction.message.embeds[0];
                    const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#ff0000').setTitle('Urząd: Podanie Odrzucone ❌');
                    await interaction.update({ embeds: [newEmbed], components: [] });

                    try {
                        const citizenUser = await interaction.client.users.fetch(pending.discordId);
                        if (citizenUser) await citizenUser.send({ content: '❌ Urząd odrzucił Twoje podanie o zaktualizowanie dowodu osobistego.' });
                    } catch(e) {}
                } else if (isReason) {
                    const modal = new ModalBuilder()
                        .setCustomId(`admin_reason_modal_${updateId}`)
                        .setTitle('Powód odrzucenia');
                    const reasonInput = new TextInputBuilder()
                        .setCustomId('reason')
                        .setLabel("Dlaczego odrzucasz ten wniosek?")
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true);
                    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
                    modal.addComponents(row);
                    await interaction.showModal(modal);
                }
            }

            if (customId === 'user_confirm_uniewaznij') {
                await interaction.deferUpdate();
                const discordId = interaction.user.id;
                const citizen = await prisma.citizen.findUnique({ where: { discordId } });
                
                if (!citizen) {
                    return interaction.editReply({ content: '🚫 Twój dowód nie został znaleziony w bazie.', components: [] });
                }

                const pending = await prisma.pendingInvalidation.create({
                    data: { discordId }
                });

                const adminChannel = await interaction.client.channels.fetch('1490393894448271370');
                if (adminChannel && adminChannel.isTextBased() && 'send' in adminChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('Urząd: Wniosek o UNIEWAŻNIENIE dowodu')
                        .setDescription(`Użytkownik <@${discordId}> prosi o unieważnienie swojego dowodu osobistego.`)
                        .setColor('#ff4500')
                        .addFields(
                            { name: 'Obywatel', value: `${citizen.firstName} ${citizen.lastName}`, inline: true },
                            { name: 'Roblox Nick', value: citizen.robloxNick, inline: true }
                        )
                        .setFooter({ text: `ID Wniosku: ${pending.id}` });

                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId(`admin_approve_inv_${pending.id}`).setLabel('✅ Unieważnij').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId(`admin_reject_inv_${pending.id}`).setLabel('❌ Odrzuć').setStyle(ButtonStyle.Secondary)
                    );

                    await adminChannel.send({ embeds: [embed], components: [row] });
                    await interaction.editReply({ content: '✅ Twoje podanie o unieważnienie zostało przekazane do urzędu.', components: [] });
                } else {
                    await interaction.editReply({ content: 'Błąd: Kanał urzędu administracyjnego jest nieosiągalny.', components: [] });
                }
            }

            if (customId.startsWith('admin_approve_inv_') || customId.startsWith('admin_reject_inv_')) {
                const isApprove = customId.startsWith('admin_approve_inv_');
                const invId = parseInt(customId.split('_').pop() || '0', 10);
                
                const pending = await prisma.pendingInvalidation.findUnique({ where: { id: invId } });
                if (!pending) {
                    return interaction.update({ content: 'Wniosek wygasł lub został już przetworzony.', components: [], embeds: [] });
                }

                if (isApprove) {
                    const citizen = await prisma.citizen.findUnique({ where: { discordId: pending.discordId } });
                    if (citizen) {
                        await prisma.citizen.delete({ where: { discordId: pending.discordId } });
                        
                        try {
                            const guild = interaction.guild;
                            if (guild) {
                                const member = await guild.members.fetch(pending.discordId);
                                const roleId = '1490075447629971467';
                                if (member.roles.cache.has(roleId)) await member.roles.remove(roleId);
                            }
                        } catch(e) {}

                        try {
                            const user = await interaction.client.users.fetch(pending.discordId);
                            if (user) await user.send('🔴 Twój dowód osobisty został unieważniony przez Urząd. Twoje uprawnienia cywila zostały cofnięte.');
                        } catch(e) {}
                    }
                    
                    await prisma.pendingInvalidation.delete({ where: { id: invId } });
                    const oldEmbed = interaction.message.embeds[0];
                    const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#000000').setTitle('Urząd: Dowód Unieważniony 🔴');
                    await interaction.update({ embeds: [newEmbed], components: [] });
                } else {
                    await prisma.pendingInvalidation.delete({ where: { id: invId } });
                    const oldEmbed = interaction.message.embeds[0];
                    const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#808080').setTitle('Urząd: Wniosek o unieważnienie Odrzucony ❌');
                    await interaction.update({ embeds: [newEmbed], components: [] });

                    try {
                        const user = await interaction.client.users.fetch(pending.discordId);
                        if (user) await user.send('❌ Urząd odrzucił Twój wniosek o unieważnienie dowodu osobistego.');
                    } catch(e) {}
                }
            }

            if (customId.startsWith('owner_confirm_uniewaznij|')) {
                const targetDiscordId = customId.split('|')[1];
                console.log(`[Admin Action] Attempting to invalidate ID for: ${targetDiscordId}`);
                await interaction.deferUpdate();
                
                const citizen = await prisma.citizen.findUnique({ where: { discordId: targetDiscordId } });
                if (citizen) {
                    await prisma.citizen.delete({ where: { discordId: targetDiscordId } });
                    
                    try {
                        const guild = interaction.guild;
                        if (guild) {
                            const member = await guild.members.fetch(targetDiscordId);
                            const roleId = '1490075447629971467';
                            if (member.roles.cache.has(roleId)) await member.roles.remove(roleId);
                        }
                    } catch(e) {}

                    try {
                        const user = await interaction.client.users.fetch(targetDiscordId);
                        if (user) await user.send('🔴 Twój dowód osobisty został unieważniony administracyjnie. Wszystkie dane zostały usunięte.');
                    } catch(e) {}
                    
                    await interaction.editReply({ content: `✅ Dowód osobisty gracza został pomyślnie unieważniony.`, components: [] });
                } else {
                    await interaction.editReply({ content: '🚫 Nie znaleziono dowodu tego gracza (możliwe, że został już usunięty).', components: [] });
                }
            }

            if (customId.startsWith('confirm_transfer|')) {
                const parts = customId.split('|');
                const targetDiscordId = parts[1];
                const amount = parseInt(parts[2], 10);
                
                await interaction.deferUpdate();
                
                const sender = await prisma.citizen.findUnique({ where: { discordId: interaction.user.id } });
                const recipient = await prisma.citizen.findUnique({ where: { discordId: targetDiscordId } });

                if (!sender || !recipient) {
                     return interaction.editReply({ content: '🚫 Wystąpił błąd: Jeden z uczestników transakcji nie ma już konta.', components: [] });
                }

                if (sender.pocket < amount) {
                    return interaction.editReply({ content: `🚫 Nie masz już wystarczającej kwoty w kieszeni!`, components: [] });
                }

                await prisma.$transaction([
                    prisma.citizen.update({ where: { discordId: interaction.user.id }, data: { pocket: { decrement: amount } } }),
                    prisma.citizen.update({ where: { discordId: targetDiscordId }, data: { pocket: { increment: amount } } })
                ]);

                await interaction.editReply({ content: `✅ Przelano pomyślnie **${amount} zł** do obywatela **${recipient.firstName} ${recipient.lastName}**.`, components: [] });

                try {
                    const recipientUser = await interaction.client.users.fetch(targetDiscordId);
                    if (recipientUser) await recipientUser.send(`💸 Otrzymałeś przelew w wysokości **${amount} zł** od obywatela **${sender.firstName} ${sender.lastName}**.`);
                } catch(e) {}
            }

            if (customId.startsWith('delete_dm|')) {
                const ADMIN_ID = '1490053669830393996';
                const isOwner = interaction.user.id === ADMIN_ID || 
                                (interaction.member?.roles && !Array.isArray(interaction.member.roles) && interaction.member.roles.cache.has(ADMIN_ID));
                
                if (!isOwner) {
                    return interaction.reply({ content: '🚫 Brak uprawnień do usuwania DMów innych użytkowników.', flags: [MessageFlags.Ephemeral] });
                }

                const parts = customId.split('|');
                const targetUserId = parts[1];
                const messageId = parts[2];

                await interaction.deferUpdate();

                try {
                    const targetUser = await interaction.client.users.fetch(targetUserId);
                    const dmChannel = await targetUser.createDM();
                    const dmMessage = await dmChannel.messages.fetch(messageId);
                    
                    if (dmMessage) {
                        await dmMessage.delete();
                        
                        const oldEmbed = interaction.message.embeds[0];
                        const newEmbed = EmbedBuilder.from(oldEmbed)
                            .setTitle('🗑️ WIADOMOŚĆ USUNIĘTA Z DM')
                            .setColor('#000000')
                            .addFields({ name: 'Status', value: `Wiadomość została pomyślnie usunięta przez <@${interaction.user.id}>.` });

                        await interaction.editReply({ embeds: [newEmbed], components: [], files: [] });
                    }
                } catch (error) {
                    console.error('Delete DM error:', error);
                    await interaction.followUp({ content: '🚫 Nie udało się usunąć wiadomości. Możliwe, że została już usunięta lub użytkownik zablokował bota.', flags: [MessageFlags.Ephemeral] });
                }
            }
        } else if (interaction.isModalSubmit()) {
            const { customId } = interaction;

            // Handlery modali kartoteki (wanted_modal, note_modal) tymczasowo usunięte.

            if (customId.startsWith('admin_veh_edit_modal|')) {
                const oldPlate = (customId.split('|')[1] || '').toUpperCase();
                const brand = interaction.fields.getTextInputValue('brand');
                const model = interaction.fields.getTextInputValue('model');
                const newPlate = interaction.fields.getTextInputValue('plate').toUpperCase();

                try {
                    await (prisma as any).vehicle.update({
                        where: { plate: oldPlate },
                        data: { brand, model, plate: newPlate }
                    });
                    await interaction.reply({ content: `✅ Pomyślnie zaktualizowano dane pojazdu **${newPlate}**.`, ephemeral: true });
                } catch (err) {
                    await interaction.reply({ content: '❌ Błąd podczas aktualizacji: prawdopodobnie ta tablica jest już zajęta.', ephemeral: true });
                }
                return;
            }

            if (customId.startsWith('veh_registration_modal|')) {
                const pendingId = parseInt(customId.split('|')[1]);
                const brand = interaction.fields.getTextInputValue('brand');
                const model = interaction.fields.getTextInputValue('model');

                await interaction.deferReply({ ephemeral: true });

                try {
                    const citizen = await prisma.citizen.findUnique({ where: { discordId: interaction.user.id } });
                    if (!citizen) return interaction.editReply({ content: 'Błąd: Najpierw wyrób dowód osobisty!' });

                    const pending = await (prisma as any).pendingVehicle.findUnique({ where: { id: pendingId } });
                    if (!pending) return interaction.editReply({ content: '🚫 Nie znaleziono wniosku (mógł wygasnąć).' });

                    const imageUrl = pending.imageUrl;

                    // Zaktualizuj PendingVehicle o dane z modalu
                    await (prisma as any).pendingVehicle.update({
                        where: { id: pendingId },
                        data: { brand, model }
                    });

                    const URZAD_CHANNEL_ID = '1490393894448271370';
                    const urzadChannel = await interaction.client.channels.fetch(URZAD_CHANNEL_ID);
                    
                    if (urzadChannel && urzadChannel.isTextBased()) {
                        const aiEmoji = pending.aiConfidence > 40 ? '✅' : '⚠️';
                        const embed = new EmbedBuilder()
                            .setTitle('🏛️ Wniosek o Rejestrację Pojazdu')
                            .setThumbnail(interaction.user.displayAvatarURL())
                            .setDescription(`Obywatel <@${interaction.user.id}> prosi o zatwierdzenie ewidencji nowego pojazdu.`)
                            .addFields(
                                { name: '📌 Dane Pojazdu', value: `Model: **${brand} ${model}**`, inline: true },
                                { name: '🆔 Właściciel', value: `**${citizen.firstName} ${citizen.lastName}**`, inline: true },
                                { name: '🤖 Weryfikacja AI', value: `Status: **${aiEmoji} ${pending.aiLabel}**\nPewność: \`${pending.aiConfidence}%\``, inline: false }
                            )
                            .setImage(imageUrl)
                            .setColor(pending.aiConfidence > 40 ? '#00b894' : '#fdcb6e')
                            .setFooter({ text: 'Workflow Urzędu Miasta Bielisko', iconURL: interaction.guild?.iconURL() || undefined })
                            .setTimestamp();

                        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`urzad_reg_approve|${pendingId}`)
                                .setLabel('Zatwierdź')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId(`urzad_reg_reject|${pendingId}`)
                                .setLabel('Odrzuć')
                                .setStyle(ButtonStyle.Danger)
                        );

                        await (urzadChannel as any).send({ embeds: [embed], components: [row] });
                    }

                    await interaction.editReply({ 
                        content: `✅ Wniosek o rejestrację **${brand} ${model}** został wysłany do Urzędu.\nOtrzymasz powiadomienie, gdy urzędnik go rozpatrzy.`
                    });
                } catch (err) {
                    console.error('Error in veh_registration_modal:', err);
                    await interaction.editReply({ content: '❌ Wystąpił błąd podczas wysyłania wniosku. Spróbuj ponownie później.' });
                }
                return;
            }


            if (customId.startsWith('veh_correction_modal|')) {
                const plate = customId.split('|')[1];
                const newBrand = interaction.fields.getTextInputValue('brand');
                const newModel = interaction.fields.getTextInputValue('model');

                try {
                    const embed = new EmbedBuilder()
                        .setTitle('📝 Złożono Prośbę o Korektę')
                        .setDescription(`Twoja prośba o zmianę danych dla pojazdu **${plate}** została przekazana do Urzędu.\nUrzędnik skontaktuje się z Tobą po rozpatrzeniu sprawy.`)
                        .setColor('#0984e3')
                        .setFooter({ text: 'Biuro Ewidencji Pojazdów' });

                    await interaction.reply({ embeds: [embed], ephemeral: true });

                    const URZAD_CHANNEL_ID = '1490393894448271370';
                    const channel = await interaction.client.channels.fetch(URZAD_CHANNEL_ID);
                    if (channel && channel.isTextBased()) {
                        const embed = new EmbedBuilder()
                            .setTitle('⚖️ Wniosek o Korektę Pojazdu')
                            .setDescription(`Obywatel <@${interaction.user.id}> prosi o zmianę danych pojazdu **${plate}**.`)
                            .addFields(
                                { name: 'Nowe dane', value: `🚗 ${newBrand} ${newModel}`, inline: true }
                            )
                            .setColor('#f39c12')
                            .setTimestamp();

                        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`urzad_approve|${plate}|${newBrand}|${newModel}|${interaction.user.id}`)
                                .setLabel('Zatwierdź')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId(`urzad_reject|${plate}|${newBrand}|${newModel}|${interaction.user.id}`)
                                .setLabel('Odrzuć')
                                .setStyle(ButtonStyle.Danger)
                        );

                        await (channel as any).send({ embeds: [embed], components: [row] });
                    }
                } catch (err) {
                    console.error('Error in veh_correction_modal:', err);
                    if (!interaction.replied) await interaction.reply({ content: '❌ Wystąpił błąd podczas wysyłania wniosku.', ephemeral: true });
                }
                return;
            }
            
            if (['admin_shop_check_modal', 'admin_shop_add_modal', 'admin_shop_remove_modal', 'admin_shop_wipe_modal'].includes(customId)) {
                await interaction.deferReply({ ephemeral: true });

                const targetPlayerInput = interaction.fields.getTextInputValue('target_player').trim();
                const citizen = await prisma.citizen.findFirst({
                    where: {
                        OR: [
                            { discordId: targetPlayerInput },
                            { robloxNick: targetPlayerInput }
                        ]
                    }
                });

                if (!citizen) {
                    return interaction.editReply({ content: `🚫 Nie znaleziono Obywatela o podanym ID/Nicku: **${targetPlayerInput}**` });
                }

                if (customId === 'admin_shop_check_modal') {
                    const items = await prisma.inventory.findMany({ where: { discordId: citizen.discordId } });
                    
                    const embed = new EmbedBuilder()
                        .setTitle(`🎒 Ekwipunek: ${citizen.firstName} ${citizen.lastName}`)
                        .setDescription(`UID: ${citizen.citizenNumber} | Discord: <@${citizen.discordId}> (ID: ${citizen.discordId})`)
                        .setColor('#3498db');

                    if (items.length === 0) {
                        embed.setDescription(embed.data.description + '\n\n**Obywatel jest czysty. Brak jakichkolwiek przedmiotów.**');
                    } else {
                        const dict: Record<string, string[]> = {};
                        items.forEach(item => {
                            if (!dict[item.type]) dict[item.type] = [];
                            
                            let expireText = '';
                            if (item.expiresAt) {
                                expireText = item.expiresAt > new Date() 
                                    ? `*(Wygasa: <t:${Math.floor(item.expiresAt.getTime() / 1000)}:R>)*`
                                    : `*(❌ Wygasłe)*`;
                            }
                            dict[item.type].push(`• ${item.itemName} ${expireText}`);
                        });
                        
                        if (dict['LICENSE']) embed.addFields({ name: '📄 Licencje i Dokumenty', value: dict['LICENSE'].join('\n') });
                        if (dict['WEAPON']) embed.addFields({ name: '🔫 Broń', value: dict['WEAPON'].join('\n') });
                        if (dict['TOOL']) embed.addFields({ name: '🛠️ Narzędzia', value: dict['TOOL'].join('\n') });
                        if (dict['INSURANCE']) embed.addFields({ name: '🏥 Ubezpieczenia', value: dict['INSURANCE'].join('\n') });
                    }

                    return interaction.editReply({ embeds: [embed] });
                }

                if (customId === 'admin_shop_wipe_modal') {
                    const items = await prisma.inventory.findMany({ where: { discordId: citizen.discordId } });
                    if (items.length === 0) return interaction.editReply({ content: `Gracz **${citizen.robloxNick}** ma już puste ekwipunek.`});

                    const embed = new EmbedBuilder()
                        .setTitle(`🗑️ Czyszczenie asortymentu!`)
                        .setDescription(`Czy NA PEWNO chcesz usunąć **wszystkie (${items.length}) przedmioty** dla gracza <@${citizen.discordId}>? Tej akcji nie można cofnąć!`)
                        .setColor('#c0392b');

                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId(`admin_shop_wipe_confirm|${citizen.discordId}`).setLabel('Potwierdź Wymazanie').setStyle(ButtonStyle.Danger)
                    );

                    return interaction.editReply({ embeds: [embed], components: [row] });
                }

                if (customId === 'admin_shop_add_modal') {
                    // Prezentujemy cały sklep w postaci select menu dla tego gracza
                    // Pobieramy całą liste z shopData
                    const shopDataModule = await import('../data/shopData');
                    const allItems = [
                        ...shopDataModule.getItemsByCategory('legal'),
                        ...shopDataModule.getItemsByCategory('weapons'),
                        ...shopDataModule.getItemsByCategory('tools')
                    ];

                    const select = new StringSelectMenuBuilder()
                        .setCustomId(`admin_shop_add_select|${citizen.discordId}`)
                        .setPlaceholder('Wybierz przedmiot do nadania...')
                        .addOptions(allItems.map(it => ({
                            label: it.name,
                            description: it.type,
                            value: it.id
                        })));

                    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
                    return interaction.editReply({ content: `Wybierz przedmiot, który chcesz nadać Obywatelowi **${citizen.firstName} ${citizen.lastName}**:`, components: [row] });
                }

                if (customId === 'admin_shop_remove_modal') {
                    const items = await prisma.inventory.findMany({ where: { discordId: citizen.discordId } });
                    if (items.length === 0) return interaction.editReply({ content: `Gracz **${citizen.robloxNick}** ma już puste ekwipunek.`});

                    const select = new StringSelectMenuBuilder()
                        .setCustomId(`admin_shop_remove_select|${citizen.discordId}`)
                        .setPlaceholder('Wybierz przedmiot do usunięcia...')
                        .addOptions(items.slice(0, 25).map(it => ({
                            label: it.itemName,
                            description: `Dodano: ${it.createdAt.toLocaleDateString()}`,
                            value: it.id.toString()
                        })));

                    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
                    return interaction.editReply({ content: `Wybierz przedmiot, który chcesz usunąć Obywatelowi **${citizen.firstName} ${citizen.lastName}**:`, components: [row] });
                }

                return;
            }

            if (customId.startsWith('admin_reason_modal_')) {
                const updateId = parseInt(interaction.customId.replace('admin_reason_modal_', ''), 10);
                if (isNaN(updateId)) return interaction.reply({ content: 'Nieprawidłowy ID podania.', ephemeral: true });

                const reason = interaction.fields.getTextInputValue('reason');
                
                const pending = await prisma.pendingUpdate.findUnique({ where: { id: updateId } });
                if (!pending) return interaction.reply({ content: 'Błąd: Podanie wygasło.', ephemeral: true });

                await prisma.pendingUpdate.delete({ where: { id: updateId } });

                if (interaction.message) {
                    const oldEmbed = interaction.message.embeds[0];
                    const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#ff0000').setTitle('Urząd: Podanie Odrzucone ❌').addFields({name: 'Powód odrzucenia', value: reason});
                    await interaction.deferUpdate();
                    await interaction.message.edit({ embeds: [newEmbed], components: [] });
                } else {
                    await interaction.reply({ content: 'Odrzucono pomyślnie!', ephemeral: true });
                }

                try {
                    const citizenUser = await interaction.client.users.fetch(pending.discordId);
                    if (citizenUser) await citizenUser.send({ content: `❌ Urząd odrzucił Twoje podanie o aktualizację dowodu osobistego.\n**Powód:** ${reason}` });
                } catch(e) {}
                return;
            }

            if (interaction.customId === 'admin_uniewaznij_modal') {
                const targetNick = interaction.fields.getTextInputValue('targetNick');
                const citizen = await prisma.citizen.findFirst({ where: { robloxNick: { equals: targetNick, mode: 'insensitive' } } });

                if (!citizen) {
                    return interaction.reply({ content: `🚫 Nie znaleziono w bazie obywatela z nickiem Roblox: **${targetNick}**.`, ephemeral: true });
                }

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`owner_confirm_uniewaznij|${citizen.discordId}`)
                        .setLabel(`🔴 Potwierdzam: Unieważnij dowód ${citizen.firstName} ${citizen.lastName}`)
                        .setStyle(ButtonStyle.Danger)
                );

                await interaction.reply({
                    content: `### 🛠️ Administracyjne unieważnienie\nZnaleziono obywatela: **${citizen.firstName} ${citizen.lastName}** (@${citizen.robloxNick})\nCzy na pewno chcesz natychmiastowo unieważnić jego dokumenty?`,
                    components: [row],
                    ephemeral: true
                });
                return;
            }

            if (interaction.customId === 'mandat_modal') {
                const targetNick = interaction.fields.getTextInputValue('targetNick');
                const reason = interaction.fields.getTextInputValue('reason');
                const amount = parseInt(interaction.fields.getTextInputValue('amount'), 10);

                if (isNaN(amount) || amount < 0) {
                    return interaction.reply({ content: '🚫 Nieprawidłowa kwota mandatu.', ephemeral: true });
                }

                const target = await prisma.citizen.findFirst({ where: { robloxNick: { equals: targetNick, mode: 'insensitive' } } });
                if (!target) {
                    return interaction.reply({ content: `🚫 Nie znaleziono w bazie obywatela o nicku: **${targetNick}**.`, ephemeral: true });
                }

                await interaction.reply({ content: 'Przetwarzanie mandatu... ⚖️', ephemeral: true });

                // Cascading payment logic
                let remainingFine = amount;
                let pocketDeduct = 0;
                let bankDeduct = 0;

                if (amount > 0) {
                    // Pocket first
                    if (target.pocket >= remainingFine) {
                        pocketDeduct = remainingFine;
                        remainingFine = 0;
                    } else {
                        pocketDeduct = target.pocket;
                        remainingFine -= target.pocket;
                    }

                    // Bank second
                    if (remainingFine > 0) {
                        if (target.bank >= remainingFine) {
                            bankDeduct = remainingFine;
                            remainingFine = 0;
                        } else {
                            bankDeduct = target.bank;
                            remainingFine -= target.bank;
                        }
                    }

                    // Debt goes to pocket
                    if (remainingFine > 0) {
                        pocketDeduct += remainingFine;
                    }

                    await prisma.citizen.update({
                        where: { discordId: target.discordId },
                        data: {
                            pocket: { decrement: pocketDeduct },
                            bank: { decrement: bankDeduct }
                        }
                    });
                }
                
                // Zapis mandatu do logów historii kar
                await (prisma as any).fineLog.create({
                    data: {
                        citizenId: target.discordId,
                        playerNick: target.robloxNick,
                        officerDiscordId: interaction.user.id,
                        reason: reason,
                        amount: amount
                    }
                });

                // Generate Image
                const officerMember = await interaction.guild?.members.fetch(interaction.user.id);
                const officerName = officerMember?.nickname || interaction.user.username;

                const buffer = await generateFineCard({
                    targetName: `${target.firstName} ${target.lastName}`,
                    targetNick: target.robloxNick,
                    reason,
                    amount,
                    citizenNumber: target.citizenNumber,
                    officerName,
                    date: new Date().toLocaleString('pl-PL')
                });

                const attachment = new AttachmentBuilder(buffer, { name: 'mandat.png' });

                // Send to channel
                if (interaction.channel && 'send' in interaction.channel) {
                    await interaction.channel.send({
                        content: `⚖️ Wystawiono ${amount === 0 ? 'pouczenie' : 'mandat'} dla <@${target.discordId}>!`,
                        files: [attachment]
                    });
                }

                // Send to DM
                try {
                    const targetUser = await interaction.client.users.fetch(target.discordId);
                    if (targetUser) {
                        const sentMsg = await targetUser.send({ content: `🔴 Otrzymałeś ${amount === 0 ? 'pouczenie' : 'mandat'} w świecie RP Bielisko.`, files: [attachment] });
                        await logBotDM(interaction.client, target.discordId, sentMsg, 'FINE');
                    }
                } catch(e) {
                    console.error('Failed to DM fine:', e);
                }

                await interaction.editReply({ content: '✅ Mandat został wystawiony i przesłany.' });
                return;
            }

            if (interaction.customId === 'areszt_modal') {
                const targetNick = interaction.fields.getTextInputValue('targetNick');
                const reason = interaction.fields.getTextInputValue('reason');
                const timeStr = interaction.fields.getTextInputValue('time');
                const time = parseInt(timeStr, 10);

                if (isNaN(time) || time <= 0) {
                    return interaction.reply({ content: '🚫 Nieprawidłowy czas aresztu.', flags: [MessageFlags.Ephemeral] });
                }

                const target = await prisma.citizen.findFirst({ where: { robloxNick: { equals: targetNick, mode: 'insensitive' } } });
                if (!target) {
                    return interaction.reply({ content: `🚫 Nie znaleziono w bazie obywatela o nicku: **${targetNick}**.`, flags: [MessageFlags.Ephemeral] });
                }

                await interaction.reply({ content: 'Przygotowywanie dokumentacji osadzenia... 🚓', flags: [MessageFlags.Ephemeral] });

                await (prisma as any).arrestLog.create({
                    data: {
                        citizenId: target.discordId,
                        playerNick: target.robloxNick,
                        officerDiscordId: interaction.user.id,
                        reason: reason,
                        time: time
                    }
                });

                const officerMember = await interaction.guild?.members.fetch(interaction.user.id);
                const officerName = officerMember?.nickname || interaction.user.username;

                const buffer = await generateArrestCard({
                    targetName: `${target.firstName} ${target.lastName}`,
                    targetNick: target.robloxNick,
                    reason,
                    time: `${time} miesięc(y)`,
                    citizenNumber: target.citizenNumber,
                    officerName,
                    date: new Date().toLocaleString('pl-PL')
                });

                const attachment = new AttachmentBuilder(buffer, { name: 'areszt.png' });

                if (interaction.channel && 'send' in interaction.channel) {
                    await interaction.channel.send({
                        content: `🚔 Obywatel <@${target.discordId}> został osadzony w areszcie na **${time} miesięcy**!`,
                        files: [attachment]
                    });
                }

                try {
                    const targetUser = await interaction.client.users.fetch(target.discordId);
                    if (targetUser) {
                        const sentMsg = await targetUser.send({ content: `🚨 Zostałeś osadzony w areszcie na **${time} miesięcy** w świecie RP Bielisko.`, files: [attachment] });
                        await logBotDM(interaction.client, target.discordId, sentMsg, 'ARREST');
                    }
                } catch(e) {
                    console.error('Failed to DM arrest:', e);
                }

                await interaction.editReply({ content: '✅ Dokumentacja osadzenia wysłana.' });
                return;
            }

            if (interaction.customId.startsWith('modal_id_')) {
                const parts = interaction.customId.replace('modal_id_', '').split('|');
                const robloxId = parts[0];
                const robloxNick = parts[1];
                const action = parts[2] || 'create';

                const firstName = interaction.fields.getTextInputValue('firstName').trim();
                const lastName = interaction.fields.getTextInputValue('lastName').trim();
                const dob = interaction.fields.getTextInputValue('dob');
                const gender = interaction.fields.getTextInputValue('gender').toUpperCase();
                const citizenship = interaction.fields.getTextInputValue('citizenship');

                // Walidacja znaków (tylko litery polskie i łacińskie + spacje)
                const nameRegex = /^[A-Za-zĄĘÓŁŚĆŃŹŻąęółśćńźż\s]+$/;
                if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
                    await interaction.reply({ content: '🚫 Imię i nazwisko mogą zawierać tylko litery (w tym polskie znaki) oraz spacje.', ephemeral: true });
                    return;
                }

                // Walidacja spacji (max 3)
                const firstNameSpaces = (firstName.match(/ /g) || []).length;
                const lastNameSpaces = (lastName.match(/ /g) || []).length;
                if (firstNameSpaces > 3 || lastNameSpaces > 3) {
                    await interaction.reply({ content: '🚫 Imię lub nazwisko zawiera zbyt wiele spacji! (Maksymalnie 3 spacje na pole).', ephemeral: true });
                    return;
                }

                // Walidacja płci
                if (!['M', 'K', 'X', 'F'].includes(gender)) {
                    await interaction.reply({ content: '🚫 Niepoprawna płeć! Wprowadź jedną odpowiednią literę: `M` (Mężczyzna), `K` (Kobieta) lub `X` (Inne).', ephemeral: true });
                    return;
                }

                // Walidacja daty
                const dateParts = dob.split('.');
                if (dateParts.length !== 3 || dateParts[2].length !== 4) {
                    await interaction.reply({ content: '🚫 Nieprawidłowy format daty urodzenia! Użyj DD.MM.RRRR (np. 01.05.2000)', ephemeral: true });
                    return;
                }

                const dayNum = parseInt(dateParts[0], 10);
                const monNum = parseInt(dateParts[1], 10);
                const yeaNum = parseInt(dateParts[2], 10);

                if (isNaN(dayNum) || isNaN(monNum) || isNaN(yeaNum) ||
                    dayNum < 1 || dayNum > 31 || 
                    monNum < 1 || monNum > 12 || 
                    yeaNum < 1850 || yeaNum > new Date().getFullYear()) {
                    await interaction.reply({ content: '🚫 Wprowadziłeś nielogiczną datę urodzenia! Popraw swoje dane.', ephemeral: true });
                    return;
                }

                const YY = dateParts[2].substring(2, 4);
                const MM = dateParts[1];
                const DD = dateParts[0];

                let endID = robloxId.substring(robloxId.length - 4);
                if (endID.length < 4) {
                    endID = endID.padStart(4, '0');
                }

                const citizenNumber = `${YY}${MM}${DD}${endID}`;

                await interaction.reply({ content: 'Generowanie i zapisywanie dokumentu... ⏳', ephemeral: true });

                if (action === 'update') {
                    try {
                        const oldCitizen = await prisma.citizen.findUnique({ where: { discordId: interaction.user.id } });
                        if (!oldCitizen) {
                             return interaction.editReply({ content: 'Błąd: Nie znaleziono starego dowodu do aktualizacji.' });
                        }

                        const pendingUpdate = await prisma.pendingUpdate.create({
                            data: {
                                discordId: interaction.user.id,
                                newRobloxNick: robloxNick,
                                newRobloxId: robloxId,
                                newFirstName: firstName,
                                newLastName: lastName,
                                newDob: dob,
                                newGender: gender,
                                newCitizenship: citizenship
                            }
                        });

                        const adminChannel = await interaction.client.channels.fetch('1490393894448271370');
                        if (adminChannel && adminChannel.isTextBased() && 'send' in adminChannel) {
                            const embed = new EmbedBuilder()
                                .setTitle(`Urząd: Podanie o aktualizację dowodu`)
                                .setDescription(`Użytkownik <@${interaction.user.id}> składa wniosek o zaktualizowanie danych w dowodzie.`)
                                .setColor('#e6a822')
                                .addFields(
                                    { name: 'Imię', value: `${oldCitizen.firstName} ➔ **${firstName}**`, inline: true },
                                    { name: 'Nazwisko', value: `${oldCitizen.lastName} ➔ **${lastName}**`, inline: true },
                                    { name: 'Data Urodzenia', value: `${oldCitizen.dob} ➔ **${dob}**`, inline: true },
                                    { name: 'Roblox Nick', value: `${oldCitizen.robloxNick} ➔ **${robloxNick}**`, inline: true },
                                    { name: 'Płeć', value: `${oldCitizen.gender} ➔ **${gender}**`, inline: true },
                                    { name: 'Obywatelstwo', value: `${oldCitizen.citizenship} ➔ **${citizenship}**`, inline: true }
                                )
                                .setFooter({ text: `ID Wniosku: ${pendingUpdate.id}` });

                            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                                new ButtonBuilder().setCustomId(`admin_approve_${pendingUpdate.id}`).setLabel('✅ Zatwierdź').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId(`admin_reject_${pendingUpdate.id}`).setLabel('❌ Odrzuć').setStyle(ButtonStyle.Danger),
                                new ButtonBuilder().setCustomId(`admin_reason_${pendingUpdate.id}`).setLabel('📝 Odrzuć ze zwrotem').setStyle(ButtonStyle.Secondary)
                            );

                            await adminChannel.send({ embeds: [embed], components: [row] });
                            await interaction.editReply({ content: '✅ Twoje podanie o zaktualizowanie dowodu osobistego zostało złożone! Urząd wkrótce je rozpatrzy, a o decyzji dowiesz się poprzez Wiadomość Prywatną.' });
                            return;
                        } else {
                            await interaction.editReply({ content: 'Błąd: Kanał urzędu administracyjnego jest nieosiągalny.' });
                            return;
                        }
                    } catch(e) {
                        console.error('Wystąpił błąd przy dodawaniu podania', e);
                        await interaction.editReply({ content: 'Błąd bazy danych podczas składania podania.' });
                        return;
                    }
                }

                // Logika dla 'create'
                try {
                    // Sprawdź czy robloxId nie jest już zajęty
                    const duplicate = await prisma.citizen.findUnique({ where: { robloxId: robloxId } });
                    if (duplicate && duplicate.discordId !== interaction.user.id) {
                        return interaction.editReply({ content: `🚫 To konto Roblox jest już przypisane do innego obywatela (<@${duplicate.discordId}>)! Jeden profil Roblox może mieć tylko jeden dowód.` });
                    }

                    // --- LOGIKA BONUSU STARTOWEGO ---
                    const startBonus = await (prisma as any).startBonus.findFirst({
                        where: {
                            OR: [
                                { robloxId: robloxId },
                                { discordId: interaction.user.id }
                            ]
                        }
                    });

                    let initialBank = 0;
                    let receivedBonus = false;

                    if (!startBonus) {
                        initialBank = 4000;
                        receivedBonus = true;
                    }
                    // --------------------------------

                    // Zapisz do bazy
                    const citizenData = {
                        discordId: interaction.user.id,
                        robloxNick,
                        robloxId,
                        firstName,
                        lastName,
                        dob,
                        gender,
                        citizenship,
                        citizenNumber,
                        bank: initialBank
                    };

                    const savedCitizen = await prisma.citizen.upsert({
                        where: { discordId: interaction.user.id },
                        update: citizenData,
                        create: citizenData,
                    });

                    // Generowanie obrazka
                    const avatarBustUrl = await getAvatarBust(robloxId);
                    const pfp = avatarBustUrl || '';
                    
                    const buffer = await generateIDCard(savedCitizen, pfp);
                    const attachment = new AttachmentBuilder(buffer, { name: 'dowod.png' });

                    // Zapisz fakt przyznania bonusu (jeśli przyznano)
                    if (receivedBonus) {
                        try {
                            await (prisma as any).startBonus.create({
                                data: {
                                    robloxId: robloxId,
                                    discordId: interaction.user.id
                                }
                            });
                        } catch (bonusErr) {
                            console.error('Failed to save StartBonus record:', bonusErr);
                        }
                    }

                    // Try sending DM
                    let dmSent = true;
                    try {
                        const sentMsg = await interaction.user.send({
                            content: `Twój elektroniczny dowód osobisty został pomyślnie zapisany w systemie. Oto kopia:` + 
                                     (receivedBonus ? `\n\n🎁 **BONUS STARTOWY:** Z okazji wyrobienia Twojego pierwszego dowodu, na Twoje konto w banku wpłynęło **4.000 zł**! Powodzenia w Bielisku!` : ''),
                            files: [attachment]
                        });
                        await logBotDM(interaction.client, interaction.user.id, sentMsg, 'ID_CARD');
                    } catch (e) {
                        dmSent = false; // User has DMs disabled
                    }

                    // Send to public channel
                    if (interaction.channel && 'send' in interaction.channel) {
                        const publicMsg = await interaction.channel.send({
                            content: `🪪 Obywatel **${firstName} ${lastName}** (Z postacią **${robloxNick}**) wyrobił dowód osobisty!` + (!dmSent ? `\n*(Nie udało się wysłać na DM)*` : ''),
                            files: [attachment]
                        });
                    }

                    // Zmiana pseudonimu i nadawanie roli
                    try {
                        const robloxUser = await getUserInfo(robloxId);
                        if (interaction.guild) {
                            const member = await interaction.guild.members.fetch(interaction.user.id);
                            
                            // Nadanie roli Cywil
                            const roleId = '1490075447629971467';
                            if (!member.roles.cache.has(roleId)) {
                                await member.roles.add(roleId);
                            }

                            if (robloxUser) {
                                await member.setNickname(`${robloxUser.displayName} (@${robloxUser.name})`);
                            }
                        }
                    } catch (e) {
                        console.error('Błąd zmiany pseudonimu lub dodania roli (brak uprawnień lub błąd API)', e);
                    }

                    await interaction.editReply({ 
                        content: '✅ Dowód wyrobiony pomyślnie!' + 
                                 (receivedBonus ? '\n💰 Otrzymałeś **4.000 zł** bonusu startowego do banku!' : '') 
                    });

                } catch (e) {
                    console.error(e);
                    await interaction.editReply({ content: 'Wystąpił nieoczekiwany błąd podczas zapisywania dowodu do bazy lub rysowania grafiki.' });
                }
            }
        }
    } catch (err) {
        console.error('[Interaction Handler Error]:', err);
        if (interaction.isRepliable()) {
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ Wystąpił błąd podczas przetwarzania tej akcji. Skontaktuj się z deweloperem.', flags: [MessageFlags.Ephemeral] });
                } else {
                    await interaction.reply({ content: '❌ Wystąpił błąd podczas przetwarzania tej akcji. Skontaktuj się z deweloperem.', flags: [MessageFlags.Ephemeral] });
                }
            } catch (e) {
                console.error('Failed to send error message to user:', e);
            }
        }
    }
}

async function getFishReviewUI(request: any) {
    const embed = new EmbedBuilder()
        .setTitle(`👨‍⚖️ Weryfikacja: ${request.robloxNick}`)
        .setDescription(`Wniosek od gracza <@${request.discordId}>\n\n` +
                        `💰 **Suma Brutto:** ${request.amount.toLocaleString()} zł\n` +
                        `💸 **Suma Netto (60%):** **${request.taxedAmount.toLocaleString()} zł**\n\n` +
                        `📅 **Data:** <t:${Math.floor(request.createdAt.getTime() / 1000)}:f>`)
        .setImage(request.screenshotUrl)
        .setColor('#f39c12')
        .setFooter({ text: `ID Wniosku: ${request.id}` });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`fish_approve|${request.id}`)
            .setLabel('Akceptuj i Wypłać')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId(`fish_reject|${request.id}`)
            .setLabel('Odrzuć')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );

    return { embed, components: [row] };
}
