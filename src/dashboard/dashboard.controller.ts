import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Access } from './decorators/access.decorator';
import { DashboardAccessGuard } from './guards/dashboard-access.guard';
import type { DashboardAccess } from './types/dashboard-access.type';
import { DashboardService } from './services/dashboard.service';
import { AnalyticsService } from './services/analytics.service';
import { ReportService } from './services/report.service';
import { ExportService } from './services/export.service';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';
import { AnalyticsFilterDto } from './dto/analytics-filter.dto';
import { ChartType, ReportFormat } from './enums/dashboard.enums';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportSearchDto } from './dto/report-search.dto';
import { ExportReportDto } from './dto/export-report.dto';
import { PaginationDto } from './dto/pagination.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(DashboardAccessGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly analyticsService: AnalyticsService,
    private readonly reportService: ReportService,
    private readonly exportService: ExportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get role-aware dashboard summary' })
  getDashboard(
    @Access() access: DashboardAccess,
    @Query() query: DashboardFilterDto,
  ) {
    console.log("Access: ", access, " Query: ", query);
    return this.dashboardService.getDashboard(access, query);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get dashboard analytics' })
  getAnalytics(
    @Access() access: DashboardAccess,
    @Query() query: AnalyticsFilterDto,
  ) {
    return this.analyticsService.getAggregate(access, query);
  }

  @Get('charts')
  @ApiOperation({ summary: 'Get chart data for dashboard widgets' })
  getCharts(
    @Access() access: DashboardAccess,
    @Query() query: AnalyticsFilterDto,
  ) {
    return this.analyticsService.getCharts(access, query, [
      ChartType.LINE,
      ChartType.BAR,
      ChartType.PIE,
    ]);
  }

  @Get('reports')
  @ApiOperation({ summary: 'List saved reports' })
  listReports(
    @Access() access: DashboardAccess,
    @Query() query: PaginationDto,
  ) {
    return this.reportService.list(access, query);
  }

  @Post('reports')
  @ApiOperation({ summary: 'Create a saved report' })
  createReport(
    @Access() access: DashboardAccess,
    @Body() dto: CreateReportDto,
    @Req() request: Request,
  ) {
    return this.reportService.create(access, dto, request);
  }

  @Get('reports/search')
  @ApiOperation({ summary: 'Search saved reports and related entities' })
  searchReports(
    @Access() access: DashboardAccess,
    @Query() query: ReportSearchDto,
  ) {
    return this.reportService.search(
      access,
      query.q ?? '',
      query.category,
      query,
    );
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Get a saved report' })
  getReport(@Access() access: DashboardAccess, @Param('id') id: string) {
    return this.reportService.getOne(access, id);
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: 'Update a saved report' })
  updateReport(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
    @Req() request: Request,
  ) {
    return this.reportService.update(access, id, dto, request);
  }

  @Delete('reports/:id')
  @ApiOperation({ summary: 'Delete a saved report' })
  deleteReport(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.reportService.remove(access, id, request);
  }

  @Post('reports/:id/run')
  @ApiOperation({ summary: 'Run a saved report' })
  runReport(@Access() access: DashboardAccess, @Param('id') id: string) {
    return this.reportService.run(access, id);
  }

  @Post('reports/export')
  @ApiOperation({ summary: 'Export a dataset or report' })
  exportReport(
    @Access() access: DashboardAccess,
    @Body() dto: ExportReportDto,
    @Req() request: Request,
  ) {
    return this.exportService.export(access, dto, request);
  }

  @Post('reports/:id/export')
  @ApiOperation({ summary: 'Export an existing saved report' })
  exportSavedReport(
    @Access() access: DashboardAccess,
    @Param('id') id: string,
    @Body('format') format: 'CSV' | 'EXCEL' | 'PDF',
    @Req() request: Request,
  ) {
    return this.exportService.exportSavedReport(
      access,
      id,
      format as ReportFormat,
      request,
    );
  }
}
