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
        console.log('Downloading YOLOv8n model... 📥');
        const response = await axios.get(MODEL_URL, { responseType: 'arraybuffer' });
        fs.writeFileSync(MODEL_PATH, Buffer.from(response.data));
        console.log('Model downloaded! ✅');
    }

    session = await ort.InferenceSession.create(MODEL_PATH);
    console.log('YOLOv8 session initialized! 🧠');
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

    // Scale box from 320 to original dimensions
    const scale = origW / 320; // Assuming square model input mapping relative to width
    const scaleY = origH / 320;
    
    let cx = box.x * scale;
    let cy = box.y * scaleY;
    let cw = box.w * scale;
    let ch = box.h * scaleY;

    // Target Aspect Ratio 16:9
    const targetAR = 16 / 9;
    const margin = 0.25; // 25% margin

    // Add margin
    cw *= (1 + margin);
    ch *= (1 + margin);

    // If wider than target AR, expand height. If taller, expand width.
    if (cw / ch > targetAR) {
        ch = cw / targetAR;
    } else {
        cw = ch * targetAR;
    }

    // Calculate crop rectangle
    let x = cx - cw / 2;
    let y = cy - ch / 2;

    // Clamp to image bounds
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + cw > origW) cw = origW - x;
    if (y + ch > origH) ch = origH - y;

    // Create crop canvas
    const canvas = createCanvas(Math.round(cw), Math.round(ch));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, x, y, cw, ch, 0, 0, cw, ch);

    return canvas.toBuffer('image/png');
}
