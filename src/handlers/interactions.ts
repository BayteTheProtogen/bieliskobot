import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder } from 'discord.js';
import { prisma } from '../services/db';
import { generateIDCard } from '../services/canvas';
import { getAvatarBust, getUserInfo } from '../services/roblox';

export async function handleInteractions(interaction: Interaction) {
    if (interaction.isButton()) {
        const { customId } = interaction;

        if (customId === 'roblox_no') {
            await interaction.update({ content: 'Anulowano. Spróbuj podać dokładny Nick.', embeds: [], components: [] });
            return;
        }

        if (customId.startsWith('roblox_yes|')) {
            const parts = customId.split('|');
            const robloxUserId = parts[1];
            const nick = parts[2];

            // Pokaż modal formularz
            const modal = new ModalBuilder()
                .setCustomId(`modal_id_${robloxUserId}|${nick}`)
                .setTitle('Dane do Dowodu Osobistego');

            const firstNameInput = new TextInputBuilder()
                .setCustomId('firstName')
                .setLabel("Imię postaci")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const lastNameInput = new TextInputBuilder()
                .setCustomId('lastName')
                .setLabel("Nazwisko postaci")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const dobInput = new TextInputBuilder()
                .setCustomId('dob')
                .setLabel("Data urodzenia (np. 15.04.1998)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(10)
                .setMaxLength(10);

            const genderInput = new TextInputBuilder()
                .setCustomId('gender')
                .setLabel("Płeć (M / K / X)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(1);

            const citizenshipInput = new TextInputBuilder()
                .setCustomId('citizenship')
                .setLabel("Obywatelstwo")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue("Polskie");

            const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(firstNameInput);
            const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(lastNameInput);
            const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(dobInput);
            const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(genderInput);
            const row5 = new ActionRowBuilder<TextInputBuilder>().addComponents(citizenshipInput);

            modal.addComponents(row1, row2, row3, row4, row5);

            await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('modal_id_')) {
            const parts = interaction.customId.replace('modal_id_', '').split('|');
            const robloxId = parts[0];
            const robloxNick = parts[1];

            const firstName = interaction.fields.getTextInputValue('firstName');
            const lastName = interaction.fields.getTextInputValue('lastName');
            const dob = interaction.fields.getTextInputValue('dob');
            const gender = interaction.fields.getTextInputValue('gender').toUpperCase();
            const citizenship = interaction.fields.getTextInputValue('citizenship');

            // Walidacja daty
            const dateParts = dob.split('.');
            if (dateParts.length !== 3 || dateParts[2].length !== 4) {
                await interaction.reply({ content: 'Nieprawidłowy format daty urodzenia! Użyj DD.MM.RRRR (np. 01.05.2000)', ephemeral: true });
                return;
            }

            const YY = dateParts[2].substring(2, 4);
            const MM = dateParts[1];
            const DD = dateParts[0];

            let endID = robloxId.substring(robloxId.length - 4);
            if (endID.length < 4) {
                endID = endID.padStart(4, '0');
            }

            const citizenNumber = `${YY}${MM}${DD}${endID}`;

            await interaction.reply({ content: 'Generowanie i zapisywanie dowodu... ⏳', ephemeral: true });

            try {
                // Zapisz do bazy
                const citizenData = {
                    discordId: interaction.user.id,
                    robloxNick,
                    robloxId,
                    firstName,
                    lastName,
                    dob,
                    gender,
                    citizenship,
                    citizenNumber,
                };

                const savedCitizen = await prisma.citizen.upsert({
                    where: { discordId: interaction.user.id },
                    update: citizenData,
                    create: citizenData,
                });

                // Generowanie obrazka
                const avatarBustUrl = await getAvatarBust(robloxId);
                const pfp = avatarBustUrl || '';
                
                const buffer = await generateIDCard(savedCitizen, pfp);
                const attachment = new AttachmentBuilder(buffer, { name: 'dowod.png' });

                // Try sending DM
                let dmSent = true;
                try {
                    await interaction.user.send({
                        content: `Twój elektroniczny dowód osobisty został pomyślnie zapisany w systemie. Oto kopia:`,
                        files: [attachment]
                    });
                } catch (e) {
                    dmSent = false; // User has DMs disabled
                }

                // Send to public channel
                if (interaction.channel && 'send' in interaction.channel) {
                    const publicMsg = await interaction.channel.send({
                        content: `🪪 Obywatel **${firstName} ${lastName}** (Z postacią **${robloxNick}**) wyrobił dowód osobisty!` + (!dmSent ? `\n*(Nie udało się wysłać na DM)*` : ''),
                        files: [attachment]
                    });
                }

                // Zmiana pseudonimu
                try {
                    const robloxUser = await getUserInfo(robloxId);
                    if (robloxUser && interaction.guild) {
                        const member = await interaction.guild.members.fetch(interaction.user.id);
                        await member.setNickname(`${robloxUser.displayName} (@${robloxUser.name})`);
                    }
                } catch (e) {
                    console.error('Błąd zmiany pseudonimu (brak uprawnień lub błąd API)', e);
                }

                await interaction.editReply({ content: '✅ Dowód wyrobiony pomyślnie!' });

            } catch (e) {
                console.error(e);
                await interaction.editReply({ content: 'Wystąpił nieoczekiwany błąd podczas zapisywania dowodu do bazy lub rysowania grafiki.' });
            }
        }
    }
}
