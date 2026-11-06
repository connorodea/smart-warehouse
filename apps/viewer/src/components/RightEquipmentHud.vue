<template>
  <aside class="right-equipment-hud" :aria-label="$t('rightEquipmentHud.ariaLabel')">
    <!-- Module 1: Dock Berth Load -->
    <div class="hud-card">
      <div class="hud-card-header">
        <div class="header-left">
          <span class="hud-icon amber">🚛</span>
          <div>
            <div class="hud-title">{{ $t('rightEquipmentHud.dockDispatchTitle') }}</div>
            <div class="hud-subtitle">DOCKING BAYS</div>
          </div>
        </div>
        <div class="status-badge amber">
          {{ $t('rightEquipmentHud.dockFullBadge') }}
        </div>
      </div>

      <div class="dock-list">
        <div class="dock-item active">
          <div class="dock-title-row">
            <span class="dock-name">Dock 1 (Telescopic Roller)</span>
            <span class="dock-tag green">High-Speed Transfer</span>
          </div>
          <div class="dock-desc">Automated conveyor 120 pcs/min · AGV-linked transfer</div>
        </div>

        <div class="dock-item">
          <div class="dock-title-row">
            <span class="dock-name">Dock 2 (Cold-Chain Trailer)</span>
            <span class="dock-tag blue">Temperature-Controlled Docking</span>
          </div>
          <div class="dock-desc">Fresh-produce cold-chain trailer · Airlock sealed</div>
        </div>

        <div class="dock-item">
          <div class="dock-title-row">
            <span class="dock-name">Dock 3 (Line-Haul Box Truck)</span>
            <span class="dock-tag purple">Outbound Loading</span>
          </div>
          <div class="dock-desc">Standard container trailer · Pallet consolidation outbound</div>
        </div>
      </div>
    </div>

    <!-- Module 2: Constant-Temperature Cold-Chain Airlock Environment -->
    <div class="hud-card">
      <div class="hud-card-header">
        <div class="header-left">
          <span class="hud-icon teal">❄️</span>
          <div>
            <div class="hud-title">{{ $t('rightEquipmentHud.coldChainTitle') }}</div>
            <div class="hud-subtitle">CLIMATE CONTROL</div>
          </div>
        </div>
        <div class="status-badge green">
          {{ $t('rightEquipmentHud.coldChainBadge') }}
        </div>
      </div>

      <div class="temp-hero-row">
        <div class="temp-val-group">
          <span class="temp-val">-18.2</span>
          <span class="temp-unit">°C</span>
        </div>
        <div class="temp-target">
          <span class="target-label">{{ $t('rightEquipmentHud.tempRangeLabel') }}</span>
          <span class="target-range">-18.0 ± 0.5 °C</span>
        </div>
      </div>

      <div class="env-metrics-grid">
        <div class="env-metric-item">
          <span class="env-label">{{ $t('rightEquipmentHud.humidityLabel') }}</span>
          <span class="env-val">48% <small>RH</small></span>
        </div>
        <div class="env-metric-item">
          <span class="env-label">{{ $t('rightEquipmentHud.pressureDiffLabel') }}</span>
          <span class="env-val">+25 <small>Pa</small></span>
        </div>
        <div class="env-metric-item">
          <span class="env-label">{{ $t('rightEquipmentHud.redundancyLabel') }}</span>
          <span class="env-val green">{{ $t('rightEquipmentHud.redundancyValue') }}</span>
        </div>
      </div>
    </div>

    <!-- Module 3: 3D Scene and View Control Dock -->
    <div class="hud-card controls-card">
      <div class="hud-card-header compact">
        <div class="header-left">
          <span class="hud-icon cyan">🧭</span>
          <div>
            <div class="hud-title">{{ $t('rightEquipmentHud.viewControlTitle') }}</div>
            <div class="hud-subtitle">SCENE PERSPECTIVE</div>
          </div>
        </div>
      </div>

      <div class="controls-action-grid">
        <button class="ctrl-btn" @click="$emit('zoom-in')" :title="$t('rightEquipmentHud.zoomInTitle')">
          <span class="btn-icon">+</span>
          <span class="btn-text">{{ $t('rightEquipmentHud.zoomIn') }}</span>
        </button>
        <button class="ctrl-btn" @click="$emit('zoom-out')" :title="$t('rightEquipmentHud.zoomOutTitle')">
          <span class="btn-icon">−</span>
          <span class="btn-text">{{ $t('rightEquipmentHud.zoomOut') }}</span>
        </button>
        <button
          class="ctrl-btn"
          :class="{ active: currentMode === 'reset' }"
          @click="handleReset"
          :title="$t('rightEquipmentHud.resetTitle')"
        >
          <span class="btn-icon">⟲</span>
          <span class="btn-text">{{ $t('rightEquipmentHud.reset') }}</span>
        </button>
        <button
          class="ctrl-btn"
          :class="{ active: currentMode === 'top' }"
          @click="handleTopView"
          :title="$t('rightEquipmentHud.topViewTitle')"
        >
          <span class="btn-icon">📐</span>
          <span class="btn-text">{{ $t('rightEquipmentHud.topView') }}</span>
        </button>
      </div>

      <button
        class="playback-btn"
        :class="{ paused: isPaused }"
        @click="handleTogglePlay"
        :title="$t('rightEquipmentHud.pauseResumeTitle')"
      >
        <span class="playback-icon">{{ isPaused ? '▶' : '⏸' }}</span>
        <span>{{ isPaused ? $t('rightEquipmentHud.resumeMotion') : $t('rightEquipmentHud.pauseMotion') }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  (e: 'zoom-in'): void;
  (e: 'zoom-out'): void;
  (e: 'reset-view'): void;
  (e: 'top-view'): void;
  (e: 'toggle-play'): void;
}>();

const currentMode = ref<'reset' | 'top' | 'custom'>('reset');
const isPaused = ref(false);

function handleReset() {
  currentMode.value = 'reset';
  emit('reset-view');
}

function handleTopView() {
  currentMode.value = 'top';
  emit('top-view');
}

function handleTogglePlay() {
  isPaused.value = !isPaused.value;
  emit('toggle-play');
}

defineExpose({
  setPaused(paused: boolean) {
    isPaused.value = paused;
  },
  setMode(mode: 'reset' | 'top' | 'custom') {
    currentMode.value = mode;
  }
});
</script>

<style scoped>
.right-equipment-hud {
  position: absolute;
  top: 66px;
  right: 20px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 290px;
  pointer-events: auto;
  user-select: none;
}

/* Cyber micro-crystal card base */
.hud-card {
  background: linear-gradient(135deg, rgba(11, 18, 30, 0.88) 0%, rgba(15, 23, 42, 0.78) 100%);
  border: 1px solid rgba(0, 240, 255, 0.22);
  border-radius: 12px;
  padding: 13px 15px;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.42), inset 0 0 12px rgba(0, 240, 255, 0.04);
  position: relative;
  overflow: hidden;
  transition: border-color 0.25s, transform 0.2s;
}

.hud-card:hover {
  border-color: rgba(0, 240, 255, 0.45);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(0, 240, 255, 0.12);
}

.hud-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 32px;
  height: 2px;
  background: linear-gradient(270deg, #00f0ff, transparent);
}

.hud-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.hud-card-header.compact {
  margin-bottom: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 9px;
}

.hud-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}
.hud-icon.amber {
  background: rgba(245, 158, 11, 0.18);
  border: 1px solid rgba(245, 158, 11, 0.35);
}
.hud-icon.teal {
  background: rgba(20, 184, 166, 0.18);
  border: 1px solid rgba(20, 184, 166, 0.35);
}
.hud-icon.cyan {
  background: rgba(0, 240, 255, 0.18);
  border: 1px solid rgba(0, 240, 255, 0.35);
}

.hud-title {
  font-size: 13px;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: 0.4px;
  line-height: 1.2;
}

.hud-subtitle {
  font-size: 9px;
  color: #64748b;
  font-family: ui-monospace, monospace;
  letter-spacing: 0.8px;
  margin-top: 1px;
}

/* Status pill */
.status-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  font-family: ui-monospace, monospace;
}
.status-badge.amber {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.35);
}
.status-badge.green {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.35);
}

/* Dock list */
.dock-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dock-item {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 6px 9px;
}
.dock-item.active {
  border-left: 2px solid #00f0ff;
}
.dock-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}
.dock-name {
  font-size: 11px;
  font-weight: 600;
  color: #e2e8f0;
}
.dock-tag {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
}
.dock-tag.green { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.dock-tag.blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.dock-tag.purple { background: rgba(168, 85, 247, 0.2); color: #c084fc; }

.dock-desc {
  font-size: 9px;
  color: #64748b;
}

/* Cold-chain temperature control row */
.temp-hero-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.temp-val-group {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.temp-val {
  font-size: 24px;
  font-weight: 800;
  color: #38bdf8;
  font-family: ui-monospace, monospace;
  text-shadow: 0 0 14px rgba(56, 189, 248, 0.4);
}
.temp-unit {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 600;
}
.temp-target {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.target-label {
  font-size: 9px;
  color: #64748b;
}
.target-range {
  font-size: 11px;
  font-weight: 700;
  color: #cbd5e1;
  font-family: ui-monospace, monospace;
}

.env-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.env-metric-item {
  background: rgba(0, 0, 0, 0.22);
  border-radius: 6px;
  padding: 5px 4px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.04);
}
.env-label {
  font-size: 9px;
  color: #64748b;
  display: block;
}
.env-val {
  font-size: 12px;
  font-weight: 700;
  color: #f1f5f9;
  font-family: ui-monospace, monospace;
  margin-top: 1px;
}
.env-val small {
  font-size: 9px;
  color: #94a3b8;
  font-weight: normal;
}
.env-val.green {
  color: #34d399;
}

/* 3D view control dock */
.controls-card {
  padding-bottom: 12px;
}
.controls-action-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}
.ctrl-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 6px 2px;
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.18s ease;
}
.ctrl-btn:hover {
  background: rgba(0, 240, 255, 0.15);
  border-color: rgba(0, 240, 255, 0.45);
  color: #00f0ff;
  transform: translateY(-1px);
}
.ctrl-btn:active {
  transform: scale(0.95);
}
.ctrl-btn.active {
  background: rgba(0, 240, 255, 0.22);
  border-color: #00f0ff;
  color: #ffffff;
  box-shadow: 0 0 10px rgba(0, 240, 255, 0.35);
}
.btn-icon {
  font-size: 13px;
  font-weight: bold;
}
.btn-text {
  font-size: 10px;
  font-weight: 600;
}

.playback-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(0, 240, 255, 0.10);
  border: 1px solid rgba(0, 240, 255, 0.3);
  border-radius: 6px;
  padding: 7px 12px;
  color: #00f0ff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}
.playback-btn:hover {
  background: rgba(0, 240, 255, 0.22);
  border-color: #00f0ff;
  box-shadow: 0 0 12px rgba(0, 240, 255, 0.3);
}
.playback-btn.paused {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}
.playback-icon {
  font-size: 12px;
}
</style>
