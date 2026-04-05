import { createCanvas, loadImage } from '@napi-rs/canvas';

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

    // Tło (delikatne pastelowe przejście przypominające dokument)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#e8f4f8');
    gradient.addColorStop(0.5, '#f5ebeb');
    gradient.addColorStop(1, '#e8f4f8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Ozdobnik na górze (biało-czerwony)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, 15);
    ctx.fillStyle = '#dc143c';   // karmazyn polskiej flagi
    ctx.fillRect(0, 15, width, 15);

    // Nagłówek dokumentu
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('RZECZPOSPOLITA POLSKA', 300, 70);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#555555';
    ctx.fillText('DOWÓD OSOBISTY / IDENTITY CARD', 300, 95);

    // Rysowanie awatara postaci
    try {
        const avatar = await loadImage(avatarUrl);
        const imgWidth = 220;
        const imgHeight = 220;
        const imgX = 40;
        const imgY = 120;
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(imgX, imgY, imgWidth, imgHeight, 15);
        ctx.clip();
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(imgX, imgY, imgWidth, imgHeight); // tło obrazka
        ctx.drawImage(avatar, imgX, imgY, imgWidth, imgHeight);
        ctx.restore();
        
        // Obramowanie
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(imgX, imgY, imgWidth, imgHeight, 15);
        ctx.stroke();

    } catch (e) {
        console.error('Error drawing avatar', e);
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(40, 120, 220, 220);
    }

    // Dynamiczne Pola Danych
    const startX = 300;
    const startY = 145;
    const lineHeight = 55;

    const drawField = (label: string, value: string, x: number, y: number) => {
        ctx.fillStyle = '#888888';
        ctx.font = '12px sans-serif';
        ctx.fillText(label.toUpperCase(), x, y);
        
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(value.toUpperCase(), x, y + 25);
    };

    drawField('Nazwisko / Surname', data.lastName, startX, startY);
    drawField('Imię (Imiona) / Name', data.firstName, startX, startY + lineHeight);
    drawField('Obywatelstwo / Nationality', data.citizenship, startX, startY + lineHeight * 2);
    
    drawField('Data urodzenia / Date of birth', data.dob, startX, startY + lineHeight * 3);
    drawField('Płeć / Sex', data.gender, startX + 280, startY + lineHeight * 3);
    
    // Numer obywatela
    drawField('Numer Obywatela / Citizen No.', data.citizenNumber, startX, startY + lineHeight * 4);

    // Strefa Maszynowa (MRZ - Machine Readable Zone)
    const mrzY = 440;
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(0, mrzY, width, height - mrzY);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 24px monospace';
    
    // Normalizowanie polskich liter i czyszczenie znaków dla MRZ
    const cleanStr = (str: string) => str.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^A-Z]/gi, '').toUpperCase();
    
    const sName = cleanStr(data.lastName);
    const fName = cleanStr(data.firstName);
    
    const mrz1 = `IDPOL${sName}<<${fName}`;
    const mrz1Pad = mrz1.padEnd(30, '<').substring(0, 30);
    
    // Szybka data urodzenia dla MRZ z usunięciem kropek
    const dobMrz = data.dob.replace(/\\./g, '');
    const mrz2 = `${data.citizenNumber}<0POL${dobMrz}${cleanStr(data.gender).substring(0,1)}<`;
    const mrz2Pad = mrz2.padEnd(30, '<').substring(0, 30);

    ctx.fillText(`${mrz1Pad}<<<<`, 40, mrzY + 45);
    ctx.fillText(`${mrz2Pad}<<<<`, 40, mrzY + 80);

    return canvas.toBuffer('image/png');
}
