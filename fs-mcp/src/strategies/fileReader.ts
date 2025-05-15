import { promises as fs } from "fs";
import path from "path";
import { pdfToImg } from "pdftoimg-js";

// File Reading Strategy Interface
export interface FileReadingStrategy {
  canHandle(extension: string): boolean;
  read(uri: string): Promise<{ text?: any[], content?: any[] }>;
}

// Concrete Strategies
export class TextFileStrategy implements FileReadingStrategy {
  canHandle(extension: string): boolean {
    return extension === '.txt';
  }

  async read(uri: string) {
    const textBuffer = await fs.readFile(uri);
    return {
      content: [{
        type: 'text',
        text: textBuffer.toString('utf8')
      }]
    };
  }
}

export class ImageFileStrategy implements FileReadingStrategy {
  canHandle(extension: string): boolean {
    return (
      extension === '.png' ||
      extension === '.jpg'
    );
  }

  async read(uri: string) {
    let ext = path.extname(uri).replace(".", "").replace("jpg", "jpeg");
    const imageBuffer = await fs.readFile(uri);
    return  {
      content: [{
        type: 'image',
        mimeType: `image/${ext}`,
        data: imageBuffer.toString('base64')
      }]
    };
  }
}

export class PdfFileStrategy implements FileReadingStrategy {
  canHandle(extension: string): boolean {
    return extension === '.pdf';
  }

  async read(uri: string) {
    const content: Record<string, any>[] = [];
    const images = await pdfToImg(uri, {
      pages: "all",
      imgType: "png",
      scale: 1.5,
    });
    images.forEach((base64Str) => {
      const data = base64Str.replace("data:image/png;base64,", "");
      content.push({ type: 'image', mimeType: "image/png", data });
    })
    return {
      content
    };
  }
}

// Context class for managing strategies
export class FileReader {
  private strategies: FileReadingStrategy[] = [];

  constructor() {
    this.strategies = [
      new TextFileStrategy(),
      new ImageFileStrategy(),
      new PdfFileStrategy()
    ];
  }

  async readFile(uri: string) {
    const extension = path.extname(uri);
    const strategy = this.strategies.find(s => s.canHandle(extension));

    if (!strategy) {
      throw new Error(`No strategy found for file extension: ${extension}`);
    }

    return await strategy.read(uri);
  }
}