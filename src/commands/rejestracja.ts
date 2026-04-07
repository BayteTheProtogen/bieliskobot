import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { prisma } from '../services/db';
import { detectVehicle, cropToVehicle } from '../services/vision';
import { getVehicleListPage } from '../utils/vehicleList';

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
                        .setRequired(false)
                ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sprawdz')
                .setDescription('Narzędzie służb: Sprawdź dane po tablicy lub użytkowniku')
                .addStringOption(option =>
                    option.setName('tablica')
                        .setDescription('Numer rejestracyjny pojazdu')
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option.setName('użytkownik')
                        .setDescription('Właściciel pojazdów do sprawdzenia')
                        .setRequired(false)
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
                
                if (!attachment.contentType?.startsWith('image/')) {
                    return interaction.reply({ content: '🚫 Musisz przesłać obrazek (screenshot) swojego auta!', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });

                try {
                    const aiResult = await detectVehicle(attachment.url);
                    
                    if (!aiResult.detected) {
                        return interaction.editReply({ 
                            content: `❌ **Nie byliśmy w stanie zweryfikować pojazdu.**\nWykonaj zrzut ekranu pod innym kątem (najlepiej w dzień, z bliska) i spróbuj ponownie.` 
                        });
                    }

                    const STORAGE_CHANNEL_ID = '1491131655778209923';
                    const storageChannel = await interaction.client.channels.fetch(STORAGE_CHANNEL_ID);
                    
                    let finalImageUrl = attachment.url;
                    let storageMessageId = null;

                    if (storageChannel && storageChannel.isTextBased()) {
                        let fileToUpload: string | Buffer = attachment.url;
                        let fileName = 'oryginalny.png';

                        if (aiResult.box) {
                            try {
                                fileToUpload = await cropToVehicle(attachment.url, aiResult.box);
                                fileName = 'auto_kadrowane.png';
                            } catch (cropErr) {
                                console.error('Crop error:', cropErr);
                            }
                        }

                        const storageMsg = await (storageChannel as any).send({
                            content: `📦 Cloud Storage: Wniosek od <@${interaction.user.id}>`,
                            files: [new AttachmentBuilder(fileToUpload, { name: fileName })]
                        });
                        finalImageUrl = storageMsg.attachments.first()?.url || attachment.url;
                        storageMessageId = storageMsg.id;
                    }

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
                        .setTitle('🚗 Pojazd Zweryfikowany')
                        .setDescription(`Kliknij przycisk poniżej, aby uzupełnić dane.`)
                        .setImage(finalImageUrl)
                        .setColor('#2ecc71');

                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`veh_form|${pending.id}`)
                            .setLabel('Uzupełnij dane auta')
                            .setStyle(ButtonStyle.Success)
                    );

                    await interaction.editReply({ embeds: [embed], components: [row] });
                } catch (aiErr) {
                    console.error('Processing error:', aiErr);
                    await interaction.editReply({ content: '❌ Wystąpił błąd podczas weryfikacji zdjęcia.' });
                }
                return;
            }

            if (subcommand === 'pokaz') {
                const result = await getVehicleListPage(discordId, discordId, 0, 'show');
                return interaction.reply({ ...result, ephemeral: true });
            }

            if (subcommand === 'popraw') {
                const plate = interaction.options.getString('tablica')?.toUpperCase();
                
                if (!plate) {
                    const result = await getVehicleListPage(discordId, discordId, 0, 'popraw');
                    return interaction.reply({ ...result, ephemeral: true });
                }

                const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });
                if (!vehicle || vehicle.ownerId !== discordId) {
                    return interaction.reply({ content: '🚫 Nie znaleziono Twojego pojazdu o takiej tablicy.', ephemeral: true });
                }

                const modal = {
                    title: `Korekta: ${plate}`,
                    custom_id: `veh_correction_modal|${plate}`,
                    components: [
                        { type: 1, components: [{ type: 4, custom_id: 'brand', label: 'Nowa Marka', style: 1, value: vehicle.brand, required: true }] },
                        { type: 1, components: [{ type: 4, custom_id: 'model', label: 'Nowy Model', style: 1, value: vehicle.model, required: true }] }
                    ]
                };

                await interaction.showModal(modal as any);
                return;
            }

            if (subcommand === 'sprawdz') {
                const member = await interaction.guild?.members.fetch(discordId);
                if (!member?.roles.cache.has('1490253667910029412')) {
                    return interaction.reply({ content: '🚫 Brak uprawnień!', ephemeral: true });
                }

                const plate = interaction.options.getString('tablica')?.toUpperCase();
                const target = interaction.options.getUser('użytkownik');

                if (!plate && !target) {
                    return interaction.reply({ content: '🚫 Podaj tablicę lub osobę!', ephemeral: true });
                }

                if (target) {
                    const result = await getVehicleListPage(discordId, target.id, 0, 'show');
                    return interaction.reply({ ...result, ephemeral: true });
                }

                if (plate) {
                    const vehicle = await (prisma as any).vehicle.findUnique({ where: { plate } });
                    if (!vehicle) {
                        return interaction.reply({ content: `🚫 Nie znaleziono pojazdu **${plate}**.`, ephemeral: true });
                    }

                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId(`veh_show|${plate}`).setLabel('Wyświetl Dowód').setStyle(ButtonStyle.Primary)
                    );

                    await interaction.reply({
                        content: `🔍 Zidentyfikowano: **${vehicle.brand} ${vehicle.model}**\nWłaściciel: **${vehicle.ownerName}**`,
                        components: [row],
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error in rejestracja execute:', error);
            const msg = '❌ Wystąpił błąd.';
            if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
            else await interaction.reply({ content: msg, ephemeral: true });
        }
    }
};
