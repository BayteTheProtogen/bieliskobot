import axios from 'axios';

const ERLC_API_V1 = 'https://api.policeroleplay.community/v1/server';
const ERLC_API_URL = 'https://api.policeroleplay.community/v2/server/command';

function erlcHeaders() {
    return { 'Server-Key': process.env.ERLC_SERVER_KEY || '' };
}

export interface ERLCCommandLog {
    Player: string;    // "NickName:RobloxId"
    Timestamp: number; // unix seconds
    Command: string;   // ":ban Nick powód"
}

export interface ERLCBan {
    PlayerId: string;  // PlayerName only
}

export async function getCommandLogs(): Promise<ERLCCommandLog[]> {
    try {
        const res = await axios.get(`${ERLC_API_V1}/commandlogs`, { headers: erlcHeaders() });
        return Array.isArray(res.data) ? res.data : [];
    } catch(e: any) {
        console.error('[ERLC] getCommandLogs error:', e.response?.data || e.message);
        return [];
    }
}

export async function getBans(): Promise<Record<string, string>> {
    try {
        const res = await axios.get(`${ERLC_API_V1}/bans`, { headers: erlcHeaders() });
        return res.data || {};
    } catch(e: any) {
        console.error('[ERLC] getBans error:', e.response?.data || e.message);
        return {};
    }
}


export async function executeERLCCommand(command: string) {
    const serverKey = process.env.ERLC_SERVER_KEY;
    
    if (!serverKey) {
        console.warn('⚠️ Brak ERLC_SERVER_KEY w pliku .env! Komendy Roblox nie zostaną wykonane.');
        return { success: false, error: 'Brak klucza API serwera.' };
    }

    try {
        const response = await axios.post(
            ERLC_API_URL,
            { command },
            {
                headers: {
                    'Server-Key': serverKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        return { success: true, data: response.data };
    } catch (error: any) {
        console.error('❌ Błąd API ER:LC:', error.response?.data || error.message);
        return { 
            success: false, 
            error: error.response?.data?.message || error.message 
        };
    }
}

export const erlcModeration = {
    async kick(username: string, reason: string) {
        return await executeERLCCommand(`:kick ${username} ${reason}`);
    },
    async ban(username: string, duration: string, reason: string) {
        // Format dla temp bana w ER:LC to zazwyczaj :ban [user] [time] [reason]
        // Czas może być np. 24h
        return await executeERLCCommand(`:ban ${username} ${duration} ${reason}`);
    },
    async permBan(username: string, reason: string) {
        // pban dla permanentnego bana
        return await executeERLCCommand(`:pban ${username} ${reason}`);
    },
    async unban(username: string) {
        return await executeERLCCommand(`:unban ${username}`);
    }
};
