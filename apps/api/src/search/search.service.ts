import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const INDEX = 'deals';

@Injectable()
export class SearchService implements OnModuleInit {
  private host: string;
  private apiKey: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.host = this.config.get('MEILI_HOST', 'http://localhost:7700');
    this.apiKey = this.config.get('MEILI_MASTER_KEY', 'meili_dev_master_key');
    try {
      await this.req('POST', `/indexes`, { uid: INDEX, primaryKey: 'id' });
      await this.req('PATCH', `/indexes/${INDEX}/settings`, {
        searchableAttributes: ['reference', 'make', 'model', 'clientName', 'registrationNo', 'vin', 'destinationCountry', 'destinationCity'],
        filterableAttributes: ['currentStatusId', 'currentLocationId', 'consultantId', 'destinationCountry'],
      });
    } catch {
      // index may already exist; settings are idempotent
    }
  }

  async indexDeal(deal: any) {
    const doc = {
      id: deal.id,
      reference: deal.reference,
      make: deal.make,
      model: deal.model,
      year: deal.year,
      clientName: deal.client?.fullName ?? '',
      registrationNo: deal.registrationNo ?? '',
      vin: deal.vin ?? '',
      destinationCountry: deal.destinationCountry ?? '',
      destinationCity: deal.destinationCity ?? '',
      currentStatusId: deal.currentStatusId,
      currentLocationId: deal.currentLocationId,
      consultantId: deal.consultantId,
      updatedAt: deal.updatedAt?.toISOString?.() ?? deal.updatedAt,
    };
    await this.req('POST', `/indexes/${INDEX}/documents`, [doc]);
  }

  async search(q: string) {
    return this.req('POST', `/indexes/${INDEX}/search`, { q, limit: 20 });
  }

  private async req(method: string, path: string, body?: unknown) {
    const res = await fetch(`${this.host}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }
}
