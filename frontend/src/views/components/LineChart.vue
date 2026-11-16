<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 数据来自父组件调 /api/usage/daily 拿到的真实按日用量：
// [{date: 'MM-DD', translateCount, chars}, ...]。
// 没传数据时显示最近 7 天、全部为 0——不编造演示数字。
const props = defineProps({
  days: {
    type: Array,
    default: () => [],
  },
})

const chartRef = ref(null)
let chartInstance = null

const getLast7Days = () => {
  const dates = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    dates.push(`${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`)
  }
  return dates
}

const buildOption = () => {
  const hasData = Array.isArray(props.days) && props.days.length > 0
  return {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['翻译次数', '消耗字符数']
    },
    xAxis: {
      type: 'category',
      data: hasData ? props.days.map((d) => d.date) : getLast7Days()
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: '翻译次数',
        type: 'line',
        data: hasData ? props.days.map((d) => d.translateCount) : [0, 0, 0, 0, 0, 0, 0]
      },
      {
        name: '消耗字符数',
        type: 'line',
        data: hasData ? props.days.map((d) => d.chars) : [0, 0, 0, 0, 0, 0, 0]
      }
    ]
  }
}

const renderChart = () => {
  if (!chartInstance) return
  chartInstance.setOption(buildOption())
}

const initChart = () => {
  // 初始化图表
  chartInstance = echarts.init(chartRef.value)
  renderChart()
}

watch(() => props.days, renderChart, { deep: true })

onMounted(() => {
  initChart()
  window.addEventListener('resize', chartInstance.resize)
})

onUnmounted(() => {
  if (chartInstance) {
    window.removeEventListener('resize', chartInstance.resize)
    chartInstance.dispose()
  }
})
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  min-height: 400px; /* 设置最小高度，保证自适应 */
}
</style>
