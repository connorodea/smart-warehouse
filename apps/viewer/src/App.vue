<template>
  <div class="smart-warehouse-app">
    <!-- Loading indicator overlay (Holographic initialization pod) -->
    <LoadingOverlay ref="loadingRef" />

    <!-- Top digital large-screen control center Header (52px minimalist holographic bar) -->
    <HeaderBar v-if="!isCleanMode" :theme="currentTheme" @toggle-theme="handleToggleTheme" />

    <!-- Left: Holographic operations situational monitoring HUD (Throughput / AGV Scheduling / Stacker storage capacity) -->
    <LeftTelemetryHud v-if="!isCleanMode" />

    <!-- Right: Facility load monitoring + 3D multi-dimensional view control dock HUD -->
    <RightEquipmentHud
      v-if="!isCleanMode"
      ref="controlsRef"
      @zoom-in="handleZoomIn"
      @zoom-out="handleZoomOut"
      @reset-view="handleResetView"
      @top-view="handleTopView"
      @toggle-play="handleTogglePlay"
    />

    <!-- Bottom operation hint bar (Dark frosted microcrystalline capsule) -->
    <TipBar v-if="!isCleanMode" />

    <!-- 3D entity snapping and adaptive anti-boundary popup (Dark microcrystalline tech card) -->
    <AnchoredPopup
      :visible="popupVisible"
      :detail="popupDetail"
      :screen-x="popupPos.x"
      :screen-y="popupPos.y"
      :behind-camera="popupBehind"
      :safe-left="safeBounds.left"
      :safe-right="safeBounds.right"
      @close="closePopup"
    />

    <!-- Three.js WebGL canvas container -->
    <div ref="canvasContainer" class="canvas-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import HeaderBar from './components/HeaderBar.vue';
import LeftTelemetryHud from './components/LeftTelemetryHud.vue';
import RightEquipmentHud from './components/RightEquipmentHud.vue';
import TipBar from './components/TipBar.vue';
import AnchoredPopup from './components/AnchoredPopup.vue';
import LoadingOverlay from './components/LoadingOverlay.vue';
import { WarehouseScene } from './core/WarehouseScene';
import { ENTITY_DATA } from './core/constants';
import { EntityDetail, EntityKey } from './types/warehouse';

const { t } = useI18n();

const canvasContainer = ref<HTMLElement | null>(null);
const loadingRef = ref<InstanceType<typeof LoadingOverlay> | null>(null);
const controlsRef = ref<InstanceType<typeof RightEquipmentHud> | null>(null);

let sceneInstance: WarehouseScene | null = null;

// Popup state
const popupVisible = ref(false);
const popupDetail = ref<EntityDetail | null>(null);
const popupPos = ref({ x: 0, y: 0 });
const popupBehind = ref(false);

const currentTheme = ref<'cyber' | 'studio'>('cyber');
const isCleanMode = ref(typeof window !== 'undefined' && window.location.search.includes('clean=1'));

function handleToggleTheme() {
  if (sceneInstance) {
    currentTheme.value = sceneInstance.toggleTheme();
  }
}

const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1920);

function handleResize() {
  windowWidth.value = window.innerWidth;
}

const safeBounds = computed(() => {
  if (windowWidth.value > 1100) {
    return {
      left: 310,
      right: windowWidth.value - 310
    };
  }
  return {
    left: 20,
    right: windowWidth.value - 20
  };
});

function closePopup() {
  popupVisible.value = false;
  if (sceneInstance) {
    sceneInstance.clearTrackedAnchor();
  }
}

function handleZoomIn() {
  sceneInstance?.zoomCamera(0.80);
}

function handleZoomOut() {
  sceneInstance?.zoomCamera(1.25);
}

function handleResetView() {
  sceneInstance?.resetCameraView();
  controlsRef.value?.setMode('reset');
}

function handleTopView() {
  sceneInstance?.setTopView();
  controlsRef.value?.setMode('top');
}

function handleTogglePlay() {
  if (sceneInstance && controlsRef.value) {
    const isPaused = sceneInstance.toggleAnimation();
    controlsRef.value.setPaused(isPaused);
  }
}

onMounted(async () => {
  window.addEventListener('resize', handleResize);
  if (!canvasContainer.value) return;

  sceneInstance = new WarehouseScene(canvasContainer.value);

  // Picking listener
  sceneInstance.onPick((entityKey: EntityKey) => {
    const data = ENTITY_DATA[entityKey];
    if (data) {
      popupDetail.value = data;
      popupVisible.value = true;
    }
  });

  // Blank click
  sceneInstance.onBlankClick(() => {
    closePopup();
  });

  // Per-frame projection calculation
  sceneInstance.onPositionUpdate((x: number, y: number, behind: boolean) => {
    popupPos.value = { x, y };
    popupBehind.value = behind;
  });

  if (typeof window !== 'undefined') {
    (window as any).__showEntityPopup = (key: EntityKey = 'pc_workstation') => {
      const data = ENTITY_DATA[key];
      if (data) {
        popupDetail.value = data;
        popupVisible.value = true;
        popupPos.value = { x: 960, y: 520 };
        popupBehind.value = false;
      }
    };
  }

  try {
    await sceneInstance.loadModel((percent, items) => {
      loadingRef.value?.updateProgress(percent, items);
    });

    if (typeof window !== 'undefined' && window.location.search.includes('preview=loading')) {
      loadingRef.value?.updateProgress(68, 74);
      return;
    }

    loadingRef.value?.complete();

    if (typeof window !== 'undefined') {
      if (window.location.search.includes('theme=studio')) {
        sceneInstance.setTheme('studio');
        currentTheme.value = 'studio';
      }
      if (window.location.search.includes('view=top')) {
        sceneInstance.setTopView();
      }
      if (window.location.search.includes('view=screen')) {
        sceneInstance.focusHoloScreen();
      }
      if (window.location.search.includes('focus=truck')) {
        sceneInstance.focusOnEntity('truck_dock2', [20.04, 1.5, 3.0]);
      }
      if (window.location.search.includes('focus=cockpit')) {
        sceneInstance.focusOnTruckCockpit();
      }
      if (window.location.search.includes('preview=popup')) {
        const urlParams = new URLSearchParams(window.location.search);
        const target = (urlParams.get('target') as EntityKey) || 'pc_workstation';
        sceneInstance.selectEntityByKey(target);
      }
    }
  } catch (err: any) {
    console.error(t('app.modelLoadFailed'), err);
    loadingRef.value?.setError(t('app.modelLoadFailedConfirmResourceFiles'));
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  sceneInstance?.destroy();
  sceneInstance = null;
});
</script>

<style>
/* Global base reset and dark theme background */
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-text-size-adjust: 100%;
  background: #080d17;
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

.smart-warehouse-app {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: #080d17;
}

.canvas-container {
  width: 100vw;
  height: 100vh;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}
</style>
