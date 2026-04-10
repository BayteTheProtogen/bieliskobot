import { Message, Client } from 'discord.js';
import { prisma } from './db';
import { finalizeAction } from './modActions';

export async function processModeratorConversation(client: Client, message: Message) {
    const userId = message.author.id;
    const conversation = await (prisma as any).banConversation.findUnique({ where: { userId } });
    
    if (!conversation) return false; // Not in a mod conversation

    const content = message.content.trim();

    // Check for cancel
    if (content.toLowerCase() === '!cancel' || content.toLowerCase() === 'anuluj') {
        await (prisma as any).banConversation.delete({ where: { userId } });
        await message.reply('❌ Rozmowa została przerwana. Dane nie zostały zapisane.');
        return true;
    }

    if (conversation.step === 1) {
        // Step 1: Handle duration
        let durationStr = content.toLowerCase();
        let isPerm = false;
        let hours: number | null = null;

        if (['perm', 'permanent', 'stały', 'staly', 'na zawsze'].includes(durationStr)) {
            isPerm = true;
            durationStr = 'perm';
        } else {
            const parsed = parseInt(durationStr);
            if (isNaN(parsed) || parsed <= 0) {
                await message.reply('⚠️ Podaj poprawną liczbę godzin (np. `24`) lub wpisz `perm`. Jeśli chcesz przerwać, wpisz `!cancel`.');
                return true;
            }
            hours = parsed;
        }

        await (prisma as any).banConversation.update({
            where: { userId },
            data: { step: 2, tempDuration: isPerm ? 'perm' : hours!.toString() }
        });

        await message.reply('✅ Rozumiem. A jaki był powód tej kary?');
        return true;
    }

    if (conversation.step === 2) {
        // Step 2: Handle reason
        const reason = content;
        const targetNick = conversation.targetNick;
        const action = conversation.action;
        const erlcTimestamp = conversation.erlcTimestamp;

        let hours: number | null = null;
        let isPerm = false;

        if (conversation.tempDuration === 'perm') {
            isPerm = true;
        } else if (conversation.tempDuration === 'unban' || conversation.tempDuration === 'kick') {
            // No duration needed for these
        } else {
            hours = parseInt(conversation.tempDuration || '0');
        }

        // Finalize
        await message.channel.sendTyping();
        await finalizeAction(
            client, 
            message.author, 
            userId, 
            action, 
            targetNick, 
            reason, 
            hours, 
            isPerm, 
            'game', 
            erlcTimestamp
        );

        // Cleanup
        await (prisma as any).banConversation.delete({ where: { userId } });
        await message.reply('✅ Dziękuję! Wszystko zapisałem w kartotece i banroomie. Miłego dyżuru! ⚖️');
        return true;
    }

    return false;
}
