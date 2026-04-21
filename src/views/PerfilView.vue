<script setup>
import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'
import { useRouter } from 'vue-router'

const router = useRouter()

const claveAc = ref('')
const claveNew = ref('')
const claveConfirm = ref('')
const loading = ref(false)

// Computed para validación en tiempo real (Software Profesional)
const checkMinLength = computed(() => claveNew.value.length >= 6)
const checkHasLetter = computed(() => /[A-Za-z]/.test(claveNew.value))
const checkHasNumber = computed(() => /\d/.test(claveNew.value))

const isFormInvalid = computed(() => {
  return !claveAc.value || !claveNew.value || !claveConfirm.value || 
         (claveNew.value !== claveConfirm.value) || 
         !checkMinLength.value || !checkHasLetter.value || !checkHasNumber.value
})

const handleCambio = async () => {
  if (isFormInvalid.value) return

  loading.value = true
  try {
    // 1. Verificamos que la contraseña actual es la correcta re-autenticando al usuario silenciosamente.
    const userEmail = (await supabase.auth.getUser()).data.user.email
    const { error: errorAuth } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: claveAc.value,
    })

    if (errorAuth) throw new Error('La contraseña actual es incorrecta.')

    // 2. Ejecutar la actualización en Supabase
    const { error: updateError } = await supabase.auth.updateUser({ password: claveNew.value })
    if (updateError) throw updateError

    Swal.fire({
      title: '¡A SALVO!',
      text: 'Tu contraseña secreta se modernizó con éxito.',
      icon: 'success',
      background: '#020617', color: '#fff',
      confirmButtonColor: '#10b981'
    })

    // Reset fields
    claveAc.value = ''
    claveNew.value = ''
    claveConfirm.value = ''

  } catch (err) {
    Swal.fire({
      title: 'ERROR',
      text: err.message,
      icon: 'error',
      background: '#020617', color: '#fff'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-[100dvh] pb-32 p-4 md:p-10 bg-[#020617] text-slate-300 font-sans">
    <div class="max-w-2xl mx-auto space-y-10">
      
      <header class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
        <div class="space-y-4">
          <p class="text-emerald-500 text-[9px] font-black uppercase tracking-[0.5em]">Seguridad</p>
          <div class="flex flex-col gap-1">
            <p class="text-slate-500 text-xs font-bold uppercase tracking-widest">Protección de Cuenta</p>
            <h2 class="text-5xl md:text-6xl font-black italic uppercase tracking-tighter text-white leading-none">
              Cambiar <span class="text-emerald-500">Clave</span>
            </h2>
          </div>
        </div>
      </header>

      <div class="bg-slate-900/50 border border-white/5 rounded-[2rem] p-8 md:p-10">
        <div class="flex items-center gap-4 mb-8 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
          <span class="material-symbols-rounded text-orange-500 text-3xl">shield_person</span>
          <p class="text-xs text-orange-500/90 font-medium leading-relaxed">
            Asegúrate de no usar la misma contraseña que asignamos por defecto al club. Usa letras, números y al menos 6 caracteres.
          </p>
        </div>

        <form @submit.prevent="handleCambio" class="space-y-6">
          <div class="space-y-2">
            <label class="text-[10px] text-emerald-500 font-black uppercase tracking-[0.2em] ml-1">Contraseña Actual</label>
            <div class="relative group">
              <span class="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400">lock_open</span>
              <input v-model="claveAc" type="password" 
                class="w-full bg-white/[0.02] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white text-sm outline-none focus:border-emerald-500/50 transition-all" 
                placeholder="Ingresa tu clave actual" required />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-[10px] text-emerald-500 font-black uppercase tracking-[0.2em] ml-1">Nueva Contraseña</label>
            <div class="relative group">
              <span class="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400">lock</span>
              <input v-model="claveNew" type="password" 
                class="w-full bg-white/[0.02] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white text-sm outline-none focus:border-emerald-500/50 transition-all" 
                placeholder="Ingresa tu nueva clave secreta" required />
            </div>

            <!-- Validadores Dinámicos (Estilo Checker Profesional) -->
            <div class="flex gap-4 mt-3 px-2">
              <div class="flex items-center gap-1.5 transition-all" :class="checkMinLength ? 'opacity-100 scale-105' : 'opacity-60 grayscale'">
                <span class="material-symbols-rounded text-[14px]" :class="checkMinLength ? 'text-emerald-500' : 'text-slate-500'">
                  {{ checkMinLength ? 'check_circle' : 'radio_button_unchecked' }}
                </span>
                <span :class="checkMinLength ? 'text-emerald-500' : 'text-slate-500'" class="text-[9px] font-black uppercase tracking-widest">6+ Caracteres</span>
              </div>
              
              <div class="flex items-center gap-1.5 transition-all" :class="checkHasLetter ? 'opacity-100 scale-105' : 'opacity-60 grayscale'">
                <span class="material-symbols-rounded text-[14px]" :class="checkHasLetter ? 'text-emerald-500' : 'text-slate-500'">
                  {{ checkHasLetter ? 'check_circle' : 'radio_button_unchecked' }}
                </span>
                <span :class="checkHasLetter ? 'text-emerald-500' : 'text-slate-500'" class="text-[9px] font-black uppercase tracking-widest">Letra</span>
              </div>

              <div class="flex items-center gap-1.5 transition-all" :class="checkHasNumber ? 'opacity-100 scale-105' : 'opacity-60 grayscale'">
                <span class="material-symbols-rounded text-[14px]" :class="checkHasNumber ? 'text-emerald-500' : 'text-slate-500'">
                  {{ checkHasNumber ? 'check_circle' : 'radio_button_unchecked' }}
                </span>
                <span :class="checkHasNumber ? 'text-emerald-500' : 'text-slate-500'" class="text-[9px] font-black uppercase tracking-widest">Número</span>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-[10px] text-emerald-500 font-black uppercase tracking-[0.2em] ml-1 flex justify-between">
              Confirmar Contraseña
              <span v-if="claveConfirm && claveNew !== claveConfirm" class="text-red-500 text-[8px] animate-pulse">Las contraseñas no coinciden</span>
            </label>
            <div class="relative group">
              <span class="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400">gpp_good</span>
              <input v-model="claveConfirm" type="password" 
                :class="['w-full bg-white/[0.02] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white text-sm outline-none focus:border-emerald-500/50 transition-all', claveConfirm && claveNew !== claveConfirm ? 'border-red-500/50 focus:border-red-500/50 text-red-100' : '']" 
                placeholder="Repite la nueva clave" required />
            </div>
          </div>

          <button type="submit" :disabled="isFormInvalid || loading" 
            class="w-full bg-emerald-500 text-slate-950 py-5 mt-4 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-[0_0_15px_rgba(16,185,129,0.2)] disabled:opacity-30 disabled:shadow-none transition-all flex justify-center items-center gap-2">
            <span v-if="loading" class="animate-spin w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full block"></span>
            {{ loading ? 'MODIFICANDO...' : 'Actualizar Contraseña' }}
          </button>
        </form>

      </div>
    </div>
  </div>
</template>
