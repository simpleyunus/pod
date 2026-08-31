import { Module } from '@nestjs/common';
import { ClamAvService } from './clamav.service';

@Module({ providers: [ClamAvService], exports: [ClamAvService] })
export class ClamAvModule {}
