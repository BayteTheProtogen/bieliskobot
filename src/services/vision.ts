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
}

export async function detectVehicle(imageUrl: string): Promise<DetectionResult> {
    await initVision();
    if (!session) throw new Error('Vision session not initialized');

    // 1. Load and Resize Image
    const img = await loadImage(imageUrl);
    const size = 320; // Model expects 320x320
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);

    // 2. Preprocess: [1, 3, 320, 320]
    const float32Data = new Float32Array(3 * size * size);
    for (let i = 0; i < size * size; i++) {
        float32Data[i] = imageData.data[i * 4] / 255.0; // R
        float32Data[i + size * size] = imageData.data[i * 4 + 1] / 255.0; // G
        float32Data[i + 2 * size * size] = imageData.data[i * 4 + 2] / 255.0; // B
    }

    const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, size, size]);

    // 3. Inference
    const outputs = await session.run({ images: inputTensor });
    const output = outputs['output0'] || outputs[Object.keys(outputs)[0]]; 
    
    // 4. Post-process
    const data = output.data as Float32Array;
    const shape = output.dims; // [1, 84, boxes]
    const numDetections = shape[2];
    const numClasses = shape[1];

    // Indices: 2-car, 3-motorcycle, 5-bus, 7-truck
    const vehicleIndices = [2, 3, 5, 7];
    const labels = { 2: 'Auto', 3: 'Motocykl', 5: 'Autobus', 7: 'Ciężarówka' };
    
    let maxConf = 0;
    let bestLabel = 'Brak';
    
    for (let i = 0; i < numDetections; i++) {
        for (const idx of vehicleIndices) {
            // Index calculation: (class_idx + 4) * numDetections + i
            const conf = data[(4 + idx) * numDetections + i];
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
