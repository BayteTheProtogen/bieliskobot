import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getCommandLogs } from './erlc';
import { prisma } from './db';
import { BAN_ROOM_ID } from './modActions';

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

            const erlcTimestamp = log.Timestamp;
            const existing = await prisma.trackedAction.findUnique({
                where: { erlcTimestamp }
            });
            if (existing) continue;

            await prisma.trackedAction.create({
                data: { erlcTimestamp }
            });

            const [modNick] = log.Player.split(':');
            const args = log.Command.trim().split(/\s+/);
            const action = args[0].toLowerCase();
            const targetNick = args[1];
            if (!targetNick) continue;

            const modCitizen = await prisma.citizen.findFirst({
                where: { robloxNick: { equals: modNick, mode: 'insensitive' } }
            });

            if (!modCitizen) {
                console.log(`[ERLC Poller] Moderator "${modNick}" not in DB – cannot DM.`);
                continue;
            }

            try {
                const user = await client.users.fetch(modCitizen.discordId);
                
                const actionLabel = 
                    action === ':kick'  ? 'wyrzucenie (kick)' :
                    action === ':unban' ? 'odbanowanie'       :
                    action === ':pban'  ? 'permaban'           : 'ban';

                const embed = new EmbedBuilder()
                    .setTitle('⚖️ Wykryto akcję w grze!')
                    .setDescription(
                        `Wykonałeś **${actionLabel}** na graczu **${targetNick}**.\n\n` +
                        `Kliknij przycisk poniżej, aby uzupełnić powód i czas trwania kary.`
                    )
                    .setColor('#3498db')
                    .setTimestamp();

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`mod_action|${targetNick}|${erlcTimestamp}|${action}`)
                        .setLabel(`📝 Uzupełnij dane: ${targetNick}`)
                        .setStyle(ButtonStyle.Primary)
                );

                await user.send({ embeds: [embed], components: [row] });
            } catch (e) {
                console.error(`[ERLC Poller] Failed to DM ${modNick}:`, e);
            }
        }
    } catch (e) {
        console.error('[ERLC Poller] Poll error:', e);
    }
}
