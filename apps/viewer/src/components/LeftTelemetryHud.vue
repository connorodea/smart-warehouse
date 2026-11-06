<template>
  <aside class="left-telemetry-hud" :aria-label="$t('leftTelemetryHud.ariaLabel')">
    <!-- Module 1: Today's Warehouse Throughput -->
    <div class="hud-card">
      <div class="hud-card-header">
        <div class="header-left">
          <span class="hud-icon blue">📦</span>
          <div>
            <div class="hud-title">{{ $t('leftTelemetryHud.throughput.title') }}</div>
            <div class="hud-subtitle">DAILY THROUGHPUT</div>
          </div>
        </div>
        <div class="trend-badge positive">
          <span class="trend-arrow">↑</span> 12.8%
        </div>
      </div>

      <div class="kpi-hero-val">
        <span class="val-num">24,580</span>
        <span class="val-unit">{{ $t('leftTelemetryHud.throughput.unit') }}</span>
      </div>

      <div class="throughput-split">
        <div class="split-col">
          <span class="split-label">{{ $t('leftTelemetryHud.throughput.inbound') }}</span>
          <span class="split-val in">13,420</span>
        </div>
        <div class="split-divider"></div>
        <div class="split-col">
          <span class="split-label">{{ $t('leftTelemetryHud.throughput.outbound') }}</span>
          <span class="split-val out">11,160</span>
        </div>
      </div>

      <div class="progress-section">
        <div class="progress-info">
          <span>Daily Target Achievement (27,500 items)</span>
          <span class="progress-pct">89.4%</span>
        </div>
        <div class="hud-progress-track">
          <div class="hud-progress-bar cyan-glow" style="width: 89.4%"></div>
        </div>
      </div>
    </div>

    <!-- Module 2: AGV Capacity Real-Time Status -->
    <div class="hud-card">
      <div class="hud-card-header">
        <div class="header-left">
          <span class="hud-icon cyan">🤖</span>
          <div>
            <div class="hud-title">{{ $t('leftTelemetryHud.agv.title') }}</div>
            <div class="hud-subtitle">FLEET DISPATCHING</div>
          </div>
        </div>
        <div class="status-badge live">
          <span class="pulse-dot"></span> 7 vehicles online
        </div>
      </div>

      <div class="agv-status-grid">
        <div class="status-cell heavy">
          <div class="cell-num">4 <small>{{ $t('leftTelemetryHud.agv.unit') }}</small></div>
          <div class="cell-desc">Heavy-Load Trunk Transport</div>
        </div>
        <div class="status-cell empty">
          <div class="cell-num">2 <small>{{ $t('leftTelemetryHud.agv.unit') }}</small></div>
          <div class="cell-desc">Empty Vehicle Track Return</div>
        </div>
        <div class="status-cell dock">
          <div class="cell-num">1 <small>{{ $t('leftTelemetryHud.agv.unit') }}</small></div>
          <div class="cell-desc">Dock Shuttle Loading</div>
        </div>
      </div>

      <div class="agv-meta-row">
        <div class="meta-item">
          <span class="meta-label">{{ $t('leftTelemetryHud.agv.obstacleAvoidance') }}</span>
          <span class="meta-val green">LiDAR Normal</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ $t('leftTelemetryHud.agv.averageSpeed') }}</span>
          <span class="meta-val">1.5 m/s</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ $t('leftTelemetryHud.agv.averageBattery') }}</span>
          <span class="meta-val">94%</span>
        </div>
      </div>
    </div>

    <!-- Module 3: High-Bay Pallet Storage Capacity -->
    <div class="hud-card">
      <div class="hud-card-header">
        <div class="header-left">
          <span class="hud-icon indigo">🏭</span>
          <div>
            <div class="hud-title">{{ $t('leftTelemetryHud.storage.title') }}</div>
            <div class="hud-subtitle">STORAGE CAPACITY</div>
          </div>
        </div>
        <div class="capacity-rate">
          <span class="rate-num">88.4</span>%
        </div>
      </div>

      <div class="progress-section compact">
        <div class="progress-info">
          <span>Dense Storage Location Utilization (708 / 800 pallets)</span>
          <span class="progress-pct">92 pallets remaining</span>
        </div>
        <div class="hud-progress-track">
          <div class="hud-progress-bar emerald-glow" style="width: 88.4%"></div>
        </div>
      </div>

      <div class="pallet-meta-row">
        <div class="pallet-stat">
          <span class="p-dot amber"></span>
          <span class="p-label">{{ $t('leftTelemetryHud.storage.eastSortingStack') }}</span>
          <span class="p-val">368 pallets</span>
        </div>
        <div class="pallet-stat">
          <span class="p-dot blue"></span>
          <span class="p-label">{{ $t('leftTelemetryHud.storage.southBufferArea') }}</span>
          <span class="p-val">340 pallets</span>
        </div>
        <div class="pallet-stat">
          <span class="p-dot cyan"></span>
          <span class="p-label">{{ $t('leftTelemetryHud.storage.turnoverRate') }}</span>
          <span class="p-val highlight">95.2%</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
// Props or telemetry store can be easily attached here for real-time socket updates
</script>

<style scoped>
.left-telemetry-hud {
  position: absolute;
  top: 66px;
  left: 20px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 290px;
  pointer-events: auto;
  user-select: none;
}

/* Cyber microcrystal card base */
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

/* Top tech light corner */
.hud-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 32px;
  height: 2px;
  background: linear-gradient(90deg, #00f0ff, transparent);
}

.hud-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
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
.hud-icon.blue {
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.35);
}
.hud-icon.cyan {
  background: rgba(0, 240, 255, 0.18);
  border: 1px solid rgba(0, 240, 255, 0.35);
}
.hud-icon.indigo {
  background: rgba(99, 102, 241, 0.18);
  border: 1px solid rgba(99, 102, 241, 0.35);
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

/* Trend capsule */
.trend-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  font-family: ui-monospace, monospace;
}
.trend-badge.positive {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.35);
}
.trend-arrow {
  font-size: 12px;
  margin-right: 1px;
}

/* Core large value */
.kpi-hero-val {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin-bottom: 8px;
}
.val-num {
  font-size: 26px;
  font-weight: 800;
  color: #ffffff;
  font-family: ui-monospace, monospace;
  letter-spacing: 0.5px;
  text-shadow: 0 0 16px rgba(0, 240, 255, 0.35);
}
.val-unit {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}

/* Inbound/outbound breakdown */
.throughput-split {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  padding: 6px 12px;
  margin-bottom: 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.split-col {
  display: flex;
  flex-direction: column;
}
.split-label {
  font-size: 10px;
  color: #64748b;
}
.split-val {
  font-size: 13px;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.split-val.in { color: #38bdf8; }
.split-val.out { color: #a78bfa; }
.split-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
}

/* Progress bar group */
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.progress-section.compact {
  margin-bottom: 8px;
}
.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #94a3b8;
}
.progress-pct {
  color: #00f0ff;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.hud-progress-track {
  width: 100%;
  height: 5px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}
.hud-progress-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}
.hud-progress-bar.cyan-glow {
  background: linear-gradient(90deg, #0284c7, #00f0ff);
  box-shadow: 0 0 8px rgba(0, 240, 255, 0.6);
}
.hud-progress-bar.emerald-glow {
  background: linear-gradient(90deg, #059669, #10b981);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
}

/* AGV grid and indicators */
.status-badge.live {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  color: #34d399;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
  padding: 2px 7px;
  border-radius: 12px;
}
.pulse-dot {
  width: 6px;
  height: 6px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 6px #10b981;
  animation: pulse 1.8s infinite ease-in-out;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.3); }
}

.agv-status-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}
.status-cell {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 6px 4px;
  text-align: center;
}
.status-cell.heavy { border-top: 2px solid #00f0ff; }
.status-cell.empty { border-top: 2px solid #a855f7; }
.status-cell.dock { border-top: 2px solid #f59e0b; }

.cell-num {
  font-size: 15px;
  font-weight: 800;
  color: #ffffff;
  font-family: ui-monospace, monospace;
}
.cell-num small {
  font-size: 10px;
  color: #94a3b8;
  font-weight: normal;
}
.cell-desc {
  font-size: 9px;
  color: #94a3b8;
  margin-top: 2px;
}

.agv-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.meta-item {
  display: flex;
  flex-direction: column;
}
.meta-label {
  color: #64748b;
  font-size: 9px;
}
.meta-val {
  color: #cbd5e1;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.meta-val.green {
  color: #34d399;
}

/* Shelf utilization */
.capacity-rate {
  font-size: 16px;
  font-weight: 800;
  color: #10b981;
  font-family: ui-monospace, monospace;
  text-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
}
.pallet-meta-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.pallet-stat {
  display: flex;
  align-items: center;
  font-size: 10px;
  gap: 6px;
}
.p-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.p-dot.amber { background: #f59e0b; box-shadow: 0 0 5px #f59e0b; }
.p-dot.blue { background: #3b82f6; box-shadow: 0 0 5px #3b82f6; }
.p-dot.cyan { background: #00f0ff; box-shadow: 0 0 5px #00f0ff; }
.p-label { color: #94a3b8; }
.p-val { color: #e2e8f0; font-family: ui-monospace, monospace; font-weight: 600; margin-left: auto; }
.p-val.highlight { color: #00f0ff; font-weight: 700; }
</style>
