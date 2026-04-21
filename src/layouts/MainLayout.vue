<script setup>

import { ref, computed } from 'vue'

import { useRouter, useRoute } from 'vue-router'

import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'
import logoClub from '../assets/logo.png'



const router = useRouter()
const route = useRoute()

const isSidebarOpen = ref(window.innerWidth >= 768)

const userName = ref(localStorage.getItem('userName') || 'Usuario')

const userRol = ref(localStorage.getItem('userRol') || 'JUGADOR')



const canManageCaja = computed(() => ['ADMINISTRADOR', 'TESORERO'].includes(userRol.value))
const canApproveMembers = computed(() => ['ADMINISTRADOR', 'SECRETARIO', 'TESORERO'].includes(userRol.value))



const handleLogout = async () => {
  const result = await Swal.fire({
    title: '¿Cerrar Sesión?',
    text: "Saldrás de tu cuenta en F.C. Portillo",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#334155',
    confirmButtonText: 'SÍ, SALIR',
    cancelButtonText: 'CANCELAR',
    background: '#020617',
    color: '#fff'
  })

  if (result.isConfirmed) {
    await supabase.auth.signOut()
    localStorage.clear()
    router.push('/')
  }
}

const handleNavClick = () => {
  if (window.innerWidth < 1024) {
    isSidebarOpen.value = false
  }
}

// Vigilante de ruta: Si la página cambia, cerramos el menú en móvil/tablet automáticamente
import { watch } from 'vue'
watch(() => route.path, () => {
  if (window.innerWidth < 1024) {
    isSidebarOpen.value = false
  }
})

</script>



<template>

  <div class="min-h-screen bg-slate-950 text-slate-200 flex font-sans overflow-hidden relative">

    

    <!-- OVERLAY PARA MÓVIL -->

    <Transition name="fade">

      <div 

        v-if="isSidebarOpen" 

        @click="isSidebarOpen = false" 

        class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden"

      ></div>

    </Transition>



    <aside 

      :class="[

        isSidebarOpen ? 'translate-x-0 w-[280px] md:w-72' : '-translate-x-full md:translate-x-0 md:w-24',

        'fixed md:static inset-y-0 left-0 z-50 sidebar-container flex-shrink-0'

      ]"

    >

      <div class="logo-area" :class="{ 'md:justify-center md:px-0': !isSidebarOpen }">

        <div class="logo-wrapper">

          <img :src="logoClub" class="logo-img" alt="Logo Club" />

        </div>

        <span v-if="isSidebarOpen" class="brand-name truncate">F.C. Portillo</span>

      </div>



      <nav class="flex-1 p-4 space-y-2 mt-4 overflow-y-auto custom-scrollbar">

        <router-link to="/dashboard" @click="handleNavClick" class="nav-link" active-class="nav-active">
          <span class="material-symbols-rounded">dashboard</span>
          <span v-if="isSidebarOpen" class="link-text">Panel Principal</span>
        </router-link>



        <router-link v-if="canApproveMembers" to="/socios" @click="handleNavClick" class="nav-link" active-class="nav-active">
          <span class="material-symbols-rounded">group_add</span>
          <span v-if="isSidebarOpen" class="link-text">Gestión Socios</span>
        </router-link>



        <router-link to="/caja" @click="handleNavClick" class="nav-link" active-class="nav-active">
          <span class="material-symbols-rounded">payments</span>
          <span v-if="isSidebarOpen" class="link-text">Libro Diario</span>
        </router-link>

      </nav>



      <div class="p-4 pb-12 md:pb-6 border-t border-white/5 bg-slate-950/50">
        <div v-if="isSidebarOpen" class="mb-4 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20 flex-shrink-0">
              {{ userName.charAt(0).toUpperCase() }}
            </div>

            <div class="min-w-0">
              <p class="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] leading-none mb-1">
                {{ userRol }}
              </p>

              <p class="text-xs font-bold text-white truncate leading-none italic uppercase">
                {{ userName }}
              </p>
            </div>
          </div>
        </div>

        <router-link to="/perfil" @click="handleNavClick" class="w-full flex items-center gap-4 p-3 mb-2 rounded-xl transition-all duration-300 group text-slate-400 hover:text-emerald-400 bg-slate-900/50 hover:bg-slate-800 border border-transparent hover:border-emerald-500/20" :class="{ 'justify-center': !isSidebarOpen }">
          <span class="material-symbols-rounded text-xl group-hover:rotate-12 transition-transform">manage_accounts</span>
          <span v-if="isSidebarOpen" class="text-[10px] font-black uppercase tracking-[0.3em]">Cambiar Clave</span>
        </router-link>

        <button @click="handleLogout" 
          class="w-full flex items-center gap-4 p-3 rounded-xl transition-all duration-300 group
                text-rose-500 bg-rose-500/10 border border-rose-500/20
                hover:bg-rose-500/20 hover:border-rose-500/40 hover:scale-[1.02]"
          :class="{ 'justify-center': !isSidebarOpen }">
          <span class="material-symbols-rounded text-xl group-hover:rotate-12 transition-transform">logout</span>
          <span v-if="isSidebarOpen" class="text-[10px] font-black uppercase tracking-[0.3em]">Cerrar Sesión</span>
        </button>
      </div>

    </aside>



    <main class="flex-1 flex flex-col h-[100dvh] overflow-hidden min-w-0">

      <header class="top-header">

        <button @click="isSidebarOpen = !isSidebarOpen" class="menu-toggle">

          <span class="material-symbols-rounded text-2xl">{{ isSidebarOpen ? 'menu_open' : 'menu' }}</span>

        </button>

        

        <div class="header-status">

          <div class="status-dot"></div>

          <p class="status-text uppercase tracking-widest">FC Portillo</p>

        </div>

      </header>



      <section class="viewport-container">

        <RouterView />

      </section>

    </main>

  </div>

</template>



<style scoped>

@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');



/* Transición suave para el overlay */

.fade-enter-active,

.fade-leave-active {

  transition: opacity 0.3s ease;

}



.fade-enter-from,

.fade-leave-to {

  opacity: 0;

}





</style>