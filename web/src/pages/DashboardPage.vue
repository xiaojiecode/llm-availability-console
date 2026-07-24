<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Activity, Download, Plus, RefreshCcw, RotateCw, ShieldCheck, Sparkles, Upload } from '@lucide/vue'
import ChannelDialog from '../components/ChannelDialog.vue'
import ChannelCards from '../components/ChannelCards.vue'
import DataImportDialog from '../components/DataImportDialog.vue'
import UserscriptStatus from '../components/UserscriptStatus.vue'
import MetricsChart from '../components/MetricsChart.vue'
import NetworkScene from '../components/NetworkScene.vue'
import OverviewStats from '../components/OverviewStats.vue'
import ProbeLogTable from '../components/ProbeLogTable.vue'
import ProxySettingsDialog from '../components/ProxySettingsDialog.vue'
import { useDashboard } from '../composables/useDashboard'
import { useDashboardMotion } from '../composables/useDashboardMotion'
import type { Channel, ChannelInput, ImportMode, SortField } from '../types'

const dashboard = useDashboard()
const dialogOpen = shallowRef(false)
const editingChannel = shallowRef<Channel | undefined>()
const busyId = shallowRef(0)
const channelView = shallowRef<'enabled' | 'all' | 'disabled'>('enabled')
const importDialogOpen = shallowRef(false)
const importBusy = shallowRef(false)
const mergeChannelGroups = shallowRef(true)
const proxyDialogOpen = shallowRef(false)
const proxySaving = shallowRef(false)
const shellRef = useTemplateRef<HTMLElement>('shell')

useDashboardMotion(shellRef)

const sortOptions: { field: SortField; label: string; defaultOrder: 'asc' | 'desc' }[] = [
  { field: 'comprehensive', label: '综合', defaultOrder: 'desc' },
  { field: 'current', label: '当前可用', defaultOrder: 'desc' },
  { field: 'latency', label: '延迟', defaultOrder: 'asc' },
]

const channelViewCounts = computed(() => ({
  enabled: dashboard.channels.value.filter((channel) => channel.enabled).length,
  disabled: dashboard.channels.value.filter((channel) => !channel.enabled).length,
}))

const visibleChannels = computed(() => {
  if (channelView.value === 'enabled') return dashboard.channels.value.filter((channel) => channel.enabled)
  if (channelView.value === 'disabled') return dashboard.channels.value.filter((channel) => !channel.enabled)
  return dashboard.channels.value
})

const healthPercentage = computed(() => {
  const total = dashboard.summary.value.enabledChannels
  if (!total) return 0
  return Math.round((dashboard.summary.value.healthyChannels / total) * 100)
})

function toggleSort(field: SortField, defaultOrder: 'asc' | 'desc') {
  dashboard.sortBy.value = field
  dashboard.sortOrder.value = defaultOrder
}

function openCreate() {
  editingChannel.value = undefined
  dialogOpen.value = true
}

function openEdit(channel: Channel) {
  editingChannel.value = channel
  dialogOpen.value = true
}

async function saveChannel(id: number, payload: ChannelInput) {
  try {
    await dashboard.saveChannel(id, payload)
    dialogOpen.value = false
    ElMessage.success(id ? '信道已更新' : '信道已创建')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  }
}

async function deleteChannel(channel: Channel) {
  try {
    await ElMessageBox.confirm(
      '删除后，该信道的历史探测记录也会一并删除。',
      '删除"' + channel.name + '"',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    await dashboard.deleteChannel(channel.id)
    ElMessage.success('信道已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '删除失败')
    }
  }
}

async function probeChannel(channel: Channel) {
  busyId.value = channel.id
  try {
    await dashboard.probeChannel(channel.id)
    ElMessage.success('探测完成')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '探测失败')
  } finally {
    busyId.value = 0
  }
}

async function toggleChannel(channel: Channel, enabled: boolean) {
  try {
    await dashboard.saveChannel(channel.id, {
      name: channel.name,
      provider: channel.provider,
      baseUrl: channel.baseUrl,
      apiKey: '',
      model: channel.model,
      enabled,
      note: channel.note,
      rateMultiplier: channel.rateMultiplier,
      proxyUrl: channel.proxyUrl,
      requestTemplate: { ...channel.requestTemplate },
    })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '状态更新失败')
  }
}

async function probeAll() {
  await dashboard.probeAll()
  ElMessage.success('全部探测已完成')
}

async function toggleAutoProbe(value: string | number | boolean) {
  try {
    await dashboard.setAutoProbe(Boolean(value))
    ElMessage.success(Boolean(value) ? '自动探测已开启' : '自动探测已关闭')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '自动探测状态更新失败')
  }
}

async function exportData() {
  try {
    const backup = await dashboard.exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `llm-channel-monitor-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    ElMessage.success('备份已导出')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败')
  }
}

async function importData(payload: unknown, mode: ImportMode) {
  importBusy.value = true
  try {
    const result = await dashboard.importBackup(payload, mode)
    importDialogOpen.value = false
    ElMessage.success(`已导入 ${result.channels} 个信道、${result.probes} 条记录`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入失败')
  } finally {
    importBusy.value = false
  }
}

async function saveGlobalProxy(value: string) {
  proxySaving.value = true
  try {
    await dashboard.setGlobalProxyUrl(value)
    proxyDialogOpen.value = false
    ElMessage.success(value ? '统一代理已保存' : '统一代理已关闭')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '代理设置保存失败')
  } finally {
    proxySaving.value = false
  }
}
</script>

<template>
  <div ref="shell" class="app-shell">
    <div class="command-zone">
      <NetworkScene
        :healthy-channels="dashboard.summary.value.healthyChannels"
        :total-channels="dashboard.summary.value.enabledChannels"
        :active="dashboard.autoProbeEnabled.value"
      />

      <header class="topbar">
        <div class="topbar__inner">
          <div class="brand">
            <span class="brand-mark"><Activity :size="20" /></span>
            <div>
              <h1>LLM 信道观测台</h1>
              <span>Channel Intelligence Console</span>
            </div>
          </div>
          <div class="header-actions">
            <UserscriptStatus
              :status="dashboard.userscriptStatus.value"
              @recheck="dashboard.checkUserscript"
            />
            <label class="auto-probe-control">
              <span class="live-dot" :class="{ 'live-dot--paused': !dashboard.autoProbeEnabled.value }" />
              <span>{{ dashboard.autoProbeEnabled.value ? '自动巡检' : '巡检暂停' }}</span>
              <el-switch
                :model-value="dashboard.autoProbeEnabled.value"
                :loading="dashboard.autoProbeSaving.value"
                aria-label="全局自动探测"
                @change="toggleAutoProbe"
              />
            </label>
            <el-tooltip content="刷新数据" placement="bottom">
              <el-button circle :loading="dashboard.loading.value" aria-label="刷新数据" @click="dashboard.loadBase">
                <RefreshCcw :size="16" />
              </el-button>
            </el-tooltip>
            <el-button
              :disabled="dashboard.batchProbing.value || !dashboard.channels.value.some((channel) => channel.enabled)"
              @click="probeAll"
            >
              <RotateCw :size="16" />
              {{ dashboard.batchProbing.value ? '探测中' : '全部探测' }}
            </el-button>
            <el-button @click="importDialogOpen = true">
              <Upload :size="16" />
              导入
            </el-button>
            <el-button @click="proxyDialogOpen = true">
              <ShieldCheck :size="16" />
              跨域代理
            </el-button>
            <el-button @click="exportData">
              <Download :size="16" />
              导出
            </el-button>
            <el-button type="primary" @click="openCreate">
              <Plus :size="16" />
              新增信道
            </el-button>
          </div>
        </div>
      </header>

      <section class="command-hero">
        <div class="command-copy">
          <span class="command-eyebrow"><Sparkles :size="14" /> LIVE MODEL NETWORK</span>
          <h2>实时信道态势</h2>
          <p>延迟、可用率与故障信号持续汇聚，让每一次模型调用都有清晰路径。</p>
          <div class="command-meta">
            <span><i class="meta-signal meta-signal--success" />{{ dashboard.summary.value.healthyChannels }} 条可用</span>
            <span><i class="meta-signal meta-signal--warning" />{{ dashboard.summary.value.enabledChannels - dashboard.summary.value.healthyChannels }} 条待关注</span>
            <span>页面打开时每 60 秒同步</span>
          </div>
        </div>
        <div class="health-readout" aria-label="当前信道健康度">
          <span>NETWORK HEALTH</span>
          <strong>{{ healthPercentage }}%</strong>
          <div class="health-track"><i :style="{ width: healthPercentage + '%' }" /></div>
          <small>{{ dashboard.summary.value.healthyChannels }} / {{ dashboard.summary.value.enabledChannels }} ONLINE</small>
        </div>
      </section>
    </div>

    <main class="content">
      <el-alert
        v-if="dashboard.errorMessage.value"
        :title="dashboard.errorMessage.value"
        type="error"
        show-icon
        closable
        @close="dashboard.errorMessage.value = ''"
      />

      <OverviewStats class="motion-reveal" :summary="dashboard.summary.value" />

      <section class="workspace-section motion-reveal">
        <div class="section-heading section-heading--controls">
          <div>
            <h2>所有信道延迟</h2>
            <span>24 小时 · 每个信道独立曲线 · 15 秒上限</span>
          </div>
        </div>
        <MetricsChart
          v-model:merge-channel-groups="mergeChannelGroups"
          :channels="dashboard.channels.value"
          :series-by-channel="dashboard.channelSeries.value"
        />
      </section>

      <section class="workspace-section workspace-section--plain motion-reveal">
        <div class="section-heading section-heading--channels">
          <div>
            <h2>信道状态</h2>
            <span>{{ visibleChannels.length }} / {{ dashboard.channels.value.length }} 个配置</span>
          </div>
          <div class="channel-controls">
            <div class="sort-bar">
              <span class="sort-label">排序</span>
              <el-button
                v-for="opt in sortOptions"
                :key="opt.field"
                :type="dashboard.sortBy.value === opt.field ? 'primary' : ''"
                size="small"
                plain
                @click="toggleSort(opt.field, opt.defaultOrder)"
              >
                {{ opt.label }}
              </el-button>
            </div>
            <el-radio-group v-model="channelView" size="small" class="channel-view-filter" aria-label="信道筛选">
              <el-radio-button value="enabled">已启用 {{ channelViewCounts.enabled }}</el-radio-button>
              <el-radio-button value="all">全部 {{ dashboard.channels.value.length }}</el-radio-button>
              <el-radio-button value="disabled">已停用 {{ channelViewCounts.disabled }}</el-radio-button>
            </el-radio-group>
          </div>
        </div>
        <ChannelCards
          :channels="visibleChannels"
          :merge-channel-groups="mergeChannelGroups"
          :series-by-channel="dashboard.channelSeries.value"
          :selected-channel-id="dashboard.selectedChannelId.value"
          :loading="dashboard.loading.value"
          :busy-id="busyId"
          @select="dashboard.selectedChannelId.value = $event"
          @edit="openEdit"
          @probe="probeChannel"
          @delete="deleteChannel"
          @toggle="toggleChannel"
        />
      </section>

      <section class="workspace-section motion-reveal">
        <div class="section-heading">
          <div>
            <h2>最近探测</h2>
            <span>最多显示 80 条</span>
          </div>
        </div>
        <ProbeLogTable
          :channels="dashboard.channels.value"
          :probes="dashboard.recentProbes.value"
        />
      </section>
    </main>

    <ChannelDialog
      :open="dialogOpen"
      :channel="editingChannel"
      :saving="dashboard.saving.value"
      @close="dialogOpen = false"
      @save="saveChannel"
    />

    <DataImportDialog
      :open="importDialogOpen"
      :importing="importBusy"
      @close="importDialogOpen = false"
      @import="importData"
    />

    <ProxySettingsDialog
      :open="proxyDialogOpen"
      :value="dashboard.globalProxyUrl.value"
      :saving="proxySaving"
      @close="proxyDialogOpen = false"
      @save="saveGlobalProxy"
    />
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  min-height: 100vh;
  overflow-x: clip;
}

.command-zone {
  position: relative;
  min-height: 360px;
  overflow: hidden;
  border-bottom: 1px solid rgb(105 162 151 / 22%);
  background: #0b1415;
  color: #f4fbf8;
  isolation: isolate;
}

.command-zone :deep(.network-scene) {
  opacity: 0.82;
}

.topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  border-bottom: 1px solid rgb(126 185 174 / 16%);
  background: rgb(11 20 21 / 78%);
  backdrop-filter: blur(18px);
}

.topbar__inner {
  display: flex;
  width: min(1440px, calc(100% - 44px));
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 0 auto;
}

.brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  color: #f4f7f6;
}

.brand-mark {
  position: relative;
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  border: 1px solid rgb(89 216 189 / 44%);
  border-radius: 8px;
  background: rgb(89 216 189 / 8%);
  color: #59d8bd;
  box-shadow: inset 0 0 22px rgb(89 216 189 / 8%);
}

.brand h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
}

.brand span {
  color: #789a95;
  font-size: 10px;
  text-transform: uppercase;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.header-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.auto-probe-control {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid rgb(126 185 174 / 28%);
  border-radius: 7px;
  background: rgb(255 255 255 / 4%);
  color: #dcece8;
  font-size: 12px;
}

.live-dot,
.meta-signal {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
}

.live-dot {
  background: #5fe1b5;
  box-shadow: 0 0 0 4px rgb(95 225 181 / 12%), 0 0 14px rgb(95 225 181 / 50%);
  animation: signal-pulse 1.8s ease-in-out infinite;
}

.live-dot--paused {
  background: #ef946d;
  box-shadow: 0 0 0 4px rgb(239 148 109 / 12%);
  animation: none;
}

.command-hero {
  position: relative;
  z-index: 2;
  display: grid;
  width: min(1440px, calc(100% - 44px));
  min-height: 286px;
  grid-template-columns: minmax(0, 1fr) 250px;
  align-items: center;
  gap: 60px;
  margin: 0 auto;
  padding: 34px 0 48px;
}

.command-copy {
  max-width: 700px;
}

.command-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #72d9c1;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
}

.command-copy h2 {
  margin: 12px 0 10px;
  color: #f5fbf9;
  font-size: clamp(30px, 4vw, 52px);
  font-weight: 720;
  line-height: 1.06;
  letter-spacing: 0;
}

.command-copy p {
  max-width: 620px;
  margin: 0;
  color: #9bb5b0;
  font-size: 14px;
  line-height: 1.75;
}

.command-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
  margin-top: 22px;
  color: #b9ceca;
  font-size: 11px;
}

.command-meta span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.meta-signal--success {
  background: #59d8bd;
  box-shadow: 0 0 10px rgb(89 216 189 / 62%);
}

.meta-signal--warning {
  background: #f08a62;
  box-shadow: 0 0 10px rgb(240 138 98 / 52%);
}

.health-readout {
  display: grid;
  align-self: center;
  gap: 7px;
  padding-left: 26px;
  border-left: 1px solid rgb(123 175 166 / 26%);
}

.health-readout > span,
.health-readout small {
  color: #789a95;
  font-size: 10px;
  font-weight: 650;
}

.health-readout strong {
  color: #f5fbf9;
  font: 700 42px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
}

.health-track {
  width: 100%;
  height: 3px;
  overflow: hidden;
  background: rgb(255 255 255 / 10%);
}

.health-track i {
  display: block;
  height: 100%;
  background: #59d8bd;
  box-shadow: 0 0 12px rgb(89 216 189 / 60%);
  transition: width 600ms cubic-bezier(0.16, 1, 0.3, 1);
}

.content {
  display: grid;
  width: min(1440px, calc(100% - 44px));
  margin: 0 auto;
  padding: 26px 0 52px;
  gap: 20px;
}

.workspace-section {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 14px 34px var(--section-shadow);
}

.workspace-section--plain {
  padding: 0;
  border: 0;
  background: transparent;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.section-heading--channels {
  align-items: flex-end;
}

.section-heading h2 {
  margin: 0 0 3px;
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
}

.section-heading span {
  color: var(--muted);
  font-size: 12px;
}

.channel-filter {
  width: 220px;
}

.sort-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.channel-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-label {
  color: var(--muted);
  font-size: 12px;
  margin-right: 2px;
}

.sort-bar :deep(.el-button) {
  padding: 4px 10px;
  font-size: 12px;
}

.channel-view-filter {
  flex: 0 0 auto;
}

@keyframes signal-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.62; transform: scale(0.82); }
}

@media (max-width: 980px) {
  .topbar__inner {
    align-items: flex-start;
    padding: 14px 0;
  }

  .header-actions {
    max-width: 480px;
  }

  .command-hero {
    grid-template-columns: minmax(0, 1fr) 210px;
    gap: 32px;
  }

  .channel-controls {
    align-items: flex-end;
    flex-direction: column;
  }
}

@media (max-width: 760px) {
  .topbar {
    position: relative;
  }

  .topbar__inner {
    width: calc(100% - 28px);
    flex-direction: column;
    gap: 12px;
  }

  .header-actions {
    width: 100%;
    max-width: none;
    justify-content: flex-start;
  }

  .command-hero {
    width: calc(100% - 28px);
    min-height: 260px;
    grid-template-columns: 1fr;
    gap: 24px;
    padding: 30px 0 38px;
  }

  .command-zone :deep(.network-scene) {
    opacity: 0.38;
    transform: translateX(22%) scale(0.88);
  }

  .health-readout {
    width: min(260px, 100%);
    padding-left: 0;
    border-left: 0;
  }

  .content {
    width: calc(100% - 24px);
    padding-top: 14px;
  }

  .workspace-section {
    padding: 14px;
  }

  .section-heading--controls {
    align-items: flex-start;
    flex-direction: column;
  }

  .section-heading--channels {
    align-items: flex-start;
    flex-direction: column;
  }

  .channel-controls {
    width: 100%;
    align-items: flex-start;
  }

  .channel-view-filter {
    max-width: 100%;
  }

  .channel-filter {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .command-copy h2 {
    font-size: 34px;
  }

  .header-actions :deep(.el-button) {
    flex: 1 1 auto;
  }

  .auto-probe-control {
    width: 100%;
    justify-content: space-between;
  }

  .channel-controls,
  .sort-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .channel-view-filter {
    width: 100%;
    overflow-x: auto;
  }

  .section-heading h2 {
    font-size: 15px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .live-dot {
    animation: none;
  }
}
</style>
