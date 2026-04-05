import { Client, GatewayIntentBits, REST, Routes, Events } from 'discord.js';
import * as dotenv from 'dotenv';
import { dowodCommand } from './commands/dowod';
import { economyCommands, workCommands, extraWorkCommands } from './commands/economy';
import { economyAdminCommands } from './commands/economyAdmin';
import { mandatCommand } from './commands/mandat';
import { handleInteractions } from './handlers/interactions';
import { erlcModeration } from './services/erlc';
import { generatePrisonerCard } from './services/canvas';
import { prisma } from './services/db';
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { PunishmentType } from '@prisma/client';
import { startAuditLogPolling, handleAdminDM } from './services/auditLog';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
    console.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment variables");
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

client.once(Events.ClientReady, async () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
    startAuditLogPolling(client);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: [
                dowodCommand.data.toJSON(),
                economyCommands.data.toJSON(),
                workCommands.data.toJSON(),
                extraWorkCommands.data.toJSON(),
                mandatCommand.data.toJSON(),
                economyAdminCommands.data.toJSON()
            ] },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'dowod') {
            if (interaction.channelId !== '1490011932068024370') {
                await interaction.reply({ content: '🚫 Tej komendy można używać wyłącznie zgłaszając się na kanale <#1490011932068024370>!', ephemeral: true });
                return;
            }
            await dowodCommand.execute(interaction);
        } else if (['portfel', 'praca', 'dorobka'].includes(interaction.commandName)) {
            if (interaction.channelId !== '1490011312669855904') {
                await interaction.reply({ content: '🚫 Zarządzanie finansami i praca są dozwolone wyłącznie na kanale <#1490011312669855904>!', ephemeral: true });
                return;
            }
            if (interaction.commandName === 'portfel') await economyCommands.execute(interaction);
            if (interaction.commandName === 'praca') await workCommands.execute(interaction);
            if (interaction.commandName === 'dorobka') await extraWorkCommands.execute(interaction);
            if (interaction.commandName === 'przelej') await economyCommands.execute(interaction);
        } else if (interaction.commandName === 'mandat') {
            if (interaction.channelId !== '1490365930818109490') {
                await interaction.reply({ content: '🚫 Mandaty można wystawiać wyłącznie na kanale <#1490365930818109490>!', ephemeral: true });
                return;
            }
            await mandatCommand.execute(interaction);
        } else if (interaction.commandName === 'eco-admin') {
            await economyAdminCommands.execute(interaction);
        }
    } else {
        await handleInteractions(interaction);
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    if (!message.guild) {
        // Obsługa DM dla Adminów (Audit Logs)
        await handleAdminDM(message);
        return;
    }

    if (!message.content.startsWith('!bb ')) return;

    const BAN_ROOM_ID = '1490073045002485991'; // Kanał z obrazkami "za kratami"
    const KICK_LOG_ID = '1490303478965207181'; // Kanał dla kicków i logów akcji
    const ADMIN_CHANNEL_ID = '1490274396391211158';
    const OWNER_ROLE_ID = '1490053669830393996';

    if (message.channelId !== ADMIN_CHANNEL_ID) return;

    const args = message.content.slice(4).trim().split(' ');
    const command = args[0].toLowerCase();

    const helpEmbed = new EmbedBuilder()
        .setTitle('🛠️ Panel Moderacji BieliskoBot (!bb)')
        .setColor('#34495e')
        .setDescription('Zdalne zarządzanie serwerem ER:LC. Komendy dostępne tylko na tym kanale.')
        .addFields(
            { name: '⚖️ Wyrzucenie', value: '`!bb kick [nick] [powód]` - Wyrzuca gracza z gry.', inline: false },
            { name: '⛓️ Ban tymczasowy', value: '`!bb tempban [nick] [czas_h] [powód]` - Ban czasowy + stempel na dowód.', inline: false },
            { name: '💀 Permban', value: '`!bb permban [nick] [powód]` - Ban stały (Tylko Owner).', inline: false },
            { name: '🔓 Unban', value: '`!bb unban [nick]` - Zdjęcie kary i czyszczenie bazy.', inline: false }
        )
        .setFooter({ text: 'RP Bielisko - System Moderacji' })
        .setTimestamp();

    if (!command || !['kick', 'tempban', 'permban', 'unban'].includes(command)) {
        return message.reply({ embeds: [helpEmbed] });
    }

    // !bb kick [nick] [reason...]
    if (command === 'kick') {
        const nick = args[1];
        const reason = args.slice(2).join(' ') || 'Brak powodu';
        if (!nick) return message.reply('Sposób użycia: `!bb kick [nick] [powód]`');

        const result = await erlcModeration.kick(nick, reason);
        if (result.success) {
            const citizen = await prisma.citizen.findFirst({ where: { robloxNick: { equals: nick, mode: 'insensitive' } } });
            
            const embed = new EmbedBuilder()
                .setTitle('⚖️ Wyrzucenie z serwera')
                .setColor('#f1c40f')
                .addFields(
                    { name: 'Gracz', value: nick, inline: true },
                    { name: 'Powód', value: reason, inline: true },
                    { name: 'Moderator', value: message.author.tag, inline: true }
                )
                .setTimestamp();
            
            const kickLog = client.channels.cache.get(KICK_LOG_ID);
            let sentMsgId: string | undefined;
            if (kickLog?.isTextBased()) {
                const sent = await (kickLog as any).send({ embeds: [embed] });
                sentMsgId = sent.id;
            }

            if (citizen) {
                await prisma.punishment.create({
                    data: {
                        citizenId: citizen.discordId,
                        type: PunishmentType.KICK,
                        reason,
                        messageId: sentMsgId,
                        isActive: false // Kick is instant, not "active" as a ban
                    }
                });
            }

            message.reply(`✅ Wyrzucono **${nick}** z serwera.`);
        } else {
            message.reply(`❌ Błąd: ${result.error}`);
        }
    }

    // !bb tempban [nick] [time_h] [reason...]
    if (command === 'tempban') {
        const nick = args[1];
        const timeHString = args[2];
        const timeH = parseInt(timeHString);
        const reason = args.slice(3).join(' ') || 'Brak powodu';

        if (!nick || isNaN(timeH)) return message.reply('Sposób użycia: `!bb tempban [nick] [czas_h] [powód]`');

        const bannedUntil = new Date(Date.now() + timeH * 60 * 60 * 1000);
        const result = await erlcModeration.ban(nick, `${timeH}h`, reason);

        if (result.success) {
            const citizen = await prisma.citizen.findFirst({ where: { robloxNick: { equals: nick, mode: 'insensitive' } } });
            if (citizen) {
                await prisma.citizen.update({ where: { discordId: citizen.discordId }, data: { bannedUntil } });
            }

            const img = await generatePrisonerCard(`https://www.roblox.com/headshot-thumbnail/image?userName=${nick}&width=420&height=420&format=png`);
            const attachment = new AttachmentBuilder(img, { name: 'prisoner.png' });

            const embed = new EmbedBuilder()
                .setTitle('⛓️ Ban tymczasowy')
                .setColor('#e67e22')
                .setThumbnail('attachment://prisoner.png')
                .addFields(
                    { name: 'Gracz', value: nick, inline: true },
                    { name: 'Czas kary', value: `${timeH}h`, inline: true },
                    { name: 'Koniec kary', value: `<t:${Math.floor(bannedUntil.getTime() / 1000)}:R>`, inline: true },
                    { name: 'Powód', value: reason, inline: false },
                    { name: 'Moderator', value: message.author.tag, inline: true }
                )
                .setTimestamp();

            const banroom = client.channels.cache.get(BAN_ROOM_ID);
            let sentMsgId: string | undefined;
            if (banroom?.isTextBased()) {
                const sentNotification = await (banroom as any).send({ embeds: [embed], files: [attachment] });
                sentMsgId = sentNotification.id;
            }

            if (citizen) {
                await prisma.punishment.create({
                    data: {
                        citizenId: citizen.discordId,
                        type: PunishmentType.BAN,
                        reason,
                        duration: `${timeH}h`,
                        messageId: sentMsgId,
                        isActive: true
                    }
                });

                try {
                    const user = await client.users.fetch(citizen.discordId);
                    await user.send(`⚖️ Został na Ciebie nałożony **Ban tymczasowy** na serwerze Bielisko na okres **${timeH}h**.\nPowód: **${reason}**.\nKoniec kary: <t:${Math.floor(bannedUntil.getTime() / 1000)}:F>.`);
                } catch(e) {}
            }
            message.reply(`✅ Zbanowano **${nick}** na ${timeH}h.`);
        } else {
            message.reply(`❌ Błąd: ${result.error}`);
        }
    }

    // !bb permban [nick] [reason...]
    if (command === 'permban') {
        if (!message.member?.roles.cache.has(OWNER_ROLE_ID)) return message.reply('🚫 Tylko Owner może nakładać dożywocie!');
        
        const nick = args[1];
        const reason = args.slice(2).join(' ') || 'Brak powodu';
        if (!nick) return message.reply('Sposób użycia: `!bb permban [nick] [powód]`');

        const result = await erlcModeration.permBan(nick, reason);

        if (result.success) {
            const citizen = await prisma.citizen.findFirst({ where: { robloxNick: { equals: nick, mode: 'insensitive' } } });
            if (citizen) {
                await prisma.citizen.update({ where: { discordId: citizen.discordId }, data: { isPermBanned: true } });
            }

            const img = await generatePrisonerCard(`https://www.roblox.com/headshot-thumbnail/image?userName=${nick}&width=420&height=420&format=png`);
            const attachment = new AttachmentBuilder(img, { name: 'perp.png' });

            const embed = new EmbedBuilder()
                .setTitle('💀 Dożywocie (Permban)')
                .setColor('#c0392b')
                .setThumbnail('attachment://perp.png')
                .addFields(
                    { name: 'Skazany (Gracz)', value: nick, inline: true },
                    { name: 'Powód', value: reason, inline: true },
                    { name: 'Wyrok wydał (Moderator)', value: message.author.tag, inline: true }
                )
                .setTimestamp();

            const banroom = client.channels.cache.get(BAN_ROOM_ID);
            let sentMsgId: string | undefined;
            if (banroom?.isTextBased()) {
                const sent = await (banroom as any).send({ embeds: [embed], files: [attachment] });
                sentMsgId = sent.id;
            }

            if (citizen) {
                await prisma.punishment.create({
                    data: {
                        citizenId: citizen.discordId,
                        type: PunishmentType.PERMBAN,
                        reason,
                        messageId: sentMsgId,
                        isActive: true
                    }
                });

                try {
                    const user = await client.users.fetch(citizen.discordId);
                    await user.send(`🚫 Zostałeś skazany na **dożywocie** (permban) na serwerze Bielisko.\nPowód: **${reason}**.`);
                } catch(e) {}
            }
            message.reply(`✅ Zbanowano permanentnie **${nick}**.`);
        } else {
            message.reply(`❌ Błąd: ${result.error}`);
        }
    }

    // !bb unban [nick]
    if (command === 'unban') {
        const nick = args[1];
        if (!nick) return message.reply('Sposób użycia: `!bb unban [nick]`');

        const result = await erlcModeration.unban(nick);

        if (result.success) {
            const citizen = await prisma.citizen.findFirst({ where: { robloxNick: { equals: nick, mode: 'insensitive' } } });
            
            const punishmentsToUpdate = citizen ? await prisma.punishment.findMany({
                where: { citizenId: citizen.discordId, isActive: true }
            }) : [];

            if (citizen) {
                await prisma.citizen.update({ 
                    where: { discordId: citizen.discordId }, 
                    data: { isPermBanned: false, bannedUntil: null } 
                });

                await prisma.punishment.updateMany({
                    where: { citizenId: citizen.discordId, isActive: true },
                    data: { isActive: false, resolvedAt: new Date() }
                });
            }

            const banroom = client.channels.cache.get(BAN_ROOM_ID);
            if (banroom?.isTextBased()) {
                // Edytuj stare logi
                for (const p of punishmentsToUpdate) {
                    if (p.messageId) {
                        try {
                            const oldMsg = await (banroom as any).messages.fetch(p.messageId);
                            if (oldMsg && oldMsg.embeds.length > 0) {
                                const oldEmbed = EmbedBuilder.from(oldMsg.embeds[0]);
                                oldEmbed.setTitle(oldMsg.embeds[0].title + ' 🔓 ODBANOWANO');
                                oldEmbed.setColor('#2ecc71');
                                await oldMsg.edit({ embeds: [oldEmbed] });
                            }
                        } catch (e) {
                            console.error(`Nie udało się edytować wiadomości ${p.messageId}:`, e);
                        }
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle('🔓 Uwolnienie / Odbanowanie')
                    .setColor('#2ecc71')
                    .addFields(
                        { name: 'Gracz', value: nick, inline: true },
                        { name: 'Moderator', value: message.author.tag, inline: true }
                    )
                    .setTimestamp();
                
                await (banroom as any).send({ embeds: [embed] });
            }

            message.reply(`✅ Odbanowano **${nick}**.`);

            if (citizen) {
                try {
                    const user = await client.users.fetch(citizen.discordId);
                    await user.send(`🔓 Twoja kara na serwerze Bielisko została zdjęta. Możesz ponownie dołączyć do gry!`);
                } catch(e) {}
            }
        } else {
            message.reply(`❌ Błąd: ${result.error}`);
        }
    }
});

client.login(token);
