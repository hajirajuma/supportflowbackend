import { Injectable } from '@nestjs/common';
import type { ChartData, ChartDataset } from '../types/dashboard-access.type';
import { ChartType } from '../enums/dashboard.enums';

export interface SeriesItem {
  period: string;
  value: number;
}

export interface CategoryItem {
  label: string;
  value: number;
}

@Injectable()
export class ChartService {
  line(series: SeriesItem[], label = 'Value'): ChartData {
    return this.fromSeries('line', series, label);
  }

  bar(series: SeriesItem[], label = 'Value'): ChartData {
    return this.fromSeries('bar', series, label);
  }

  area(series: SeriesItem[], label = 'Value'): ChartData {
    return this.fromSeries('area', series, label);
  }

  trend(series: SeriesItem[], label = 'Trend'): ChartData {
    return this.fromSeries('trend', series, label);
  }

  pie(items: CategoryItem[]): ChartData {
    return this.fromCategories('pie', items);
  }

  donut(items: CategoryItem[]): ChartData {
    return this.fromCategories('donut', items);
  }

  /**
   * Builds a full chart object from trend series + category distributions,
   * limited to the requested chart types (defaults to line + pie).
   */
  compose(
    trendSeries: SeriesItem[],
    categories: CategoryItem[],
    types: ChartType[] = [ChartType.LINE, ChartType.PIE],
    trendLabel = 'Value',
  ): ChartData[] {
    const charts: ChartData[] = [];
    if (types.includes(ChartType.LINE))
      charts.push(this.line(trendSeries, trendLabel));
    if (types.includes(ChartType.BAR))
      charts.push(this.bar(trendSeries, trendLabel));
    if (types.includes(ChartType.AREA))
      charts.push(this.area(trendSeries, trendLabel));
    if (types.includes(ChartType.TREND))
      charts.push(this.trend(trendSeries, trendLabel));
    if (types.includes(ChartType.PIE)) charts.push(this.pie(categories));
    if (types.includes(ChartType.DONUT)) charts.push(this.donut(categories));
    return charts;
  }

  private fromSeries(
    type: ChartData['type'],
    series: SeriesItem[],
    label: string,
  ): ChartData {
    const labels = series.map((s) => s.period);
    const dataset: ChartDataset = { label, data: series.map((s) => s.value) };
    return { type, labels, datasets: [dataset] };
  }

  private fromCategories(
    type: ChartData['type'],
    items: CategoryItem[],
  ): ChartData {
    return {
      type,
      labels: items.map((i) => i.label),
      datasets: [{ label: 'Count', data: items.map((i) => i.value) }],
    };
  }
}
