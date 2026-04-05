import axios from 'axios';

const ERLC_API_URL = 'https://api.policeroleplay.community/v2/server/command';

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
