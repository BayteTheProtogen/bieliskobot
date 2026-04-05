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
}

const pendingActions = new Map<string, PendingAction>();

export async function startAuditLogPolling(client: Client) {
    console.log('👀 Uruchomiono monitoring logów ER:LC...');
    
    setInterval(async () => {
        try {
            const state = await prisma.auditLogState.findUnique({ where: { id: 1 } });
            const lastTimestamp = state?.lastProcessedTimestamp ? state.lastProcessedTimestamp.getTime() : 0;

            const response = await fetch(`${ERLC_API_URL}?CommandLogs=true`, {
                headers: { 
                    'Server-Key': process.env.ERLC_SERVER_KEY || '',
                    'User-Agent': 'BieliskoBot/1.0.0'
                }
            });

            if (!response.ok) return;

            const data = (await response.json()) as any;
            if (!data.CommandLogs) {
                console.log('ℹ️ Brak logów komend w odpowiedzi API ER:LC.');
                return;
            }
            const logs: CommandLog[] = data.CommandLogs;
            console.log(`📊 Pobrano ${logs.length} logów z ER:LC. Sprawdzam nowe...`);

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
    
    // Używamy .includes() dla większej elastyczności obok .startsWith()
    if (cmd.startsWith(':kick') || cmd.includes(':kick ')) type = PunishmentType.KICK;
    if (cmd.startsWith(':ban') || cmd.includes(':ban ')) type = PunishmentType.BAN;
    if (cmd.startsWith(':unban') || cmd.includes(':unban ')) {
        await handleInGameUnban(client, log);
        return;
    }

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
        
        pendingActions.set(admin.discordId, {
            adminDiscordId: admin.discordId,
            targetNick,
            type,
            step: 'REASON'
        });

        await discordUser.send(`👮‍♂️ Wykryto, że użyłeś komendy w grze: \`${log.Command}\` na graczu **${targetNick}**.\n\n**Dlaczego to zrobiłeś?** (Podaj powód kary)`);
        await discordUser.send(`💡 *Pamiętaj: Następnym razem użyj komendy \`!bb\` na Discordzie, aby system automatycznie przygotował pełną dokumentację!*`);
        
    } catch (e) {
        console.error(`Nie udało się wysłać DM do admina ${admin.discordId}:`, e);
    }
}

export async function handleAdminDM(message: Message) {
    if (message.author.bot) return;
    
    const action = pendingActions.get(message.author.id);
    if (!action) return;

    if (action.step === 'REASON') {
        action.reason = message.content;
        
        if (action.type === PunishmentType.BAN) {
            action.step = 'DURATION';
            await message.reply('⏳ Na jak długo? (np. `24h`, `permanentny`).');
        } else {
            action.step = 'DONE';
            await finalizeAction(message.client, action);
        }
    } else if (action.step === 'DURATION') {
        action.duration = message.content;
        action.step = 'DONE';
        await finalizeAction(message.client, action);
    }
}

async function finalizeAction(client: Client, action: PendingAction) {
    pendingActions.delete(action.adminDiscordId);
    
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

async function handleInGameUnban(client: Client, log: CommandLog) {
    const parts = log.Command.split(' ');
    const targetNick = parts[1];
    if (!targetNick) return;

    console.log(`🔓 Wykryto unban w grze dla: ${targetNick}`);

    const citizen = await prisma.citizen.findFirst({
        where: { robloxNick: { equals: targetNick, mode: 'insensitive' } }
    });

    if (citizen) {
        // Aktulizacja bazy
        await prisma.citizen.update({
            where: { discordId: citizen.discordId },
            data: { isPermBanned: false, bannedUntil: null }
        });

        // Edycja historycznych logów
        const activePunishments = await prisma.punishment.findMany({
            where: { citizenId: citizen.discordId, isActive: true }
        });

        const banRoom = client.channels.cache.get('1490073045002485991'); // Korzystamy z banroomu
        if (banRoom?.isTextBased()) {
            for (const p of activePunishments) {
                try {
                    const msg = await (banRoom as any).messages.fetch(p.messageId);
                    if (msg) {
                        const embed = EmbedBuilder.from(msg.embeds[0])
                            .setColor('#2ecc71')
                            .setTitle(msg.embeds[0].title + ' 🔓 ODBANOWANO');
                        await msg.edit({ embeds: [embed] });
                    }
                } catch (e) {
                    console.error(`Nie udało się edytować wiadomości ${p.messageId}:`, e);
                }
            }
        }

        await prisma.punishment.updateMany({
            where: { citizenId: citizen.discordId, isActive: true },
            data: { isActive: false }
        });

        // Powiadomienie admina (jeśli zarejestrowany)
        const admin = await prisma.citizen.findFirst({ where: { robloxId: log.UserId.toString() } });
        if (admin) {
            try {
                await client.users.send(admin.discordId, `✅ Wykryto, że odbanowałeś gracza **${targetNick}** w grze. System zaktualizował profil gracza i logi.`);
            } catch {}
        }
    }
}
