<script setup lang="ts">
import { shallowRef } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, RefreshCcw, RotateCw } from '@lucide/vue'
import ChannelDialog from '../components/ChannelDialog.vue'
import ChannelCards from '../components/ChannelCards.vue'
import MetricsChart from '../components/MetricsChart.vue'
import OverviewStats from '../components/OverviewStats.vue'
import ProbeLogTable from '../components/ProbeLogTable.vue'
import { useDashboard } from '../composables/useDashboard'
import type { Channel, ChannelInput } from '../types'

const dashboard = useDashboard()
const dialogOpen = shallowRef(false)
const editingChannel = shallowRef<Channel | undefined>()
const busyId = shallowRef(0)
const probingAll = shallowRef(false)

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
      '删除“' + channel.name + '”',
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
    })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '状态更新失败')
  }
}

async function probeAll() {
  probingAll.value = true
  try {
    await dashboard.probeAll()
    ElMessage.success('全部探测完成')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量探测失败')
  } finally {
    probingAll.value = false
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"><RotateCw :size="20" /></span>
        <div>
          <h1>LLM 信道观测台</h1>
          <span>60s 自动探测</span>
        </div>
      </div>
      <div class="header-actions">
        <el-button :loading="dashboard.loading.value" @click="dashboard.loadBase">
          <RefreshCcw :size="16" />
          刷新
        </el-button>
        <el-button
          :loading="probingAll"
          :disabled="!dashboard.channels.value.some((channel) => channel.enabled)"
          @click="probeAll"
        >
          <RotateCw :size="16" />
          全部探测
        </el-button>
        <el-button type="primary" @click="openCreate">
          <Plus :size="16" />
          新增信道
        </el-button>
      </div>
    </header>

    <main class="content">
      <el-alert
        v-if="dashboard.errorMessage.value"
        :title="dashboard.errorMessage.value"
        type="error"
        show-icon
        closable
        @close="dashboard.errorMessage.value = ''"
      />

      <OverviewStats :summary="dashboard.summary.value" />

      <section class="workspace-section">
        <div class="section-heading section-heading--controls">
          <div>
            <h2>可用率与延迟</h2>
            <span>24 小时 · 分钟聚合</span>
          </div>
          <el-select v-model="dashboard.selectedChannelId.value" class="channel-filter">
            <el-option label="全部信道" :value="0" />
            <el-option
              v-for="channel in dashboard.channels.value"
              :key="channel.id"
              :label="channel.name"
              :value="channel.id"
            />
          </el-select>
        </div>
        <MetricsChart :points="dashboard.series.value" />
      </section>

      <section class="workspace-section workspace-section--plain">
        <div class="section-heading">
          <div>
            <h2>信道状态</h2>
            <span>{{ dashboard.channels.value.length }} 个配置 · 点击卡片查看趋势</span>
          </div>
        </div>
        <ChannelCards
          :channels="dashboard.channels.value"
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

      <section class="workspace-section">
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
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 10px max(22px, calc((100vw - 1440px) / 2));
  border-bottom: 1px solid #28383b;
  background: #132023;
}

.brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  color: #f4f7f6;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border: 1px solid #385156;
  border-radius: 6px;
  color: #65d4bb;
}

.brand h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: 0;
}

.brand span {
  color: #91aaa8;
  font-size: 11px;
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

.content {
  display: grid;
  width: min(1440px, calc(100% - 44px));
  margin: 0 auto;
  padding: 24px 0 44px;
  gap: 18px;
}

.workspace-section {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
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

.section-heading h2 {
  margin: 0 0 3px;
  color: var(--text);
  font-size: 15px;
  font-weight: 650;
}

.section-heading span {
  color: var(--muted);
  font-size: 12px;
}

.channel-filter {
  width: 220px;
}

@media (max-width: 760px) {
  .topbar {
    position: static;
    align-items: flex-start;
    padding: 14px;
  }

  .header-actions {
    max-width: 210px;
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

  .channel-filter {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .topbar {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    max-width: none;
    justify-content: flex-start;
  }

  .header-actions :deep(.el-button) {
    flex: 1 1 auto;
  }
}
</style>
