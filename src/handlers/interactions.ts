import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuInteraction } from 'discord.js';
import { prisma } from '../services/db';
import { generateIDCard, generateFineCard } from '../services/canvas';
import { getAvatarBust, getUserInfo } from '../services/roblox';

export async function handleInteractions(interaction: Interaction) {
    if (interaction.isUserSelectMenu()) {
        if (interaction.customId === 'admin_select_uniewaznij') {
            const targetDiscordId = interaction.values[0];
            const citizen = await prisma.citizen.findUnique({ where: { discordId: targetDiscordId } });

            if (!citizen) {
                return interaction.reply({ content: '🚫 Ten użytkownik nie posiada wyrobionego dowodu osobistego w bazie.', ephemeral: true });
            }

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`owner_confirm_unieważnij|${targetDiscordId}`)
                    .setLabel(`🔴 Potwierdzam: Unieważnij dowód ${citizen.firstName} ${citizen.lastName}`)
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({
                content: `### 🛠️ Administracyjne unieważnienie\nWybrano obywatela: **${citizen.firstName} ${citizen.lastName}** (@${citizen.robloxNick})\nCzy na pewno chcesz natychmiastowo unieważnić jego dokumenty?`,
                components: [row],
                ephemeral: true
            });
            return;
        }
    }

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

            const action = parts[3];

            if (action === 'create') {
                const existing = await prisma.citizen.findUnique({ where: { discordId: interaction.user.id } });
                if (existing) {
                    return interaction.update({ content: '🚫 Posiadasz już wyrobiony dowód osobisty! Jeśli chcesz zmienić dane, użyj `/dowod zaktualizuj`.', embeds: [], components: [] });
                }
            }

            // Pokaż modal formularz
            const modal = new ModalBuilder()
                .setCustomId(`modal_id_${robloxUserId}|${nick}|${action}`)
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

        if (customId.startsWith('admin_') && !customId.startsWith('admin_approve_inv_') && !customId.startsWith('admin_reject_inv_')) {
            const isApprove = customId.startsWith('admin_approve_');
            const isReject = customId.startsWith('admin_reject_');
            const isReason = customId.startsWith('admin_reason_');
            
            const updateIdStr = customId.split('_').pop() || '0';
            const updateId = parseInt(updateIdStr, 10);
            
            const pending = await prisma.pendingUpdate.findUnique({ where: { id: updateId } });
            if (!pending) {
                await interaction.update({ content: 'Podanie wygasło lub zostało zrealizowane.', embeds: [], components: [] });
                return;
            }

            if (isApprove) {
                await interaction.deferUpdate();
                
                const dobParts = pending.newDob.split('.');
                const YY = dobParts[2].substring(2, 4);
                const MM = dobParts[1];
                const DD = dobParts[0];
                let endID = pending.newRobloxId.substring(pending.newRobloxId.length - 4);
                if (endID.length < 4) endID = endID.padStart(4, '0');
                const citizenNumber = `${YY}${MM}${DD}${endID}`;

                const citizenData = {
                    discordId: pending.discordId,
                    robloxNick: pending.newRobloxNick,
                    robloxId: pending.newRobloxId,
                    firstName: pending.newFirstName,
                    lastName: pending.newLastName,
                    dob: pending.newDob,
                    gender: pending.newGender,
                    citizenship: pending.newCitizenship,
                    citizenNumber,
                };

                const savedCitizen = await prisma.citizen.upsert({
                    where: { discordId: pending.discordId },
                    update: citizenData,
                    create: citizenData,
                });

                await prisma.pendingUpdate.delete({ where: { id: updateId } });

                const oldEmbed = interaction.message.embeds[0];
                const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#00ff00').setTitle('Urząd: Podanie Zatwierdzone ✅');
                await interaction.editReply({ embeds: [newEmbed], components: [] });

                try {
                    const avatarBustUrl = await getAvatarBust(pending.newRobloxId);
                    const buffer = await generateIDCard(savedCitizen, avatarBustUrl || '');
                    const attachment = new AttachmentBuilder(buffer, { name: 'dowod.png' });

                    const citizenUser = await interaction.client.users.fetch(pending.discordId);
                    if (citizenUser) {
                        try {
                            await citizenUser.send({ content: '✅ Urząd zatwierdził Twoje podanie o aktualizację dowodu! Oto nowy dokument:', files: [attachment] });
                        } catch(e) {}
                    }

                    try {
                        const guild = interaction.guild;
                        if (guild) {
                            const member = await guild.members.fetch(pending.discordId);
                            const roleId = '1490075447629971467';
                            if (!member.roles.cache.has(roleId)) await member.roles.add(roleId);
                            const robloxUser = await getUserInfo(pending.newRobloxId);
                            if (robloxUser) await member.setNickname(`${robloxUser.displayName} (@${robloxUser.name})`);
                        }
                    } catch(e) {}
                } catch(e) {
                    console.error('Error post-approve', e);
                }

            } else if (isReject) {
                await prisma.pendingUpdate.delete({ where: { id: updateId } });
                
                const oldEmbed = interaction.message.embeds[0];
                const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#ff0000').setTitle('Urząd: Podanie Odrzucone ❌');
                await interaction.update({ embeds: [newEmbed], components: [] });

                try {
                    const citizenUser = await interaction.client.users.fetch(pending.discordId);
                    if (citizenUser) await citizenUser.send({ content: '❌ Urząd odrzucił Twoje podanie o zaktualizowanie dowodu osobistego.' });
                } catch(e) {}
            } else if (isReason) {
                const modal = new ModalBuilder()
                    .setCustomId(`admin_reason_modal_${updateId}`)
                    .setTitle('Powód odrzucenia');
                const reasonInput = new TextInputBuilder()
                    .setCustomId('reason')
                    .setLabel("Dlaczego odrzucasz ten wniosek?")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);
                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
                modal.addComponents(row);
                await interaction.showModal(modal);
            }
        }

        if (customId === 'user_confirm_unieważnienie') {
            await interaction.deferUpdate();
            const discordId = interaction.user.id;
            const citizen = await prisma.citizen.findUnique({ where: { discordId } });
            
            if (!citizen) {
                return interaction.editReply({ content: '🚫 Twój dowód nie został znaleziony w bazie.', components: [] });
            }

            const pending = await prisma.pendingInvalidation.create({
                data: { discordId }
            });

            const adminChannel = await interaction.client.channels.fetch('1490393894448271370');
            if (adminChannel && adminChannel.isTextBased() && 'send' in adminChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('Urząd: Wniosek o UNIEWAŻNIENIE dowodu')
                    .setDescription(`Użytkownik <@${discordId}> prosi o unieważnienie swojego dowodu osobistego.`)
                    .setColor('#ff4500')
                    .addFields(
                        { name: 'Obywatel', value: `${citizen.firstName} ${citizen.lastName}`, inline: true },
                        { name: 'Roblox Nick', value: citizen.robloxNick, inline: true }
                    )
                    .setFooter({ text: `ID Wniosku: ${pending.id}` });

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId(`admin_approve_inv_${pending.id}`).setLabel('✅ Unieważnij').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`admin_reject_inv_${pending.id}`).setLabel('❌ Odrzuć').setStyle(ButtonStyle.Secondary)
                );

                await adminChannel.send({ embeds: [embed], components: [row] });
                await interaction.editReply({ content: '✅ Twoje podanie o unieważnienie zostało przekazane do urzędu.', components: [] });
            } else {
                await interaction.editReply({ content: 'Błąd: Kanał urzędu administracyjnego jest nieosiągalny.', components: [] });
            }
        }

        if (customId.startsWith('admin_approve_inv_') || customId.startsWith('admin_reject_inv_')) {
            const isApprove = customId.startsWith('admin_approve_inv_');
            const invId = parseInt(customId.split('_').pop() || '0', 10);
            
            const pending = await prisma.pendingInvalidation.findUnique({ where: { id: invId } });
            if (!pending) {
                return interaction.update({ content: 'Wniosek wygasł lub został już przetworzony.', components: [], embeds: [] });
            }

            if (isApprove) {
                const citizen = await prisma.citizen.findUnique({ where: { discordId: pending.discordId } });
                if (citizen) {
                    await prisma.citizen.delete({ where: { discordId: pending.discordId } });
                    
                    try {
                        const guild = interaction.guild;
                        if (guild) {
                            const member = await guild.members.fetch(pending.discordId);
                            const roleId = '1490075447629971467';
                            if (member.roles.cache.has(roleId)) await member.roles.remove(roleId);
                        }
                    } catch(e) {}

                    try {
                        const user = await interaction.client.users.fetch(pending.discordId);
                        if (user) await user.send('🔴 Twój dowód osobisty został unieważniony przez Urząd. Twoje uprawnienia cywila zostały cofnięte.');
                    } catch(e) {}
                }
                
                await prisma.pendingInvalidation.delete({ where: { id: invId } });
                const oldEmbed = interaction.message.embeds[0];
                const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#000000').setTitle('Urząd: Dowód Unieważniony 🔴');
                await interaction.update({ embeds: [newEmbed], components: [] });
            } else {
                await prisma.pendingInvalidation.delete({ where: { id: invId } });
                const oldEmbed = interaction.message.embeds[0];
                const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#808080').setTitle('Urząd: Wniosek o unieważnienie Odrzucony ❌');
                await interaction.update({ embeds: [newEmbed], components: [] });

                try {
                    const user = await interaction.client.users.fetch(pending.discordId);
                    if (user) await user.send('❌ Urząd odrzucił Twój wniosek o unieważnienie dowodu osobistego.');
                } catch(e) {}
            }
        }

        if (customId.startsWith('owner_confirm_unieważnij|')) {
            const targetDiscordId = customId.split('|')[1];
            await interaction.deferUpdate();
            
            const citizen = await prisma.citizen.findUnique({ where: { discordId: targetDiscordId } });
            if (citizen) {
                await prisma.citizen.delete({ where: { discordId: targetDiscordId } });
                
                try {
                    const guild = interaction.guild;
                    if (guild) {
                        const member = await guild.members.fetch(targetDiscordId);
                        const roleId = '1490075447629971467';
                        if (member.roles.cache.has(roleId)) await member.roles.remove(roleId);
                    }
                } catch(e) {}

                try {
                    const user = await interaction.client.users.fetch(targetDiscordId);
                    if (user) await user.send('🔴 Twój dowód osobisty został unieważniony administracyjnie. Wszystkie dane zostały usunięte.');
                } catch(e) {}
                
                await interaction.editReply({ content: `✅ Dowód osobisty gracza został pomyślnie unieważniony.`, components: [] });
            } else {
                await interaction.editReply({ content: '🚫 Nie znaleziono dowodu tego gracza (możliwe, że został już usunięty).', components: [] });
            }
        }

        if (customId.startsWith('confirm_transfer|')) {
            const parts = customId.split('|');
            const targetDiscordId = parts[1];
            const amount = parseInt(parts[2], 10);
            
            await interaction.deferUpdate();
            
            const sender = await prisma.citizen.findUnique({ where: { discordId: interaction.user.id } });
            const recipient = await prisma.citizen.findUnique({ where: { discordId: targetDiscordId } });

            if (!sender || !recipient) {
                 return interaction.editReply({ content: '🚫 Wystąpił błąd: Jeden z uczestników transakcji nie ma już konta.', components: [] });
            }

            if (sender.pocket < amount) {
                return interaction.editReply({ content: `🚫 Nie masz już wystarczającej kwoty w kieszeni!`, components: [] });
            }

            await prisma.$transaction([
                prisma.citizen.update({ where: { discordId: interaction.user.id }, data: { pocket: { decrement: amount } } }),
                prisma.citizen.update({ where: { discordId: targetDiscordId }, data: { pocket: { increment: amount } } })
            ]);

            await interaction.editReply({ content: `✅ Przelano pomyślnie **${amount} zł** do obywatela **${recipient.firstName} ${recipient.lastName}**.`, components: [] });

            try {
                const recipientUser = await interaction.client.users.fetch(targetDiscordId);
                if (recipientUser) await recipientUser.send(`💸 Otrzymałeś przelew w wysokości **${amount} zł** od obywatela **${sender.firstName} ${sender.lastName}**.`);
            } catch(e) {}
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('admin_reason_modal_')) {
            const updateId = parseInt(interaction.customId.replace('admin_reason_modal_', ''), 10);
            const reason = interaction.fields.getTextInputValue('reason');
            
            const pending = await prisma.pendingUpdate.findUnique({ where: { id: updateId } });
            if (!pending) return interaction.reply({ content: 'Błąd: Podanie wygasło.', ephemeral: true });

            await prisma.pendingUpdate.delete({ where: { id: updateId } });

            if (interaction.message) {
                const oldEmbed = interaction.message.embeds[0];
                const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#ff0000').setTitle('Urząd: Podanie Odrzucone ❌').addFields({name: 'Powód odrzucenia', value: reason});
                await interaction.deferUpdate();
                await interaction.message.edit({ embeds: [newEmbed], components: [] });
            } else {
                await interaction.reply({ content: 'Odrzucono pomyślnie!', ephemeral: true });
            }

            try {
                const citizenUser = await interaction.client.users.fetch(pending.discordId);
                if (citizenUser) await citizenUser.send({ content: `❌ Urząd odrzucił Twoje podanie o aktualizację dowodu osobistego.\n**Powód:** ${reason}` });
            } catch(e) {}
            return;
        }

        if (interaction.customId === 'admin_uniewaznij_modal') {
            const targetNick = interaction.fields.getTextInputValue('targetNick');
            const citizen = await prisma.citizen.findFirst({ where: { robloxNick: targetNick } });

            if (!citizen) {
                return interaction.reply({ content: `🚫 Nie znaleziono w bazie obywatela z nickiem Roblox: **${targetNick}**.`, ephemeral: true });
            }

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`owner_confirm_unieważnij|${citizen.discordId}`)
                    .setLabel(`🔴 Potwierdzam: Unieważnij dowód ${citizen.firstName} ${citizen.lastName}`)
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({
                content: `### 🛠️ Administracyjne unieważnienie\nZnaleziono obywatela: **${citizen.firstName} ${citizen.lastName}** (@${citizen.robloxNick})\nCzy na pewno chcesz natychmiastowo unieważnić jego dokumenty?`,
                components: [row],
                ephemeral: true
            });
            return;
        }

        if (interaction.customId === 'mandat_modal') {
            const targetNick = interaction.fields.getTextInputValue('targetNick');
            const reason = interaction.fields.getTextInputValue('reason');
            const amount = parseInt(interaction.fields.getTextInputValue('amount'), 10);

            if (isNaN(amount) || amount < 0) {
                return interaction.reply({ content: '🚫 Nieprawidłowa kwota mandatu.', ephemeral: true });
            }

            const target = await prisma.citizen.findFirst({ where: { robloxNick: targetNick } });
            if (!target) {
                return interaction.reply({ content: `🚫 Nie znaleziono w bazie obywatela o nicku: **${targetNick}**.`, ephemeral: true });
            }

            await interaction.reply({ content: 'Przetwarzanie mandatu... ⚖️', ephemeral: true });

            // Cascading payment logic
            let remainingFine = amount;
            let pocketDeduct = 0;
            let bankDeduct = 0;

            if (amount > 0) {
                // Pocket first
                if (target.pocket >= remainingFine) {
                    pocketDeduct = remainingFine;
                    remainingFine = 0;
                } else {
                    pocketDeduct = target.pocket;
                    remainingFine -= target.pocket;
                }

                // Bank second
                if (remainingFine > 0) {
                    if (target.bank >= remainingFine) {
                        bankDeduct = remainingFine;
                        remainingFine = 0;
                    } else {
                        bankDeduct = target.bank;
                        remainingFine -= target.bank;
                    }
                }

                // Debt goes to pocket
                if (remainingFine > 0) {
                    pocketDeduct += remainingFine;
                }

                await prisma.citizen.update({
                    where: { discordId: target.discordId },
                    data: {
                        pocket: { decrement: pocketDeduct },
                        bank: { decrement: bankDeduct }
                    }
                });
            }

            // Generate Image
            const officerMember = await interaction.guild?.members.fetch(interaction.user.id);
            const officerName = officerMember?.nickname || interaction.user.username;

            const buffer = await generateFineCard({
                targetName: `${target.firstName} ${target.lastName}`,
                targetNick: target.robloxNick,
                reason,
                amount,
                citizenNumber: target.citizenNumber,
                officerName,
                date: new Date().toLocaleString('pl-PL')
            });

            const attachment = new AttachmentBuilder(buffer, { name: 'mandat.png' });

            // Send to channel
            if (interaction.channel && 'send' in interaction.channel) {
                await interaction.channel.send({
                    content: `⚖️ Wystawiono ${amount === 0 ? 'pouczenie' : 'mandat'} dla <@${target.discordId}>!`,
                    files: [attachment]
                });
            }

            // Send to DM
            try {
                const targetUser = await interaction.client.users.fetch(target.discordId);
                if (targetUser) await targetUser.send({ content: `🔴 Otrzymałeś ${amount === 0 ? 'pouczenie' : 'mandat'} w świecie RP Bielisko.`, files: [attachment] });
            } catch(e) {}

            await interaction.editReply({ content: '✅ Mandat został wystawiony i przesłany.' });
            return;
        }

        if (interaction.customId.startsWith('modal_id_')) {
            const parts = interaction.customId.replace('modal_id_', '').split('|');
            const robloxId = parts[0];
            const robloxNick = parts[1];
            const action = parts[2] || 'create';

            const firstName = interaction.fields.getTextInputValue('firstName');
            const lastName = interaction.fields.getTextInputValue('lastName');
            const dob = interaction.fields.getTextInputValue('dob');
            const gender = interaction.fields.getTextInputValue('gender').toUpperCase();
            const citizenship = interaction.fields.getTextInputValue('citizenship');

            // Walidacja płci
            if (!['M', 'K', 'X', 'F'].includes(gender)) {
                await interaction.reply({ content: '🚫 Niepoprawna płeć! Wprowadź jedną odpowiednią literę: `M` (Mężczyzna), `K` (Kobieta) lub `X` (Inne).', ephemeral: true });
                return;
            }

            // Walidacja daty
            const dateParts = dob.split('.');
            if (dateParts.length !== 3 || dateParts[2].length !== 4) {
                await interaction.reply({ content: '🚫 Nieprawidłowy format daty urodzenia! Użyj DD.MM.RRRR (np. 01.05.2000)', ephemeral: true });
                return;
            }

            const dayNum = parseInt(dateParts[0], 10);
            const monNum = parseInt(dateParts[1], 10);
            const yeaNum = parseInt(dateParts[2], 10);

            if (isNaN(dayNum) || isNaN(monNum) || isNaN(yeaNum) ||
                dayNum < 1 || dayNum > 31 || 
                monNum < 1 || monNum > 12 || 
                yeaNum < 1850 || yeaNum > new Date().getFullYear()) {
                await interaction.reply({ content: '🚫 Wprowadziłeś nielogiczną datę urodzenia! Popraw swoje dane.', ephemeral: true });
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

            await interaction.reply({ content: 'Generowanie i zapisywanie dokumentu... ⏳', ephemeral: true });

            if (action === 'update') {
                try {
                    const oldCitizen = await prisma.citizen.findUnique({ where: { discordId: interaction.user.id } });
                    if (!oldCitizen) {
                         return interaction.editReply({ content: 'Błąd: Nie znaleziono starego dowodu do aktualizacji.' });
                    }

                    const pendingUpdate = await prisma.pendingUpdate.create({
                        data: {
                            discordId: interaction.user.id,
                            newRobloxNick: robloxNick,
                            newRobloxId: robloxId,
                            newFirstName: firstName,
                            newLastName: lastName,
                            newDob: dob,
                            newGender: gender,
                            newCitizenship: citizenship
                        }
                    });

                    const adminChannel = await interaction.client.channels.fetch('1490393894448271370');
                    if (adminChannel && adminChannel.isTextBased() && 'send' in adminChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle(`Urząd: Podanie o aktualizację dowodu`)
                            .setDescription(`Użytkownik <@${interaction.user.id}> składa wniosek o zaktualizowanie danych w dowodzie.`)
                            .setColor('#e6a822')
                            .addFields(
                                { name: 'Imię', value: `${oldCitizen.firstName} ➔ **${firstName}**`, inline: true },
                                { name: 'Nazwisko', value: `${oldCitizen.lastName} ➔ **${lastName}**`, inline: true },
                                { name: 'Data Urodzenia', value: `${oldCitizen.dob} ➔ **${dob}**`, inline: true },
                                { name: 'Roblox Nick', value: `${oldCitizen.robloxNick} ➔ **${robloxNick}**`, inline: true },
                                { name: 'Płeć', value: `${oldCitizen.gender} ➔ **${gender}**`, inline: true },
                                { name: 'Obywatelstwo', value: `${oldCitizen.citizenship} ➔ **${citizenship}**`, inline: true }
                            )
                            .setFooter({ text: `ID Wniosku: ${pendingUpdate.id}` });

                        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder().setCustomId(`admin_approve_${pendingUpdate.id}`).setLabel('✅ Zatwierdź').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`admin_reject_${pendingUpdate.id}`).setLabel('❌ Odrzuć').setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setCustomId(`admin_reason_${pendingUpdate.id}`).setLabel('📝 Odrzuć ze zwrotem').setStyle(ButtonStyle.Secondary)
                        );

                        await adminChannel.send({ embeds: [embed], components: [row] });
                        await interaction.editReply({ content: '✅ Twoje podanie o zaktualizowanie dowodu osobistego zostało złożone! Urząd wkrótce je rozpatrzy, a o decyzji dowiesz się poprzez Wiadomość Prywatną.' });
                        return;
                    } else {
                        await interaction.editReply({ content: 'Błąd: Kanał urzędu administracyjnego jest nieosiągalny.' });
                        return;
                    }
                } catch(e) {
                    console.error('Wystąpił błąd przy dodawaniu podania', e);
                    await interaction.editReply({ content: 'Błąd bazy danych podczas składania podania.' });
                    return;
                }
            }

            // Logika dla 'create'
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

                // Zmiana pseudonimu i nadawanie roli
                try {
                    const robloxUser = await getUserInfo(robloxId);
                    if (interaction.guild) {
                        const member = await interaction.guild.members.fetch(interaction.user.id);
                        
                        // Nadanie roli Cywil
                        const roleId = '1490075447629971467';
                        if (!member.roles.cache.has(roleId)) {
                            await member.roles.add(roleId);
                        }

                        if (robloxUser) {
                            await member.setNickname(`${robloxUser.displayName} (@${robloxUser.name})`);
                        }
                    }
                } catch (e) {
                    console.error('Błąd zmiany pseudonimu lub dodania roli (brak uprawnień lub błąd API)', e);
                }

                await interaction.editReply({ content: '✅ Dowód wyrobiony pomyślnie!' });

            } catch (e) {
                console.error(e);
                await interaction.editReply({ content: 'Wystąpił nieoczekiwany błąd podczas zapisywania dowodu do bazy lub rysowania grafiki.' });
            }
        }
    }
}
