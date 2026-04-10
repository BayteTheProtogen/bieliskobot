import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { getCommandLogs, erlcModeration } from './erlc';
import { prisma } from './db';
import { BAN_ROOM_ID } from './modActions';

const MODERATED_CMDS = [':ban', ':pban', ':kick', ':unban'];

export function startERLCPolling(client: Client) {
    console.log('[ERLC Poller] Started polling every 2 minutes.');
    // Initial run after 10s to let the bot fully boot
    setTimeout(() => pollOnce(client), 10_000);
    setInterval(() => pollOnce(client), 2 * 60 * 1000);
}

export function startAutoUnbanJob(client: Client) {
    console.log('[Auto-Unban] Job started (10 min interval).');
    setInterval(async () => {
        try {
            const now = new Date();
            const expiredBans = await (prisma as any).banLog.findMany({
                where: {
                    unbannedAt: null,
                    isPermBan: false,
                    bannedUntil: { lt: now }
                }
            });

            for (const ban of expiredBans) {
                const result = await erlcModeration.unban(ban.playerNick);
                if (result.success) {
                    await (prisma as any).banLog.update({
                        where: { id: ban.id },
                        data: { unbannedAt: now }
                    });
                    
                    const citizen = await prisma.citizen.findFirst({ where: { robloxNick: { equals: ban.playerNick, mode: 'insensitive' } } });
                    if (citizen) {
                        await prisma.citizen.update({
                            where: { discordId: citizen.discordId },
                            data: { bannedUntil: null, isPermBanned: false }
                        });
                    }

                    const banroom = client.channels.cache.get(BAN_ROOM_ID) as TextChannel | undefined;
                    if (banroom) {
                        const embed = new EmbedBuilder()
                            .setTitle('🔓 Automatyczne Odbanowanie')
                            .setDescription(`Czas kary dla gracza **${ban.playerNick}** dobiegł końca. Bot automatycznie zdjął blokadę serwerową.`)
                            .setColor('#27ae60')
                            .setTimestamp();
                        await banroom.send({ embeds: [embed] });
                    }
                }
            }
        } catch (e) {
            console.error('[Auto-Unban] Error:', e);
        }
    }, 10 * 60 * 1000);
}

async function pollOnce(client: Client) {
    try {
        const logs = await getCommandLogs();
        for (const log of logs) {
            const cmd = log.Command.trim();
            const lowerCmd = cmd.toLowerCase();
            
            const isLogCmd = lowerCmd.startsWith(':log ');
            const isModCmd = MODERATED_CMDS.some(c => lowerCmd.startsWith(c + ' ') || lowerCmd === c);
            if (!isLogCmd && !isModCmd) continue;

            const erlcTimestamp = log.Timestamp;
            const existing = await prisma.trackedAction.findUnique({ where: { erlcTimestamp } });
            if (existing) continue;

            await prisma.trackedAction.create({ data: { erlcTimestamp } });

            const [playerNick] = log.Player.split(':');

            if (isLogCmd) {
                const logContent = cmd.slice(5).trim();
                const logChannelId = '1490076757955575849';
                try {
                    const channel = await client.channels.fetch(logChannelId);
                    if (channel?.isTextBased()) {
                        const embed = new EmbedBuilder()
                            .setTitle('📝 Nowy wpis w logach (In-Game)')
                            .addFields(
                                { name: '👤 Gracz', value: `**${playerNick}**`, inline: true },
                                { name: '🕒 Czas (ERLC)', value: `<t:${erlcTimestamp}:f>`, inline: true },
                                { name: '📄 Treść', value: logContent }
                            )
                            .setColor('#f1c40f')
                            .setTimestamp();
                        await (channel as any).send({ embeds: [embed] });
                    }
                } catch (e) {}
                continue;
            }

            // Moderation Flow (Conversational DM)
            const args = cmd.split(/\s+/);
            const action = args[0].toLowerCase();
            const targetNick = args[1];
            if (!targetNick) continue;

            const modCitizen = await prisma.citizen.findFirst({
                where: { robloxNick: { equals: playerNick, mode: 'insensitive' } }
            });
            if (!modCitizen) continue;

            try {
                const user = await client.users.fetch(modCitizen.discordId);
                
                // Initialize conversation in DB
                await (prisma as any).banConversation.upsert({
                    where: { userId: user.id },
                    update: { targetNick, action, erlcTimestamp, step: 1, tempDuration: null },
                    create: { userId: user.id, targetNick, action, erlcTimestamp, step: 1 }
                });

                if (action === ':unban') {
                    await user.send(`👋 Heja! Zauważyłem, że odbanowałeś gracza **${targetNick}** w grze. Czy możesz podać powód lub krótką notatkę do logów?`);
                    await (prisma as any).banConversation.update({ where: { userId: user.id }, data: { step: 2, tempDuration: 'unban' } });
                } else if (action === ':kick') {
                    await user.send(`👋 Heja! Zauważyłem, że wyrzuciłeś gracza **${targetNick}** z serwera. Jaki był powód tego kicka?`);
                    await (prisma as any).banConversation.update({ where: { userId: user.id }, data: { step: 2, tempDuration: 'kick' } });
                } else {
                    await user.send(`👋 Heja! Zauważyłem, że zbanowałeś gracza **${targetNick}** przez grę a nie panel. Na ile godzin nadałeś tę karę? (Np. 24, 48 albo wpisz 'perm' jeśli to ban stały)`);
                }
            } catch (e) {
                console.error(`[ERLC Poller] Failed to start conversation with ${playerNick}:`, e);
            }
        }
    } catch (e) {
        console.error('[ERLC Poller] Poll error:', e);
    }
}
