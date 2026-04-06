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
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        const type = interaction.options.getString('typ', true);
        const embed = new EmbedBuilder().setColor('#9b59b6');

        if (type === 'commands') {
            const logs = await getCommandLogs();
            embed.setTitle('💻 Ostatnie użycia komend ER:LC');
            
            if (logs.length === 0) {
                embed.setDescription('Brak wpisów w logach komend.');
            } else {
                const strings = logs.slice(0, 25).map(l => 
                    `[<t:${l.Timestamp}:f>] [<t:${l.Timestamp}:R>] **${l.Player}** użył komendy: \`${l.Command}\``
                );
                embed.setDescription(strings.join('\n'));
            }
        } else if (type === 'kills') {
            const logs = await getKillLogs();
            embed.setTitle('☠️ Ostatnie zabójstwa (Kill Logs)');
            
            if (logs.length === 0) {
                embed.setDescription('Brak wpisów w logach zabójstw.');
            } else {
                const strings = logs.slice(0, 25).map(l => 
                    `[<t:${l.Timestamp}:f>] [<t:${l.Timestamp}:R>] 🩸 **${l.Killer}** zabił **${l.Killed}**`
                );
                embed.setDescription(strings.join('\n'));
            }
        } else if (type === 'joins') {
            const logs = await getJoinLogs();
            embed.setTitle('🚪 Logi dołączeń (Join/Leave)');
            
            if (logs.length === 0) {
                embed.setDescription('Brak wpisów w logach wejść/wyjść.');
            } else {
                const strings = logs.slice(0, 25).map(l => 
                    `[<t:${l.Timestamp}:f>] [<t:${l.Timestamp}:R>] ${l.Join ? '✅' : '❌'} **${l.Player}** ${l.Join ? 'dołączył(a)' : 'wyszedł/wyszła'}`
                );
                embed.setDescription(strings.join('\n'));
            }
        } else if (type === 'modcalls') {
            const logs = await getModCalls();
            embed.setTitle('🚨 Logi wezwań administracji (Mod Calls)');
            
            if (logs.length === 0) {
                embed.setDescription('Brak wezwań w logach.');
            } else {
                const strings = logs.slice(0, 25).map(l => 
                    `[<t:${l.Timestamp}:f>] [<t:${l.Timestamp}:R>] 📞 **${l.Caller}** wezwał moderację. ${l.Moderator ? `(Przyjął: **${l.Moderator}**)` : '*(Oczekuje)*'}`
                );
                embed.setDescription(strings.join('\n'));
            }
        }

        return interaction.editReply({ embeds: [embed] });
    }
};
