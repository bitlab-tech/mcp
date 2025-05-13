import { promises as fs } from "fs";
import path from "path";

// File Reading Strategy Interface
export interface FileReadingStrategy {
  canHandle(extension: string): boolean;
  read(uri: string): Promise<{ type: string; content: any }>;
}

// Concrete Strategies
export class TextFileStrategy implements FileReadingStrategy {
  canHandle(extension: string): boolean {
    return extension === '.txt';
  }

  async read(uri: string) {
    const textBuffer = await fs.readFile(uri);
    return {
      type: 'text',
      content: textBuffer.toString('utf8')
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
    return {
      type: 'image',
      content: {
        mimeType: `image/${ext}`,
        data: imageBuffer.toString('base64')
      }
    };
  }
}

// Context class for managing strategies
export class FileReader {
  private strategies: FileReadingStrategy[] = [];

  constructor() {
    this.strategies = [
      new TextFileStrategy(),
      new ImageFileStrategy()
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