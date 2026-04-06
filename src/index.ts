import { Client, GatewayIntentBits, REST, Routes, Events, Partials } from 'discord.js';
import * as dotenv from 'dotenv';
import { dowodCommand } from './commands/dowod';
import { economyCommands, workCommands, extraWorkCommands } from './commands/economy';
import { economyAdminCommands } from './commands/economyAdmin';
import { mandatCommand } from './commands/mandat';
import { handleInteractions } from './handlers/interactions';
import { erlcModeration } from './services/erlc';
import { generatePrisonerCard } from './services/canvas';
import { prisma } from './services/db';
import { EmbedBuilder, AttachmentBuilder, TextChannel, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { startERLCPolling } from './services/erlcPoller';
import { BAN_ROOM_ID, finalizeAction } from './services/modActions';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
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

    // Start ERLC polling for in-game mod action detection
    startERLCPolling(client);
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
    } else if (interaction.isButton()) {
        const customId = interaction.customId;
        if (customId.startsWith('mod_action:')) {
            const [_, targetNick, erlcTimestamp, action] = customId.split(':');
            
            const modal = new ModalBuilder()
                .setCustomId(`mod_modal:${targetNick}:${erlcTimestamp}:${action}`)
                .setTitle(`Uzupełnij dane: ${targetNick}`);

            const reasonInput = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel("Dlaczego? (Powód)")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("Podaj powód kary...")
                .setRequired(true);

            const durationInput = new TextInputBuilder()
                .setCustomId('duration')
                .setLabel(action === ':kick' ? "Pole ignorowane dla kicka" : "Na ile czasu? (Liczba h lub 'perm')")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(action === ':kick' ? "Zostaw puste" : "Np. 24 lub perm")
                .setRequired(action !== ':kick' && action !== ':unban');

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
                new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput)
            );

            await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        const customId = interaction.customId;
        if (customId.startsWith('mod_modal:')) {
            const [_, targetNick, erlcTimestamp, action] = customId.split(':');
            const reason = interaction.fields.getTextInputValue('reason');
            const durationRaw = action !== ':kick' ? interaction.fields.getTextInputValue('duration').toLowerCase() : '';

            await interaction.deferReply({ ephemeral: true });

            let hours: number | null = null;
            let isPermBan = (action === ':pban');

            if (action === ':ban') {
                if (durationRaw === 'perm' || durationRaw === 'permban') {
                    isPermBan = true;
                } else {
                    const parsed = parseInt(durationRaw);
                    if (!isNaN(parsed) && parsed > 0) hours = parsed;
                    else isPermBan = true;
                }
            }

            await finalizeAction(client, interaction.user, interaction.user.id, action, targetNick, reason, hours, isPermBan);
            
            // Edit original DM message to show it's done
            if (interaction.message) {
                const finishedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor('#2ecc71')
                    .setDescription(`✅ **Dane uzupełnione!**\nGracz: **${targetNick}**\nPowód: ${reason}\nCzas: ${isPermBan ? 'Permanentny' : (hours ? hours + 'h' : '—')}`);
                await interaction.message.edit({ embeds: [finishedEmbed], components: [] });
            }

            await interaction.editReply({ content: `✅ Pomyślnie zarejestrowano akcję dla **${targetNick}**.` });
        }
    } else {
        await handleInteractions(interaction);
    }
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.content.startsWith('!bb ')) return;

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
            await finalizeAction(client, message.author, message.author.id, ':kick', nick, reason, null, false);
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

        const result = await erlcModeration.ban(nick, `${timeH}h`, reason);
        if (result.success) {
            await finalizeAction(client, message.author, message.author.id, ':ban', nick, reason, timeH, false);
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
            await finalizeAction(client, message.author, message.author.id, ':pban', nick, reason, null, true);
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
            await finalizeAction(client, message.author, message.author.id, ':unban', nick, 'Zdjęcie kary', null, false);
            message.reply(`✅ Odbanowano **${nick}**.`);
        } else {
            message.reply(`❌ Błąd: ${result.error}`);
        }
    }
});

client.login(token);
