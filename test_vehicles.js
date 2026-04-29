require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.on('ready', async () => {
    try {
        const channel = await client.channels.fetch('1490640702135079042');
        const msgs = await channel.messages.fetch({ limit: 100 });
        let found = 0;
        msgs.forEach(m => {
            const embed = m.embeds[0];
            if (embed && embed.title && embed.title.includes('VEHICLE')) {
                console.log('VEHICLE LOG:', embed.fields[0]?.value);
                found++;
            }
        });
        console.log('Total vehicle logs found:', found);
    } catch(e) { console.error(e); }
    process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
