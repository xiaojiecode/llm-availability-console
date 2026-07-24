<script setup lang="ts">
import * as THREE from 'three'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  healthyChannels: number
  totalChannels: number
  active: boolean
}>()

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvas')

let renderer: THREE.WebGLRenderer | undefined
let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let networkGroup: THREE.Group | undefined
let coreMaterial: THREE.MeshBasicMaterial | undefined
let lineMaterial: THREE.LineBasicMaterial | undefined
let nodeMaterial: THREE.PointsMaterial | undefined
let rings: THREE.Mesh[] = []
let resizeObserver: ResizeObserver | undefined
let themeObserver: MutationObserver | undefined
let frameId = 0
let lastTime = 0
let pointerX = 0
let pointerY = 0
let reducedMotion = false

function readPalette() {
  const styles = getComputedStyle(document.documentElement)
  return {
    primary: styles.getPropertyValue('--scene-primary').trim() || '#59d8bd',
    secondary: styles.getPropertyValue('--scene-secondary').trim() || '#f08a62',
    line: styles.getPropertyValue('--scene-line').trim() || '#426a68',
  }
}

function applyPalette() {
  const palette = readPalette()
  coreMaterial?.color.set(palette.primary)
  nodeMaterial?.color.set(palette.secondary)
  lineMaterial?.color.set(palette.line)
  rings.forEach((ring, index) => {
    const material = ring.material as THREE.MeshBasicMaterial
    material.color.set(index === 1 ? palette.secondary : palette.primary)
  })
  renderFrame(0)
}

function buildNetwork() {
  if (!scene) return
  const palette = readPalette()
  networkGroup = new THREE.Group()
  scene.add(networkGroup)

  const nodeCount = 76
  const positions = new Float32Array(nodeCount * 3)
  const vectors: THREE.Vector3[] = []

  for (let index = 0; index < nodeCount; index += 1) {
    const radius = 2.4 + Math.random() * 4.8
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const point = new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi) * 0.72,
      radius * Math.sin(phi) * Math.sin(theta),
    )
    vectors.push(point)
    positions.set([point.x, point.y, point.z], index * 3)
  }

  const pointGeometry = new THREE.BufferGeometry()
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  nodeMaterial = new THREE.PointsMaterial({
    color: palette.secondary,
    size: 0.065,
    transparent: true,
    opacity: 0.82,
    sizeAttenuation: true,
  })
  networkGroup.add(new THREE.Points(pointGeometry, nodeMaterial))

  const linePositions: number[] = []
  for (let first = 0; first < vectors.length; first += 1) {
    let links = 0
    for (let second = first + 1; second < vectors.length && links < 3; second += 1) {
      if (vectors[first].distanceTo(vectors[second]) > 1.65) continue
      linePositions.push(...vectors[first].toArray(), ...vectors[second].toArray())
      links += 1
    }
  }

  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))
  lineMaterial = new THREE.LineBasicMaterial({
    color: palette.line,
    transparent: true,
    opacity: 0.28,
  })
  networkGroup.add(new THREE.LineSegments(lineGeometry, lineMaterial))

  coreMaterial = new THREE.MeshBasicMaterial({
    color: palette.primary,
    wireframe: true,
    transparent: true,
    opacity: 0.64,
  })
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.06, 2), coreMaterial)
  networkGroup.add(core)

  rings = [
    new THREE.Mesh(
      new THREE.TorusGeometry(1.48, 0.018, 8, 120),
      new THREE.MeshBasicMaterial({ color: palette.primary, transparent: true, opacity: 0.44 }),
    ),
    new THREE.Mesh(
      new THREE.TorusGeometry(1.92, 0.012, 8, 120),
      new THREE.MeshBasicMaterial({ color: palette.secondary, transparent: true, opacity: 0.34 }),
    ),
    new THREE.Mesh(
      new THREE.TorusGeometry(2.36, 0.009, 8, 120),
      new THREE.MeshBasicMaterial({ color: palette.primary, transparent: true, opacity: 0.2 }),
    ),
  ]
  rings[0].rotation.x = Math.PI / 2.8
  rings[1].rotation.set(Math.PI / 2.1, 0.42, 0)
  rings[2].rotation.set(Math.PI / 1.65, -0.28, 0.2)
  rings.forEach((ring) => networkGroup?.add(ring))
}

function resize() {
  const canvas = canvasRef.value
  if (!canvas || !renderer || !camera) return
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / Math.max(height, 1)
  camera.updateProjectionMatrix()
  renderFrame(0)
}

function renderFrame(time: number) {
  if (!renderer || !scene || !camera || !networkGroup) return
  const delta = Math.min((time - lastTime) / 1000 || 0, 0.04)
  lastTime = time

  if (!reducedMotion) {
    networkGroup.rotation.y += delta * (props.active ? 0.085 : 0.035)
    networkGroup.rotation.x += (pointerY * 0.12 - networkGroup.rotation.x) * 0.018
    networkGroup.rotation.z += (pointerX * -0.08 - networkGroup.rotation.z) * 0.018
    rings.forEach((ring, index) => {
      ring.rotation.z += delta * (0.05 + index * 0.018)
    })
  }

  renderer.render(scene, camera)
  if (!reducedMotion) frameId = window.requestAnimationFrame(renderFrame)
}

function handlePointerMove(event: PointerEvent) {
  pointerX = (event.clientX / window.innerWidth - 0.5) * 2
  pointerY = (event.clientY / window.innerHeight - 0.5) * 2
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return

  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  camera.position.set(0, 0.2, 11.5)
  buildNetwork()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  themeObserver = new MutationObserver(applyPalette)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  resize()
  renderFrame(performance.now())
})

watch(
  () => [props.healthyChannels, props.totalChannels, props.active],
  () => {
    const ratio = props.totalChannels ? props.healthyChannels / props.totalChannels : 0
    if (coreMaterial) coreMaterial.opacity = 0.38 + ratio * 0.42
    if (lineMaterial) lineMaterial.opacity = props.active ? 0.34 : 0.18
  },
)

onBeforeUnmount(() => {
  window.cancelAnimationFrame(frameId)
  window.removeEventListener('pointermove', handlePointerMove)
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  scene?.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })
  renderer?.dispose()
})
</script>

<template>
  <canvas ref="canvas" class="network-scene" aria-hidden="true" />
</template>

<style scoped>
.network-scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
