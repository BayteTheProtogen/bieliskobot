import { Client, GatewayIntentBits, REST, Routes, Events, Partials, MessageFlags, EmbedBuilder } from 'discord.js';
import * as dotenv from 'dotenv';
import { dowodCommand } from './commands/dowod';
import { economyCommands, workCommands, extraWorkCommands } from './commands/economy';
import { economyAdminCommands } from './commands/economyAdmin';
import { mandatCommand } from './commands/mandat';
import { sklepCommands } from './commands/sklep';
import { ekwipunekCommands } from './commands/ekwipunek';
import { logiCommand } from './commands/logi';
import { kasynoCommand } from './commands/kasyno';
import { aresztCommand } from './commands/areszt';
import { kartotekaCommand } from './commands/kartoteka';
import { handleInteractions } from './handlers/interactions';
import { handleKasynoInteractions } from './handlers/kasynoInteractions';
import { rejestracjaCommand } from './commands/rejestracja';
import { rejestracjaAdminCommands } from './commands/rejestracjaAdmin';
// import { poszukiwanieCommand } from './commands/poszukiwanie'; // Tymczasowo usunięte
import { panelCommand } from './commands/panel';
import { rybyCommand } from './commands/ryby';
import { dyzuryCommand } from './commands/dyzury';
import { wezwijCommand } from './commands/wezwij';
import { rpStartCommand } from './commands/rp-start';
import { rpStopCommand } from './commands/rp-stop';
import { erlcModeration } from './services/erlc';
import { initVision } from './services/vision';
import { generatePrisonerCard, generateArrestCard, generateKartotekaCard } from './services/canvas';
import { prisma } from './services/db';
import { TextChannel, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { startERLCPolling, startAutoUnbanJob } from './services/erlcPoller';
import { BAN_ROOM_ID, finalizeAction } from './services/modActions';
import { startWebServer } from './web/server';
import { processModeratorConversation } from './services/dmModeration';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
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

    // Init AI Vision
    try {
        await initVision();
    } catch (e) {
        console.error('Failed to init AI Vision:', e);
    }

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
                 economyAdminCommands.data.toJSON(),
                sklepCommands.data.toJSON(),
                ekwipunekCommands.data.toJSON(),
                logiCommand.data.toJSON(),
                kasynoCommand.data.toJSON(),
                aresztCommand.data.toJSON(),
                kartotekaCommand.data.toJSON(),
                rejestracjaCommand.data.toJSON(),
                rejestracjaAdminCommands.data.toJSON(),
                // poszukiwanieCommand.data.toJSON(), // Tymczasowo usunięte
                panelCommand.data.toJSON(),
                rybyCommand.data.toJSON(),
                dyzuryCommand.data.toJSON(),
                wezwijCommand.data.toJSON(),
                rpStartCommand.data.toJSON(),
                rpStopCommand.data.toJSON()
            ] },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }

    // Start ERLC polling for in-game mod action detection
    startERLCPolling(client);
    startAutoUnbanJob(client);
    
    // Auto-cleanup for Wanted People (12h expiry)
    setInterval(() => cleanupWantedPeople(client), 1000 * 60 * 60); // Every hour
    cleanupWantedPeople(client); // Run once on start

    // Uruchom WebUI API
    startWebServer(client, Number(process.env.PORT) || 3000);
});

async function cleanupWantedPeople(client: Client) {
    console.log('[CLEANUP] Sprawdzanie wygasłych poszukiwań...');
    const POSZUKIWANI_CHANNEL_ID = '1491176702586523769';
    const expirationLimit = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12h ago

    try {
        const expired = await (prisma as any).wantedPerson.findMany({
            where: { createdAt: { lt: expirationLimit } }
        });

        if (expired.length === 0) return;

        const channel = await client.channels.fetch(POSZUKIWANI_CHANNEL_ID).catch(() => null) as TextChannel;

        for (const person of expired) {
            console.log(`[CLEANUP] Usuwanie wygasłego poszukiwania: ${person.targetNick}`);
            if (channel && person.messageId) {
                await channel.messages.delete(person.messageId).catch(() => null);
            }
            await (prisma as any).wantedPerson.delete({ where: { id: person.id } }).catch(() => null);
        }
    } catch (err) {
        console.error('[CLEANUP] Błąd podczas czyszczenia poszukiwanych:', err);
    }
}

client.on('interactionCreate', async interaction => {
    const POLICJA_CHANNEL = '1491082576130216037';
    const POLICJA_ROLE = '1490253667910029412';

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'dowod') {
            const memberRoles = interaction.member?.roles;
            const isPolicja = interaction.channelId === POLICJA_CHANNEL && 
                              memberRoles && 
                              'cache' in memberRoles && 
                              (memberRoles as any).cache.has(POLICJA_ROLE);

            if (interaction.channelId !== '1490011932068024370' && !isPolicja) {
                await interaction.reply({ content: '🚫 Tej komendy można używać wyłącznie na kanale <#1490011932068024370> lub przez Policję na ich kanale!', ephemeral: true });
                return;
            }
            try {
                await dowodCommand.execute(interaction);
            } catch (err) {
                console.error('Error executing dowodCommand:', err);
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: '❌ Wystąpił błąd podczas wykonywania tej komendy.' });
                } else {
                    await interaction.reply({ content: '❌ Wystąpił błąd podczas wykonywania tej komendy.', ephemeral: true });
                }
            }
        } else if (['portfel', 'praca', 'dorobka', 'sklep', 'ekwipunek'].includes(interaction.commandName)) {
            if (interaction.channelId !== '1490011312669855904') {
                await interaction.reply({ content: '🚫 Komendy ekonomii, sklepu, pracy oraz ekwipunku są dozwolone wyłącznie na kanale <#1490011312669855904>!', ephemeral: true });
                return;
            }
            if (interaction.commandName === 'portfel') await economyCommands.execute(interaction);
            if (interaction.commandName === 'praca') await workCommands.execute(interaction);
            if (interaction.commandName === 'dorobka') await extraWorkCommands.execute(interaction);
            if (interaction.commandName === 'sklep') await sklepCommands.execute(interaction);
            if (interaction.commandName === 'ekwipunek') await ekwipunekCommands.execute(interaction);
        } else if (interaction.commandName === 'kasyno') {
            if (interaction.channelId !== '1490011537199595773') {
                await interaction.reply({ content: '🚫 Komenda kasyna jest dozwolona wyłącznie na kanale <#1490011537199595773>!', ephemeral: true });
                return;
            }
            await kasynoCommand.execute(interaction);
        } else if (interaction.commandName === 'mandat') {
            if (interaction.channelId !== '1490365930818109490') {
                await interaction.reply({ content: '🚫 Mandaty można wypisywać wyłącznie na kanale <#1490365930818109490>!', ephemeral: true });
                return;
            }
            try {
                await mandatCommand.execute(interaction);
            } catch (err) {
                console.error('Error executing mandatCommand:', err);
                if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Wystąpił błąd podczas wystawiania mandatu.', ephemeral: true });
            }
        } else if (interaction.commandName === 'areszt') {
            if (interaction.channelId !== '1490366000615526460') {
                await interaction.reply({ content: '🚫 Areszty można wystawiać wyłącznie na kanale <#1490366000615526460>!', ephemeral: true });
                return;
            }
            try {
                await aresztCommand.execute(interaction);
            } catch (err) {
                if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Wystąpił błąd podczas przetwarzania wyroku.', ephemeral: true });
            }
        } else if (interaction.commandName === 'kartoteka') {
            if (interaction.channelId !== POLICJA_CHANNEL) {
                await interaction.reply({ content: `🚫 Kartotekę można sprawdzać wyłącznie na kanale <#${POLICJA_CHANNEL}>!`, ephemeral: true });
                return;
            }
            try {
                await kartotekaCommand.execute(interaction);
            } catch (err) {
                if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Wystąpił błąd podczas sprawdzania kartoteki.', ephemeral: true });
            }
        /* } else if (interaction.commandName === 'poszukiwanie') {
            const memberRoles = interaction.member?.roles;
            const isPolicja = memberRoles && 'cache' in memberRoles && (memberRoles as any).cache.has(POLICJA_ROLE);
            
            if (interaction.channelId !== POLICJA_CHANNEL && !isPolicja) {
                await interaction.reply({ content: '🚫 Komendy poszukiwań można używać wyłącznie na kanale Policji!', ephemeral: true });
                return;
            }
            try {
                await poszukiwanieCommand.execute(interaction);
            } catch (err) {
                console.error('Error executing poszukiwanie:', err);
                if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Błąd systemu poszukiwań.', ephemeral: true });
            } */
        } else if (interaction.commandName === 'panel') {
            try {
                await panelCommand.execute(interaction);
            } catch (err) {
                console.error('Error executing panel:', err);
                if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Błąd panelu.', ephemeral: true });
            }
        } else if (interaction.commandName === 'rejestracja') {
            const memberRoles = interaction.member?.roles;
            const isPolicja = interaction.channelId === POLICJA_CHANNEL && 
                              memberRoles && 
                              'cache' in memberRoles && 
                              (memberRoles as any).cache.has(POLICJA_ROLE);

            if (interaction.channelId !== '1490012050888593439' && !isPolicja) {
                await interaction.reply({ content: '🚫 Rejestrację pojazdów można przeprowadzić wyłącznie na kanale <#1490012050888593439> lub przez Policję na ich kanale!', ephemeral: true });
                return;
            }
            try {
                await rejestracjaCommand.execute(interaction);
            } catch (err) {
                console.error('Error executing rejestracjaCommand:', err);
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: '❌ Wystąpił błąd podczas wykonywania tej komendy.' });
                } else {
                    await interaction.reply({ content: '❌ Wystąpił błąd podczas wykonywania tej komendy.', ephemeral: true });
                }
            }
        } else if (interaction.commandName === 'rejestracja-adm') {
            await rejestracjaAdminCommands.execute(interaction);
        } else if (interaction.commandName === 'rp-stop') {
            try {
                await rpStopCommand.execute(interaction);
            } catch (err) {
                console.error('Error executing rpStopCommand:', err);
                if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Błąd podczas zatrzymywania RP.', ephemeral: true });
            }
        } else if (interaction.commandName === 'rp-start') {
            try {
                await rpStartCommand.execute(interaction);
            } catch (err) {
                console.error('Error executing rpStartCommand:', err);
                if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Błąd podczas startu RP.', ephemeral: true });
            }
        } else if (interaction.commandName === 'eco-admin') {
            await economyAdminCommands.execute(interaction);
        } else if (interaction.commandName === 'logi') {
            if (interaction.channelId !== '1490274396391211158') {
                await interaction.reply({ content: '🚫 Komendy `/logi` można używać wyłącznie na wydzielonym kanale <#1490274396391211158>!', ephemeral: true });
                return;
            }
            await logiCommand.execute(interaction);
        } else if (interaction.commandName === 'ryby') {
            if (interaction.channelId !== '1492254461467295774') {
                await interaction.reply({ content: '🚫 Komendy `/ryby` można używać wyłącznie na wydzielonym kanale <#1492254461467295774>!', ephemeral: true });
                return;
            }
            await rybyCommand.execute(interaction);
        } else if (interaction.commandName === 'dyzury') {
            await dyzuryCommand.execute(interaction);
        } else if (interaction.commandName === 'wezwij') {
            await wezwijCommand.execute(interaction);
        }
    } else if (interaction.isButton()) {
        const customId = interaction.customId;
        if (customId.startsWith('mod_action|')) {
            const [_, targetNick, erlcTimestamp, action] = customId.split('|');
            
            const modal = new ModalBuilder()
                .setCustomId(`mod_modal|${targetNick}|${erlcTimestamp}|${action}`)
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
        } else if (customId.startsWith('wanted_finish_')) {
            const POLICJA_ROLE = '1490253667910029412';
            const memberRoles = interaction.member?.roles;
            if (!memberRoles || !('cache' in memberRoles) || !(memberRoles as any).cache.has(POLICJA_ROLE)) {
                await interaction.reply({ content: '🚫 Tylko funkcjonariusze mogą kończyć poszukiwania!', ephemeral: true });
                return;
            }

            const targetNick = customId.replace('wanted_finish_', '');
            await interaction.deferUpdate();

            try {
                const existing = await (prisma as any).wantedPerson.findUnique({ where: { targetNick } });
                if (existing) {
                    if (existing.messageId && interaction.channel) {
                        await (interaction.channel as TextChannel).messages.delete(existing.messageId).catch(() => null);
                    }
                    await (prisma as any).wantedPerson.delete({ where: { targetNick } });
                }
            } catch (err) {
                console.error('Error in wanted_finish button:', err);
            }
        }
    } else if (interaction.isModalSubmit()) {
        const customId = interaction.customId;
        if (customId.startsWith('mod_modal|')) {
            const [_, targetNick, erlcTimestamp, action] = customId.split('|');
            const reason = interaction.fields.getTextInputValue('reason');
            const durationRaw = action !== ':kick' ? interaction.fields.getTextInputValue('duration').toLowerCase() : '';

            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

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

            const erlcTsParsed = parseInt(erlcTimestamp, 10);
            await finalizeAction(client, interaction.user, interaction.user.id, action, targetNick, reason, hours, isPermBan, 'game', isNaN(erlcTsParsed) ? undefined : erlcTsParsed);
            
            // Edit original DM message to show it's done
            if (interaction.message) {
                const finishedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor('#2ecc71')
                    .setDescription(`✅ **Dane uzupełnione!**\nGracz: **${targetNick}**\nPowód: ${reason}\nCzas: ${isPermBan ? 'Permanentny' : (hours ? hours + 'h' : '—')}`);
                await interaction.message.edit({ embeds: [finishedEmbed], components: [] });
            }

            await interaction.editReply({ content: `✅ Pomyślnie zarejestrowano akcję dla **${targetNick}**.` });
            return; // Important: stay in this block
        }
    }
    
    // Check casino interactions first
    const kasynoHandled = await handleKasynoInteractions(interaction);
    if (!kasynoHandled) {
        // Any other interaction (including our specialized modals) falls through here
        await handleInteractions(interaction);
    }
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    // Obsługa konwersacji moderacyjnych w DM
    if (!message.guild) {
        const handled = await processModeratorConversation(client, message);
        if (handled) return;
    }

    if (!message.content.startsWith('!bb ')) return;

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
            { name: '🔓 Unban', value: '`!bb unban [nick]` - Zdjęcie kary i czyszczenie bazy.', inline: false },
            { name: '🔄 Odbudowa DB', value: '`!bb rebuilddb` - Rekonstrukcja utraconej bazy.', inline: false }
        )
        .setFooter({ text: 'RP Bielisko - System Moderacji' })
        .setTimestamp();

    if (!command || !['kick', 'tempban', 'permban', 'unban', 'rebuilddb'].includes(command)) {
        return message.reply({ embeds: [helpEmbed] });
    }

    if (command === 'rebuilddb') {
        if (!message.member?.roles.cache.has(OWNER_ROLE_ID)) return message.reply('🚫 Brak uprawnień do przebudowy bazy danych!');
        
        await message.reply('⏳ Rozpoczynam skanowanie kanałów i rekonstrukcję bazy danych. To potrwa chwilę...');

        try {
            const publicChannel = await client.channels.fetch('1490011932068024370') as TextChannel;
            const dmLogChannel = await client.channels.fetch('1490640702135079042') as TextChannel;

            if (!publicChannel || !dmLogChannel) throw new Error("Kanały nie zostały znalezione.");

            // Pobieranie logów DM (Discord ID)
            const dmMessages: any[] = [];
            let lastId: string | undefined = undefined;
            while (true) {
                const msgs: any = await dmLogChannel.messages.fetch({ limit: 100, before: lastId });
                if (msgs.size === 0) break;
                dmMessages.push(...msgs.values());
                lastId = msgs.last()?.id;
            }

            const dmLogsExtracted = dmMessages.map(m => {
                if (m.embeds.length > 0 && m.embeds[0].title?.includes('ID_CARD')) {
                    const desc = m.embeds[0].description || '';
                    const match = desc.match(/\(\`(\d+)\`\)/);
                    if (match) return { discordId: match[1], time: m.createdTimestamp };
                }
                return null;
            }).filter(x => x !== null);

            // Pobieranie publicznych ogłoszeń o dowodzie (Dane obywatela)
            const publicMessages: any[] = [];
            lastId = undefined;
            while (true) {
                const msgs: any = await publicChannel.messages.fetch({ limit: 100, before: lastId });
                if (msgs.size === 0) break;
                publicMessages.push(...msgs.values());
                lastId = msgs.last()?.id;
            }

            const { getUserIdByUsername } = require('./services/roblox');
            let reconstructed = 0;
            let failed = 0;

            for (const msg of publicMessages) {
                if (msg.author.id !== client.user?.id) continue;
                
                const regex = /🪪 Obywatel \*\*([^\*]+)\*\* \(Z postacią \*\*([^\*]+)\*\*\)/;
                const match = msg.content.match(regex);
                if (!match) continue;

                const fullName = match[1].trim();
                const robloxNick = match[2].trim();
                const nameParts = fullName.split(' ');
                const firstName = nameParts[0] || 'Nieznane';
                const lastName = nameParts.slice(1).join(' ') || 'Nieznane';

                // Znajdź najbliższy log DM (dopasowanie czasowe do 15 sekund)
                const closestDM = dmLogsExtracted.find((log: any) => Math.abs(log.time - msg.createdTimestamp) < 15000);

                if (!closestDM) {
                    failed++;
                    continue;
                }

                try {
                    const fetchedId = await getUserIdByUsername(robloxNick);
                    const robloxId = fetchedId ? fetchedId.toString() : `TEMP-${Math.floor(Math.random()*1000000)}`;

                    const existing = await prisma.citizen.findUnique({ where: { discordId: closestDM.discordId } });
                    if (!existing) {
                        await prisma.citizen.create({
                            data: {
                                discordId: closestDM.discordId,
                                robloxNick,
                                robloxId,
                                firstName,
                                lastName,
                                dob: "01.01.2000", // Zastępcze
                                gender: "M",
                                citizenship: "Bielisko",
                                citizenNumber: `BI-${Math.floor(10000 + Math.random() * 90000)}`,
                                bank: 0,
                                pocket: 0
                            }
                        });
                        reconstructed++;
                    }
                } catch (e) {
                    failed++;
                }
            }

            let reconstructedVehicles = 0;

            for (const msg of dmLogsMessages) {
                const embed = msg.embeds[0];
                if (!embed || !embed.description) continue;
                
                const discordMatch = embed.description.match(/<@(\d+)>/);
                if (!discordMatch) continue;
                const ownerDiscordId = discordMatch[1];
                
                const content = embed.fields[0]?.value || '';
                
                // Próba dopasowania do rejestracji pojazdu
                const vehMatch = content.match(/Twój wniosek o rejestrację pojazdu \*\*(.+?) (.+?)\*\* został zaakceptowany.*Twoja nowa tablica to: \*\*(.+?)\*\*/s);
                if (vehMatch) {
                    const brand = vehMatch[1].trim();
                    const model = vehMatch[2].trim();
                    const plate = vehMatch[3].trim();
                    const imageUrl = msg.attachments.first()?.url || '';

                    try {
                        const existingVeh = await prisma.vehicle.findUnique({ where: { plate } });
                        if (!existingVeh) {
                            const citizen = await prisma.citizen.findUnique({ where: { discordId: ownerDiscordId } });
                            await prisma.vehicle.create({
                                data: {
                                    ownerId: ownerDiscordId,
                                    ownerName: citizen ? `${citizen.firstName} ${citizen.lastName}` : 'Nieznany Obywatel',
                                    brand,
                                    model,
                                    plate,
                                    imageUrl
                                }
                            });
                            reconstructedVehicles++;
                        }
                    } catch(e) {}
                }
            }

            await message.channel.send(`✅ Zakończono! \nOdzyskano i zapisano: **${reconstructed}** obywateli.\nOdzyskano: **${reconstructedVehicles}** pojazdów.\nNie udało się dopasować: **${failed}** logów obywateli (Brak powiązanego logu DM w tym samym czasie).`);
        } catch (e) {
            console.error(e);
            await message.channel.send('❌ Wystąpił błąd podczas odbudowy bazy.');
        }
        return;
    }

    // !bb kick [nick] [reason...]
    if (command === 'kick') {
        const nick = args[1];
        const reason = args.slice(2).join(' ') || 'Brak powodu';
        if (!nick) return message.reply('Sposób użycia: `!bb kick [nick] [powód]`');

        const result = await erlcModeration.kick(nick, reason);
        if (result.success) {
            await finalizeAction(client, message.author, message.author.id, ':kick', nick, reason, null, false, 'discord');
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
            await finalizeAction(client, message.author, message.author.id, ':ban', nick, reason, timeH, false, 'discord');
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
            await finalizeAction(client, message.author, message.author.id, ':pban', nick, reason, null, true, 'discord');
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
            await finalizeAction(client, message.author, message.author.id, ':unban', nick, 'Zdjęcie kary', null, false, 'discord');
            message.reply(`✅ Odbanowano **${nick}**.`);
        } else {
            message.reply(`❌ Błąd: ${result.error}`);
        }
    }
});

client.login(token);
