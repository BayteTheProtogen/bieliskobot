import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function saveImage(buffer: Buffer, folder: string = 'misc'): Promise<string> {
    const folderPath = path.join(UPLOADS_DIR, folder);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    const filename = `${uuidv4()}.png`;
    const filePath = path.join(folderPath, filename);
    
    await fs.promises.writeFile(filePath, buffer);
    return filename;
}

export async function deleteImage(filename: string, folder: string = 'misc'): Promise<void> {
    const filePath = path.join(UPLOADS_DIR, folder, filename);
    if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
    }
}

export function getImageUrl(filename: string, folder: string = 'misc'): string {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    return `${baseUrl}/uploads/${folder}/${filename}`;
}

// Kompatybilność wsteczna z rejestracja.ts
export async function saveVehicleImage(buffer: Buffer): Promise<string> {
    return saveImage(buffer, 'vehicles');
}

export function getVehicleImagePath(filename: string): string {
    return path.join(UPLOADS_DIR, 'vehicles', filename);
}
