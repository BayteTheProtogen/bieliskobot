import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { join } from 'path';
import axios from 'axios';

GlobalFonts.registerFromPath(join(__dirname, '../../fonts/Roboto-Regular.ttf'), 'Roboto');
GlobalFonts.registerFromPath(join(__dirname, '../../fonts/Roboto-Bold.ttf'), 'RobotoBold');
GlobalFonts.registerFromPath(join(__dirname, '../../fonts/SpaceMono-Bold.ttf'), 'SpaceMono');

export interface CitizenData {
    firstName: string;
    lastName: string;
    dob: string;
    gender: string;
    citizenship: string;
    citizenNumber: string;
}

export async function generateIDCard(data: CitizenData, avatarUrl: string): Promise<Buffer> {
    const width = 856;
    const height = 540;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. TŁO - Nowoczesny e-dowód (Srebrzysto-niebieski)
    const baseGrad = ctx.createLinearGradient(0, 0, width, height);
    baseGrad.addColorStop(0, '#f0f2f5');
    baseGrad.addColorStop(0.3, '#ddecff');
    baseGrad.addColorStop(0.7, '#fff1f1'); // Subtelny różowy akcent
    baseGrad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. PROCEDURALNY GILOSZ (Wzór zabezpieczający)
    ctx.strokeStyle = 'rgba(0, 51, 153, 0.04)';
    ctx.lineWidth = 0.5;
    for (let i = -100; i < width + 100; i += 15) {
        ctx.beginPath();
        for (let j = 0; j < height; j += 10) {
            const x = i + Math.sin(j * 0.015) * 40;
            ctx.lineTo(x, j);
        }
        ctx.stroke();
    }

    // 3. PASEK UNIJNY (Top Left)
    const blueBarWidth = 140;
    const blueBarHeight = 90;
    ctx.fillStyle = '#003399';
    // Rysowanie prostokąta z jednym zaokrąglonym rogiem (dolny prawy)
    ctx.beginPath();
    ctx.roundRect(0, 0, blueBarWidth, blueBarHeight, [0, 0, 30, 0]);
    ctx.fill();

    // Gwiazdy i PL
    ctx.save();
    ctx.translate(70, 45);
    ctx.strokeStyle = '#FFCC00';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
        ctx.save();
        ctx.rotate((Math.PI * 2 / 12) * i);
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(0, -26);
        ctx.stroke();
        ctx.restore();
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '28px RobotoBold';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PL', 0, 0);
    ctx.restore();

    // NAGŁÓWEK
    ctx.fillStyle = '#003399';
    ctx.font = '32px RobotoBold';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('RZECZPOSPOLITA POLSKA', 160, 45);
    ctx.font = '16px RobotoBold';
    ctx.fillStyle = '#64748b';
    ctx.fillText('REPUBLIC OF POLAND', 160, 70);
    ctx.font = '18px Roboto';
    ctx.fillStyle = '#334155';
    ctx.fillText('DOWÓD OSOBISTY / IDENTITY CARD', 160, 100);

    // 4. CHIP ELEKTRONICZNY
    const chipX = 320;
    const chipY = 120;
    const chipGrad = ctx.createLinearGradient(chipX, chipY, chipX + 65, chipY + 50);
    chipGrad.addColorStop(0, '#d4af37');
    chipGrad.addColorStop(0.5, '#f7e4a1');
    chipGrad.addColorStop(1, '#b8860b');
    
    ctx.fillStyle = chipGrad;
    ctx.beginPath();
    ctx.roundRect(chipX, chipY, 65, 50, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Wzór na chipie
    ctx.beginPath();
    ctx.moveTo(chipX + 32, chipY); ctx.lineTo(chipX + 32, chipY + 50);
    ctx.moveTo(chipX, chipY + 25); ctx.lineTo(chipX + 65, chipY + 25);
    ctx.stroke();

    // 5. ZDJĘCIE OBYWATELA
    try {
        const avatar = await loadImage(avatarUrl);
        const imgWidth = 240;
        const imgHeight = 240;
        const imgX = 40;
        const imgY = 130;

        // Cień pod zdjęciem
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 8;

        ctx.beginPath();
        ctx.roundRect(imgX, imgY, imgWidth, imgHeight, 25);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(imgX, imgY, imgWidth, imgHeight, 25);
        ctx.clip();
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(imgX, imgY, imgWidth, imgHeight);
        ctx.drawImage(avatar, imgX, imgY, imgWidth, imgHeight);
        ctx.restore();

        // Ramka wokół zdjęcia
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(imgX, imgY, imgWidth, imgHeight, 25);
        ctx.stroke();
    } catch (e) {
        ctx.fillStyle = '#cbd5e1';
        ctx.roundRect(40, 130, 240, 240, 25);
        ctx.fill();
    }

    // 6. DANE OBYWATELA
    const dataX = 330;
    const dataY = 210;
    const spacing = 70;

    const drawModernField = (label: string, value: string, x: number, y: number) => {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Roboto';
        ctx.fillText(label.toUpperCase(), x, y);
        
        ctx.fillStyle = '#0f172a';
        ctx.font = '22px RobotoBold';
        ctx.fillText(value.toUpperCase(), x, y + 26);
    };

    drawModernField('Nazwisko / Surname', data.lastName, dataX, dataY);
    drawModernField('Imię (Imiona) / Name', data.firstName, dataX, dataY + spacing);
    drawModernField('Obywatelstwo / Nationality', data.citizenship, dataX, dataY + spacing * 2);
    
    drawModernField('Data urodzenia / Birth', data.dob, dataX, dataY + spacing * 3);
    drawModernField('Płeć / Sex', data.gender, dataX + 210, dataY + spacing * 3);
    
    // Numer seryjny (Citizen No) w dolnym rogu
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px RobotoBold';
    ctx.fillText('NUMER OBYWATELA / CITIZEN NUMBER', width - 40, height - 130);
    ctx.fillStyle = '#334155';
    ctx.font = '18px SpaceMono';
    ctx.fillText(data.citizenNumber.toUpperCase(), width - 40, height - 105);
    ctx.textAlign = 'left';

    // 7. HOLOGRAM (Subtelny orzeł w tle)
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#003399';
    ctx.translate(width - 180, height / 2);
    ctx.beginPath();
    ctx.arc(0, 0, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 8. MRZ (Machine Readable Zone)
    const mrzY = height - 90;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(0, mrzY, width, 90);

    ctx.fillStyle = '#1e293b';
    ctx.font = '22px SpaceMono';
    
    const cleanStr = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/gi, '').toUpperCase();
    const lName = cleanStr(data.lastName).padEnd(15, '<').substring(0, 15);
    const fName = cleanStr(data.firstName).padEnd(14, '<').substring(0, 14);
    const dobMrz = data.dob.replace(/\./g, '').substring(0, 6);
    
    const mrzLine1 = `IDPOL${lName}${fName}<<<<<<`;
    const mrzLine2 = `${data.citizenNumber.substring(0,9)}<${dobMrz}${cleanStr(data.gender).substring(0,1)}<<<<<<<<<<<<<`;

    ctx.fillText(mrzLine1, 60, mrzY + 40);
    ctx.fillText(mrzLine2, 60, mrzY + 75);

    // 9. STEMPEL "OSADZONY" (Jeśli zbanowany)
    const now = new Date();
    // @ts-ignore
    const isTempBanned = data.bannedUntil && new Date(data.bannedUntil) > now;
    // @ts-ignore
    if (data.isPermBanned || isTempBanned) {
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(-0.3);
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 8;
        
        // Ramka stempla
        ctx.strokeRect(-200, -60, 400, 120);

        // Tekst stempla
        ctx.fillStyle = '#c0392b';
        ctx.font = 'bold 70px Roboto';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('OSADZONY', 0, 0);

        // Lekki efekt "zużycia" stempla (proceduralnie)
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 50; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 400 - 200, Math.random() * 120 - 60, Math.random() * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    return canvas.toBuffer('image/png');
}

export async function generatePrisonerCard(avatarUrl: string): Promise<Buffer> {
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Tło i Avatar
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    if (avatarUrl) {
        try {
            // Fetch as buffer to circumvent potential redirect/UA issues
            const response = await axios.get(avatarUrl, { 
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const avatar = await loadImage(Buffer.from(response.data));
            
            ctx.save();
            ctx.drawImage(avatar, 50, 50, 700, 700);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // Darken slightly
            ctx.fillRect(50, 50, 700, 700);
            ctx.restore();
        } catch (e) {
            console.error('Błąd ładowania avatara do karty więźnia:', e);
        }
    }

    // 2. KRATY (Proceduralnie - Bardziej widoczne)
    ctx.strokeStyle = '#4b5563'; // Jaśniejszy szary dla lepszego kontrastu
    ctx.lineWidth = 35;
    ctx.lineCap = 'round';
    
    const barCount = 7;
    const barSpacing = width / (barCount + 1);
    
    for (let i = 1; i <= barCount; i++) {
        ctx.beginPath();
        ctx.moveTo(i * barSpacing, 0);
        ctx.lineTo(i * barSpacing, height);
        ctx.stroke();
    }

    // Poziome belki wzmacniające
    ctx.lineWidth = 25;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.25);
    ctx.lineTo(width, height * 0.25);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(0, height * 0.75);
    ctx.lineTo(width, height * 0.75);
    ctx.stroke();

    // 3. STEMPEL "OSADZONY" (Bardziej wyrazisty)
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-0.2);
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 15;
    
    // Grubsza ramka stempla
    ctx.strokeRect(-280, -90, 560, 180);

    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 100px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OSADZONY', 0, 0);
    ctx.restore();

    return canvas.toBuffer('image/png');
}

export interface FineData {
    targetName: string;
    targetNick: string;
    reason: string;
    amount: number;
    citizenNumber: string;
    officerName: string;
    date: string;
}

export async function generateFineCard(data: FineData): Promise<Buffer> {
    const width = 600;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const isWarning = data.amount === 0;
    const primaryColor = isWarning ? '#D4AF37' : '#C0392B'; // Gold or Deep Red
    const secondaryColor = isWarning ? '#F1C40F' : '#922B21';

    // 1. TŁO - Delikatny gilosz
    ctx.fillStyle = '#fdfdfd';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = `rgba(${isWarning ? '212, 175, 55' : '192, 57, 43'}, 0.05)`;
    ctx.lineWidth = 0.5;
    for (let i = -100; i < width + 100; i += 15) {
        ctx.beginPath();
        for (let j = 0; j < height; j += 10) {
            const x = i + Math.cos(j * 0.02) * 20;
            ctx.lineTo(x, j);
        }
        ctx.stroke();
    }

    // 2. NAGŁÓWEK - Metaliczny gradient
    const headerH = 140;
    const headerGrad = ctx.createLinearGradient(0, 0, 0, headerH);
    headerGrad.addColorStop(0, primaryColor);
    headerGrad.addColorStop(0.5, secondaryColor);
    headerGrad.addColorStop(1, primaryColor);
    
    ctx.fillStyle = headerGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, headerH, [0, 0, 40, 40]);
    ctx.fill();

    // Połysk na nagłówku
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, 40);
    ctx.lineTo(0, 100);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px Roboto';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.fillText(isWarning ? 'POUCZENIE' : 'MANDAT KARNY', width / 2, 75);
    
    ctx.shadowBlur = 0;
    ctx.font = 'bold 16px Roboto';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('RZECZPOSPOLITA POLSKA - SŁUŻBY PORZĄDKOWE', width / 2, 110);

    // 3. SEKCJA DANYCH
    const contentX = 60;
    let currentY = 210;

    const drawLine = (y: number) => {
        ctx.strokeStyle = '#e2e8f0';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(contentX, y);
        ctx.lineTo(width - contentX, y);
        ctx.stroke();
        ctx.setLineDash([]);
    };

    const drawSection = (label: string, value: string, subValue?: string) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 12px Roboto';
        ctx.fillText(label.toUpperCase(), contentX, currentY);
        
        ctx.fillStyle = '#1e293b';
        ctx.font = '22px RobotoBold';
        ctx.fillText(value.toUpperCase(), contentX, currentY + 30);
        
        if (subValue) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '14px Roboto';
            ctx.fillText(`(${subValue})`, contentX, currentY + 52);
            currentY += 10;
        }
        
        currentY += 85;
        drawLine(currentY - 35);
    };

    drawSection('Obywatel (Ukarany)', data.targetName, `@${data.targetNick}`);
    drawSection('Numer Dowodu', data.citizenNumber);
    
    // Powód (z zawijaniem tekstu)
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Roboto';
    ctx.fillText('POWÓD WYSTAWIENIA', contentX, currentY);
    ctx.fillStyle = '#334155';
    ctx.font = '18px Roboto';
    
    const words = data.reason.split(' ');
    let line = '';
    let reasonY = currentY + 30;
    for (const word of words) {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > width - 120) {
            ctx.fillText(line, contentX, reasonY);
            line = word + ' ';
            reasonY += 24;
        } else {
            line = test;
        }
    }
    ctx.fillText(line, contentX, reasonY);
    currentY = reasonY + 50;
    drawLine(currentY - 15);
    currentY += 35;

    // Kwota - Grande
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Roboto';
    ctx.fillText('KWOTA GRZYWNY', contentX, currentY);
    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 36px SpaceMono';
    ctx.fillText(isWarning ? '0.00 ZŁ' : `${data.amount.toLocaleString()}.00 ZŁ`, contentX, currentY + 45);
    currentY += 100;

    // Funkcjonariusz i Data
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 10px Roboto';
    ctx.fillText('WYSTAWIŁ:', contentX, currentY);
    ctx.fillStyle = '#1e293b';
    ctx.font = '14px RobotoBold';
    ctx.fillText(data.officerName.toUpperCase(), contentX, currentY + 20);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 10px Roboto';
    ctx.fillText('DATA I GODZINA:', width - contentX, currentY);
    ctx.fillStyle = '#1e293b';
    ctx.font = '14px RobotoBold';
    ctx.fillText(data.date, width - contentX, currentY + 20);

    // 4. PROCEDURALNA PIECZĘĆ
    ctx.save();
    ctx.translate(width - 140, height - 160);
    ctx.rotate(-0.2);
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 3;
    
    // Zewnętrzny krąg
    ctx.beginPath();
    ctx.arc(0, 0, 60, 0, Math.PI * 2);
    ctx.stroke();
    
    // Wewnętrzny krąg
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.stroke();

    // Tekst pieczęci
    ctx.fillStyle = primaryColor;
    ctx.font = '10px RobotoBold';
    ctx.textAlign = 'center';
    for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((Math.PI * 2 / 8) * i);
        ctx.fillText('URZĄD RP', 0, -52);
        ctx.restore();
    }
    
    // Środek - Orzeł (proceduralnie-subtelny)
    ctx.font = '24px RobotoBold';
    ctx.fillText('RP', 0, 8);
    ctx.restore();

    // 5. MRZ (Machine Readable Zone)
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    ctx.fillRect(0, height - 70, width, 70);
    
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px SpaceMono';
    ctx.textAlign = 'center';
    const fakeID = `FINE${Date.now().toString().substring(5)}<${data.citizenNumber}<<<<<<<<`;
    const fakeID2 = `${data.targetNick.toUpperCase().padEnd(15, '<')}<<<<<<<<<<<<<<<<<<`;
    ctx.fillText(fakeID, width / 2, height - 40);
    ctx.fillText(fakeID2, width / 2, height - 15);

    return canvas.toBuffer('image/png');
}

export async function generateCasinoResult(user: any, isWin: boolean, outcomeLabel: string, newBalance: number): Promise<Buffer> {
    const width = 600;
    const height = 300;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const baseColor = isWin ? '#064225' : '#4a0b12';
    const darkColor = '#0a0a0a';
    
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
    bgGrad.addColorStop(0, baseColor);
    bgGrad.addColorStop(1, darkColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '20px SpaceMono';
    ctx.textAlign = 'center';
    ctx.fillText('BIELISKO BET - RACHUNEK ROZLICZENIOWY', width / 2, 35);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.moveTo(50, 50); ctx.lineTo(width-50, 50); ctx.stroke();

    const drawChip = (cx: number, cy: number, color1: string, color2: string, scale: number = 1, angle: number = 0) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.scale(scale, scale);

        ctx.beginPath();
        ctx.arc(0, 0, 40, 0, Math.PI * 2);
        ctx.fillStyle = '#fdfdfd';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#999';
        ctx.stroke();

        ctx.fillStyle = color2;
        for (let i = 0; i < 8; i++) {
            ctx.save();
            ctx.rotate((Math.PI * 2 / 8) * i);
            ctx.fillRect(25, -5, 15, 10);
            ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 2);
        ctx.fillStyle = color1;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px SpaceMono';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 0);

        ctx.restore();
    }

    if (isWin) {
        drawChip(120, 220, '#116e3c', '#000000', 1.2, 0);
        drawChip(120, 205, '#116e3c', '#000000', 1.2, 0.1);
        drawChip(120, 190, '#116e3c', '#000000', 1.2, -0.1);
        drawChip(120, 175, '#116e3c', '#000000', 1.2, 0.2);
        drawChip(160, 215, '#b8860b', '#000000', 1.1, -0.3);
    } else {
        ctx.save();
        ctx.globalAlpha = 0.5;
        drawChip(120, 150, '#9e1414', '#000', 1.2, -0.5);
        drawChip(120, 170, '#9e1414', '#000', 1.2, -0.2);
        ctx.globalAlpha = 1;
        drawChip(120, 190, '#9e1414', '#000', 1.2, 0);
        ctx.restore();
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = isWin ? '#2ecc71' : '#e74c3c';
    ctx.font = 'bold 50px SpaceMono';
    ctx.fillText(outcomeLabel, width - 60, 140);
    
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '22px Roboto';
    ctx.fillText('NOWE SALDO KIESZENI:', width - 60, 190);
    
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 36px SpaceMono';
    ctx.fillText(`${newBalance.toLocaleString()} ZŁ`, width - 60, 230);

    return canvas.toBuffer('image/png');
}

export interface ArrestData {
    targetName: string;
    targetNick: string;
    reason: string;
    time: string;
    citizenNumber: string;
    officerName: string;
    date: string;
}

export async function generateArrestCard(data: ArrestData): Promise<Buffer> {
    const width = 600;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Tło dokumentu więziennego
    ctx.fillStyle = '#1c1f26';
    ctx.fillRect(0, 0, width, height);

    // Drobny szum/texture
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (let i = 0; i < width; i += 4) {
        for (let j = 0; j < height; j += 4) {
            if (Math.random() > 0.5) ctx.fillRect(i, j, 4, 4);
        }
    }

    // Paski góra/dół (Ostrzegawcze)
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(0, 0, width, 40);
    ctx.fillRect(0, height - 40, width, 40);
    
    ctx.fillStyle = '#111';
    for (let i = 0; i < width + 100; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i - 40, 40);
        ctx.moveTo(i + 20, 0); ctx.lineTo(i - 20, 40);
        ctx.stroke();
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px Roboto';
    ctx.textAlign = 'center';
    ctx.fillText('NAKAZ OSADZENIA', width / 2, 90);

    const contentX = 50;
    let currentY = 160;

    const drawSection = (label: string, value: string) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#7f8c8d';
        ctx.font = 'bold 12px Roboto';
        ctx.fillText(label.toUpperCase(), contentX, currentY);
        
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '22px RobotoBold';
        ctx.fillText(value.toUpperCase(), contentX, currentY + 30);
        currentY += 75;
    };

    drawSection('OSADZONY', `${data.targetName} (@${data.targetNick})`);
    drawSection('NUMER CYWILNY', data.citizenNumber);
    drawSection('WYMIAR KARY (CZAS)', data.time);
    
    // Powód
    ctx.fillStyle = '#7f8c8d';
    ctx.font = 'bold 12px Roboto';
    ctx.fillText('ZASĄDZONY WYROK (POWÓD)', contentX, currentY);
    ctx.fillStyle = '#e74c3c';
    ctx.font = '18px Roboto';
    
    const words = data.reason.split(' ');
    let line = '';
    let reasonY = currentY + 30;
    for (const word of words) {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > width - 100) {
            ctx.fillText(line, contentX, reasonY);
            line = word + ' ';
            reasonY += 24;
        } else {
            line = test;
        }
    }
    ctx.fillText(line, contentX, reasonY);
    currentY = reasonY + 70;

    ctx.fillStyle = '#7f8c8d';
    ctx.font = 'bold 12px Roboto';
    ctx.fillText('FUNKCJONARIUSZ:', contentX, currentY);
    ctx.fillStyle = '#bdc3c7';
    ctx.font = '16px RobotoBold';
    ctx.fillText(data.officerName.toUpperCase(), contentX, currentY + 25);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#7f8c8d';
    ctx.font = 'bold 12px Roboto';
    ctx.fillText('DATA ARESZTU:', width - contentX, currentY);
    ctx.fillStyle = '#bdc3c7';
    ctx.font = '16px RobotoBold';
    ctx.fillText(data.date, width - contentX, currentY + 25);

    // Proceduralny stempel w tle (ZAMKNIĘTY)
    ctx.save();
    ctx.translate(width / 2 + 50, height / 2 + 100);
    ctx.rotate(-0.35);
    ctx.strokeStyle = 'rgba(231, 76, 60, 0.4)';
    ctx.lineWidth = 10;
    ctx.strokeRect(-200, -60, 400, 120);
    ctx.fillStyle = 'rgba(231, 76, 60, 0.4)';
    ctx.font = 'bold 80px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ARESZT', 0, 0);
    ctx.restore();

    return canvas.toBuffer('image/png');
}

export interface KartotekaData {
    targetName: string;
    targetNick: string;
    bans: number;
    arrests: number;
    fines: number;
}

export async function generateKartotekaCard(data: KartotekaData): Promise<Buffer> {
    const width = 800;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Tło kartoteki (teczka FBI manila folder)
    ctx.fillStyle = '#e4c590';
    ctx.fillRect(0, 0, width, height);
    
    // Efekt zagięcia teczki po lewej
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, 0, 50, height);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath(); ctx.moveTo(50, 0); ctx.lineTo(50, height); ctx.stroke();

    // Kartka z danymi (przypięta do teczki)
    ctx.fillStyle = '#fdfdfd';
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;
    ctx.fillRect(80, 40, width - 120, height - 80);
    ctx.shadowColor = 'transparent';

    // Spinacz (clip) na górze kartki
    ctx.fillStyle = '#bdc3c7';
    ctx.fillRect(width / 2 - 40, 20, 80, 30);
    ctx.strokeStyle = '#7f8c8d';
    ctx.lineWidth = 2;
    ctx.strokeRect(width / 2 - 40, 20, 80, 30);

    // Treść na kartce
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 36px SpaceMono';
    ctx.textAlign = 'center';
    ctx.fillText('KARTOTEKA KRYMINALNA', width / 2, 100);
    
    ctx.strokeStyle = '#bdc3c7';
    ctx.beginPath(); ctx.moveTo(width / 2 - 200, 115); ctx.lineTo(width / 2 + 200, 115); ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#7f8c8d';
    ctx.font = 'bold 16px Roboto';
    ctx.fillText('DANE OSOBOWE:', 120, 170);
    ctx.fillStyle = '#2c3e50';
    ctx.font = '26px RobotoBold';
    ctx.fillText(`${data.targetName} (@${data.targetNick})`, 120, 205);

    ctx.fillStyle = '#7f8c8d';
    ctx.font = 'bold 16px Roboto';
    ctx.fillText('REJESTR WYKROCZEŃ (HISTORYCZNY):', 120, 270);

    // Kary - 3 sekcje
    const drawsCount = (label: string, count: number, startX: number, color: string) => {
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(startX, 300, 180, 80);
        ctx.fillStyle = color;
        ctx.font = 'bold 44px SpaceMono';
        ctx.textAlign = 'center';
        ctx.fillText(count.toString(), startX + 90, 345);
        ctx.fillStyle = '#34495e';
        ctx.font = 'bold 14px Roboto';
        ctx.fillText(label, startX + 90, 370);
        ctx.textAlign = 'left';
    };

    drawsCount('BANY / KICKI', data.bans, 120, '#e74c3c');
    drawsCount('ARESZTOWANIA', data.arrests, 320, '#e67e22');
    drawsCount('MANDATY', data.fines, 520, '#f1c40f');

    // Pieczęć TOP SECRET
    ctx.save();
    ctx.translate(width - 150, 120);
    ctx.rotate(0.2);
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 5;
    ctx.strokeRect(-90, -30, 180, 60);
    ctx.fillStyle = '#c0392b';
    ctx.font = 'bold 32px SpaceMono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CONFIDENTIAL', 0, 0);
    ctx.restore();

    return canvas.toBuffer('image/png');
}

export interface VehicleCardData {
    ownerName: string;
    brand: string;
    model: string;
    plate: string;
    issuedAt: string;
    carImageUrl: string;
}

export async function generateVehicleCard(data: VehicleCardData): Promise<Buffer> {
    const width = 850;
    const height = 540;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. TŁO - Nowoczesny Dowód Rejestracyjny (Bogata tekstura)
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#fef9c3'); // Jasny żółty
    bgGrad.addColorStop(0.5, '#fefce8');
    bgGrad.addColorStop(1, '#fde68a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. PROCEDURALNY GILOSZ (Bezpieczeństwo)
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 53, 15, 0.05)';
    ctx.lineWidth = 0.5;
    for (let i = -200; i < width + 200; i += 20) {
        ctx.beginPath();
        for (let j = 0; j < height; j += 5) {
            const x = i + Math.sin(j * 0.02) * 30 + Math.cos(i * 0.01) * 20;
            ctx.lineTo(x, j);
        }
        ctx.stroke();
    }
    ctx.restore();

    // 3. NAGŁÓWEK
    ctx.fillStyle = '#451a03';
    ctx.font = 'bold 36px Roboto';
    ctx.textAlign = 'center';
    ctx.fillText('DOWÓD REJESTRACYJNY', width / 2, 65);
    
    ctx.font = '14px RobotoBold';
    ctx.fillStyle = '#92400e';
    ctx.fillText('RZECZPOSPOLITA POLSKA • BIELISKO', width / 2, 95);

    // 4. TABLICA REJESTRACYJNA (3D LOOK)
    const plateX = 40;
    const plateY = 130;
    const plateW = 340;
    const plateH = 75;

    // Cień tablicy
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(plateX, plateY, plateW, plateH, 8);
    ctx.fill();
    ctx.restore();

    // Pasek unijny (PL)
    ctx.fillStyle = '#003399';
    ctx.beginPath();
    ctx.roundRect(plateX, plateY, 45, plateH, [8, 0, 0, 8]);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Roboto';
    ctx.fillText('PL', plateX + 22, plateY + plateH - 12);
    // Gwiazdki
    for (let i = 0; i < 12; i++) {
        const ang = (i * Math.PI * 2) / 12;
        ctx.fillRect(plateX + 22 + Math.cos(ang) * 9, plateY + 25 + Math.sin(ang) * 9, 2, 2);
    }

    // Numer na tablicy (Wygląd tłoczenia)
    ctx.fillStyle = '#111';
    ctx.font = 'bold 48px SpaceMono';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255,255,255,0.5)';
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillText(data.plate.toUpperCase(), plateX + (plateW + 45) / 2, plateY + 55);
    ctx.shadowColor = 'transparent';

    // 5. ZDJĘCIE AUTA (Główna ekspozycja)
    const imgX = 40;
    const imgY = 230;
    const imgW = 400;
    const imgH = 270;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 15);
    ctx.clip();
    
    try {
        const carImg = await loadImage(data.carImageUrl);
        ctx.drawImage(carImg, imgX, imgY, imgW, imgH);
    } catch (e) {
        ctx.fillStyle = '#d1d5db';
        ctx.fillRect(imgX, imgY, imgW, imgH);
    }
    ctx.restore();

    // 6. DANE POJAZDU (Prawa kolumna)
    const infoX = 480;
    let infoY = 160;

    const drawInfoField = (label: string, value: string, icon: string) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#92400e';
        ctx.font = '11px RobotoBold';
        ctx.fillText(`${icon} ${label.toUpperCase()}`, infoX, infoY);
        
        ctx.fillStyle = '#451a03';
        ctx.font = '24px RobotoBold';
        ctx.fillText(value.toUpperCase(), infoX, infoY + 32);
        
        ctx.strokeStyle = 'rgba(146, 64, 14, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(infoX, infoY + 50);
        ctx.lineTo(width - 40, infoY + 50);
        ctx.stroke();
        
        infoY += 85;
    };

    drawInfoField('Właściciel pojazdu (A)', data.ownerName, '👤');
    drawInfoField('Marka i Model (D.1/D.3)', `${data.brand} ${data.model}`, '🚘');
    drawInfoField('Data Pierwszej Rejestracji (B)', data.issuedAt, '📅');

    // 7. HOLOGRAM I PIECZĘĆ
    ctx.save();
    ctx.translate(width - 120, height - 120);
    ctx.rotate(-0.1);
    ctx.globalAlpha = 0.6;
    
    // Zewnętrzny okrąg stempla
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = '#991b1b';
    ctx.font = 'bold 12px Roboto';
    ctx.textAlign = 'center';
    ctx.fillText('URZĄD KOMUNIKACJI', 0, -45);
    ctx.fillText('BIELISKO RP', 0, 50);
    
    ctx.font = 'bold 40px Roboto';
    ctx.fillText('RP', 0, 15);
    ctx.restore();

    // 8. MRZ (Dół karty)
    const mrzY = height - 60;
    ctx.fillStyle = 'rgba(69, 26, 3, 0.05)';
    ctx.fillRect(40, mrzY, width - 80, 45);
    
    ctx.fillStyle = '#78350f';
    ctx.font = '16px SpaceMono';
    ctx.textAlign = 'center';
    ctx.fillText(`P<POL${data.plate.replace(' ', '<')}<<<<<<<<<<<<<<<<<<`, width / 2, mrzY + 30);

    return canvas.toBuffer('image/png');
}

export async function generateWantedPoster(nick: string, reason: string, avatarUrl: string): Promise<Buffer> {
    const width = 600;
    const height = 850;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. TŁO - Stary, pożółkły papier
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
    bgGrad.addColorStop(0, '#f3e5ab'); // Jasny pergamin
    bgGrad.addColorStop(1, '#c2b280'); // Ciemniejszy brzeg
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Tekstura papieru (szum i plamy)
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    for (let i = 0; i < 2000; i++) {
        ctx.beginPath();
        const x = Math.random() * width;
        const y = Math.random() * height;
        const r = Math.random() * 2 + 1;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Ramka
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 15;
    ctx.strokeRect(20, 20, width - 40, height - 40);
    ctx.lineWidth = 2;
    ctx.strokeRect(35, 35, width - 70, height - 70);

    // 2. NAGŁÓWEK - WANTED
    ctx.fillStyle = '#451a03';
    ctx.font = 'bold 110px RobotoBold';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.fillText('WANTED', width / 2, 160);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 3. OBRAZ POSZUKIWANEGO (Awatara)
    const imgX = 100;
    const imgY = 200;
    const imgW = 400;
    const imgH = 400;

    // Tło pod zdjęcie
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(imgX - 10, imgY - 10, imgW + 20, imgH + 20);
    
    if (avatarUrl) {
        try {
            const response = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
            const avatar = await loadImage(Buffer.from(response.data));
            
            // Czarno-biały filtr dla klimatu retro
            const tempCanvas = createCanvas(imgW, imgH);
            const tCtx = tempCanvas.getContext('2d');
            tCtx.drawImage(avatar, 0, 0, imgW, imgH);
            
            const imgData = tCtx.getImageData(0, 0, imgW, imgH);
            for (let i = 0; i < imgData.data.length; i += 4) {
                const avg = (imgData.data[i] + imgData.data[i + 1] + imgData.data[i + 2]) / 3;
                imgData.data[i] = avg;
                imgData.data[i + 1] = avg * 0.9; // Lekka sepia
                imgData.data[i + 2] = avg * 0.8;
            }
            tCtx.putImageData(imgData, 0, 0);
            
            ctx.drawImage(tempCanvas, imgX, imgY, imgW, imgH);
        } catch (e) {
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(imgX, imgY, imgW, imgH);
            ctx.fillStyle = '#ffffff';
            ctx.font = '40px Roboto';
            ctx.fillText('BRAK FOTO', width / 2, imgY + imgH / 2);
        }
    }

    // 4. DANE - NICK I POWÓD
    ctx.fillStyle = '#451a03';
    ctx.font = 'bold 48px RobotoBold';
    ctx.fillText(nick.toUpperCase(), width / 2, 670);
    
    ctx.font = 'italic 24px Roboto';
    const words = reason.split(' ');
    let line = '';
    let currentY = 730;
    ctx.fillText('POWÓD POSZUKIWAŃ:', width / 2, 715);
    
    ctx.font = 'bold 28px Roboto';
    for (const word of words) {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > width - 120) {
            ctx.fillText(line, width / 2, currentY);
            line = word + ' ';
            currentY += 35;
        } else {
            line = test;
        }
    }
    ctx.fillText(line, width / 2, currentY);

    // 5. STEMPEL "Bielisko Police"
    ctx.save();
    ctx.translate(width - 120, height - 120);
    ctx.rotate(-0.2);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 4;
    ctx.strokeRect(-90, -35, 180, 70);
    ctx.fillStyle = '#991b1b';
    ctx.font = 'bold 20px Roboto';
    ctx.fillText('BIELISKO', 0, -5);
    ctx.fillText('POLICE', 0, 20);
    ctx.restore();

    return canvas.toBuffer('image/png');
}
