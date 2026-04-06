import { Client, EmbedBuilder, AttachmentBuilder, User, TextChannel } from 'discord.js';
import { getCommandLogs, ERLCCommandLog } from './erlc';
import { prisma } from './db';
import { generatePrisonerCard } from './canvas';

const BAN_ROOM_ID = '1490303478965207181';
const MODERATED_CMDS = [':ban', ':pban', ':kick', ':unban'];

export function startERLCPolling(client: Client) {
    console.log('[ERLC Poller] Started polling every 2 minutes.');
    // Initial run after 10s to let the bot fully boot
    setTimeout(() => pollOnce(client), 10_000);
    setInterval(() => pollOnce(client), 2 * 60 * 1000);
}

async function pollOnce(client: Client) {
    try {
        const logs = await getCommandLogs();
        for (const log of logs) {
            const cmd = log.Command.trim().toLowerCase();
            const isModCmd = MODERATED_CMDS.some(c => cmd.startsWith(c + ' ') || cmd === c);
            if (!isModCmd) continue;

            // Deduplication – skip if already processed
            const existing = await (prisma as any).trackedAction.findUnique({
                where: { erlcTimestamp: log.Timestamp }
            });
            if (existing) continue;

            // Mark as processed immediately to avoid race conditions
            await (prisma as any).trackedAction.create({
                data: { erlcTimestamp: log.Timestamp }
            });

            // Parse player nick & command type
            const [modNick] = log.Player.split(':');
            const args = log.Command.trim().split(/\s+/);
            const action = args[0].toLowerCase(); // :ban, :pban, :kick, :unban
            const targetNick = args[1];
            if (!targetNick) continue;

            // Find moderator Discord account via roblox nick
            const modCitizen = await prisma.citizen.findFirst({
                where: { robloxNick: { equals: modNick, mode: 'insensitive' } }
            });

            if (!modCitizen) {
                console.log(`[ERLC Poller] Moderator "${modNick}" not in DB – cannot DM.`);
                continue;
            }

            try {
                const discordUser = await client.users.fetch(modCitizen.discordId);
                await handleDMConversation(client, discordUser, modCitizen.discordId, action, targetNick);
            } catch (e) {
                console.error(`[ERLC Poller] Failed to DM ${modNick}:`, e);
            }
        }
    } catch (e) {
        console.error('[ERLC Poller] Poll error:', e);
    }
}

async function handleDMConversation(
    client: Client,
    user: User,
    modDiscordId: string,
    action: string,
    targetNick: string,
) {
    const actionLabel =
        action === ':kick'  ? 'wyrzucenie (kick)' :
        action === ':unban' ? 'odbanowanie'       :
        action === ':pban'  ? 'permaban'           : 'ban';

    // — DM 1: Why —
    await user.send(
        `⚠️ **Wykryto akcję moderacyjną wykonaną bezpośrednio w grze!**\n\n` +
        `Wykonałeś **${actionLabel}** na graczu **${targetNick}**.\n\n` +
        `❓ **Dlaczego?** Odpowiedz na tę wiadomość.\n\n` +
        `> 💡 Następnym razem użyj \`!bb ${action.replace(':', '')}\` na kanale moderacyjnym, ` +
        `żeby wszystko było zapisane automatycznie.`
    );

    const dm = await user.createDM();
    const filter = (m: any) => m.author.id === user.id;

    let reason = 'Brak powodu (brak odpowiedzi)';
    let hours: number | null = null;
    let isPermBan = (action === ':pban');

    try {
        const r1 = await dm.awaitMessages({ filter, max: 1, time: 30 * 60 * 1000, errors: ['time'] });
        reason = r1.first()!.content.trim() || 'Brak powodu';
    } catch {
        await user.send('⏱️ Czas na odpowiedź minął. Akcja została zarejestrowana z "Brak powodu".');
        await finalizeAction(client, user, modDiscordId, action, targetNick, reason, null, isPermBan);
        return;
    }

    // — DM 2: How long (only for bans) —
    if (action === ':ban') {
        await user.send(
            `✅ Powód: **${reason}**\n\n` +
            `⏳ **Na ile czasu?** Podaj liczbę godzin (np. \`24\`) lub wpisz \`permban\`.`
        );

        try {
            const r2 = await dm.awaitMessages({ filter, max: 1, time: 30 * 60 * 1000, errors: ['time'] });
            const input = r2.first()!.content.trim().toLowerCase();
            if (input === 'permban') {
                isPermBan = true;
            } else {
                const parsed = parseInt(input);
                if (!isNaN(parsed) && parsed > 0) {
                    hours = parsed;
                } else {
                    isPermBan = true;
                }
            }
        } catch {
            await user.send('⏱️ Czas na odpowiedź minął. Traktuję jako permaban.');
            isPermBan = true;
        }
    }

    await finalizeAction(client, user, modDiscordId, action, targetNick, reason, hours, isPermBan);
}

async function finalizeAction(
    client: Client,
    user: User,
    modDiscordId: string,
    action: string,
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
                const banMsg = await (banroom as any).messages.fetch(banLog.messageId);
                const originalEmbed = banMsg.embeds[0];
                const updatedEmbed = EmbedBuilder.from(originalEmbed)
                    .setColor('#2ecc71')
                    .addFields({ name: '✅ Odbanowany', value: `<t:${Math.floor(Date.now() / 1000)}:R> przez ${user.tag}`, inline: false });
                await banMsg.edit({ embeds: [updatedEmbed] });
                await (prisma as any).banLog.update({
                    where: { id: banLog.id },
                    data: { unbannedAt: new Date(), unbanModDiscordId: modDiscordId }
                });
                // Also send a short summary
                await (banroom as any).send({ embeds: [embed] });
            } catch {
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

    await user.send('✅ Akcja zarejestrowana i zaraportowana na kanale.\n💡 Następnym razem użyj `!bb` żeby to było automatyczne!');
}
