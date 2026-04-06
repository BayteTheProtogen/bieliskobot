import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getCommandLogs, getKillLogs, getJoinLogs, getModCalls } from '../services/erlc';

export const logiCommand = {
    data: new SlashCommandBuilder()
        .setName('logi')
        .setDescription('Pobiera ostatnie logi z serwera ER:LC. (Tylko dla zarządu)')
        .addStringOption(option => 
            option.setName('typ')
                .setDescription('Typ logów, które chcesz zobaczyć')
                .setRequired(true)
                .addChoices(
                    { name: 'Killed / Zabójstwa', value: 'kills' },
                    { name: 'Command / Komendy moderacyjne', value: 'commands' },
                    { name: 'Joins / Wejścia i wyjścia', value: 'joins' },
                    { name: 'Mod Calls / Wezwania moderacji', value: 'modcalls' }
                )
        )
        .addStringOption(option => 
            option.setName('gracz')
                .setDescription('Opcjonalny nick gracza do odfiltrowania logów')
                .setRequired(false)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        const type = interaction.options.getString('typ', true);
        const filterPlayer = interaction.options.getString('gracz')?.toLowerCase();
        const embed = new EmbedBuilder().setColor('#9b59b6');

        if (type === 'commands') {
            const logs = await getCommandLogs();
            embed.setTitle('💻 Ostatnie użycia komend ER:LC');
            
            if (logs.length === 0) {
                embed.setDescription('Brak wpisów w logach komend.');
            } else {
                const filtered = filterPlayer 
                    ? logs.filter(l => l.Player.toLowerCase().includes(filterPlayer) || l.Command.toLowerCase().includes(filterPlayer))
                    : logs;
                if (filtered.length === 0 && filterPlayer) {
                    embed.setDescription(`Brak wpisów dla gracza **${filterPlayer}**.`);
                } else {
                    const strings = filtered.slice(0, 25).map(l => 
                        `[<t:${l.Timestamp}:f>] [<t:${l.Timestamp}:R>] **${l.Player}** użył: \`${l.Command}\``
                    );
                    embed.setDescription(strings.join('\n'));
                }
            }
        } else if (type === 'kills') {
            const logs = await getKillLogs();
            embed.setTitle('☠️ Ostatnie zabójstwa (Kill Logs)');
            
            if (logs.length === 0) {
                embed.setDescription('Brak wpisów w logach zabójstw.');
            } else {
                const filtered = filterPlayer
                    ? logs.filter(l => l.Killer.toLowerCase().includes(filterPlayer) || l.Killed.toLowerCase().includes(filterPlayer))
                    : logs;
                if (filtered.length === 0 && filterPlayer) {
                    embed.setDescription(`Brak zabójstw powiązanych z graczem **${filterPlayer}**.`);
                } else {
                    const strings = filtered.slice(0, 25).map(l => 
                        `[<t:${l.Timestamp}:f>] [<t:${l.Timestamp}:R>] 🩸 **${l.Killer}** zabił **${l.Killed}**`
                    );
                    embed.setDescription(strings.join('\n'));
                }
            }
        } else if (type === 'joins') {
            const logs = await getJoinLogs();
            embed.setTitle('🚪 Logi dołączeń (Join/Leave)');
            
            if (logs.length === 0) {
                embed.setDescription('Brak wpisów w logach wejść/wyjść.');
            } else {
                const filtered = filterPlayer
                    ? logs.filter(l => l.Player.toLowerCase().includes(filterPlayer))
                    : logs;
                if (filtered.length === 0 && filterPlayer) {
                    embed.setDescription(`Brak logów dołączeń dla gracza **${filterPlayer}**.`);
                } else {
                    const strings = filtered.slice(0, 25).map(l => 
                        `[<t:${l.Timestamp}:f>] [<t:${l.Timestamp}:R>] ${l.Join ? '✅' : '❌'} **${l.Player}** ${l.Join ? 'dołączył(a)' : 'wyszedł/wyszła'}`
                    );
                    embed.setDescription(strings.join('\n'));
                }
            }
        } else if (type === 'modcalls') {
            const logs = await getModCalls();
            embed.setTitle('🚨 Logi wezwań administracji (Mod Calls)');
            
            if (logs.length === 0) {
                embed.setDescription('Brak wezwań w logach.');
            } else {
                const filtered = filterPlayer
                    ? logs.filter(l => l.Caller.toLowerCase().includes(filterPlayer) || (l.Moderator && l.Moderator.toLowerCase().includes(filterPlayer)))
                    : logs;
                if (filtered.length === 0 && filterPlayer) {
                    embed.setDescription(`Brak wezwań powiązanych z graczem **${filterPlayer}**.`);
                } else {
                    const strings = filtered.slice(0, 25).map(l => 
                        `[<t:${l.Timestamp}:f>] [<t:${l.Timestamp}:R>] 📞 **${l.Caller}** wezwał moderację. ${l.Moderator ? `(Przyjął: **${l.Moderator}**)` : '*(Oczekuje)*'}`
                    );
                    embed.setDescription(strings.join('\n'));
                }
            }
        }

        return interaction.editReply({ embeds: [embed] });
    }
};
