<template>
  <RouterView />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { supabase } from './lib/supabase'

let profileSubscription = null

onMounted(() => {
  const userId = localStorage.getItem('userId')
  if (userId) {
    profileSubscription = supabase
      .channel('public:perfiles:' + userId)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'perfiles', filter: `id=eq.${userId}` },
        (payload) => {
          const newRol = payload.new.rol
          const newName = payload.new.nombre_completo

          if (localStorage.getItem('userRol') !== newRol || localStorage.getItem('userName') !== newName) {
            localStorage.setItem('userRol', newRol)
            localStorage.setItem('userName', newName)
            // Recargamos silenciosamente para que todos los componentes (MainLayout, Dashboard, Caja) 
            // obtengan de inmediato los nuevos valores del localStorage sin requerir cierre de sesión.
            window.location.reload()
          }
        }
      )
      .subscribe()
  }
})

onUnmounted(() => {
  if (profileSubscription) supabase.removeChannel(profileSubscription)
})
</script>

<style>
/* Evita estilos complejos aquí que puedan romper el layout */
body {
  margin: 0;
  padding: 0;
  background-color: #020617; /* Slate-950 */
}
</style>