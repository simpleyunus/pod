import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  query(@Query('q') q: string) {
    if (!q?.trim()) return { hits: [], query: '' };
    return this.searchService.search(q);
  }
}
