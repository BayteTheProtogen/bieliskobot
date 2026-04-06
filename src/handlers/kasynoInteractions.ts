import { Interaction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { prisma } from '../services/db';
import { generateCasinoResult } from '../services/canvas';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleKasynoInteractions(interaction: Interaction): Promise<boolean> {
    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId === 'kasyno_slots') {
            const modal = new ModalBuilder()
                .setCustomId('kasyno_modal_slots')
                .setTitle('Jednoręki Bandyta 🎰');
            const betInput = new TextInputBuilder()
                .setCustomId('bet')
                .setLabel("Ilość gotówki z kieszeni")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Np. 500")
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(betInput));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'kasyno_roulette') {
            const embed = new EmbedBuilder()
                .setTitle('🎲 Ruletka - Wybierz kolor')
                .setDescription('Czarny (x2), Czerwony (x2), a może ryzykowny Zielony (x14)?')
                .setColor('#e67e22');
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('kasyno_roulette_black').setLabel('Czarny ⚫').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('kasyno_roulette_red').setLabel('Czerwony 🔴').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('kasyno_roulette_green').setLabel('Zielony 🟩').setStyle(ButtonStyle.Success)
            );
            await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
            return true;
        }

        if (customId === 'kasyno_coinflip') {
            const embed = new EmbedBuilder()
                .setTitle('🪙 Rzut Monetą - Obstawiasz?')
                .setDescription('Wybierz wygrywającą stronę (Zwrot x2 gotówki)')
                .setColor('#f1c40f');
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('kasyno_coinflip_heads').setLabel('Orzeł').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('kasyno_coinflip_tails').setLabel('Reszka').setStyle(ButtonStyle.Secondary)
            );
            await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
            return true;
        }

        if (customId.startsWith('kasyno_roulette_') || customId.startsWith('kasyno_coinflip_')) {
            const gameType = customId.includes('roulette') ? 'roulette' : 'coinflip';
            const choice = customId.split('_').pop();

            const modal = new ModalBuilder()
                .setCustomId(`kasyno_modal_${gameType}|${choice}`)
                .setTitle(gameType === 'roulette' ? 'Zagraj w Ruletkę 🎲' : 'Rzuć Monetą 🪙');
            const betInput = new TextInputBuilder()
                .setCustomId('bet')
                .setLabel("Stawka z Twojej kieszeni")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Podaj kwotę w PLN")
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(betInput));
            await interaction.showModal(modal);
            return true;
        }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('kasyno_modal_')) {
        const customId = interaction.customId;
        const betRaw = interaction.fields.getTextInputValue('bet');
        let bet = parseInt(betRaw.replace(/[^0-9]/g, ''));

        if (isNaN(bet) || bet <= 0) {
            await interaction.reply({ content: '🚫 Podaj poprawną kwotę (liczbę większą od 0).', flags: [MessageFlags.Ephemeral] });
            return true;
        }

        const discordId = interaction.user.id;
        const citizen = await prisma.citizen.findUnique({ where: { discordId } });

        if (!citizen || citizen.pocket < bet) {
            await interaction.reply({ content: `🚫 Nie masz tyle gotówki! (Stawka: ${bet}zł, Posiadasz: ${citizen?.pocket || 0}zł)`, flags: [MessageFlags.Ephemeral] });
            return true;
        }

        // POBRANIE WKLADU. Jeśli wygra - dodamy zyski powiększone o wkład na końcu
        await prisma.citizen.update({
            where: { discordId },
            data: { pocket: { decrement: bet } }
        });

        await interaction.deferReply(); 

        if (customId === 'kasyno_modal_slots') {
            await playSlots(interaction, bet);
        } else if (customId.startsWith('kasyno_modal_coinflip')) {
            const choice = customId.split('|')[1];
            await playCoinflip(interaction, bet, choice);
        } else if (customId.startsWith('kasyno_modal_roulette')) {
            const color = customId.split('|')[1];
            await playRoulette(interaction, bet, color);
        }

        return true;
    }

    return false;
}

async function finishGame(interaction: any, isWin: boolean, bet: number, multiplier: number) {
    const discordId = interaction.user.id;
    let winnings = 0;
    
    if (isWin) {
        winnings = bet * multiplier;
        await prisma.citizen.update({
            where: { discordId },
            data: { pocket: { increment: winnings } }
        });
    }

    const citizen = await prisma.citizen.findUnique({ where: { discordId } });
    if (!citizen) return;

    // Generowanie obrazka z wynikiem!
    const canvasBuffer = await generateCasinoResult(interaction.user, isWin, isWin ? `+${winnings} PLN` : `-${bet} PLN`, citizen.pocket);
    const attachment = new AttachmentBuilder(canvasBuffer, { name: 'ticket.png' });

    const embed = new EmbedBuilder()
        .setColor(isWin ? '#2ecc71' : '#e74c3c')
        .setImage('attachment://ticket.png');

    await interaction.editReply({ embeds: [embed], files: [attachment] });
}


// GRY I ANIMACJE
async function playSlots(interaction: any, bet: number) {
    const fruits = ['🍒', '🍋', '🔔', '💎', '🎰'];
    const r = () => fruits[Math.floor(Math.random() * fruits.length)];
    
    let msg = await interaction.editReply(`🎰 **Jednoręki Bandyta** \n[ ❓ | ❓ | ❓ ]  *(Losowanie...)*`);
    await delay(1000);
    
    const r1 = r();
    await interaction.editReply(`🎰 **Jednoręki Bandyta** \n[ ${r1} | ❓ | ❓ ]  *(Losowanie...)*`);
    await delay(1000);
    
    const r2 = r();
    await interaction.editReply(`🎰 **Jednoręki Bandyta** \n[ ${r1} | ${r2} | ❓ ]  *(Losowanie...)*`);
    await delay(1500);

    const r3 = r();
    let isWin = false;
    let multiplier = 0;

    if (r1 === r2 && r2 === r3) {
        isWin = true;
        if (r1 === '💎') multiplier = 10;
        else if (r1 === '🎰') multiplier = 20;
        else multiplier = 3; // Owoce x3
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
        isWin = true;
        multiplier = 1.5; // Dwa takie same symbole x1.5
    }

    await interaction.editReply(`🎰 **Jednoręki Bandyta** \n[ ${r1} | ${r2} | ${r3} ]  **Koniec gry!**`);
    await delay(1000);

    await finishGame(interaction, isWin, bet, multiplier);
}

async function playCoinflip(interaction: any, bet: number, userChoice: string) {
    await interaction.editReply(`🪙 Rozgrzewam nadgarstek...`);
    await delay(800);
    await interaction.editReply(`🪙 Moneta wiruje w powietrzu...`);
    await delay(1500);

    const isHeads = Math.random() > 0.5;
    const resultSide = isHeads ? 'heads' : 'tails';
    const resultName = isHeads ? 'Orzeł' : 'Reszka';

    await interaction.editReply(`💥 Wypada... **${resultName}**!`);
    await delay(1000);

    const isWin = (userChoice === resultSide);
    await finishGame(interaction, isWin, bet, 2);
}

async function playRoulette(interaction: any, bet: number, colorChoice: string) {
    await interaction.editReply(`🎲 Krupier kręci kołem ruletki...`);
    await delay(1000);
    await interaction.editReply(`🎲 Kuleczka skacze po polach... 🔴... ⚫... 🟩...`);
    await delay(1500);

    const rand = Math.random();
    let resultColor = '';
    let resultName = '';

    // 0-47.3%: Red, 47.3-94.6%: Black, 94.6-100%: Green
    if (rand < 0.473) {
        resultColor = 'red'; resultName = 'Czerwony 🔴';
    } else if (rand < 0.946) {
        resultColor = 'black'; resultName = 'Czarny ⚫';
    } else {
        resultColor = 'green'; resultName = 'Zielony 🟩';
    }

    await interaction.editReply(`💥 Kuleczka opada! Wynik: **${resultName}**`);
    await delay(1200);

    const isWin = (colorChoice === resultColor);
    const multiplier = (resultColor === 'green') ? 14 : 2;

    await finishGame(interaction, isWin, bet, multiplier);
}
