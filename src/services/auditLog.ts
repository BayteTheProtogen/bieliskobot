import { Client, EmbedBuilder, Message } from 'discord.js';
import { prisma } from './db';
import { PunishmentType } from '@prisma/client';
import { generatePrisonerCard } from './canvas';
import { AttachmentBuilder } from 'discord.js';

const ERLC_API_URL = 'https://api.policeroleplay.community/v2/server';
const POLL_INTERVAL = 2 * 60 * 1000; // 2 minuty
const LOG_CHANNEL_ID = '1490303478965207181';

interface CommandLog {
    Username: string;
    UserId: number;
    Command: string;
    Timestamp: number;
}

interface PendingAction {
    adminDiscordId: string;
    targetNick: string;
    type: PunishmentType;
    step: 'REASON' | 'DURATION' | 'DONE';
    reason?: string;
    duration?: string;
    robloxCommand: string;
}

// Kolejka akcji: Map<DiscordId, PendingAction[]>
const adminQueues = new Map<string, PendingAction[]>();

export async function startAuditLogPolling(client: Client) {
    console.log('👀 Uruchomiono monitoring logów ER:LC...');
    
    setInterval(async () => {
        try {
            const state = await prisma.auditLogState.findUnique({ where: { id: 1 } });
            const lastTimestamp = state?.lastProcessedTimestamp ? state.lastProcessedTimestamp.getTime() : 0;

            const response = await fetch(`${ERLC_API_URL}?CommandLogs=true`, {
                headers: { 'Server-Key': process.env.ERLC_SERVER_KEY || '' }
            });

            if (!response.ok) return;

            const data = (await response.json()) as any;
            const logs: CommandLog[] = data.CommandLogs || [];

            // Sortuj logi od najstarszych
            const newLogs = logs
                .filter(l => (l.Timestamp * 1000) > lastTimestamp)
                .sort((a, b) => a.Timestamp - b.Timestamp);

            for (const log of newLogs) {
                await processLog(client, log);
            }

            if (newLogs.length > 0) {
                const latest = newLogs[newLogs.length - 1];
                await prisma.auditLogState.upsert({
                    where: { id: 1 },
                    update: { lastProcessedTimestamp: new Date(latest.Timestamp * 1000) },
                    create: { id: 1, lastProcessedTimestamp: new Date(latest.Timestamp * 1000) }
                });
            }
        } catch (error) {
            console.error('Błąd podczas odpytywania API ER:LC:', error);
        }
    }, POLL_INTERVAL);
}

async function processLog(client: Client, log: CommandLog) {
    const cmd = log.Command.toLowerCase();
    let type: PunishmentType | null = null;
    
    if (cmd.startsWith(':kick')) type = PunishmentType.KICK;
    if (cmd.startsWith(':ban')) type = PunishmentType.BAN;

    if (!type) return;

    // Wyciągnij nick celu z komendy
    const parts = log.Command.split(' ');
    const targetNick = parts[1];
    if (!targetNick) return;

    // Znajdź admina na Discordzie
    const admin = await prisma.citizen.findFirst({
        where: { robloxId: log.UserId.toString() }
    });

    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);

    if (!admin) {
        if (logChannel?.isTextBased()) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Wykryto akcję w grze (Admin Niezarejestrowany)')
                .setColor('#95a5a6')
                .addFields(
                    { name: 'Admin (Roblox)', value: log.Username, inline: true },
                    { name: 'Akcja', value: log.Command, inline: true },
                    { name: 'Uwaga', value: 'Bot nie mógł wysłać DM do admina, ponieważ nie ma on profilu.' }
                )
                .setTimestamp();
            await (logChannel as any).send({ embeds: [embed] });
        }
        return;
    }

    try {
        const discordUser = await client.users.fetch(admin.discordId);
        
        const newAction: PendingAction = {
            adminDiscordId: admin.discordId,
            targetNick,
            type,
            step: 'REASON',
            robloxCommand: log.Command
        };

        const queue = adminQueues.get(admin.discordId) || [];
        queue.push(newAction);
        adminQueues.set(admin.discordId, queue);

        // Jeśli to pierwsza akcja w kolejce, zacznij konwersację
        if (queue.length === 1) {
            await startActionConversation(discordUser, newAction);
        }
        
    } catch (e) {
        console.error(`Nie udało się wysłać DM do admina ${admin.discordId}:`, e);
    }
}

async function startActionConversation(user: any, action: PendingAction) {
    await user.send(`👮‍♂️ Wykryto, że użyłeś komendy w grze: \`${action.robloxCommand}\` na graczu **${action.targetNick}**.\n\n**Dlaczego to zrobiłeś?** (Podaj powód kary)`);
    await user.send(`💡 *Pamiętaj: Następnym razem użyj komendy \`!bb\` na Discordzie, aby system automatycznie przygotował pełną dokumentację!*`);
}

export async function handleAdminDM(message: Message) {
    if (message.author.bot) return;
    
    const queue = adminQueues.get(message.author.id);
    if (!queue || queue.length === 0) return;

    const action = queue[0]; // Zawsze obsługujemy pierwszą akcję z kolejki

    if (action.step === 'REASON') {
        action.reason = message.content;
        
        if (action.type === PunishmentType.BAN) {
            action.step = 'DURATION';
            await message.reply('⏳ Na jak długo? (np. `24h`, `permanentny`).');
        } else {
            action.step = 'DONE';
            await finalizeAction(message.client, action);
            await checkNextInQueue(message.author, message.client);
        }
    } else if (action.step === 'DURATION') {
        action.duration = message.content;
        action.step = 'DONE';
        await finalizeAction(message.client, action);
        await checkNextInQueue(message.author, message.client);
    }
}

async function checkNextInQueue(user: any, client: Client) {
    const queue = adminQueues.get(user.id);
    if (!queue) return;
    
    queue.shift(); // Usuń zakończoną akcję
    
    if (queue.length > 0) {
        const next = queue[0];
        await startActionConversation(user, next);
    } else {
        adminQueues.delete(user.id);
    }
}

async function finalizeAction(client: Client, action: PendingAction) {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel?.isTextBased()) return;

    const isPerm = action.duration?.toLowerCase().includes('perm') || action.type === PunishmentType.PERMBAN;
    const title = action.type === PunishmentType.KICK ? '⚖️ Wyrzucenie (In-Game)' : 
                 (isPerm ? '💀 Dożywocie (In-Game)' : '⛓️ Ban tymczasowy (In-Game)');
    
    const color = action.type === PunishmentType.KICK ? '#f1c40f' : (isPerm ? '#c0392b' : '#e67e22');

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color as any)
        .addFields(
            { name: 'Gracz', value: action.targetNick, inline: true },
            { name: 'Powód', value: action.reason || 'Brak', inline: true },
            { name: 'Moderator', value: `<@${action.adminDiscordId}>`, inline: true }
        )
        .setTimestamp();

    if (action.duration && !isPerm) {
        embed.addFields({ name: 'Czas', value: action.duration, inline: true });
    }

    let attachment: AttachmentBuilder | null = null;
    if (action.type !== PunishmentType.KICK) {
        const img = await generatePrisonerCard(`https://www.roblox.com/headshot-thumbnail/image?userName=${action.targetNick}&width=420&height=420&format=png`);
        attachment = new AttachmentBuilder(img, { name: 'perp.png' });
        embed.setThumbnail('attachment://perp.png');
    }

    const sent = await (logChannel as any).send({ 
        embeds: [embed], 
        files: attachment ? [attachment] : [] 
    });

    const citizen = await prisma.citizen.findFirst({ where: { robloxNick: { equals: action.targetNick, mode: 'insensitive' } } });
    if (citizen) {
        await prisma.punishment.create({
            data: {
                citizenId: citizen.discordId,
                type: isPerm ? PunishmentType.PERMBAN : action.type,
                reason: action.reason || '',
                duration: action.duration,
                messageId: sent.id,
                isActive: action.type !== PunishmentType.KICK
            }
        });

        if (action.type === PunishmentType.BAN || isPerm) {
            await prisma.citizen.update({
                where: { discordId: citizen.discordId },
                data: {
                    isPermBanned: isPerm,
                    bannedUntil: isPerm ? null : new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
            });
        }
    }

    await client.users.send(action.adminDiscordId, '✅ Akcja została zapisana i zalogowana w systemie Bielisko. Dziękuję!');
}
