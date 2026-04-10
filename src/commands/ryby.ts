import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../services/db';

const RYBY_CHANNEL_ID = '1492254461467295774';
const SPRAWDZANIE_RYB_CHANNEL_ID = '1492254600458408059';
const RYBAK_ROLE_ID = '1492254899558416554';

export const rybyCommand = {
    data: new SlashCommandBuilder()
        .setName('ryby')
        .setDescription('Złóż wniosek o sprzedaż złowionych ryb (Wymaga karty rybackiej)')
        .addIntegerOption(opt => 
            opt.setName('suma')
               .setDescription('Suma brutto za złowione ryby (pobrany zostanie podatek 40%)')
               .setRequired(true))
        .addAttachmentOption(opt => 
            opt.setName('screenshot')
               .setDescription('Screenshot potwierdzający złowienie ryb')
               .setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction) {
        // 1. Sprawdzenie kanału
        if (interaction.channelId !== RYBY_CHANNEL_ID) {
            return interaction.reply({ content: `🚫 Komendy /ryby można używać wyłącznie na kanale <#${RYBY_CHANNEL_ID}>.`, ephemeral: true });
        }

        const discordId = interaction.user.id;

        // 2. Sprawdzenie dowodu osobistego
        const citizen = await prisma.citizen.findUnique({ where: { discordId } });
        if (!citizen) {
            return interaction.reply({ content: '🚫 Musisz posiadać wyrobiony dowód osobisty, aby legalnie sprzedawać ryby w Bielisku!', ephemeral: true });
        }

        // 3. Sprawdzenie rangi Rybak
        const member = await interaction.guild?.members.fetch(discordId);
        if (!member?.roles.cache.has(RYBAK_ROLE_ID)) {
            return interaction.reply({ content: `🚫 Musisz posiadać rangę <@&${RYBAK_ROLE_ID}>, aby móc łowić ryby zawodowo.`, ephemeral: true });
        }

        // 4. Sprawdzenie karty rybackiej w ekwipunku
        const hasPermit = await prisma.inventory.findFirst({
            where: { discordId, itemKey: 'karta_rybacka' }
        });
        if (!hasPermit) {
            return interaction.reply({ content: '🚫 Nie posiadasz **Karty rybackiej**! Możesz ją zakupić w `/sklep` (Kategoria: Legalne) za 7000 zł.', ephemeral: true });
        }

        const sumaBrutto = interaction.options.getInteger('suma', true);
        const screenshot = interaction.options.getAttachment('screenshot', true);

        if (sumaBrutto <= 0) {
            return interaction.reply({ content: '🚫 Suma musi być większa niż 0.', ephemeral: true });
        }

        const taxedAmount = Math.floor(sumaBrutto * 0.6); // 40% podatek -> 60% dla gracza

        await interaction.deferReply({ ephemeral: true });

        try {
            // 5. Utworzenie wniosku w bazie
            await (prisma as any).fishingRequest.create({
                data: {
                    discordId,
                    robloxNick: citizen.robloxNick,
                    amount: sumaBrutto,
                    taxedAmount,
                    screenshotUrl: screenshot.url
                }
            });

            // 6. Obsługa skonsolidowanej wiadomości dla administracji
            const adminChannel = await interaction.client.channels.fetch(SPRAWDZANIE_RYB_CHANNEL_ID).catch(() => null);
            if (adminChannel && adminChannel.isTextBased()) {
                const pendingRequests = await (prisma as any).fishingRequest.findMany({
                    where: { discordId, status: 'PENDING' },
                    orderBy: { createdAt: 'asc' }
                });

                const count = pendingRequests.length;
                const summary = await (prisma as any).fishingSummary.findUnique({ where: { discordId } });

                const embed = new EmbedBuilder()
                    .setTitle(`🎣 Wnioski o ryby: ${citizen.firstName} ${citizen.lastName}`)
                    .setDescription(`Gracz: **${citizen.firstName} ${citizen.lastName}** (@${citizen.robloxNick})\nOczekujące wnioski: **${count}**\nSuma netto oczekująca: **${pendingRequests.reduce((acc: number, curr: any) => acc + curr.taxedAmount, 0).toLocaleString()} zł**`)
                    .setColor('#3498db')
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setFooter({ text: 'RP Bielisko - System Składu Ryb' })
                    .setTimestamp();

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`fish_review|${discordId}`)
                        .setLabel(`Rozpocznij sprawdzanie (${count})`)
                        .setStyle(ButtonStyle.Primary)
                );

                // Usuń poprzednią wiadomość zbiorczą jeśli istnieje
                if (summary) {
                    try {
                        const oldMsg = await (adminChannel as any).messages.fetch(summary.messageId);
                        if (oldMsg) await oldMsg.delete();
                    } catch (e) { /* ignore */ }
                }

                const newMsg = await (adminChannel as any).send({ embeds: [embed], components: [row] });
                
                // Zapisz nową wiadomość zbiorczą
                await (prisma as any).fishingSummary.upsert({
                    where: { discordId },
                    update: { messageId: newMsg.id },
                    create: { discordId, messageId: newMsg.id }
                });
            }

            await interaction.editReply({ 
                content: `✅ Wniosek wysłany! Po odliczeniu podatku (40%) otrzymasz **${taxedAmount.toLocaleString()} zł** do kieszeni, gdy tylko administrator go zaakceptuje.\nObecnie masz **${await (prisma as any).fishingRequest.count({ where: { discordId, status: 'PENDING' }})}** oczekujących wniosków.` 
            });

        } catch (error) {
            console.error('Błąd /ryby:', error);
            await interaction.editReply({ content: '🚫 Wystąpił błąd podczas wysyłania wniosku do bazy.' });
        }
    }
};
