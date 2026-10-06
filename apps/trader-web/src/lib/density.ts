export type ExperienceLevel = 'NEWCOMER' | 'INTERMEDIATE' | 'PROFESSIONAL';

export interface DensityConfig {
  cardPadding: string;
  textSize: string;
  showAdvancedMetrics: boolean;
  tablePadding: string;
  chartHeight: string;
  showPlainEnglishHelp: boolean;
}

export function getAppDensity(level: ExperienceLevel = 'INTERMEDIATE'): DensityConfig {
  switch (level) {
    case 'NEWCOMER':
      return {
        cardPadding: 'p-6 sm:p-8',
        textSize: 'text-base',
        showAdvancedMetrics: false,
        tablePadding: 'px-6 py-4',
        chartHeight: 'h-64',
        showPlainEnglishHelp: true,
      };
    case 'PROFESSIONAL':
      return {
        cardPadding: 'p-3 sm:p-4',
        textSize: 'text-xs',
        showAdvancedMetrics: true,
        tablePadding: 'px-3 py-2',
        chartHeight: 'h-96',
        showPlainEnglishHelp: false,
      };
    case 'INTERMEDIATE':
    default:
      return {
        cardPadding: 'p-5',
        textSize: 'text-sm',
        showAdvancedMetrics: true,
        tablePadding: 'px-5 py-3.5',
        chartHeight: 'h-80',
        showPlainEnglishHelp: false,
      };
  }
}
