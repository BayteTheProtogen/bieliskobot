import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Client, TextChannel, EmbedBuilder as DiscordEmbedBuilder } from 'discord.js';
import { prisma } from '../services/db';
import { executeERLCCommand } from '../services/erlc';
import { finalizeAction } from '../services/modActions';
import axios from 'axios';

const LOG_WWW_CHANNEL = '1490076757955575849';
const SHIFTS_CHANNEL = '1490297041472065697';

// Helper for parsing JSON body
function parseJSONBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
    });
}

// Ensure WebSession is valid
async function getSession(req: http.IncomingMessage) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    if (!token) return null;

    const session = await (prisma as any).webSession.findUnique({ where: { token } });
    if (!session || session.expiresAt < new Date()) {
        return null;
    }
    return session;
}

// Logging helper
async function logActionToDiscord(client: Client, discordId: string, title: string, description: string, color: string = '#3498db') {
    try {
        const channel = await client.channels.fetch(LOG_WWW_CHANNEL).catch(() => null) as TextChannel;
        if (!channel) return;

        const embed = new DiscordEmbedBuilder()
            .setTitle(`🌐 [WebPanel] ${title}`)
            .setDescription(description)
            .setColor(color as any)
            .addFields({ name: 'Moderator', value: `<@${discordId}>`, inline: true })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[WebUI] Log error:', e);
    }
}

// Shift Report helper
async function sendShiftReport(client: Client, moderatorId: string, durationMin: number, startTime: Date, endTime: Date, isAuto: boolean = false) {
    try {
        const channel = await client.channels.fetch(SHIFTS_CHANNEL).catch(() => null) as TextChannel;
        if (!channel) return;

        const embed = new DiscordEmbedBuilder()
            .setTitle(`📋 Raport z dyżuru: <@${moderatorId}>`)
            .setColor(isAuto ? '#e67e22' : '#2ecc71')
            .addFields(
                { name: '⏱️ Czas trwania', value: `**${durationMin} min**`, inline: true },
                { name: '📅 Rozpoczęto', value: `<t:${Math.floor(startTime.getTime() / 1000)}:f>`, inline: true },
                { name: '📅 Zakończono', value: `<t:${Math.floor(endTime.getTime() / 1000)}:f>`, inline: true },
                { name: '💡 Status', value: isAuto ? '⚠️ Zamknięto automatycznie (brak aktywności)' : '✅ Zamknięto ręcznie', inline: false }
            )
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[WebUI] Shift report error:', e);
    }
}

async function stopShift(client: Client, discordId: string, isAuto: boolean = false) {
    const existing = await (prisma as any).moderationShift.findFirst({
        where: { moderatorId: discordId, endTime: null },
        orderBy: { startTime: 'desc' }
    });
    if (!existing) return null;

    const endTime = new Date();
    const diffMs = endTime.getTime() - existing.startTime.getTime();
    const durationMinutes = Math.round(diffMs / 60000);

    await (prisma as any).moderationShift.update({
        where: { id: existing.id },
        data: { endTime, durationMinutes }
    });

    await sendShiftReport(client, discordId, durationMinutes, existing.startTime, endTime, isAuto);
    await logActionToDiscord(client, discordId, 'Koniec dyżuru', `Zakończono dyżur po **${durationMinutes}** minutach.${isAuto ? ' *(Automatycznie)*' : ''}`, isAuto ? '#e67e22' : '#95a5a6');

    return durationMinutes;
}

export function startWebServer(client: Client, port: number = 3000) {
    // Background job for auto-closing shifts (every 1 min)
    setInterval(async () => {
        const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
        const inactiveSessions = await (prisma as any).webSession.findMany({
            where: { lastHeartbeat: { lt: twentyMinAgo } }
        });

        for (const session of inactiveSessions) {
            await stopShift(client, session.discordId, true);
            // Optionally clean up session if expired, but here we just manage the shift
        }
    }, 60 * 1000);

    const server = http.createServer(async (req, res) => {
        // CORS Headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const pathname = url.pathname;

        // Static Files
        if (!pathname.startsWith('/api/')) {
            const publicDir = path.join(process.cwd(), 'src', 'web', 'public');
            let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
            if (!filePath.startsWith(publicDir)) { res.writeHead(403); return res.end('Forbidden'); }

            if (!fs.existsSync(filePath)) {
                filePath = path.join(publicDir, 'index.html');
                if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('File not found.'); }
            }

            const extname = path.extname(filePath);
            const contentTypes: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg', '.gif': 'image/gif' };

            const contentType = contentTypes[extname] || 'application/octet-stream';
            fs.readFile(filePath, (err, content) => {
                if (err) { res.writeHead(500); res.end('Server error'); } 
                else { res.writeHead(200, { 'Content-Type': contentType }); res.end(content, 'utf-8'); }
            });
            return;
        }

        // --- API ROUTES ---
        res.setHeader('Content-Type', 'application/json');

        const session = await getSession(req);
        if (!session && pathname !== '/api/auth/verify') {
            res.writeHead(401);
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }

        try {
            if (req.method === 'POST' && pathname === '/api/heartbeat') {
                await (prisma as any).webSession.update({
                    where: { token: session!.token },
                    data: { lastHeartbeat: new Date() }
                });
                res.writeHead(200); return res.end(JSON.stringify({ success: true }));
            }

            if (req.method === 'GET' && pathname === '/api/me') {
                const user = await client.users.fetch(session!.discordId).catch(() => null);
                const shift = await (prisma as any).moderationShift.findFirst({
                    where: { moderatorId: session!.discordId, endTime: null },
                    orderBy: { startTime: 'desc' }
                });

                res.writeHead(200);
                res.end(JSON.stringify({ 
                    id: session!.discordId, username: user?.username || 'Unknown', 
                    avatar: user?.displayAvatarURL({ extension: 'png' }) || null,
                    shiftActive: !!shift, shiftStart: shift?.startTime || null
                }));
                return;
            }

            if (req.method === 'GET' && pathname === '/api/moderators') {
                const activeShifts = await (prisma as any).moderationShift.findMany({
                    where: { endTime: null }
                });
                
                const mods = await Promise.all(activeShifts.map(async (s: any) => {
                    const u = await client.users.fetch(s.moderatorId).catch(() => null);
                    return {
                        id: s.moderatorId,
                        username: u?.username || 'Unknown',
                        avatar: u?.displayAvatarURL({ size: 64, extension: 'png' }) || null,
                        startTime: s.startTime
                    };
                }));

                res.writeHead(200); return res.end(JSON.stringify(mods));
            }

            if (req.method === 'POST' && pathname === '/api/shift/start') {
                const existing = await (prisma as any).moderationShift.findFirst({
                    where: { moderatorId: session!.discordId, endTime: null }
                });
                if (existing) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Służba już trwa' })); }

                await (prisma as any).moderationShift.create({ data: { moderatorId: session!.discordId } });
                await logActionToDiscord(client, session!.discordId, 'Rozpoczęcie dyżuru', 'Użytkownik wszedł na służbę w panelu.', '#2ecc71');

                res.writeHead(200); return res.end(JSON.stringify({ success: true }));
            }

            if (req.method === 'POST' && pathname === '/api/shift/stop') {
                const duration = await stopShift(client, session!.discordId);
                if (duration === null) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Brak aktywnej służby' })); }
                res.writeHead(200); return res.end(JSON.stringify({ success: true, duration }));
            }

            if (req.method === 'GET' && pathname === '/api/players') {
                const ERLC_API_V1 = 'https://api.policeroleplay.community/v1/server';
                try {
                    const serverKey = process.env.ERLC_SERVER_KEY || '';
                    const erlcRes = await axios.get(`${ERLC_API_V1}/players`, { headers: { 'Server-Key': serverKey }});
                    const playersData = Array.isArray(erlcRes.data) ? erlcRes.data : [];
                    
                    const enhancedPlayers = await Promise.all(playersData.map(async (p) => {
                        const [nick, robloxId] = (p.Player || '').split(':');
                        let discordAvatar = null;
                        if (robloxId) {
                            const citizen = await (prisma as any).citizen.findFirst({ where: { robloxId } });
                            if (citizen) {
                                const discordUser = await client.users.fetch(citizen.discordId).catch(() => null);
                                if (discordUser) discordAvatar = discordUser.displayAvatarURL({ size: 64, extension: 'png' });
                            }
                        }
                        return { nick: nick || 'Unknown', robloxId: robloxId || '', permission: p.Permission, discordAvatar };
                    }));
                    res.writeHead(200); return res.end(JSON.stringify(enhancedPlayers));
                } catch (e: any) {
                    res.writeHead(500); return res.end(JSON.stringify({ error: 'Blad ERLC' }));
                }
            }

            if (req.method === 'POST' && pathname === '/api/action') {
                const body = await parseJSONBody(req);
                const { type, targetNick, reason, duration } = body;
                if (!type || !targetNick || !reason) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing params' })); }

                const shift = await (prisma as any).moderationShift.findFirst({
                    where: { moderatorId: session!.discordId, endTime: null }
                });
                if (!shift) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Musisz rozpocząć służbę!' })); }

                let commandStr = '';
                let hours = null;
                let isPerm = false;

                if (type === 'kick') {
                    commandStr = `:kick ${targetNick} ${reason}`;
                } else if (type === 'ban') {
                    if (duration && duration !== 'perm') {
                        commandStr = `:ban ${targetNick} ${duration} ${reason}`;
                        hours = parseInt(duration) || null;
                    } else {
                        commandStr = `:pban ${targetNick} ${reason}`;
                        isPerm = true;
                    }
                } else if (type === 'warn') {
                    commandStr = `:pm ${targetNick} OSTRZEŻENIE: ${reason}`;
                }

                if (type !== 'log') {
                    const result = await executeERLCCommand(commandStr);
                    if (!result.success) { res.writeHead(500); return res.end(JSON.stringify({ error: result.error })); }

                    // Sync with modActions flow for bany/kicki
                    if (type === 'ban' || type === 'kick') {
                        const modUser = await client.users.fetch(session!.discordId);
                        await finalizeAction(client, modUser, session!.discordId, `:${type}`, targetNick, reason, hours, isPerm, 'discord');
                    }
                    
                    if (type === 'warn') {
                        const targetCitizen = await (prisma as any).citizen.findFirst({ where: { robloxNick: { equals: targetNick, mode: 'insensitive' } }});
                        if (targetCitizen) {
                            const discordUser = await client.users.fetch(targetCitizen.discordId).catch(() => null);
                            if (discordUser) discordUser.send(`⚠️ **Otrzymałeś ostrzeżenie od Administracji!**\n\n**Powód:** ${reason}`).catch(() => null);
                        }
                    }

                    await logActionToDiscord(client, session!.discordId, `Akcja: ${type.toUpperCase()}`, `Gracz: **${targetNick}**\nPowód: ${reason}\n${duration ? `Długość: ${duration}` : ''}`, type === 'ban' ? '#e74c3c' : (type === 'warn' ? '#f39c12' : '#3498db'));
                } else {
                    // Manual Log
                    await logActionToDiscord(client, session!.discordId, 'Akcja: LOG', `Gracz: **${targetNick}**\nInformacja: ${reason}`, '#7f8c8d');
                }

                res.writeHead(200); return res.end(JSON.stringify({ success: true }));
            }

            res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
        } catch (error: any) {
            console.error('API Error:', error);
            res.writeHead(500); res.end(JSON.stringify({ error: 'Internal Error' }));
        }
    });

    server.listen(port, () => {
        console.log(`[WebUI] Panel dostępny na HTTP port ${port}`);
    });
}
