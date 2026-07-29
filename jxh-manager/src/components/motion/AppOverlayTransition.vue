<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    show: boolean
    variant?: 'dialog' | 'drawer'
  }>(),
  { variant: 'dialog' },
)

const transitionName = computed(() =>
  props.variant === 'drawer' ? 'app-drawer' : 'app-dialog',
)
</script>

<template>
  <Transition :name="transitionName">
    <slot v-if="show" />
  </Transition>
</template>
