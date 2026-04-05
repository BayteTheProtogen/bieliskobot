import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { join } from 'path';

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
    const primaryColor = isWarning ? '#f1c40f' : '#e74c3c'; // Yellow or Red
    const secondaryColor = isWarning ? '#f39c12' : '#c0392b';

    // Background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    // Decorative Borders
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 20;
    ctx.strokeRect(0, 0, width, height);

    // Header
    const headerHeight = 120;
    const grad = ctx.createLinearGradient(0, 0, width, headerHeight);
    grad.addColorStop(0, primaryColor);
    grad.addColorStop(1, secondaryColor);
    ctx.fillStyle = grad;
    ctx.fillRect(10, 10, width - 20, headerHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px Roboto';
    ctx.textAlign = 'center';
    ctx.fillText(isWarning ? 'POUCZENIE' : 'MANDAT KARNY', width / 2, 70);
    
    ctx.font = '20px Roboto';
    ctx.fillText('RP BIELISKO - SŁUŻBY PORZĄDKOWE', width / 2, 105);

    // Content Area
    const contentX = 50;
    let currentY = 200;

    const drawLabelValue = (label: string, value: string) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#7f8c8d';
        ctx.font = 'bold 16px Roboto';
        ctx.fillText(label.toUpperCase(), contentX, currentY);
        
        ctx.fillStyle = '#2c3e50';
        ctx.font = '24px RobotoBold';
        ctx.fillText(value, contentX, currentY + 35);
        currentY += 80;
    };

    drawLabelValue('Obywatel (Ukarany)', `${data.targetName} (@${data.targetNick})`);
    drawLabelValue('Numer Dowodu', data.citizenNumber);
    
    // Reason with wrapping
    ctx.fillStyle = '#7f8c8d';
    ctx.font = 'bold 16px Roboto';
    ctx.fillText('POWÓD WYSTAWIENIA', contentX, currentY);
    ctx.fillStyle = '#2c3e50';
    ctx.font = '20px Roboto';
    
    const words = data.reason.split(' ');
    let line = '';
    const maxWidth = width - 100;
    let reasonY = currentY + 30;
    
    for (const word of words) {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line !== '') {
            ctx.fillText(line, contentX, reasonY);
            line = word + ' ';
            reasonY += 25;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, contentX, reasonY);
    currentY = reasonY + 60;

    // Line separator
    ctx.strokeStyle = '#dcdde1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(contentX, currentY - 30);
    ctx.lineTo(width - contentX, currentY - 30);
    ctx.stroke();

    drawLabelValue('Kwota Grzywny', isWarning ? '0 ZŁ (POUCZENIE)' : `${data.amount.toLocaleString()} ZŁ`);
    drawLabelValue('Funkcjonariusz', data.officerName);
    drawLabelValue('Data i Godzina', data.date);

    // Footer / Stamp
    ctx.save();
    ctx.translate(width - 150, height - 150);
    ctx.rotate(-Math.PI / 12);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(-100, -40, 200, 80);
    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 20px Roboto';
    ctx.textAlign = 'center';
    ctx.fillText('ZATWIERDZONO', 0, -5);
    ctx.fillText('SYSTEM RP', 0, 20);
    ctx.restore();

    // Security Pattern (Bottom)
    ctx.fillStyle = '#bdc3c7';
    ctx.font = '10px SpaceMono';
    ctx.textAlign = 'center';
    ctx.fillText(`ID_FINE_${Date.now()}_${data.citizenNumber}`, width / 2, height - 30);

    return canvas.toBuffer('image/png');
}
