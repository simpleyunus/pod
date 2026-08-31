import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';

@Injectable()
export class ClamAvService {
  constructor(private readonly config: ConfigService) {}

  scan(buffer: Buffer): Promise<'CLEAN' | 'INFECTED' | 'FAILED'> {
    return new Promise((resolve) => {
      const host = this.config.get('CLAMAV_HOST', 'localhost');
      const port = Number(this.config.get('CLAMAV_PORT', '3310'));
      const socket = new net.Socket();
      const chunks: Buffer[] = [];

      socket.setTimeout(15000);
      socket.on('timeout', () => { socket.destroy(); resolve('FAILED'); });
      socket.on('error', () => resolve('FAILED'));

      socket.connect(port, host, () => {
        socket.write('zINSTREAM\0');
        const chunkSize = 4096;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
          const chunk = buffer.slice(offset, offset + chunkSize);
          const sizeHeader = Buffer.alloc(4);
          sizeHeader.writeUInt32BE(chunk.length, 0);
          socket.write(sizeHeader);
          socket.write(chunk);
        }
        // terminate stream
        const end = Buffer.alloc(4);
        end.writeUInt32BE(0, 0);
        socket.write(end);
      });

      socket.on('data', (d) => chunks.push(d));
      socket.on('end', () => {
        const response = Buffer.concat(chunks).toString().trim();
        socket.destroy();
        if (response.includes('OK')) resolve('CLEAN');
        else if (response.includes('FOUND')) resolve('INFECTED');
        else resolve('FAILED');
      });
    });
  }
}
