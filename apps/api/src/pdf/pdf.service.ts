import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PdfPageOptions {
  landscape?: boolean;
  marginTopMm?: number;
  marginBottomMm?: number;
  headerHtml?: string;
  footerHtml?: string;
}

const mmToIn = (mm: number) => (mm / 25.4).toFixed(3);

/**
 * Gotenberg client. The container has been in docker-compose since the
 * scaffold but nothing called it — this is the first use, so the helper lives
 * here as a general service rather than inside the RTMS module.
 *
 * Chromium route only (`/forms/chromium/convert/html`): the reports are HTML
 * we generate ourselves, so there is no office-document conversion to do.
 */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private readonly config: ConfigService) {}

  private baseUrl() {
    return this.config.get('GOTENBERG_URL', 'http://localhost:3001').replace(/\/$/, '');
  }

  async fromHtml(html: string, opts: PdfPageOptions = {}): Promise<Buffer> {
    const form = new FormData();
    // Gotenberg requires the entry file to be named index.html.
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    if (opts.landscape) form.append('landscape', 'true');
    form.append('marginTop', mmToIn(opts.marginTopMm ?? 12));
    form.append('marginBottom', mmToIn(opts.marginBottomMm ?? 12));
    form.append('marginLeft', mmToIn(10));
    form.append('marginRight', mmToIn(10));
    form.append('printBackground', 'true');
    if (opts.headerHtml) {
      form.append('files', new Blob([opts.headerHtml], { type: 'text/html' }), 'header.html');
    }
    if (opts.footerHtml) {
      form.append('files', new Blob([opts.footerHtml], { type: 'text/html' }), 'footer.html');
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}/forms/chromium/convert/html`, {
        method: 'POST',
        body: form as any,
      });
    } catch (e: any) {
      this.logger.error(`Gotenberg unreachable at ${this.baseUrl()}: ${e.message}`);
      throw new ServiceUnavailableException(
        'PDF service is unavailable — is the gotenberg container running?',
      );
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Gotenberg returned ${res.status}: ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException(`PDF generation failed (HTTP ${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /** Merge already-rendered PDFs into the single audit pack file. */
  async merge(pdfs: { filename: string; buffer: Buffer }[]): Promise<Buffer> {
    if (pdfs.length === 1) return pdfs[0].buffer;
    const form = new FormData();
    // Gotenberg merges in lexicographic filename order, so callers get the
    // order they asked for only if the names sort that way — hence the
    // NN_ prefixes applied by the audit pack builder.
    for (const p of pdfs) {
      form.append('files', new Blob([new Uint8Array(p.buffer)], { type: 'application/pdf' }), p.filename);
    }
    const res = await fetch(`${this.baseUrl()}/forms/pdfengines/merge`, {
      method: 'POST',
      body: form as any,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Gotenberg merge returned ${res.status}: ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException(`PDF merge failed (HTTP ${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async health() {
    try {
      const res = await fetch(`${this.baseUrl()}/health`);
      return { ok: res.ok, url: this.baseUrl() };
    } catch {
      return { ok: false, url: this.baseUrl() };
    }
  }
}
