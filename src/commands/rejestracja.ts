import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { prisma } from '../services/db';
import { detectVehicle } from '../services/vision';

export const rejestracjaCommand = {
    data: new SlashCommandBuilder()
        .setName('rejestracja')
        .setDescription('Zarządzanie rejestracją Twoich pojazdów')
        .addSubcommand(subcommand =>
            subcommand
                .setName('wyrob')
                .setDescription('Zarejestruj swój pojazd w Bielisku')
                .addAttachmentOption(option =>
                    option.setName('zdjecie')
                        .setDescription('Prześlij screena swojego auta (Screenshot)')
                        .setRequired(true)
                ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pokaz')
                .setDescription('Wyświetl listę Twoich zarejestrowanych pojazdów')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('popraw')
                .setDescription('Złóż wniosek o korektę danych pojazdu do Urzędu')
                .addStringOption(option =>
                    option.setName('tablica')
                        .setDescription('Numer rejestracyjny pojazdu')
                        .setRequired(true)
                ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sprawdz')
                .setDescription('Narzędzie służb: Sprawdź dane po tablicy rejestracyjnej')
                .addStringOption(option =>
                    option.setName('tablica')
                        .setDescription('Numer rejestracyjny pojazdu')
                        .setRequired(true)
                )),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const discordId = interaction.user.id;

            // Check if user is a citizen
            const citizen = await prisma.citizen.findUnique({ where: { discordId } });
            if (!citizen) {
                return interaction.reply({ content: '🚫 Nie posiadasz dowodu osobistego! Nie możesz rejestrować pojazdów bez tożsamości.', ephemeral: true });
            }

            if (subcommand === 'wyrob') {
                const attachment = interaction.options.getAttachment('zdjecie', true);
                
                // Limit check for images
                if (!attachment.contentType?.startsWith('image/')) {
                    return interaction.reply({ content: '🚫 Musisz przesłać obrazek (screenshot) swojego auta!', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });

                try {
                    // 1. Natychmiastowa analiza AI
                    const aiResult = await detectVehicle(attachment.url);
                    
                    if (!aiResult.detected) {
                        return interaction.editReply({ 
                            content: `❌ **AI nie rozpoznało pojazdu.**\nSystem twierdzi, że to prawdopodobnie: **${aiResult.label || 'Brak'}** (${aiResult.confidence}%).\n\nZrób screena pod innym kątem (najlepiej w dzień, z bliska i bez przeszkód) i spróbuj ponownie.` 
                        });
                    }

                    // 2. Upload do Cloud Storage (aby link nie wygasł)
                    const STORAGE_CHANNEL_ID = '1491131655778209923';
                    const storageChannel = await interaction.client.channels.fetch(STORAGE_CHANNEL_ID);
                    
                    let finalImageUrl = attachment.url;
                    let storageMessageId = null;

                    if (storageChannel && storageChannel.isTextBased()) {
                        const storageMsg = await (storageChannel as any).send({
                            content: `📦 Cloud Storage: Wniosek od <@${interaction.user.id}> (${interaction.user.tag})`,
                            files: [attachment.url]
                        });
                        finalImageUrl = storageMsg.attachments.first()?.url || attachment.url;
                        storageMessageId = storageMsg.id;
                    }

                    // 3. Zapisanie do PendingVehicle
                    const pending = await (prisma as any).pendingVehicle.create({
                        data: {
                            ownerId: interaction.user.id,
                            imageUrl: finalImageUrl,
                            storageMessageId,
                            aiConfidence: aiResult.confidence,
                            aiLabel: aiResult.label
                        }
                    });

                    const embed = new EmbedBuilder()
                        .setTitle('🚗 Pojazd Zweryfikowany (AI)')
                        .setDescription(`System pomyślnie rozpoznał: **${aiResult.label}**.\n\nKliknij przycisk poniżej, aby uzupełnić dane i wysłać wniosek do Urzędu.`)
                        .setImage(finalImageUrl)
                        .setColor('#2ecc71')
                        .setFooter({ text: 'AI Vision System v1.0' });

                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`veh_form|${pending.id}`)
                            .setLabel('Uzupełnij dane auta i wyślij')
                            .setStyle(ButtonStyle.Success)
                    );

                    await interaction.editReply({ embeds: [embed], components: [row] });
                } catch (aiErr) {
                    console.error('AI Processing error:', aiErr);
                    await interaction.editReply({ content: '❌ Wystąpił błąd techniczny podczas analizy zdjęcia. Spróbuj ponownie później.' });
                }
                return;
            }

            if (subcommand === 'pokaz') {
                const vehicles = await (prisma as any).vehicle.findMany({ where: { ownerId: discordId } });
                if (vehicles.length === 0) {
                    return interaction.reply({ content: 'Nie posiadasz żadnych zarejestrowanych pojazdów.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle('📋 Twoje Pojazdy')
                    .setDescription('Wybierz pojazd z listy poniżej, aby wyświetlić jego dowód rejestracyjny.')
                    .setColor('#3498db');

                const rows = [];
                let currentRow = new ActionRowBuilder<ButtonBuilder>();
                
                for (let i = 0; i < vehicles.length; i++) {
                    const v = vehicles[i];
                    currentRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`veh_show|${v.plate}`)
                            .setLabel(`${v.brand} ${v.model} (${v.plate})`)
                            .setStyle(ButtonStyle.Secondary)
                    );

                    if (currentRow.components.length === 5 || i === vehicles.length - 1) {
                        rows.push(currentRow);
                        currentRow = new ActionRowBuilder<ButtonBuilder>();
                    }
                }

                await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
                return;
            }

            if (subcommand === 'popraw') {
                const plate = interaction.options.getString('tablica', true).toUpperCase();
                const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });

                if (!vehicle || vehicle.ownerId !== discordId) {
                    return interaction.reply({ content: '🚫 Nie znaleziono Twojego pojazdu o takiej tablicy.', ephemeral: true });
                }

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

            if (subcommand === 'sprawdz') {
                // Check LEO roles (reuse same role ID as for mandates/arrests)
                const member = await interaction.guild?.members.fetch(discordId);
                if (!member?.roles.cache.has('1490253667910029412')) {
                    return interaction.reply({ content: '🚫 Brak uprawnień do sprawdzania ewidencji pojazdów!', ephemeral: true });
                }

                const plate = interaction.options.getString('tablica', true).toUpperCase();
                const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });

                if (!vehicle) {
                    return interaction.reply({ content: `🚫 Nie znaleziono pojazdu o numerze rejestracyjnym: **${plate}**.`, ephemeral: true });
                }

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`veh_show|${plate}`)
                        .setLabel('Wyświetl Dowód')
                        .setStyle(ButtonStyle.Primary)
                );

                await interaction.reply({
                    content: `🔍 Zidentyfikowano pojazd: **${vehicle.brand} ${vehicle.model}**\nWłaściciel: **${vehicle.ownerName}**`,
                    components: [row],
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in rejestracja execute:', error);
            const msg = '❌ Wystąpił błąd podczas obsługi rejestracji.';
            if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
            else await interaction.reply({ content: msg, ephemeral: true });
        }
    }
};
