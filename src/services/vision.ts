import * as ort from 'onnxruntime-node';
import axios from 'axios';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';

const MODEL_URL = 'https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.onnx';
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
}

export async function detectVehicle(imageUrl: string): Promise<DetectionResult> {
    await initVision();
    if (!session) throw new Error('Vision session not initialized');

    // 1. Load and Resize Image
    const img = await loadImage(imageUrl);
    const canvas = createCanvas(640, 640);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 640, 640);
    const imageData = ctx.getImageData(0, 0, 640, 640);

    // 2. Preprocess: [1, 3, 640, 640]
    const float32Data = new Float32Array(3 * 640 * 640);
    for (let i = 0; i < 640 * 640; i++) {
        float32Data[i] = imageData.data[i * 4] / 255.0; // R
        float32Data[i + 640 * 640] = imageData.data[i * 4 + 1] / 255.0; // G
        float32Data[i + 2 * 640 * 640] = imageData.data[i * 4 + 2] / 255.0; // B
    }

    const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);

    // 3. Inference
    const outputs = await session.run({ images: inputTensor });
    const output = outputs['output0']; // Shape [1, 84, 8400]

    // 4. Post-process (simplified: find max confidence for car/truck/etc)
    // Indices: 2-car, 3-motorcycle, 5-bus, 7-truck
    const vehicleIndices = [2, 3, 5, 7];
    const labels = { 2: 'Auto', 3: 'Motocykl', 5: 'Autobus', 7: 'Ciężarówka' };
    
    let maxConf = 0;
    let bestLabel = 'Brak';
    
    const data = output.data as Float32Array;
    // output[0] has shape [84, 8400]
    // data is flattened [84 * 8400]
    
    for (let i = 0; i < 8400; i++) {
        for (const idx of vehicleIndices) {
            const conf = data[(4 + idx) * 8400 + i]; // 4 header values (x,y,w,h) + class index
            if (conf > maxConf) {
                maxConf = conf;
                bestLabel = (labels as any)[idx];
            }
        }
    }

    return {
        detected: maxConf > 0.4, // Threshold
        confidence: Math.round(maxConf * 100),
        label: bestLabel
    };
}
