import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Client, TextChannel } from 'discord.js';
import { prisma } from '../services/db';
import { executeERLCCommand } from '../services/erlc';
import axios from 'axios';

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

export function startWebServer(client: Client, port: number = 3000) {
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
            
            // Basic security to avoid directory traversal
            if (!filePath.startsWith(publicDir)) {
                res.writeHead(403);
                return res.end('Forbidden');
            }

            if (!fs.existsSync(filePath)) {
                // SPA Fallback
                filePath = path.join(publicDir, 'index.html');
                if (!fs.existsSync(filePath)) {
                    res.writeHead(404);
                    return res.end('File not found.');
                }
            }

            const extname = path.extname(filePath);
            const contentTypes: Record<string, string> = {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpg',
                '.gif': 'image/gif'
            };

            const contentType = contentTypes[extname] || 'application/octet-stream';
            fs.readFile(filePath, (err, content) => {
                if (err) {
                    res.writeHead(500);
                    res.end('Server error');
                } else {
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(content, 'utf-8');
                }
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
            if (req.method === 'GET' && pathname === '/api/me') {
                const user = await client.users.fetch(session!.discordId).catch(() => null);
                // Sprawdzanie aktualnej służby
                const shift = await (prisma as any).moderationShift.findFirst({
                    where: { moderatorId: session!.discordId, endTime: null },
                    orderBy: { startTime: 'desc' }
                });

                res.writeHead(200);
                res.end(JSON.stringify({ 
                    id: session!.discordId, 
                    username: user?.username || 'Unknown', 
                    avatar: user?.displayAvatarURL({ extension: 'png' }) || null,
                    shiftActive: !!shift,
                    shiftStart: shift?.startTime || null
                }));
                return;
            }

            if (req.method === 'POST' && pathname === '/api/shift/start') {
                const existing = await (prisma as any).moderationShift.findFirst({
                    where: { moderatorId: session!.discordId, endTime: null }
                });
                if (existing) {
                    res.writeHead(400); return res.end(JSON.stringify({ error: 'Służba już trwa' }));
                }

                await (prisma as any).moderationShift.create({
                    data: { moderatorId: session!.discordId }
                });

                res.writeHead(200); return res.end(JSON.stringify({ success: true }));
            }

            if (req.method === 'POST' && pathname === '/api/shift/stop') {
                const existing = await (prisma as any).moderationShift.findFirst({
                    where: { moderatorId: session!.discordId, endTime: null },
                    orderBy: { startTime: 'desc' }
                });
                if (!existing) {
                    res.writeHead(400); return res.end(JSON.stringify({ error: 'Brak aktywnej służby' }));
                }

                const endTime = new Date();
                const diffMs = endTime.getTime() - existing.startTime.getTime();
                const durationMinutes = Math.round(diffMs / 60000);

                await (prisma as any).moderationShift.update({
                    where: { id: existing.id },
                    data: { endTime, durationMinutes }
                });

                res.writeHead(200); return res.end(JSON.stringify({ success: true, durationMinutes }));
            }

            if (req.method === 'GET' && pathname === '/api/players') {
                // Fetch players from ERLC
                const ERLC_API_V1 = 'https://api.policeroleplay.community/v1/server';
                try {
                    const serverKey = process.env.ERLC_SERVER_KEY || '';
                    const erlcRes = await axios.get(`${ERLC_API_V1}/players`, { headers: { 'Server-Key': serverKey }});
                    
                    const playersData = Array.isArray(erlcRes.data) ? erlcRes.data : [];
                    
                    // Match with DB to find Discord avatars if possible
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
                        
                        return {
                            nick: nick || 'Unknown',
                            robloxId: robloxId || '',
                            permission: p.Permission,
                            discordAvatar
                        };
                    }));

                    res.writeHead(200); return res.end(JSON.stringify(enhancedPlayers));
                } catch (e: any) {
                    console.error('ERLC Fetch players error', e.message);
                    res.writeHead(500); return res.end(JSON.stringify({ error: 'Blad pobierania listy gaczy z ERLC' }));
                }
            }

            if (req.method === 'POST' && pathname === '/api/action') {
                const body = await parseJSONBody(req);
                const { type, targetNick, reason, duration } = body;

                if (!type || !targetNick || !reason) {
                    res.writeHead(400); return res.end(JSON.stringify({ error: 'Brakujące parametry (type, targetNick, reason)' }));
                }

                // Check active shift
                const shift = await (prisma as any).moderationShift.findFirst({
                    where: { moderatorId: session!.discordId, endTime: null }
                });
                if (!shift) {
                    res.writeHead(403); return res.end(JSON.stringify({ error: 'Musisz rozpocząć służbę (Shift), aby wykonać akcję!' }));
                }

                let commandStr = '';
                if (type === 'kick') {
                    commandStr = `:kick ${targetNick} ${reason}`;
                } else if (type === 'ban') {
                    commandStr = duration && duration !== 'perm' 
                        ? `:ban ${targetNick} ${duration} ${reason}`
                        : `:pban ${targetNick} ${reason}`;
                } else if (type === 'warn') {
                    commandStr = `:pm ${targetNick} OSTRZEŻENIE: ${reason}`;
                } else if (type === 'log') {
                    // It's a manual log button action. Send to discord.
                    const logChannel = await client.channels.fetch('1490076757955575849').catch(() => null) as TextChannel;
                    if (logChannel) {
                        await logChannel.send({
                            content: `📝 **Wpis Moderatora** <@${session!.discordId}>\n**Gracz:** ${targetNick}\n**Informacja:** ${reason}`
                        });
                        res.writeHead(200); return res.end(JSON.stringify({ success: true }));
                    } else {
                        res.writeHead(500); return res.end(JSON.stringify({ error: 'Kanał logów nie został znaleziony.' }));
                    }
                } else {
                    res.writeHead(400); return res.end(JSON.stringify({ error: 'Nieznany typ akcji' }));
                }

                const result = await executeERLCCommand(commandStr);
                
                // Extra for warn: Send Discord DM if user is known
                if (type === 'warn') {
                    const targetCitizen = await (prisma as any).citizen.findFirst({ where: { robloxNick: { equals: targetNick, mode: 'insensitive' } }});
                    if (targetCitizen) {
                        const discordUser = await client.users.fetch(targetCitizen.discordId).catch(() => null);
                        if (discordUser) {
                            discordUser.send(`⚠️ **Otrzymałeś/aś ostrzeżenie od Administracji!**\n\n**Powód:** ${reason}`).catch(e => console.log('Nie udało się wysłać DM z ostrzeżeniem.'));
                        }
                    }
                }

                if (result.success) {
                    res.writeHead(200); return res.end(JSON.stringify({ success: true, ERLC: result.data }));
                } else {
                    res.writeHead(500); return res.end(JSON.stringify({ error: result.error }));
                }
            }

            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Route not found' }));
        } catch (error: any) {
            console.error('API Error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
    });

    server.listen(port, () => {
        console.log(`[WebUI] Panel dostępny na HTTP port ${port}`);
    });
}
