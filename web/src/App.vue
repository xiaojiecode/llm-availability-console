<script setup lang="ts">
import DashboardPage from './pages/DashboardPage.vue'
import { useSystemTheme } from './composables/useSystemTheme'

useSystemTheme()
</script>

<template>
  <DashboardPage />
</template>
