import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../services/db';

export const dyzuryCommand = {
    data: new SlashCommandBuilder()
        .setName('dyzury')
        .setDescription('Sprawdź statystyki dyżurów moderatora. (Tylko Admin)')
        .addUserOption(option => 
            option.setName('uzytkownik')
                .setDescription('Wybierz moderatora do sprawdzenia')
                .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const ownerRole = '1490053669830393996';
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || 
                        (interaction.member?.roles as any)?.cache?.has(ownerRole);

        if (!isAdmin) {
            return interaction.reply({ content: '🚫 Ta komenda jest zarezerwowana dla Administracji wyższej!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('uzytkownik', true);
        await interaction.deferReply({ ephemeral: true });

        // Calculate all-time
        const allShifts = await (prisma as any).moderationShift.findMany({
            where: { moderatorId: targetUser.id, endTime: { not: null } }
        });

        const totalMinutes = allShifts.reduce((acc: number, s: any) => acc + (s.durationMinutes || 0), 0);

        // Calculate last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentShifts = await (prisma as any).moderationShift.findMany({
            where: { 
                moderatorId: targetUser.id, 
                endTime: { not: null },
                startTime: { gte: sevenDaysAgo }
            }
        });

        const recentMinutes = recentShifts.reduce((acc: number, s: any) => acc + (s.durationMinutes || 0), 0);

        // Current status
        const currentShift = await (prisma as any).moderationShift.findFirst({
            where: { moderatorId: targetUser.id, endTime: null }
        });

        const formatMinutes = (min: number) => {
            const h = Math.floor(min / 60);
            const m = min % 60;
            const d = Math.floor(h / 24);
            const remainingH = h % 24;

            if (d > 0) return `**${d}d ${remainingH}h ${m}m** (${min} min)`;
            return `**${h}h ${m}m** (${min} min)`;
        };

        const embed = new EmbedBuilder()
            .setTitle(`📊 Statystyki dyżurów: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor('#3498db')
            .addFields(
                { name: '⏱️ Całkowity czas', value: formatMinutes(totalMinutes), inline: true },
                { name: '📅 Ostatnie 7 dni', value: formatMinutes(recentMinutes), inline: true },
                { name: '🔢 Ilość zmian', value: `Wszystkie: \`${allShifts.length}\` | Ostatnie 7 dni: \`${recentShifts.length}\``, inline: false },
                { name: '🟢 Status', value: currentShift ? `Obecnie na służbie (od <t:${Math.floor(currentShift.startTime.getTime() / 1000)}:R>)` : 'Poza służbą', inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
