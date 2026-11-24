import type { FontFamilyPreset, FontRegionConfig, FontRegionKey } from '@shared/types'

export const FONT_REGION_LABELS: Record<FontRegionKey, string> = {
  titlebar: '标题栏',
  sidebar: '功能区',
  projects: '项目列',
  dates: '日期列',
  tasks: '待办项',
  history: '历史遗留项',
  dialogs: '弹窗与提示'
}

export const FONT_PRESETS: { value: FontFamilyPreset; label: string; css: string }[] = [
  {
    value: 'system',
    label: '系统默认',
    css: '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif'
  },
  {
    value: 'yahei',
    label: '微软雅黑',
    css: '"Microsoft YaHei", "PingFang SC", sans-serif'
  },
  {
    value: 'dengxian',
    label: '等线',
    css: '"DengXian", "Microsoft YaHei", sans-serif'
  },
  {
    value: 'simsun',
    label: '宋体',
    css: '"SimSun", "Songti SC", "Microsoft YaHei", serif'
  },
  {
    value: 'simhei',
    label: '黑体',
    css: '"SimHei", "Heiti SC", "Microsoft YaHei", sans-serif'
  },
  {
    value: 'kaiti',
    label: '楷体',
    css: '"KaiTi", "Kaiti SC", "Microsoft YaHei", serif'
  },
  {
    value: 'consolas',
    label: 'Consolas（英文）',
    css: '"Consolas", "Cascadia Mono", "Microsoft YaHei", monospace'
  },
  {
    value: 'custom',
    label: '自定义字体',
    css: '"Microsoft YaHei", "PingFang SC", sans-serif'
  }
]

export function resolveFontFamily(config: FontRegionConfig): string {
  if (config.family === 'custom') {
    const custom = (config.customFamily ?? '').replace(/["\\]/g, '').trim()
    return custom
      ? `"${custom}", "Microsoft YaHei", "PingFang SC", sans-serif`
      : '"Microsoft YaHei", "PingFang SC", sans-serif'
  }
  return FONT_PRESETS.find((preset) => preset.value === config.family)?.css ?? FONT_PRESETS[0].css
}

export function fontLabel(config: FontRegionConfig): string {
  return FONT_PRESETS.find((preset) => preset.value === config.family)?.label ?? '系统默认'
}
