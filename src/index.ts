import { Client, GatewayIntentBits, REST, Routes, Events } from 'discord.js';
import * as dotenv from 'dotenv';
import { dowodCommand } from './commands/dowod';
import { pracaCommand } from './commands/praca';
import { dorobkaCommand } from './commands/dorobka';
import { ekonomiaCommand } from './commands/ekonomia';
import { handleInteractions } from './handlers/interactions';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
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

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: [
                dowodCommand.data.toJSON(),
                pracaCommand.data.toJSON(),
                dorobkaCommand.data.toJSON(),
                ekonomiaCommand.data.toJSON()
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
        } else if (interaction.commandName === 'praca') {
            await pracaCommand.execute(interaction);
        } else if (interaction.commandName === 'dorobka') {
            await dorobkaCommand.execute(interaction);
        } else if (interaction.commandName === 'ekonomia') {
            await ekonomiaCommand.execute(interaction);
        }
    } else {
        await handleInteractions(interaction);
    }
});

client.login(token);
