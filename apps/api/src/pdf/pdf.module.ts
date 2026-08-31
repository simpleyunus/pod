import { Global, Module } from '@nestjs/common';
import { PdfService } from './pdf.service';

// Global: the audit pack lives in compliance, but invoices and other PDFs
// will want the same Gotenberg client later.
@Global()
@Module({ providers: [PdfService], exports: [PdfService] })
export class PdfModule {}
