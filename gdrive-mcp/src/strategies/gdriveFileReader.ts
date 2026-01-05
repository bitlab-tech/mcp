import { pdfToImg } from "pdftoimg-js";

// File system related types
export type FileContent = {
  type: string;
  text?: string;
  mimeType?: string;
  data?: string;
};

// File Reading Strategy Interface
export interface GDriveFileReadingStrategy {
  canHandle(extension: string): boolean;
  read(
    dataBuffer: Buffer<ArrayBufferLike>,
    mimeType: string
  ): Promise<{ content: FileContent[] }>;
}

// Concrete Strategies
export class TextFileStrategy implements GDriveFileReadingStrategy {
  canHandle(extension: string): boolean {
    const extensions = new Set([
      '.txt',
      '.md',
      '.json',
    ]);
    return extensions.has(extension);
  }

  async read(
    dataBuffer: Buffer<ArrayBufferLike>,
    mimeType: string
  ): Promise<{ content: FileContent[] }> {
    const text = dataBuffer.toString('utf-8');
    return { content: [{ type: 'text', text, mimeType }] };
  }
}

export class ImageFileStrategy implements GDriveFileReadingStrategy {
  canHandle(extension: string): boolean {
    return (
      extension === '.png' ||
      extension === '.jpg'
    );
  }

  async read(
    dataBuffer: Buffer<ArrayBufferLike>,
    mimeType: string
  ): Promise<{ content: FileContent[] }> {
    const base64Data = dataBuffer.toString('base64');
    return { content: [{ type: 'image', mimeType, data: base64Data }] };
  }
}

export class PdfFileStrategy implements GDriveFileReadingStrategy {
  canHandle(extension: string): boolean {
    return extension === '.pdf';
  }

  async read(
    dataBuffer: Buffer<ArrayBufferLike>,
    mimeType: string
  ): Promise<{ content: FileContent[] }> {
    const content: FileContent[] = [];
    try {
      const images = await pdfToImg(new Uint8Array(dataBuffer), {
        pages: "all",
        imgType: "png",
        scale: 1.5,
      });
      if (Array.isArray(images)) {
        images.forEach((base64Str) => {
          const data = base64Str.replace("data:image/png;base64,", "");
          content.push({ type: 'image', mimeType: "image/png", data });
        });
      }
      return { content };
    } catch (error) {
      throw new Error(`Failed to convert PDF to images: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Context class for managing strategies
export class GDriveFileReader {
  private strategies: GDriveFileReadingStrategy[] = [];

  constructor() {
    this.strategies = [
      new TextFileStrategy(),
      new ImageFileStrategy(),
      new PdfFileStrategy()
    ];
  }

  async readFile(
    mime: string | undefined,
    dataBuffer: Buffer<ArrayBufferLike>
  ): Promise<{ content: FileContent[] }> {
    if (!mime) {
      throw new Error("Mime type is undefined");
    }
    const extension = this.mimeToExtension(mime);
    const strategy = this.strategies.find(s => s.canHandle(extension));
    if (!strategy) {
      throw new Error(`No strategy found for file extension: ${extension}`);
    }
    return await strategy.read(dataBuffer, mime);
  }

  mimeToExtension(mime: string): string {
    const mimeMap: Record<string, string> = {
      'text/plain': '.txt',
      'application/json': '.json',
      'text/markdown': '.md',
      'application/pdf': '.pdf',
      'image/png': '.png',
      'image/jpeg': '.jpg',
    };
    return mimeMap[mime] || '';
  }
}