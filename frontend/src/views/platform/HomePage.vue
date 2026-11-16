<template>
  <el-container style="height: 100vh; padding: 20px;">
    <!-- 顶部部分 -->
    <el-header style="display: flex; align-items: stretch; gap: 20px; height: 250px;">
      <!-- 左侧轮播图 -->
      <el-carousel autoplay height="100%" class="carousel-container">
        <el-carousel-item v-for="(color, index) in colors" :key="index">
          <div class="carousel-item" :style="{ backgroundColor: color }"></div>
        </el-carousel-item>
      </el-carousel>

      <!-- 右侧信息展示区 -->
      <el-card class="info-card" :style="{ height: '100%' }">
        <div class="info-content">
          <template v-if="workspace">
            <h3>{{ workspace.name }}</h3>
            <p>本月翻译字符：<strong>{{ summary ? summary.translateChars : 0 }}</strong></p>
            <p>端口峰值：<strong>{{ summary ? summary.portPeak : 0 }} / {{ workspace.portQuota }}</strong></p>
            <p>员工：<strong>{{ staffCount }}</strong> 人</p>
          </template>
          <template v-else>
            <h3>尚未创建工作区</h3>
            <p>去左侧「团队」页创建一个工作区，</p>
            <p>再建员工、分配账号、看用量。</p>
          </template>
        </div>
      </el-card>
    </el-header>

    <!-- 内容主体部分 -->
    <el-main style="overflow: auto;">
      <el-card>
        <div class="title">数据统计</div>
        <LineChart :days="dailyDays" />
      </el-card>
    </el-main>
  </el-container>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import LineChart from '../components/LineChart.vue'
import {
  getWorkspaceContext,
  listWorkspaces,
  listStaff,
  usageSummary,
  usageDaily,
} from '@/api/workspace'

// 模拟轮播图色块数据
const colors = ref(['#4caf50', '#2196f3', '#ff9800'])

const workspace = ref(null)
const summary = ref(null)
const staffCount = ref(0)
const dailyDays = ref([])

onMounted(async () => {
  // 数据全部来自本地后端真实接口；未登录或未建工作区时显示提示，不编造数字。
  const ctxRes = await getWorkspaceContext().catch(() => null)
  if (!ctxRes || !ctxRes.status || !ctxRes.data || !ctxRes.data.hasAuthCode) return
  const wsRes = await listWorkspaces().catch(() => null)
  if (!wsRes || !wsRes.status || !wsRes.data || wsRes.data.length === 0) return
  const saved = localStorage.getItem('team.workspaceId')
  workspace.value =
    wsRes.data.find((ws) => ws.id === saved) ||
    wsRes.data.find((ws) => ws.id === ctxRes.data.workspaceId) ||
    wsRes.data[0]
  const wsId = workspace.value.id
  const [sumRes, staffRes, dailyRes] = await Promise.all([
    usageSummary(wsId).catch(() => null),
    listStaff(wsId).catch(() => null),
    usageDaily(wsId, 7).catch(() => null),
  ])
  if (sumRes && sumRes.status) summary.value = sumRes.data
  if (staffRes && staffRes.status) staffCount.value = (staffRes.data || []).length
  if (dailyRes && dailyRes.status) dailyDays.value = dailyRes.data || []
})
</script>

<style scoped>
.carousel-container {
  width: 70%;
}

.carousel-item {
  width: 100%;
  height: 100%;
}

.info-card {
  width: 30%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.info-content {
  text-align: center;
}

.title {
  font-size: 20px;
  margin-bottom: 10px;
}
</style>
