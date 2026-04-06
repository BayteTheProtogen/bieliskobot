import { Client, EmbedBuilder, AttachmentBuilder, User, TextChannel } from 'discord.js';
import { prisma } from './db';
import { generatePrisonerCard } from './canvas';

export const BAN_ROOM_ID = '1490073045002485991';

export async function finalizeAction(
    client: Client,
    user: User,
    modDiscordId: string,
    action: string, // ':ban', ':pban', ':kick', ':unban'
    targetNick: string,
    reason: string,
    hours: number | null,
    isPermBan: boolean,
) {
    const bannedUntil = hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;

    // Update Citizen DB record
    const citizen = await prisma.citizen.findFirst({
        where: { robloxNick: { equals: targetNick, mode: 'insensitive' } }
    });

    if (citizen) {
        if (action === ':unban') {
            await (prisma.citizen as any).update({
                where: { discordId: citizen.discordId },
                data: { isPermBanned: false, bannedUntil: null }
            });
        } else if (action !== ':kick') {
            await (prisma.citizen as any).update({
                where: { discordId: citizen.discordId },
                data: { isPermBanned: isPermBan, bannedUntil }
            });
        }
    }

    // Build embed
    const banroom = client.channels.cache.get(BAN_ROOM_ID) as TextChannel | undefined;
    if (!banroom) return;

    let embed: EmbedBuilder;

    if (action === ':kick') {
        embed = new EmbedBuilder()
            .setTitle('⚖️ Wyrzucenie z serwera *(In-Game)*')
            .setColor('#f1c40f')
            .setDescription('*Akcja wykonana bezpośrednio w grze – zarejestrowana przez bota.*')
            .addFields(
                { name: 'Gracz', value: targetNick, inline: true },
                { name: 'Powód', value: reason, inline: true },
                { name: 'Moderator', value: user.tag, inline: true },
            ).setTimestamp();

        await (banroom as any).send({ embeds: [embed] });

    } else if (action === ':unban') {
        embed = new EmbedBuilder()
            .setTitle('🔓 Uwolnienie / Odbanowanie *(In-Game)*')
            .setColor('#2ecc71')
            .setDescription('*Akcja wykonana bezpośrednio w grze – zarejestrowana przez bota.*')
            .addFields(
                { name: 'Gracz', value: targetNick, inline: true },
                { name: 'Moderator', value: user.tag, inline: true },
            ).setTimestamp();

        // Try to edit the original ban embed
        const banLog = await (prisma as any).banLog.findFirst({
            where: { playerNick: { equals: targetNick, mode: 'insensitive' }, unbannedAt: null },
            orderBy: { createdAt: 'desc' }
        });

        if (banLog) {
            try {
                const banMsg = await (banroom as any).messages.fetch(banLog.messageId).catch(() => null);
                if (banMsg) {
                    const originalEmbed = banMsg.embeds[0];
                    const updatedEmbed = EmbedBuilder.from(originalEmbed)
                        .setColor('#2ecc71')
                        .addFields({ name: '✅ ODBANOWANY', value: `<t:${Math.floor(Date.now() / 1000)}:R> przez ${user.tag}`, inline: false });
                    await banMsg.edit({ embeds: [updatedEmbed] });
                    await (prisma as any).banLog.update({
                        where: { id: banLog.id },
                        data: { unbannedAt: new Date(), unbanModDiscordId: modDiscordId }
                    });
                }
                // Send a short summary anyway
                await (banroom as any).send({ embeds: [embed] });
            } catch (e) {
                await (banroom as any).send({ embeds: [embed] });
            }
        } else {
            await (banroom as any).send({ embeds: [embed] });
        }

    } else {
        // Ban (temp or perm)
        embed = isPermBan
            ? new EmbedBuilder()
                .setTitle('💀 Dożywocie / Permban *(In-Game)*')
                .setColor('#c0392b')
                .setDescription('*Akcja wykonana bezpośrednio w grze – zarejestrowana przez bota.*')
                .addFields(
                    { name: 'Skazany (Gracz)', value: targetNick, inline: true },
                    { name: 'Powód', value: reason, inline: true },
                    { name: 'Wyrok wydał (Moderator)', value: user.tag, inline: true },
                ).setTimestamp()
            : new EmbedBuilder()
                .setTitle('⛓️ Ban tymczasowy *(In-Game)*')
                .setColor('#e67e22')
                .setDescription('*Akcja wykonana bezpośrednio w grze – zarejestrowana przez bota.*')
                .addFields(
                    { name: 'Gracz', value: targetNick, inline: true },
                    { name: 'Czas kary', value: `${hours}h`, inline: true },
                    { name: 'Koniec kary', value: bannedUntil ? `<t:${Math.floor(bannedUntil.getTime() / 1000)}:R>` : '—', inline: true },
                    { name: 'Powód', value: reason, inline: false },
                    { name: 'Moderator', value: user.tag, inline: true },
                ).setTimestamp();

        try {
            const img = await generatePrisonerCard(
                `https://www.roblox.com/headshot-thumbnail/image?userName=${targetNick}&width=420&height=420&format=png`
            );
            const attachment = new AttachmentBuilder(img, { name: 'prisoner.png' });
            embed.setThumbnail('attachment://prisoner.png');
            const sentMsg = await (banroom as any).send({ embeds: [embed], files: [attachment] });

            // Save BanLog for future unban editing
            await (prisma as any).banLog.create({
                data: {
                    playerNick: targetNick,
                    moderatorDiscordId: modDiscordId,
                    channelId: BAN_ROOM_ID,
                    messageId: sentMsg.id,
                    reason,
                    bannedUntil,
                    isPermBan,
                }
            });
        } catch {
            const sentMsg = await (banroom as any).send({ embeds: [embed] });
            await (prisma as any).banLog.create({
                data: {
                    playerNick: targetNick, moderatorDiscordId: modDiscordId,
                    channelId: BAN_ROOM_ID, messageId: sentMsg.id,
                    reason, bannedUntil, isPermBan,
                }
            });
        }
    }
}
