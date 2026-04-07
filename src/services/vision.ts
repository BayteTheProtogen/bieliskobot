import * as ort from 'onnxruntime-node';
import axios from 'axios';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';

const MODEL_URL = 'https://huggingface.co/flightsnotights/yolov8n_onnx/resolve/main/yolov8n.onnx';
const MODEL_PATH = path.join(process.cwd(), 'models', 'yolov8n.onnx');

let session: ort.InferenceSession | null = null;

export async function initVision() {
    if (session) return;
    
    if (!fs.existsSync(path.dirname(MODEL_PATH))) {
        fs.mkdirSync(path.dirname(MODEL_PATH), { recursive: true });
    }

    if (!fs.existsSync(MODEL_PATH)) {
        const response = await axios.get(MODEL_URL, { responseType: 'arraybuffer' });
        fs.writeFileSync(MODEL_PATH, Buffer.from(response.data));
    }

    session = await ort.InferenceSession.create(MODEL_PATH);
}

export interface DetectionResult {
    detected: boolean;
    confidence: number;
    label: string;
    box?: { x: number, y: number, w: number, h: number };
}

export async function detectVehicle(imageUrl: string): Promise<DetectionResult> {
    await initVision();
    if (!session) throw new Error('Vision session not initialized');

    // 1. Load Original and Resize for Model
    const originalImg = await loadImage(imageUrl);
    const size = 320; 
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(originalImg, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);

    // 2. Preprocess
    const float32Data = new Float32Array(3 * size * size);
    for (let i = 0; i < size * size; i++) {
        float32Data[i] = imageData.data[i * 4] / 255.0; 
        float32Data[i + size * size] = imageData.data[i * 4 + 1] / 255.0; 
        float32Data[i + 2 * size * size] = imageData.data[i * 4 + 2] / 255.0; 
    }

    const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, size, size]);

    // 3. Inference
    const outputs = await session.run({ images: inputTensor });
    const output = outputs['output0'] || outputs[Object.keys(outputs)[0]]; 
    
    // 4. Post-process
    const data = output.data as Float32Array;
    const shape = output.dims; // [1, 84, boxes]
    const numDetections = shape[2];

    const vehicleIndices = [2, 3, 5, 7];
    const labels = { 2: 'Auto', 3: 'Motocykl', 5: 'Autobus', 7: 'Ciężarówka' };
    
    let maxConf = 0;
    let bestLabel = 'Brak';
    let bestBox = { x: 0, y: 0, w: 0, h: 0 };
    
    for (let i = 0; i < numDetections; i++) {
        for (const idx of vehicleIndices) {
            const conf = data[(4 + idx) * numDetections + i];
            if (conf > maxConf) {
                maxConf = conf;
                bestLabel = (labels as any)[idx];
                // YOLOv8 output: [xc, yc, w, h] normalized to 320px
                bestBox = {
                    x: data[0 * numDetections + i],
                    y: data[1 * numDetections + i],
                    w: data[2 * numDetections + i],
                    h: data[3 * numDetections + i]
                };
            }
        }
    }

    return {
        detected: maxConf > 0.4,
        confidence: Math.round(maxConf * 100),
        label: bestLabel,
        box: maxConf > 0.4 ? bestBox : undefined
    };
}

export async function cropToVehicle(imageUrl: string, box: { x: number, y: number, w: number, h: number }): Promise<Buffer> {
    const img = await loadImage(imageUrl);
    const origW = img.width;
    const origH = img.height;

    // 1. Map center and size from model (320x320 stretched) to original pixels
    const cx = box.x * (origW / 320);
    const cy = box.y * (origH / 320);
    const bw = box.w * (origW / 320);
    const bh = box.h * (origH / 320);

    // 2. Add fixed 20% margin to the bounding box
    const margin = 0.20;
    let cw = bw * (1 + margin);
    let ch = bh * (1 + margin);

    // 3. Force Aspect Ratio 40:27 (approx 1.48) - matches generateVehicleCard
    const targetAR = 400 / 270;
    
    if (cw / ch > targetAR) {
        // Current box is wider than target AR, expand height to fit
        ch = cw / targetAR;
    } else {
        // Current box is taller than target AR, expand width to fit
        cw = ch * targetAR;
    }

    // 4. Calculate final crop rectangle (top-left)
    let x = cx - cw / 2;
    let y = cy - ch / 2;

    // 5. Clamp to bounds and adjust if necessary
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + cw > origW) {
        cw = origW - x;
        ch = cw / targetAR; // Maintain AR if we had to shrink width
    }
    if (y + ch > origH) {
        ch = origH - y;
        cw = ch * targetAR; // Maintain AR if we had to shrink height
    }

    // 6. Create canvas for the crop (actual pixels, no stretching)
    const canvas = createCanvas(Math.round(cw), Math.round(ch));
    const ctx = canvas.getContext('2d');
    
    // drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)
    // sx, sy, sw, sh: source rectangle
    // dx, dy, dw, dh: destination rectangle (same size = NO STRETCH)
    ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(cw), Math.round(ch), 0, 0, Math.round(cw), Math.round(ch));

    return canvas.toBuffer('image/png');
}
