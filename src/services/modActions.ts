import { Client, EmbedBuilder, AttachmentBuilder, User, TextChannel } from 'discord.js';
import { prisma } from './db';
import { generatePrisonerCard } from './canvas';
import axios from 'axios';

export const BAN_ROOM_ID = '1490073045002485991';

async function getRobloxAvatar(nick: string): Promise<string | null> {
    try {
        const userRes = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [nick],
            excludeBannedUsers: false
        });
        
        const userData = userRes.data.data?.[0];
        if (!userData) return null;
        
        const userId = userData.id;
        const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`);
        return thumbRes.data.data?.[0]?.imageUrl || null;
    } catch (e) {
        console.error('Błąd pobierania avatara Robloxa:', e);
        return null;
    }
}

export async function finalizeAction(
    client: Client,
    user: User,
    modDiscordId: string,
    action: string, 
    targetNick: string,
    reason: string,
    hours: number | null,
    isPermBan: boolean,
    source: 'game' | 'discord' = 'game'
) {
    // Safety check: if it's a ban but no hours and not perm, fallback to something visible
    let finalIsPermBan = isPermBan;
    let finalHours = hours;
    
    if ((action === ':ban' || action === ':pban') && !finalIsPermBan && finalHours === null) {
        finalIsPermBan = true; // If no hours provided for a ban, treat as perm instead of showing nullh
    }

    const bannedUntil = finalHours ? new Date(Date.now() + finalHours * 60 * 60 * 1000) : null;

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
                data: { isPermBanned: finalIsPermBan, bannedUntil }
            });
        }
    }

    const banroom = client.channels.cache.get(BAN_ROOM_ID) as TextChannel | undefined;
    if (!banroom) return;

    let embed: EmbedBuilder;
    const suffix = source === 'game' ? ' *(In-Game)*' : '';
    const description = source === 'game' ? '*Akcja wykonana bezpośrednio w grze – zarejestrowana przez bota.*' : null;

    if (action === ':kick') {
        embed = new EmbedBuilder()
            .setTitle(`⚖️ Wyrzucenie z serwera${suffix}`)
            .setColor('#f1c40f')
            .addFields(
                { name: 'Gracz', value: targetNick, inline: true },
                { name: 'Powód', value: reason, inline: true },
                { name: 'Moderator', value: user.tag, inline: true },
            ).setTimestamp();
        if (description) embed.setDescription(description);

        await (banroom as any).send({ embeds: [embed] });

    } else if (action === ':unban') {
        embed = new EmbedBuilder()
            .setTitle(`🔓 Uwolnienie / Odbanowanie${suffix}`)
            .setColor('#2ecc71')
            .addFields(
                { name: 'Gracz', value: targetNick, inline: true },
                { name: 'Moderator', value: user.tag, inline: true },
            ).setTimestamp();
        if (description) embed.setDescription(description);

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
                        .setThumbnail(null)
                        .addFields({ name: '✅ ODBANOWANY', value: `<t:${Math.floor(Date.now() / 1000)}:R> • Moderator: ${user.tag}`, inline: false });
                    await banMsg.edit({ embeds: [updatedEmbed] });
                    await (prisma as any).banLog.update({
                        where: { id: banLog.id },
                        data: { unbannedAt: new Date(), unbanModDiscordId: modDiscordId }
                    });
                }
                await (banroom as any).send({ embeds: [embed] });
            } catch (e) {
                await (banroom as any).send({ embeds: [embed] });
            }
        } else {
            await (banroom as any).send({ embeds: [embed] });
        }

    } else {
        // Ban (temp or perm)
        embed = finalIsPermBan
            ? new EmbedBuilder()
                .setTitle(`💀 Dożywocie / Permban${suffix}`)
                .setColor('#c0392b')
                .addFields(
                    { name: 'Skazany (Gracz)', value: targetNick, inline: true },
                    { name: 'Powód', value: reason, inline: true },
                    { name: 'Wyrok wydał (Moderator)', value: user.tag, inline: true },
                ).setTimestamp()
            : new EmbedBuilder()
                .setTitle(`⛓️ Ban tymczasowy${suffix}`)
                .setColor('#e67e22')
                .addFields(
                    { name: 'Gracz', value: targetNick, inline: true },
                    { name: 'Czas kary', value: `${finalHours}h`, inline: true },
                    { name: 'Koniec kary', value: bannedUntil ? `<t:${Math.floor(bannedUntil.getTime() / 1000)}:R>` : '—', inline: true },
                    { name: 'Powód', value: reason, inline: false },
                    { name: 'Moderator', value: user.tag, inline: true },
                ).setTimestamp();
        
        if (description) embed.setDescription(description);

        try {
            const avatarUrl = await getRobloxAvatar(targetNick);
            const img = await generatePrisonerCard(avatarUrl || '');
            const attachment = new AttachmentBuilder(img, { name: 'prisoner.png' });
            embed.setThumbnail('attachment://prisoner.png');
            const sentMsg = await (banroom as any).send({ embeds: [embed], files: [attachment] });

            await (prisma as any).banLog.create({
                data: {
                    playerNick: targetNick,
                    moderatorDiscordId: modDiscordId,
                    channelId: BAN_ROOM_ID,
                    messageId: sentMsg.id,
                    reason,
                    bannedUntil,
                    isPermBan: finalIsPermBan,
                }
            });
        } catch (e) {
            const sentMsg = await (banroom as any).send({ embeds: [embed] });
            await (prisma as any).banLog.create({
                data: {
                    playerNick: targetNick, moderatorDiscordId: modDiscordId,
                    channelId: BAN_ROOM_ID, messageId: sentMsg.id,
                    reason, bannedUntil, isPermBan: finalIsPermBan,
                }
            });
        }
    }
}
