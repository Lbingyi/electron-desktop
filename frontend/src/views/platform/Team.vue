<template>
  <el-container style="height: 100vh; padding: 20px;">
    <el-header style="height: auto; padding: 0 0 12px 0;">
      <div class="title">团队与用量</div>
      <div style="color: #666; font-size: 14px; margin-top: 4px;">
        <span v-if="context.staff">当前身份：{{ context.staff.displayName || context.staff.username }}（{{ roleLabel(context.staff.role) }}）</span>
        <span v-else-if="context.hasAuthCode">当前身份：老板（本机机器授权）</span>
        <span v-else>未登录机器授权，请先在登录页登录</span>
      </div>
    </el-header>

    <el-main style="overflow: auto; padding: 0;">
      <!-- 工作区 -->
      <el-card style="margin-bottom: 16px;">
        <div class="title">工作区</div>
        <el-row :gutter="12" style="margin-top: 10px;" align="middle">
          <el-col :span="10">
            <el-select v-model="currentWorkspaceId" placeholder="选择工作区" style="width: 100%;" @change="onWorkspaceChange">
              <el-option
                v-for="ws in workspaces"
                :key="ws.id"
                :label="ws.name"
                :value="ws.id"
              />
            </el-select>
          </el-col>
          <el-col :span="8">
            <el-input v-model="newWorkspaceName" placeholder="新工作区名称" />
          </el-col>
          <el-col :span="6">
            <el-button type="primary" :loading="creatingWorkspace" :disabled="!context.hasAuthCode" @click="doCreateWorkspace">创建工作区</el-button>
          </el-col>
        </el-row>
        <p v-if="currentWorkspace" style="color: #666; font-size: 14px; margin: 10px 0 0 0;">
          端口配额：{{ currentWorkspace.portQuota }} 个（骨架默认值，定价未定） ·
          每月翻译字符额度：{{ currentWorkspace.charsQuotaMonthly }} ·
          每月 AI 点数额度：{{ currentWorkspace.aiPointsQuotaMonthly }}
        </p>
        <p v-else style="color: #999; font-size: 14px; margin: 10px 0 0 0;">还没有工作区，先创建一个（需要本机机器授权）。</p>
      </el-card>

      <!-- 员工登录 / 我的身份 -->
      <el-card style="margin-bottom: 16px;">
        <div class="title">员工登录</div>
        <div v-if="context.staff" style="margin-top: 10px;">
          <el-tag type="success">{{ roleLabel(context.staff.role) }}</el-tag>
          <span style="margin-left: 10px;">{{ context.staff.displayName || context.staff.username }}（{{ context.staff.username }}）</span>
          <el-button style="margin-left: 12px;" @click="doStaffLogout">退出员工登录</el-button>
          <p style="color: #666; font-size: 14px;">员工登录有效期 24 小时；退出后机器授权不受影响。</p>
        </div>
        <el-form v-else :inline="true" style="margin-top: 10px;" @submit.prevent>
          <el-form-item label="用户名">
            <el-input v-model="loginForm.username" placeholder="员工用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="loginForm.password" type="password" placeholder="密码" @keyup.enter="doStaffLogin" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loginLoading" :disabled="!currentWorkspaceId" @click="doStaffLogin">登录</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 员工列表与新建员工 -->
      <el-card style="margin-bottom: 16px;">
        <div class="title">员工</div>
        <el-table :data="staffList" style="width: 100%; margin-top: 10px;" empty-text="暂无员工">
          <el-table-column prop="username" label="用户名" />
          <el-table-column prop="displayName" label="姓名" />
          <el-table-column label="角色">
            <template #default="scope">{{ roleLabel(scope.row.role) }}</template>
          </el-table-column>
          <el-table-column label="上次登录">
            <template #default="scope">{{ formatTime(scope.row.lastLoginAt) }}</template>
          </el-table-column>
        </el-table>
        <p v-if="isAgent" style="color: #666; font-size: 14px;">客服只能看到自己。</p>
        <el-form v-if="canManage" :inline="true" style="margin-top: 12px;" @submit.prevent>
          <el-form-item label="用户名">
            <el-input v-model="createForm.username" placeholder="新员工用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="createForm.password" type="password" placeholder="至少 6 位" />
          </el-form-item>
          <el-form-item label="姓名">
            <el-input v-model="createForm.displayName" placeholder="显示名（可选）" />
          </el-form-item>
          <el-form-item label="角色">
            <el-select v-model="createForm.role" style="width: 110px;">
              <el-option label="主管" value="supervisor" />
              <el-option label="客服" value="agent" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="creatingStaff" :disabled="!currentWorkspaceId" @click="doCreateStaff">新建员工</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 账号分配 -->
      <el-card style="margin-bottom: 16px;">
        <div class="title">账号分配</div>
        <el-form v-if="canManage" :inline="true" style="margin-top: 10px;" @submit.prevent>
          <el-form-item label="员工">
            <el-select v-model="assignForm.staffId" placeholder="选择员工" style="width: 160px;">
              <el-option
                v-for="s in staffList"
                :key="s.id"
                :label="s.displayName ? `${s.displayName}（${s.username}）` : s.username"
                :value="s.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="平台账号">
            <el-select v-model="assignForm.cardId" placeholder="选择会话" style="width: 220px;">
              <el-option
                v-for="c in allSessions"
                :key="c.card_id"
                :label="`${c.card_name || c.platform}（${c.platform}）`"
                :value="c.card_id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="assigning" :disabled="!currentWorkspaceId" @click="doAssign(false)">分配</el-button>
            <el-button :loading="assigning" :disabled="!currentWorkspaceId" @click="doAssign(true)">收回</el-button>
          </el-form-item>
        </el-form>
        <p v-else style="color: #666; font-size: 14px; margin-top: 10px;">只有老板或主管能分配账号。</p>
        <div v-if="context.staff" style="margin-top: 10px;">
          <span style="font-size: 14px;">我可见的账号（{{ myAccounts.scope === 'all' ? '主管：全部' : '客服：仅被分配的' }}）：</span>
          <el-tag
            v-for="cardId in myAccounts.cardIds"
            :key="cardId"
            style="margin: 4px;"
          >{{ sessionLabel(cardId) }}</el-tag>
          <span v-if="myAccounts.cardIds.length === 0" style="color: #999; font-size: 14px;">暂无</span>
        </div>
      </el-card>

      <!-- 用量 -->
      <el-card style="margin-bottom: 16px;">
        <div class="title">用量（本月）</div>
        <el-row :gutter="12" style="margin-top: 10px;">
          <el-col :span="6">
            <el-statistic title="翻译字符" :value="summary ? summary.translateChars : 0" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="翻译次数" :value="summary ? summary.translateCount : 0" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="端口峰值" :value="summary ? summary.portPeak : 0" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="AI 点数" :value="summary ? summary.aiPoints : 0" />
          </el-col>
        </el-row>
        <p style="color: #666; font-size: 14px;">
          客服只看到自己的用量；老板与主管看到工作区全部。
          <el-button link type="primary" :disabled="!currentWorkspaceId" @click="loadUsage">刷新</el-button>
        </p>
      </el-card>
    </el-main>
  </el-container>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import Notification from '@/utils/notification';
import { ipc } from '@/utils/ipcRenderer';
import {
  getWorkspaceContext,
  clearWorkspaceContext,
  createWorkspace,
  listWorkspaces,
  createStaff,
  staffLogin,
  listStaff,
  assignAccount,
  unassignAccount,
  myAccounts as fetchMyAccounts,
  usageSummary,
  roleLabel,
} from '@/api/workspace';

const context = reactive({ hasAuthCode: false, workspaceId: null, staff: null });
const workspaces = ref([]);
const currentWorkspaceId = ref('');
const newWorkspaceName = ref('');
const creatingWorkspace = ref(false);
const staffList = ref([]);
const loginForm = reactive({ username: '', password: '' });
const loginLoading = ref(false);
const createForm = reactive({ username: '', password: '', displayName: '', role: 'agent' });
const creatingStaff = ref(false);
const assignForm = reactive({ staffId: '', cardId: '' });
const assigning = ref(false);
const allSessions = ref([]);
const myAccounts = reactive({ scope: 'assigned', cardIds: [] });
const summary = ref(null);

const currentWorkspace = computed(() =>
  workspaces.value.find((ws) => ws.id === currentWorkspaceId.value) || null,
);
const isAgent = computed(() => context.staff && context.staff.role === 'agent');
const canManage = computed(
  () => context.hasAuthCode || (context.staff && context.staff.role === 'supervisor'),
);

function notify(res, okMsg) {
  if (res && res.status) {
    if (okMsg) Notification.message({ message: okMsg, type: 'success' });
    return true;
  }
  Notification.message({ message: (res && res.message) || '操作失败', type: 'error' });
  return false;
}

function formatTime(ts) {
  if (!ts) return '从未登录';
  const d = new Date(Number(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sessionLabel(cardId) {
  const found = allSessions.value.find((c) => c.card_id === cardId);
  return found ? `${found.card_name || found.platform}（${found.platform}）` : cardId;
}

async function loadContext() {
  const res = await getWorkspaceContext();
  if (res && res.status && res.data) {
    context.hasAuthCode = !!res.data.hasAuthCode;
    context.workspaceId = res.data.workspaceId;
    context.staff = res.data.staff;
  }
}

async function loadWorkspaces() {
  const res = await listWorkspaces();
  if (res && res.status) {
    workspaces.value = res.data || [];
    const saved = localStorage.getItem('team.workspaceId');
    if (saved && workspaces.value.some((ws) => ws.id === saved)) {
      currentWorkspaceId.value = saved;
    } else if (context.workspaceId && workspaces.value.some((ws) => ws.id === context.workspaceId)) {
      currentWorkspaceId.value = context.workspaceId;
    } else if (workspaces.value.length > 0) {
      currentWorkspaceId.value = workspaces.value[0].id;
    }
  }
}

async function loadStaff() {
  if (!currentWorkspaceId.value) {
    staffList.value = [];
    return;
  }
  const res = await listStaff(currentWorkspaceId.value);
  if (res && res.status) staffList.value = res.data || [];
}

async function loadSessions() {
  // 三个平台的会话都取来，供分配下拉框用（与 AsideCard 同一接口）。
  const platforms = ['Telegram', 'TelegramK', 'WhatsApp'];
  const all = [];
  for (const platform of platforms) {
    try {
      const res = await ipc.invoke('controller.window.getSessions', { platform });
      if (res && res.status && Array.isArray(res.data)) all.push(...res.data);
    } catch (err) {
      // 某平台取不到不影响其他平台
    }
  }
  allSessions.value = all;
}

async function loadMyAccounts() {
  if (!context.staff) {
    myAccounts.scope = 'assigned';
    myAccounts.cardIds = [];
    return;
  }
  const res = await fetchMyAccounts();
  if (res && res.status && res.data) {
    myAccounts.scope = res.data.scope;
    myAccounts.cardIds = res.data.cardIds || [];
  }
}

async function loadUsage() {
  if (!currentWorkspaceId.value) {
    summary.value = null;
    return;
  }
  const res = await usageSummary(currentWorkspaceId.value);
  if (res && res.status) summary.value = res.data;
}

async function loadWorkspaceData() {
  await Promise.all([loadStaff(), loadUsage(), loadMyAccounts()]);
}

async function onWorkspaceChange() {
  localStorage.setItem('team.workspaceId', currentWorkspaceId.value);
  await loadWorkspaceData();
}

async function doCreateWorkspace() {
  if (!newWorkspaceName.value.trim()) {
    Notification.message({ message: '工作区名称不能为空', type: 'warning' });
    return;
  }
  creatingWorkspace.value = true;
  const res = await createWorkspace(newWorkspaceName.value.trim());
  creatingWorkspace.value = false;
  if (notify(res, '工作区已创建')) {
    newWorkspaceName.value = '';
    await loadWorkspaces();
    await loadWorkspaceData();
  }
}

async function doStaffLogin() {
  if (!loginForm.username || !loginForm.password) {
    Notification.message({ message: '用户名和密码都要填', type: 'warning' });
    return;
  }
  loginLoading.value = true;
  const res = await staffLogin({
    workspaceId: currentWorkspaceId.value,
    username: loginForm.username,
    password: loginForm.password,
  });
  loginLoading.value = false;
  if (notify(res, '员工登录成功')) {
    loginForm.password = '';
    await loadContext();
    await loadWorkspaceData();
  }
}

async function doStaffLogout() {
  const res = await clearWorkspaceContext();
  if (notify(res, '已退出员工登录')) {
    await loadContext();
    await loadWorkspaceData();
  }
}

async function doCreateStaff() {
  if (!createForm.username || !createForm.password) {
    Notification.message({ message: '用户名和密码都要填', type: 'warning' });
    return;
  }
  creatingStaff.value = true;
  const res = await createStaff({
    workspaceId: currentWorkspaceId.value,
    username: createForm.username,
    password: createForm.password,
    displayName: createForm.displayName,
    role: createForm.role,
  });
  creatingStaff.value = false;
  if (notify(res, '员工已创建')) {
    createForm.username = '';
    createForm.password = '';
    createForm.displayName = '';
    await loadStaff();
  }
}

async function doAssign(unassign) {
  if (!assignForm.staffId || !assignForm.cardId) {
    Notification.message({ message: '先选员工和平台账号', type: 'warning' });
    return;
  }
  assigning.value = true;
  const args = {
    workspaceId: currentWorkspaceId.value,
    staffId: assignForm.staffId,
    cardId: assignForm.cardId,
  };
  const res = unassign ? await unassignAccount(args) : await assignAccount(args);
  assigning.value = false;
  if (notify(res, unassign ? '账号已收回' : '账号已分配')) {
    await loadMyAccounts();
  }
}

onMounted(async () => {
  await loadContext();
  await loadWorkspaces();
  await loadSessions();
  await loadWorkspaceData();
});
</script>

<style scoped>
.title {
  font-size: 20px;
  margin-bottom: 10px;
}
</style>
