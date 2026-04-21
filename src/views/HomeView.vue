<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase' // Importamos tu cliente de supabase

const balance = ref(0)
const loading = ref(true)
const monto = ref(0)
const motivo = ref('')
const tipo = ref('Ingreso')

// Función para traer el saldo
async function getBalance() {
  loading.value = true
  const { data } = await supabase.from('balance').select('total').eq('id', 1).single()
  if (data) balance.value = data.total
  loading.value = false
}

// Función para registrar un nuevo movimiento
async function registrarMovimiento() {
  if (monto.value <= 0 || motivo.value === '') return alert('Llena los datos')

  const { error } = await supabase.from('movimientos').insert([
    { 
      monto: monto.value, 
      motivo: motivo.value, 
      tipo: tipo.value,
      registrado_por: (await supabase.auth.getUser()).data.user?.id // Intentará sacar el ID si hay sesión
    }
  ])

  if (error) {
    alert('Error al registrar: ' + error.message)
  } else {
    alert('Movimiento registrado con éxito')
    monto.value = 0
    motivo.value = ''
    getBalance() // Recarga el balance automáticamente
  }
}

onMounted(() => getBalance())
</script>

<template>
  <div class="min-h-screen w-full bg-slate-950 text-slate-200 p-4 md:p-10">
    <div class="max-w-4xl mx-auto space-y-6">
      
      <header class="flex justify-between items-center border-b border-slate-800 pb-6">
        <div>
          <h1 class="text-2xl font-bold text-white">F.C. PORTILLO</h1>
          <p class="text-slate-500 text-sm">Sistema de Gestión Financiera</p>
        </div>
        <div class="text-right">
          <span class="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/20">
            EN LÍNEA
          </span>
        </div>
      </header>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div class="bg-slate-900 p-8 rounded-3xl border border-slate-800 flex flex-col justify-center items-center shadow-xl">
          <h2 class="text-slate-400 font-medium mb-2">Balance Total Actual</h2>
          <div v-if="loading" class="text-2xl animate-pulse">Consultando...</div>
          <div v-else class="text-6xl font-black text-white tracking-tighter">
            <span class="text-emerald-500 text-3xl mr-2 font-light">S/</span>{{ balance }}
          </div>
          <button @click="getBalance" class="mt-6 text-slate-500 hover:text-white text-sm underline decoration-slate-700">
            Actualizar saldo
          </button>
        </div>

        <div class="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-xl">
          <h3 class="text-lg font-bold text-white mb-4">Nuevo Movimiento</h3>
          <div class="space-y-4">
            <div>
              <label class="text-xs text-slate-500 uppercase font-bold">Monto (S/)</label>
              <input v-model="monto" type="number" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white">
            </div>
            <div>
              <label class="text-xs text-slate-500 uppercase font-bold">Motivo / Descripción</label>
              <input v-model="motivo" type="text" placeholder="Ej: Pago arbitraje" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white">
            </div>
            <div class="flex gap-2">
              <button @click="tipo = 'Ingreso'" :class="tipo === 'Ingreso' ? 'bg-emerald-600 border-emerald-500' : 'bg-slate-950 border-slate-800'" class="flex-1 border p-2 rounded-xl text-xs font-bold transition-all">INGRESO</button>
              <button @click="tipo = 'Egreso'" :class="tipo === 'Egreso' ? 'bg-red-600 border-red-500' : 'bg-slate-950 border-slate-800'" class="flex-1 border p-2 rounded-xl text-xs font-bold transition-all">EGRESO</button>
            </div>
            <button @click="registrarMovimiento" class="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-emerald-400 transition-colors shadow-lg">
              REGISTRAR EN CAJA
            </button>
          </div>
        </div>

      </div>

    </div>
  </div>
</template>

<style>
/* Asegura que el body use todo el ancho */
body {
  margin: 0;
  padding: 0;
  width: 100%;
}
</style>