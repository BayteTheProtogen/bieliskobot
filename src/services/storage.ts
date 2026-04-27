import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const VEHICLES_DIR = path.join(UPLOADS_DIR, 'vehicles');

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(VEHICLES_DIR)) fs.mkdirSync(VEHICLES_DIR, { recursive: true });

export async function saveVehicleImage(buffer: Buffer): Promise<string> {
    const filename = `${uuidv4()}.png`;
    const filePath = path.join(VEHICLES_DIR, filename);
    
    await fs.promises.writeFile(filePath, buffer);
    
    return filename;
}

export function getVehicleImagePath(filename: string): string {
    return path.join(VEHICLES_DIR, filename);
}

export function getImageUrl(filename: string): string {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    return `${baseUrl}/uploads/vehicles/${filename}`;
}
